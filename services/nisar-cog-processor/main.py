from __future__ import annotations

import os
import secrets
from contextlib import contextmanager
from collections import Counter
from typing import Any
from urllib.parse import urlparse

import numpy as np
import rasterio
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from rasterio.mask import mask as raster_mask
from rasterio.features import geometry_mask, geometry_window
from rasterio.warp import transform_geom

app = FastAPI(title="SageHarvest NISAR COG Processor", version="0.1.0")


def allowed_hosts() -> set[str]:
    configured = os.getenv("COG_ALLOWED_HOSTS", "harmony.earthdata.nasa.gov")
    return {host.strip().lower() for host in configured.split(",") if host.strip()}


def validate_cog_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("COG URL must use HTTPS.")
    if parsed.username or parsed.password:
        raise ValueError("Credentials must not be embedded in COG URLs.")
    if parsed.hostname.lower() not in allowed_hosts():
        raise ValueError("COG URL host is not on the configured allowlist.")
    return url


class RasterLayer(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    url: HttpUrl
    frequency: str | None = Field(default=None, max_length=8)
    polarization: str | None = Field(default=None, max_length=12)
    nominal_pixel_spacing_m: float | None = Field(default=None, gt=0, le=1000)
    value_type: str = Field(default="gamma0_power", pattern="^(gamma0_power|continuous)$")


class QualityLayers(BaseModel):
    mask: HttpUrl | None = None
    number_of_looks: HttpUrl | None = None
    rtc_gamma_to_sigma_factor: HttpUrl | None = None


class ProcessRequest(BaseModel):
    field_id: str = Field(min_length=1, max_length=100)
    source_product_id: str = Field(min_length=1, max_length=300)
    acquired_at: str = Field(min_length=10, max_length=40)
    field_polygon: dict[str, Any]
    layers: list[RasterLayer] = Field(min_length=1, max_length=12)
    quality_layers: QualityLayers = Field(default_factory=QualityLayers)
    processing_version: str = Field(default="NISAR-GCOV-ZONAL-0.1.0", max_length=80)
    minimum_valid_pixels: int = Field(default=5, ge=1, le=10000)


@contextmanager
def _open_raster(path: str):
    # GDAL's /vsicurl/ driver issues HTTP range reads against the COG.
    # It does not need to download the complete source raster.
    remote_path = "/vsicurl/" + path if path.startswith("https://") else path
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.tiff",
        GDAL_HTTP_MULTIRANGE="YES",
    ):
        with rasterio.open(remote_path) as dataset:
            yield dataset


def _read_polygon_values(dataset: rasterio.io.DatasetReader, polygon: dict[str, Any]):
    if dataset.crs is None:
        raise ValueError("COG has no coordinate reference system.")
    projected = transform_geom("EPSG:4326", dataset.crs, polygon, precision=8)
    window = geometry_window(dataset, [projected])
    window_pixels = int(window.width * window.height)
    max_window_pixels = int(os.getenv("MAX_WINDOW_PIXELS", "5000000"))
    if window_pixels > max_window_pixels:
        raise ValueError(f"Requested field window is too large ({window_pixels} pixels; limit {max_window_pixels}).")
    data, transform = raster_mask(dataset, [projected], crop=True, filled=False, all_touched=False)
    band = data[0]
    values = np.asarray(band.compressed(), dtype="float64")
    values = values[np.isfinite(values)]
    inside = geometry_mask([projected], out_shape=band.shape, transform=transform, invert=True, all_touched=False)
    candidate_pixels = int(np.count_nonzero(inside))
    return values, candidate_pixels


def summarize_values(values: np.ndarray, value_type: str, candidate_pixels: int) -> dict[str, Any]:
    if values.size == 0:
        return {
            "valid_pixel_count": 0,
            "candidate_pixel_count": max(0, candidate_pixels),
            "valid_pixel_fraction": None,
            "median": None,
            "p25": None,
            "p75": None,
            "median_db": None,
        }
    p25, median, p75 = np.percentile(values, [25, 50, 75]).tolist()
    median_db = None
    if value_type == "gamma0_power":
        positive = values[values > 0]
        median_db = float(10.0 * np.log10(np.median(positive))) if positive.size else None
    denominator = max(int(candidate_pixels), int(values.size))
    return {
        "valid_pixel_count": int(values.size),
        "candidate_pixel_count": denominator,
        "valid_pixel_fraction": round(float(values.size / denominator), 6) if denominator else None,
        "median": float(median),
        "p25": float(p25),
        "p75": float(p75),
        "median_db": median_db,
    }


