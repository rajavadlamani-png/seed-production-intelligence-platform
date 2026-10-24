# Field-level Sentinel extraction and audit trail — V1

## Intended behaviour
- Process active fields with verified polygons and stable company, farmer, field and crop-season IDs.
- Check daily and backfill every completed fixed five-day interval anchored to each field's crop-start or planting date. A previously successful interval is skipped; failed or no-observation intervals are retried. Five days is a target interval, not a guarantee of a clear optical pass every five days. Field records without a crop-start or planting date are logged and skipped because no auditable crop interval can be assigned.
- Sentinel-2 L2A: retain visible, NIR, red-edge and SWIR band statistics; derive NDVI, NDRE, NDMI, NDWI, EVI and SAVI when valid.
- Sentinel-1 GRD: retain VV and VH radar statistics and VV−VH / VV:VH features. Consider orbit geometry when comparing time series.
- Query the Sentinel Hub catalogue for products intersecting the field polygon and interval; record acquisition dates, product IDs and a separate catalogue-response hash when available. An empty Statistical API response is marked `no_observation` only when a successful catalogue query also confirms zero matching products; otherwise it is logged as a failed/unverified attempt. Save statistical API payload, interval, field boundary, source hash, retrieval timestamp, indices, interpretation version and attempt-level logs. Scene-level cloud cover, when supplied by the catalogue, is stored separately from field valid-pixel coverage; it must not be presented as field-level cloud coverage.
- Give plain-language notes with data-quality caveats and a human-review state. Never automatically diagnose disease or declare yield.

## Scientific scope and limits
Sentinel-2 bands include visible B02/B03/B04, red-edge B05/B06/B07/B8A, NIR B08 and SWIR B11/B12. NDVI is a greenness indicator; NDRE tracks red-edge/canopy changes; NDMI uses NIR/SWIR and is not a direct soil-moisture sensor. Sentinel-1 backscatter is affected by vegetation structure, surface roughness, water and acquisition geometry; a single value cannot uniquely diagnose stress. Clouds, shadows, field size, orbit coverage, processing delays and valid-pixel coverage can create gaps. Missing observations must be shown explicitly.

No satellite band directly measures yield. Yield estimation requires a crop/hybrid/stage-specific model calibrated and independently validated against actual harvest records. V1 does not produce a numeric yield forecast. The initial plain-language rules are explanatory heuristics, not agronomic thresholds; their version and evidence are stored for audit.

## Backend schema
The migration adds:
- seed_satellite_ingestion_runs: per-field, per-collection attempt logs, including failures and no-observation intervals.
- seed_satellite_observations: append-only raw provider response, band statistics, derived indices, interpretation, boundary, hashes and provenance.
- seed_satellite_interpretation_reviews: separate human review/correction record.
- field boundary and planting-date metadata to the field registry.

## Existing Cloudflare connector reuse
- Sentinel-1 extraction can call the existing ANVORA Cloudflare Worker at `https://anvora-eo-connector.raja-vadlamani.workers.dev/api/sentinel1`. The worker keeps Copernicus credentials server-side; the request carries the verified field polygon as `bounds.geometry`, not only a bounding box.
- Without `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET`, the collector defaults to Sentinel-1 only. The current ANVORA Worker contract is Sentinel-1-specific; Sentinel-2 optical extraction still requires direct CDSE credentials until a Sentinel-2 operation is added and deployed to the Worker.
- The Worker integration is implemented on this feature branch but has not yet passed a fresh authenticated end-to-end test from this collector. Do not treat the connector as validated for this pipeline until a real field request returns parseable Statistical API interval data.

## Deployment prerequisites
1. Apply this migration after the weather audit migration.
2. Populate the protected registry with real stable IDs, crop/season/hybrid, planting dates, verified polygon GeoJSON and field coordinates. Centroids alone are insufficient for field-level statistics. Never use synthetic demo farmers.
3. Configure `SEED_WEATHER_SUPABASE_URL` and `SEED_WEATHER_SUPABASE_SERVICE_ROLE_KEY` in GitHub Actions secrets for the dedicated approved database.
4. For Sentinel-2, configure `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` as GitHub Actions secrets, or first extend and deploy a secure Sentinel-2 operation in the Cloudflare Worker so provider credentials need not be duplicated in GitHub.
5. Test a small set of approved fields and validate provider response shape, channel mapping, interval semantics, pixel coverage and attribution before operational use.
6. This workflow is branch-only. GitHub scheduled workflows execute from the default branch, so the daily schedule will not activate until approved and merged to the default branch. Do not merge or deploy without explicit approval.

## Validation status
Backfill and catalogue provenance handling are implemented in the feature branch and pass script-syntax validation. This remains an unverified operational integration: authenticated responses must confirm catalogue collection IDs, acquisition-date fields, Statistical API response shape, evalscript channel mapping, valid-pixel coverage, interval semantics and provider quotas. A catalogue/statistics mismatch is recorded as a failed attempt rather than falsely labelled as no observation. Until an approved authenticated integration test passes, stored output is pilot evidence only, not an agronomic decision.
