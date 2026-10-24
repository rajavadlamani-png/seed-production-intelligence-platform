# Pilot backend schema gap review — 24 October 2026

## Decision
This is a review/planning note only. No database migration, data write, Edge Function deployment, or production-branch change is authorized by this note.

## Migration draft status
- `database/migrations/20261024_0001_foundation_paddy_pilot.sql` defines the tenant, membership, farmer, season, field, seasonal field, field assignment, versioned inspection template, inspection report and audit-event foundation.
- Weather and satellite migrations are ordered as `20261024_0002_weather_audit_trail.sql` and `20261024_0003_satellite_audit_trail.sql` and now use UUID company/season/farmer/field identifiers.
- A GitHub Actions workflow, `.github/workflows/pilot-schema-migration-check.yml`, now applies the three migrations in order to a disposable PostgreSQL 17 service with a minimal Supabase-auth scaffold. This validates SQL execution without touching the pilot project. Its CI result is not yet available in the connector status response.
- These files are still review drafts; they have not been applied to the Supabase pilot database.

## Verified current state
- The dedicated Supabase project reference is `xjtzvhtoeormizrhozoy`; prior read-only connector checks reported it `ACTIVE_HEALTHY`.
- The project currently has no public tables, no recorded migrations, and no deployed Edge Functions.
- The two audit migrations on this feature branch are `20261024_0002_weather_audit_trail.sql` and `20261024_0003_satellite_audit_trail.sql`.
- The authenticated read-only function exists in source at `supabase/functions/satellite-observations/index.ts`; it is not deployed or end-to-end tested.
- The browser prototype still uses simulated roles and has no verified Supabase sign-in/session flow.

## Blocking schema/API mismatches

1. **Company identifier type:** both audit migrations define `company_id text`; the API rejects anything except a UUID-shaped `company_id`. Decide the canonical company ID type before the first migration. Recommended: UUID primary key in a `companies` registry, and UUID foreign keys throughout company-scoped tables. Do not silently cast production identifiers.
2. **Membership table absent:** the API expects `company_memberships(id, company_id, user_id, role, is_active)`. The project currently has no such table. `user_id` should reference `auth.users(id)`; membership should have a unique company/user pair and a constrained platform role.
3. **Field registry absent:** the API expects `fields(id, company_id, field_code)`, but no migration defines it. The weather/satellite ledgers store `field_id text`, whereas the function treats assignment `field_id` as the `fields.id` value. This needs an explicit mapping, not an implicit assumption.
4. **Assignment registry absent:** the API expects `field_assignments(company_id, field_officer_membership_id, field_id)`. The migration must enforce that the membership and field belong to the same company, assignments are active/current, and duplicate assignments are prevented.
5. **Field-officer filter ambiguity:** the function accepts a field ID or field code, but its query combines `field_id` and `field_code`. A stable canonical field key and a safe query strategy are required; user-supplied identifiers must not be treated as SQL filter syntax.
6. **Territory manager intentionally blocked:** the function returns HTTP 409 for `territory_manager` until a verified territory-to-field mapping exists. Keep this fail-closed behavior until the assignment model is designed and tested.
7. **Review status scope:** review records reference observations but do not themselves carry `company_id`. The function currently fetches review statuses by observation IDs from an already company-filtered result, which is acceptable only while the observation IDs are trusted and the service-role query remains server-side. Prefer an explicit unique/latest-review rule and add tests for multiple reviews.
8. **No authenticated UI integration:** do not set the frontend API URL until real Supabase Auth sign-in, company selection, bearer-token handling, and logout/session expiry are implemented. The current simulated role selector is not security.

## Recommended migration sequence (proposal; not applied)

1. **Foundation:** `companies`, `company_memberships`, `crop_seasons`, `fields`, and the minimal farmer/production registry required by the six-stage Paddy pilot. Reference `auth.users` for membership; constrain roles; use UUID internal primary keys and retain external/SAP field or farmer references in separate text columns.
2. **Assignments and scope:** `field_assignments` plus territory-to-field / territory-to-officer mapping only after the business hierarchy is confirmed. Add same-company integrity checks and active date/status fields. Do not infer platform role from TFA, Field Officer, Production Officer, or TPL designation.
3. **Weather audit:** adapt `20261024_0002_weather_audit_trail.sql` to the canonical IDs and apply RLS/revokes/grants consistently.
4. **Satellite audit:** adapt `20261024_0003_satellite_audit_trail.sql` to the same IDs, preserve append-only evidence and review history, and define a clear field-boundary provenance/version policy.
5. **Read API:** update the function to the final schema, add automated tests for authentication, company isolation, field assignment isolation, invalid identifiers, CORS, and review selection. Deploy only after explicit approval and configuration review.
6. **UI integration:** add a real authentication/session flow and replace demo-only role checks with server-enforced access. Keep sample data visibly labelled as synthetic until real approved field data is ingested and checked.

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
