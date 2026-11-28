# Automated NISAR field-monitoring pipeline

## Purpose

Add NISAR L-band GCOV as a second SAR source alongside the existing Sentinel-1 workflow. Field officers and managers must not download HDF5 products, run scripts, or repeat setup for individual fields.

The intended user experience is: register/maintain a field polygon once; the platform discovers new satellite acquisitions, requests only the required NISAR layers and area, calculates field-level statistics, and stores a provenance-rich time series.

## What is already present

- `beta_field_records` stores the company, field number, and field metadata in `record_data`.
- `s1-backscatter-trend` discovers Sentinel-1 IW acquisitions and calls the existing ANVORA EO connector for statistics. Its current geometry is a circular buffer around a field reference point, not the exact field polygon.
- `multisensor-drainage-catalogue` discovers ASF NISAR L-band and Bhoonidhi products for one field. It is catalogue discovery only; it does not submit NISAR processing jobs or calculate field statistics.
- `s1_backscatter_observations` stores Sentinel-1 summaries. `satellite_observations` is a more generic table but currently has no NISAR-specific processing contract.

Do not silently treat the current Sentinel-1 circular-buffer observations as polygon-level field measurements.

## Recommended design

### 1. Field registry remains the source of truth

- Use the saved field polygon from `beta_field_records.record_data`.
- Do not alter or re-draw the registered polygon as part of satellite processing.
- Validate geometry and retain the original polygon. A simplified geometry may be used for provider search only; all final statistics must use the original polygon.
- Process fields in batches by company and geographic region.

### 2. Discovery and deduplication

- Use the ASF DAAC NISAR search API to discover GCOV products intersecting field areas.
- Prefer Production (PR) products over Urgent Response (UR) when both represent the same acquisition. Keep UR as a fallback/alternative, not a duplicate time-series observation.
- Deduplicate by stable product/acquisition identity.
- Group fields intersecting the same product so the product is requested once per processing batch, not once per field.
- Keep catalogue discovery status separate from processing status.

### 3. Use NASA Harmony for data extraction

Do not download full HDF5 products to a user's computer or to a general application server.

Use NASA Harmony's NISAR GCOV customization service to:
- extract only selected two-dimensional GCOV variables;
- spatially subset the requested area;
- return Cloud Optimized GeoTIFF (COG) outputs;
- track the asynchronous Harmony job until outputs are ready.

The variable inventory must be obtained from the live collection capabilities/product metadata. Do not hard-code the assumption that every polarization or frequency exists in every product.

For each product, request only the applicable real-valued diagonal covariance layers, plus quality/context layers where available:
- the available co-/cross-polarized diagonal backscatter terms (for example HHHH, HVHV, VVVV, VHVH, RHRH or RVRV);
- `mask`;
- `numberOfLooks`;
- `rtcGammaToSigmaFactor`.

The actual layer names are selected from the product's available variables and acquisition polarization. Complex off-diagonal covariance terms are not part of the first field-monitoring release.

### 4. Central geospatial processor

Harmony is the extraction/subsetting service, not the field-statistics engine. The initial COG-to-polygon statistics worker is now present at `services/nisar-cog-processor/`.

The worker:
- opens remote COGs through GDAL `/vsicurl/` and HTTP range reads rather than intentionally downloading complete source rasters;
- transforms the original WGS84 Polygon/MultiPolygon into the COG CRS;
- calculates field-interior median, 25th percentile and 75th percentile for each supplied layer;
- reports valid-pixel count, candidate pixel count, valid-pixel fraction, raster CRS, dimensions, pixel size and no-data metadata;
- converts positive gamma0 power to dB and reports the number of positive samples;
- records raw mask class counts without interpreting undocumented bit flags;
- enforces an HTTPS host allowlist, a shared service token, a maximum polygon vertex count and a maximum raster window size.

The worker deliberately does **not** interpret the GCOV mask bit flags or apply them as a validity filter yet. The mask's class/bit semantics must first be validated against the relevant product specification and a real Harmony output. No-data and non-finite pixels are excluded.

The worker returns metrics only. It does not authenticate to Earthdata, submit Harmony jobs, write to Supabase, or persist raster assets. The coordinator uses `nisar_processing_jobs` for service-managed job state and `nisar_field_observations` for tenant-readable NISAR metrics linked to `beta_field_records`. This is deliberately separate from `satellite_observations`, whose foreign key targets the distinct production `fields` registry.

### 5. Resolution and field-scale rules

- Prefer Frequency A products at 10 m or 20 m nominal spacing for field-level analysis.
- Frequency B at 80 m is too coarse to be the primary signal for small production plots; it may be retained as contextual coverage only.
- Pixel counts estimated from field area are planning estimates only. Use actual valid pixels after polygon intersection.
- For small fields, enforce a configurable minimum valid-pixel threshold and return a quality status when the threshold is not met. The threshold must be validated against real sample products before production use.

### 6. Shared observations, sensor-specific metrics

