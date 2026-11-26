# NISAR Harmony orchestration

This Supabase Edge Function is the authenticated coordinator between the field registry, NASA Harmony and the private COG polygon-statistics worker.

## Actions

All requests are POST and require a valid Supabase user JWT.

### 1. Discover NISAR GCOV products for a saved field

```json
{
  "action": "discover",
  "fieldId": "<field UUID>",
  "from": "2026-10-01",
  "to": "2026-11-26"
}
```

The function verifies company membership, uses every saved boundary point to form the ASF polygon search, and groups products by acquisition identity. It prefers a unique PR product, uses a unique UR product only as a fallback, and flags ambiguous duplicate PR variants rather than choosing one without a footprint tie-break. The date range is limited to 365 days per request.

### 2. Inspect live collection capabilities

```json
{ "action": "capabilities" }
```

The function queries Harmony's live `/capabilities?shortName=...` endpoint and returns the collection concept ID, output formats and available variables. The configured collection short name defaults to `NISAR_L2_GCOV_PROVISIONAL_V1` and can be overridden by a server-side secret.

### 3. Submit one field/product extraction

```json
{
  "action": "submit",
  "fieldId": "<field UUID>",
  "productId": "<stable ASF product/granule identifier>",
  "productName": "NISAR_L2_PR_GCOV_..."
}
```

The function verifies the signed-in user's active company membership, reads the saved field boundary, preserves every saved boundary point, derives a bounding box for Harmony subsetting, chooses Frequency A variables supported by the live collection capabilities and the product's polarization mode, submits an asynchronous Harmony job, and persists the Harmony job ID.

### 4. Poll and complete the job

```json
{ "action": "poll", "jobId": "<nisar_processing_jobs UUID>" }
```

When Harmony reports completion, the function reads the output STAC assets, validates their HTTPS hosts, sends the COG links and exact saved field polygon to the private processor, then stores metrics and provenance in `nisar_field_observations`. This dedicated table references `beta_field_records`; it does not write to `satellite_observations`, whose foreign key targets the separate production `fields` registry.

## Required database migration

Apply `supabase/migrations/20261126080000_nisar_processing_jobs.sql` before calling `submit` or `poll`. The job table is service-managed: RLS is enabled and direct access is revoked from `anon` and `authenticated`. The migration also creates `nisar_field_observations`, with tenant-scoped SELECT policy for authenticated company members and service-role-only writes.

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
- ASF discovery is now available for one field and one date range per request. The coordinator groups PR/UR variants, but does not yet automatically submit every ready group. The initial processing action remains one selected field/product at a time; batch deduplication and scheduled discovery are a later layer.
- The pilot registry `beta_field_records` and production `fields` registry are distinct. NISAR pilot observations therefore go to `nisar_field_observations`, not `satellite_observations`.
- The COG processor's mask classes are recorded but not interpreted or applied as bit masks yet. That needs validation against the NISAR product specification and real COG output.
- The worker's configured COG host allowlist must include the actual hostnames returned by Harmony STAC. Do not allow arbitrary hosts.
- Temporary Harmony asset URLs are used in-memory and are not stored in the database.
- Polling is request-driven. A scheduled poller/queue worker is still needed for unattended operations.
- No production secrets are committed here.
