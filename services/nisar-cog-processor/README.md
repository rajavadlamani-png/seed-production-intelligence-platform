# NISAR COG polygon-statistics worker

This service is the raster-computation component for the automated NISAR workflow. It accepts short-lived HTTPS COG links returned by the NASA Harmony orchestration layer and computes field-polygon summaries. It does not search ASF, authenticate to Earthdata, submit Harmony jobs, write to Supabase, or store source rasters.

## Why COG

The worker opens remote COGs through GDAL `/vsicurl/` so it can issue HTTP range reads for the field window. It does not intentionally download the complete HDF5 product or COG. The source URL must be HTTPS and its hostname must be in `COG_ALLOWED_HOSTS`.

## Runtime configuration

Required:
- `NISAR_PROCESSOR_TOKEN`: long random shared secret used by the private caller.

Optional:
- `COG_ALLOWED_HOSTS`: comma-separated exact host allowlist. Defaults to `harmony.earthdata.nasa.gov`.
- `MAX_WINDOW_PIXELS`: maximum raster window size allowed for one field/layer. Defaults to 5,000,000.

Do not commit secrets or place them in browser code. Deploy this service behind private networking or an authenticated service gateway, and rotate the shared token if it is exposed.

## API

### Health

`GET /health`

### Field zonal statistics

`POST /v1/zonal-stats`

Header:

`Authorization: Bearer <NISAR_PROCESSOR_TOKEN>`

Example request:

```json
{
  "field_id": "WH-SYN-016",
  "source_product_id": "NISAR_L2_PR_GCOV_...",
  "acquired_at": "2026-11-18T00:25:21Z",
  "field_polygon": {
    "type": "Polygon",
    "coordinates": [[[75.65, 14.45], [75.651, 14.45], [75.651, 14.451], [75.65, 14.45]]]
  },
  "layers": [
    {
      "name": "/science/LSAR/GCOV/grids/frequencyA/VVVV",
      "url": "https://harmony.earthdata.nasa.gov/service-results/...",
      "frequency": "A",
      "polarization": "VV",
      "nominal_pixel_spacing_m": 10,
      "value_type": "gamma0_power"
    }
  ],
  "quality_layers": {
    "mask": "https://harmony.earthdata.nasa.gov/service-results/...",
    "number_of_looks": "https://harmony.earthdata.nasa.gov/service-results/...",
    "rtc_gamma_to_sigma_factor": "https://harmony.earthdata.nasa.gov/service-results/..."
  },
  "minimum_valid_pixels": 5
}
```

The coordinates above are illustrative only; callers must send the exact saved field polygon. Product IDs, layer availability, URLs and pixel spacing must come from actual ASF/Harmony metadata, never from this example.

The response contains, per layer:
- valid and candidate pixel counts and valid-pixel fraction;
- median, 25th and 75th percentiles of the source values;
- median dB derived from positive gamma0 power values;
- raster CRS, dimensions, pixel size and nodata metadata.

The optional mask layer is returned as raw class counts. This service deliberately does not interpret mask bit flags until their semantics are validated against the relevant NISAR product specification. It also reports number-of-looks and RTC gamma-to-sigma factor summaries when supplied.

## Processing notes

- Input geometry is the original field Polygon or MultiPolygon in WGS84 (EPSG:4326).
- Pixel inclusion uses pixel centres (`all_touched=False`) for reproducible polygon statistics.
- No-data and non-finite pixels are excluded.
- Gamma0 power remains available in its source linear units; dB is calculated as `10 * log10(power)` for positive values.
- `insufficient_valid_pixels` is returned when the smallest valid-pixel count among requested backscatter layers is below the configured threshold.
- The worker returns metrics only. The authenticated orchestrator is responsible for persisting them with company/field/product provenance in Supabase.

## Local checks

From this directory:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

The tests use a synthetic local GeoTIFF. They do not require Earthdata credentials or access to live NISAR products.

## Deployment status

Source code only. This service has not been deployed, connected to live Harmony jobs, or given production credentials. Do not point production workflows at it until the orchestrator, secret management, network policy, live COG test and Supabase persistence path are implemented and validated.