Store NISAR and Sentinel-1 in a common observation framework where possible, but retain sensor-specific source metadata and processing versions.

Do not directly compare or merge Sentinel-1 VV/VH Gamma0 summaries with NISAR GCOV covariance terms as if they were interchangeable. Any cross-sensor normalization or fusion requires a separately validated method.

For WH-SYN-016, keep the existing Sentinel-1 circular-buffer series as a historical contextual baseline. New NISAR statistics must use the saved field polygon. If a fair sensor comparison is required, reprocess Sentinel-1 over that same polygon.

### 7. Scheduling and operations

- Run a scheduled catalogue refresh for all eligible active fields, grouped by company/geography.
- Add only new products to the processing queue; do not reprocess completed products unless the processing version or source product changes.
- Use bounded concurrency, retries with backoff, idempotency keys and explicit failed/retryable/permanent states.
- Poll Harmony jobs asynchronously. Persist the job ID and resume after function restarts.
- Store derived COG assets only when required for audit/reprocessing; apply retention and access controls. Store metrics and provenance in Postgres.
- Provide a batch status view: fields checked, new acquisitions, products deduplicated, jobs submitted/completed, fields with valid observations, and failures.

## Proposed processing states

`discovered → queued → harmony_submitted → harmony_ready → statistics_running → completed`

Failure states:
- `catalogue_failed`
- `harmony_failed`
- `processing_failed`
- `insufficient_valid_pixels`

Each state transition must retain timestamps and a diagnostic message. Retrying must not create duplicate observations.

## Security and credentials

- Earthdata Login authentication is required for NISAR data access and Harmony transformations.
- Store Earthdata credentials or an approved token in server-side secret management only. Never place them in browser code, GitHub, logs, SQL fixtures or user-visible output.
- Prefer a short-lived server-side Earthdata session/token where supported; refresh it centrally.
- The public GitHub Pages demo must not expose real field data, credentials or private processing outputs.
- Enforce active company membership before a user can initiate or inspect company field jobs.

## WH-SYN-016 pilot acceptance criteria

1. The existing saved boundary remains unchanged.
2. ASF discovery returns candidate NISAR GCOV products for the saved boundary.
3. The system chooses a PR product where an equivalent UR product exists, while preserving the alternative in metadata.
4. Harmony capability discovery confirms the selected GCOV collection and available variables.
5. A Harmony job extracts a spatial subset as COG without a user downloading the full HDF5 product.
6. The processor calculates polygon-interior statistics using the original 731-point field boundary.
7. The result records actual valid-pixel count, mask/quality metadata, resolution, polarization, acquisition date and processing provenance.
8. The result is stored once and can be retrieved through the field's satellite-observation history.
9. A batch run over multiple fields deduplicates shared source products.
10. No existing Sentinel-1 records or field geometry are modified.

## Implementation sequence

1. **Completed:** apply the NISAR job/observation migrations and verify tenant-scoped access.
2. Extend the current single-field ASF discovery into batch discovery and cross-field product deduplication.
3. Configure/verify Earthdata and processor secrets in Supabase Edge Functions.
4. **Completed:** deploy the authenticated Harmony coordinator. Deploy the private COG processor to an approved container host.
5. Verify live Harmony capabilities and submit the WH-SYN-016 sample product.
6. Validate the real COG output, field-polygon statistics and mask semantics.
7. Enable scheduled batch processing only after the pilot passes.
8. Add the NISAR series to the satellite report with clear sensor/source labels.

## Current implementation status

- Design, COG polygon-statistics worker source, and Harmony coordinator source are included in this draft PR.
- The pilot field WH-SYN-016 has 731 saved boundary points, and the stored ring is already closed. The coordinator preserves all points and uses the bounding box only for Harmony extraction; the worker clips statistics to the saved polygon.
- The beta field registry is not the same table as the production `fields` registry. The migration therefore introduces a separate `nisar_field_observations` table rather than attempting to write pilot records into the incompatible `satellite_observations` foreign key.
- The two NISAR database migrations have been applied and verified. The authenticated Harmony coordinator is deployed with JWT verification enabled. No Earthdata token or processor endpoint secret has been configured, and no real Harmony COG has been processed.
- ASF polygon discovery, PR/UR grouping and Harmony submission/polling are implemented. The Supabase Edge Function deployment is active with JWT verification enabled; the deployment was accepted by Supabase, but the function has not yet been exercised with an authenticated user against live ASF/Harmony services.
- The orchestration is not end-to-end operational until Earthdata access, the private processor deployment, live COG output validation, mask interpretation and the WH-SYN-016 pilot are complete.

## Explicit non-goals for the first release

- No manual HDF5 download by field officers or managers.
- No use of 80 m Frequency B as the primary small-field signal.
- No automated drainage, irrigation or soil-moisture conclusion from backscatter alone.
- No merging of NISAR and Sentinel-1 metrics without validation.
- No automatic deployment or production scheduling until Earthdata credentials, the orchestration path and pilot validation are complete.
