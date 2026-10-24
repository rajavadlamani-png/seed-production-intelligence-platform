# Daily field weather audit trail — V1

## Requirement
Store one daily observed-weather record per active farmer field and crop season from crop start through harvest. The key is company, crop season, field and local observation date; selecting a different farmer in the UI must not change saved record identity. Daily rainfall is a primary measure.

## Data captured
- Identity: company, crop season, farmer, field, field code, crop, hybrid, village, district and state.
- Spatial provenance: latitude/longitude and whether the point represents field GPS or a captured boundary centroid.
- Open-Meteo Archive API daily observations: precipitation total, rain, showers, precipitation hours, maximum/minimum temperature, maximum wind speed/gust and reference ET₀.
- Audit provenance: observation date/timezone, source URL/licence, retrieval timestamp, full source response, SHA-256 response hash and ingestion-run ID.
- Every attempt, including failed attempts, has a separate run-log row with status, timestamp and error detail.

## Integrity and limitations
The seed_weather_daily table is append-only for a given company/season/field/date/source. A unique constraint and ignore-duplicates write prevent a retry overwriting an accepted observation. Failed attempts are logged separately so missing days are visible rather than treated as zero rainfall. No public/anonymous database access is granted.

This is weather-model/grid data associated with a field coordinate, not a physical rain-gauge reading at the exact field. Reports must label it estimated/grid weather data, not sensor-measured rainfall. Provider availability and revisions may affect historical data.

## Files
- database/migrations/20261024_weather_audit_trail.sql — tables, indexes, constraints and access controls.
- scripts/collect_daily_field_weather.py — fetches the previous India-local calendar day's observations and appends them to the database.
- .github/workflows/daily-field-weather-audit.yml — scheduled at 07:00 India time and manually runnable.

## Setup required before collection can work
1. Create/use a dedicated Seed Production Intelligence Platform PostgreSQL/Supabase database. Do not reuse ANVORA's database just because it exists.
2. Apply the SQL migration.
3. Insert approved field-location rows into seed_weather_locations with stable company/season/farmer/field identifiers and verified coordinates. Do not load the prototype's synthetic roster as production data.
4. In repository Settings → Secrets and variables → Actions, add SEED_WEATHER_SUPABASE_URL and SEED_WEATHER_SUPABASE_SERVICE_ROLE_KEY.
5. Manually run the Daily field weather audit workflow and inspect the summary and database rows before relying on the schedule.
6. Establish data retention, backup/restore, service-role rotation and operational ownership before loading real farmer-linked data.

The scheduled job is committed to the feature branch only. It will not run successfully until the migration, field registry and repository secrets are configured. The static GitHub Pages prototype itself does not provide durable storage, authenticated server APIs, or a production audit trail.

## Next integration
The MIS must write verified farmer/field/crop-season identities and GPS boundary centroids to the protected location registry through an authenticated backend. Never expose the service-role key in browser JavaScript. The dashboard can then read history through a server-enforced API and show rainfall charts, missing-day indicators and crop-season summaries.
