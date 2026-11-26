# NISAR Harmony orchestration

This Supabase Edge Function is the authenticated coordinator between the field registry, NASA Harmony and the private COG polygon-statistics worker.

## Actions

All requests are POST and require a valid Supabase user JWT.

### 1. Inspect live collection capabilities

```json
{ "action": "capabilities" }
```

The function queries Harmony's live `/capabilities?shortName=...` endpoint and returns the collection concept ID, output formats and available variables. The configured collection short name defaults to `NISAR_L2_GCOV_PROVISIONAL_V1` and can be overridden by a server-side secret.

### 2. Submit one field/product extraction

```json
{
  "action": "submit",
  "fieldId": "<field UUID>",
  "productId": "<stable ASF product/granule identifier>",
  "productName": "NISAR_L2_PR_GCOV_..."
}
```

The function verifies the signed-in user's active company membership, reads the saved field boundary, preserves every saved boundary point, derives a bounding box for Harmony subsetting, chooses Frequency A variables supported by the live collection capabilities and the product's polarization mode, submits an asynchronous Harmony job, and persists the Harmony job ID.

### 3. Poll and complete the job

```json
{ "action": "poll", "jobId": "<nisar_processing_jobs UUID>" }
```

When Harmony reports completion, the function reads the output STAC assets, validates their HTTPS hosts, sends the COG links and exact saved field polygon to the private processor, then stores metrics and provenance in `satellite_observations`.

## Required database migration

Apply `supabase/migrations/20261126080000_nisar_processing_jobs.sql` before calling `submit` or `poll`. The job table is service-managed: RLS is enabled and direct access is revoked from `anon` and `authenticated`.

## Required Edge Function secrets

- `EARTHDATA_BEARER_TOKEN`: NASA Earthdata Login bearer token. Never put it in source control or send it in chat.
- `NISAR_GCOV_COLLECTION_SHORT_NAME`: optional; defaults to `NISAR_L2_GCOV_PROVISIONAL_V1`.
- `NISAR_PROCESSOR_URL`: HTTPS base URL of the deployed private COG processor.
- `NISAR_PROCESSOR_TOKEN`: must match the processor's private service token.
- `NISAR_COG_ALLOWED_HOSTS`: optional comma-separated exact host allowlist for Harmony output assets. Defaults to `harmony.earthdata.nasa.gov`. Configure the same hostname list in the worker's `COG_ALLOWED_HOSTS` setting.
- `HARMONY_ROOT`: optional; defaults to `https://harmony.earthdata.nasa.gov`.

Supabase's built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` are used by the function runtime.

## Processing contract and limitations

- The initial implementation supports NISAR L-band GCOV Frequency A diagonal covariance layers for SH, SV, DH, DV and QP polarization modes. Compact-pol modes are deliberately rejected until their variable mapping is validated. It derives Frequency A nominal spacing from the product bandwidth code and rejects 80 m Frequency A cases for the small-field pilot.
- Harmony is asked to export GeoTIFF/COG layers and spatially subset to the field bounding box. The worker then clips to the exact field polygon. The bounding box is only an extraction optimization, not the field-statistics AOI.
- Product filename parsing is used to determine acquisition timestamp and polarization mode. Confirm the product's full granule filename and collection membership before submitting.
- The current function uses a single field/product job. Batch deduplication and scheduled discovery are a later layer.
- The COG processor's mask classes are recorded but not interpreted or applied as bit masks yet. That needs validation against the NISAR product specification and real COG output.
- The worker's configured COG host allowlist must include the actual hostnames returned by Harmony STAC. Do not allow arbitrary hosts.
- Temporary Harmony asset URLs are used in-memory and are not stored in the database.
- Polling is request-driven. A scheduled poller/queue worker is still needed for unattended operations.
- No production secrets are committed here.
