# Pilot backend schema gap review — 24 October 2026

## Decision
This is a review/planning note only. No database migration, data write, Edge Function deployment, or production-branch change is authorized by this note.

## Migration draft status
- `database/migrations/20261024_0001_foundation_paddy_pilot.sql` defines the tenant, membership, farmer, season, field, seasonal field, field assignment, versioned inspection template, inspection report and audit-event foundation.
- Weather and satellite migrations are ordered as `20261024_0002_weather_audit_trail.sql` and `20261024_0003_satellite_audit_trail.sql` and now use UUID company/season/farmer/field identifiers. Composite foreign keys bind farmer to field, each observation to its matching weather location, and observations to matching ingestion runs.
- A GitHub Actions workflow, `.github/workflows/pilot-schema-migration-check.yml`, applies the three migrations in order to a disposable PostgreSQL 17 service with a minimal Supabase-auth scaffold, then tests that invalid field-officer assignments and farmer/field mismatches are rejected. The workflow is configured, but its CI result is not available in the connector status response.
- These files are still review drafts; they have not been applied to the Supabase pilot database.

## Verified current state
- The dedicated Supabase project reference is `xjtzvhtoeormizrhozoy`; prior read-only connector checks reported it `ACTIVE_HEALTHY`.
- The project currently has no public tables, no recorded migrations, and no deployed Edge Functions.
- The two audit migrations on this feature branch are `20261024_0002_weather_audit_trail.sql` and `20261024_0003_satellite_audit_trail.sql`.
- The authenticated read-only function exists in source at `supabase/functions/satellite-observations/index.ts`; it is not deployed or end-to-end tested.
- The browser prototype still uses simulated roles and has no verified Supabase sign-in/session flow.

## Remaining gaps after the draft changes

1. **Territory manager scope remains intentionally blocked.** The API returns HTTP 409 for `territory_manager` until a verified territory-to-field mapping is designed and implemented.
2. **The frontend is not authenticated.** The GitHub Pages prototype still uses simulated roles. Do not configure its satellite API URL until real Supabase Auth sign-in, company selection, bearer-token handling, logout and session-expiry behavior are implemented.
3. **Inspection persistence is not implemented end to end.** The foundation migration defines report/template tables, but there is no deployed API that validates answers, enforces the six-stage sequence, or handles submit/review/return transitions. Database schema alone does not enforce the stage order.
4. **Field boundary provenance needs a final policy.** The draft has a verified/unverified boundary status and verifier metadata, but the team still needs a reviewed procedure for polygon validation, versioning, changes and audit retention.
5. **Review history needs acceptance tests.** The API returns the most recent review status by `created_at`; test equal timestamps, multiple review records, and observation/company isolation before calling this production-ready.
6. **Pilot registry and role mapping are not approved.** No real field registry has been loaded. TFA, Field Officer, Production Officer and TPL remain business designations, not automatic platform roles.
7. **SQL validation is pending.** A disposable PostgreSQL 17 workflow has been added, but the connector has not returned a CI status. Do not describe the migrations as tested until a successful run is visible and reviewed.

## Recommended next sequence

1. Review the three ordered migration drafts: `20261024_0001_foundation_paddy_pilot.sql`, `20261024_0002_weather_audit_trail.sql`, and `20261024_0003_satellite_audit_trail.sql`.
2. Confirm the data dictionary, company/farmer/field identity rules, business designation mapping and report approval responsibilities.
3. Obtain a successful disposable-PostgreSQL migration CI run; resolve any SQL errors and review RLS, grants/revokes and immutable audit behavior.
4. Only after explicit approval, apply the reviewed migrations to the isolated Seed Production Intelligence Supabase project; do not touch ANVORA Beta Access or `main`.
5. Populate a small, verified pilot registry and test authentication, company isolation, current field assignments and API responses.
6. Implement the real sign-in flow and server-enforced six-stage inspection persistence before entering operational reports.
7. Deploy the read API only after the schema, secret configuration, CORS origins and acceptance tests are approved.

## Required acceptance checks before a pilot is called operational
- A signed-in user cannot read another company’s records even by changing URL parameters.
- A field officer can read only assigned fields; unassigned field requests return 403.
- Unknown or unmapped field IDs fail closed; territory manager access remains blocked until verified scope is implemented.
- Anonymous, invalid, expired, and missing tokens are rejected.
- No service-role key or provider secret is present in browser assets, browser network requests, Git history, or response payloads.
- RLS, grants/revokes, and Supabase security/performance advisors are reviewed after schema creation.
- A real field registry has verified polygons, crop/season, hybrid and planting dates. Satellite indices remain proxies, not disease diagnoses or direct yield measurements.
- Each of the six Paddy inspection stages has defined persistence, validation, and authorization rules before real field reports are entered.

## Explicitly not done
No SQL was applied to Supabase. No Edge Function was deployed. No real farmer/field data was created. No branch was merged and `main` remains untouched.