def process_raster(path: str, polygon: dict[str, Any], value_type: str) -> dict[str, Any]:
    with _open_raster(path) as dataset:
        values, candidate = _read_polygon_values(dataset, polygon)
        summary = summarize_values(values, value_type, candidate)
        summary.update({
            "crs": dataset.crs.to_string() if dataset.crs else None,
            "raster_width": int(dataset.width),
            "raster_height": int(dataset.height),
            "pixel_size": [abs(float(dataset.transform.a)), abs(float(dataset.transform.e))],
            "nodata": dataset.nodata,
        })
        return summary


def process_categorical(path: str, polygon: dict[str, Any]) -> dict[str, Any]:
    with _open_raster(path) as dataset:
        values, candidate = _read_polygon_values(dataset, polygon)
        summary = summarize_values(values, "continuous", candidate)
    counts = Counter(str(int(v)) for v in values if float(v).is_integer())
    summary["class_counts"] = dict(counts.most_common(32))
    summary["interpretation"] = "Raw mask classes only; bit meanings are not interpreted by this service."
    return summary


def require_service_auth(authorization: str | None) -> None:
    expected = os.getenv("NISAR_PROCESSOR_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Processor authentication is not configured.")
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")


@app.get("/health")
def health():
    return {"ok": True, "service": "nisar-cog-processor", "version": app.version}


@app.post("/v1/zonal-stats")
def zonal_stats(payload: ProcessRequest, authorization: str | None = Header(default=None)):
    require_service_auth(authorization)
    try:
        geometry_type = payload.field_polygon.get("type")
        if geometry_type not in {"Polygon", "MultiPolygon"}:
            raise ValueError("field_polygon must be a GeoJSON Polygon or MultiPolygon.")
        coordinates = payload.field_polygon.get("coordinates")
        if not isinstance(coordinates, list) or not coordinates:
            raise ValueError("field_polygon has no coordinates.")

        def count_positions(node: Any) -> int:
            if isinstance(node, list) and len(node) >= 2 and all(isinstance(v, (int, float)) for v in node[:2]):
                return 1
            if isinstance(node, list):
                return sum(count_positions(child) for child in node)
            return 0

        vertex_count = count_positions(coordinates)
        if vertex_count < 4 or vertex_count > 8000:
            raise ValueError("Field polygon must contain between 4 and 8,000 coordinate positions.")

        output_layers: list[dict[str, Any]] = []
        for layer in payload.layers:
            url = validate_cog_url(str(layer.url))
            summary = process_raster(url, payload.field_polygon, layer.value_type)
            output_layers.append({
                "name": layer.name,
                "frequency": layer.frequency,
                "polarization": layer.polarization,
                "nominal_pixel_spacing_m": layer.nominal_pixel_spacing_m,
                **summary,
            })

        qa: dict[str, Any] = {}
        for key, url_value in [
            ("mask", payload.quality_layers.mask),
            ("number_of_looks", payload.quality_layers.number_of_looks),
            ("rtc_gamma_to_sigma_factor", payload.quality_layers.rtc_gamma_to_sigma_factor),
        ]:
            if url_value is None:
                continue
            url = validate_cog_url(str(url_value))
            qa[key] = process_categorical(url, payload.field_polygon) if key == "mask" else process_raster(url, payload.field_polygon, "continuous")

        counts = [layer["valid_pixel_count"] for layer in output_layers]
        min_count = min(counts) if counts else 0
        quality_status = "sufficient_valid_pixels" if min_count >= payload.minimum_valid_pixels else "insufficient_valid_pixels"
        return {
            "ok": True,
            "field_id": payload.field_id,
            "source_product_id": payload.source_product_id,
            "acquired_at": payload.acquired_at,
            "processing_version": payload.processing_version,
            "quality_status": quality_status,
            "minimum_valid_pixels": payload.minimum_valid_pixels,
            "layers": output_layers,
            "quality_layers": qa,
            "method": "COG window read and exact field-polygon intersection; no full-product HDF5 download.",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)[:500]) from exc
