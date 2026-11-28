import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform_geom

from main import process_raster, summarize_values, validate_cog_url


def test_gamma0_power_summary_includes_db_conversion():
    values = np.array([1.0, 10.0, 100.0])
    summary = summarize_values(values, "gamma0_power", 3)
    assert summary["valid_pixel_count"] == 3
    assert summary["median"] == 10.0
    assert summary["median_db"] == 10.0
    assert summary["positive_pixel_count"] == 3


def test_nonpositive_gamma0_values_are_excluded():
    values = np.array([0.0, -1.0, 1.0, 10.0])
    summary = summarize_values(values, "gamma0_power", 4)
    assert summary["valid_pixel_count"] == 2
    assert summary["nonpositive_pixel_count"] == 2
    assert summary["median"] == 5.5


def test_empty_summary_is_explicit():
    summary = summarize_values(np.array([]), "gamma0_power", 4)
    assert summary["valid_pixel_count"] == 0
    assert summary["median"] is None
    assert summary["median_db"] is None


def test_polygon_zonal_stats_reads_only_polygon_pixels(tmp_path):
    path = tmp_path / "sample.tif"
    transform = from_origin(500000, 1600100, 10, 10)
    values = np.arange(1, 101, dtype="float32").reshape(10, 10)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=10,
        width=10,
        count=1,
        dtype="float32",
        crs="EPSG:32643",
        transform=transform,
        nodata=-9999,
    ) as dst:
        dst.write(values, 1)

    projected_polygon = {
        "type": "Polygon",
        "coordinates": [[
            [500000, 1600100],
            [500050, 1600100],
            [500050, 1600050],
            [500000, 1600050],
            [500000, 1600100],
        ]],
    }
    polygon = transform_geom("EPSG:32643", "EPSG:4326", projected_polygon)
    result = process_raster(str(path), polygon, "gamma0_power")
    assert result["valid_pixel_count"] == 25
    assert result["median"] == 23.0
    assert result["median_db"] is not None
    assert result["candidate_pixel_count"] == 25


def test_cog_url_allowlist_rejects_untrusted_hosts(monkeypatch):
    monkeypatch.setenv("COG_ALLOWED_HOSTS", "harmony.earthdata.nasa.gov")
    try:
        validate_cog_url("https://example.com/data.tif")
    except ValueError as exc:
        assert "allowlist" in str(exc)
    else:
        raise AssertionError("Untrusted host should be rejected")


def test_cog_url_rejects_nonstandard_https_port(monkeypatch):
    monkeypatch.setenv("COG_ALLOWED_HOSTS", "harmony.earthdata.nasa.gov")
    try:
        validate_cog_url("https://harmony.earthdata.nasa.gov:8443/data.tif")
    except ValueError as exc:
        assert "standard HTTPS port" in str(exc)
    else:
        raise AssertionError("Nonstandard HTTPS port should be rejected")
