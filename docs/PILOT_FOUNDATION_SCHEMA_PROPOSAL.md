# Foundation schema proposal — Paddy pilot

**Status: design proposal.** The companion executable migration draft is [`20261024_0001_foundation_paddy_pilot.sql`](../database/migrations/20261024_0001_foundation_paddy_pilot.sql), followed by [`20261024_0002_weather_audit_trail.sql`](../database/migrations/20261024_0002_weather_audit_trail.sql) and [`20261024_0003_satellite_audit_trail.sql`](../database/migrations/20261024_0003_satellite_audit_trail.sql). The SQL drafts have not been applied to Supabase, and CI execution has not yet been confirmed. Review the data model and business-role mapping before any application.

## Pilot boundary
- Crop: Paddy
- Geography: Telangana, Karimnagar
- Season: Rabi 2026–27
- Expected start: November 2026
- Inspection sequence: First Inspection Report → Vegetative Report → Pre Flowering Report → Flowering Report → Pre Harvesting Report → Harvesting Report

The existing `template-config.js` explicitly marks the four business designations (TFA, Field Officer, Production Officer, TPL) as **Unmapped**. Keep them unmapped until the owner approves a role-to-designation matrix. Do not infer platform permissions from labels.

## Canonical identity rules
- Use internal UUID primary keys for companies, memberships, farmers, fields, seasons, and reports.
- Keep external references (SAP farmer/field/lot numbers, seasonal field numbers, legacy codes) in separate text columns; never use them as authorization evidence.
- Use UUID `company_id` foreign keys in all company-scoped records, including weather and satellite audit tables. Update those two existing migrations before first application; do not apply the current text-`company_id` versions and later guess a cast.
- Link a membership to `auth.users(id)`; the user must have an active membership in the requested company.
- Keep a unique stable field record per company and season assignment rules explicit. A farmer can have multiple fields and a field may have seasonal production records; don't overload one identifier for all three concepts.

## Proposed entities

| Entity | Purpose | Core constraints |
|---|---|---|
| `companies` | Tenant/customer boundary | UUID PK; active state; created/updated timestamps |
| `company_memberships` | User membership and platform role | FK to company and `auth.users`; unique company/user; constrained role; active/inactive status |
| `farmers` | Farmer identity within a company | UUID PK; company FK; external farmer reference; only minimum necessary personal data |
| `crop_seasons` | Crop and season context | UUID PK; company FK; crop, season label, geography, date range and lifecycle |
| `fields` | Stable physical field registry | UUID PK; company FK; farmer FK; stable field code; verified boundary/provenance; coordinates and area metadata |
| `seasonal_field_records` | Field participation in a specific crop season | UUID PK; season and field FKs; seasonal field number, hybrid, parent seed/lot references as applicable; unique season + seasonal field number |
| `field_assignments` | Field-officer scope | Company, membership, field/season record, effective dates and active status; same-company constraints |
| `territory_assignments` | Future verified territory scope | Add only after territory ownership, hierarchy and reassignment rules are confirmed |
| `inspection_template_versions` | Versioned report structure | Stage key, crop, version, lifecycle and schema JSON; published versions immutable |
| `inspection_reports` | Six-stage field reports | Company, season, seasonal field record, stage key, template version, status, reporter/reviewer IDs, timestamps and revision |
| `inspection_report_values` or versioned JSON payload | Answers to versioned form fields | Preserve field IDs and answer types; validation against the exact template version; immutable submitted revisions |
| `inspection_report_events` | Audit trail for submission/review/return | Append-only actor, event, timestamp, prior/new state and reason |

## Inspection workflow requirements
- Persist the exact template version used for every report. A later template edit must not change the meaning of an already submitted report.
- Separate Draft, Submitted for Approval, Approved/Returned and any later operational state transitions. Define the permitted transitions before implementing the API.
- A draft must not unlock the next stage. The current prototype already intends this sequence, but the server must enforce it.
- Store submitter, reviewer, review timestamps, return reasons and revision history. Do not allow the client to set reviewer identity or approval state without server-side authorization.
- Keep photos, GPS boundaries, chemical/fertilizer application logs, quality flags, SAP lot context and harvested weight/area as separately typed or well-validated records where appropriate; avoid putting all operational facts into an opaque unvalidated blob.
- Store area with an explicit unit and provenance (GPS polygon, verified registry, or manual measurement). Never treat a sample walk or demo value as verified acreage.
- Prevent cross-company reads and writes at both API authorization and database policy/grant layers.

## Field identity contract for weather and satellite
Choose one canonical internal field UUID for the field registry. In weather/satellite evidence, store that UUID as `field_id` (UUID) and preserve external/seasonal field codes in separate columns. If a transitional external text ID is needed, name it explicitly (for example `source_field_reference`) and never mix it with an internal UUID. Update all indexes, unique constraints, collector payloads, and API filters together.

## Decisions needed before executable migration
1. Confirm whether one farmer may be associated with multiple companies and whether farmer records must be tenant-local or centrally deduplicated.
2. Confirm the meaning and uniqueness scope of seasonal field numbers and SAP field/farmer/lot references.
3. Approve the platform role matrix and the separate business designation mapping. Current designation records are all marked Unmapped.
4. Confirm who can create, submit, review, return and approve each inspection stage; define separation of duties.
5. Confirm whether TPL means a territory-level manager in the pilot and how territory-to-field assignments are maintained.
6. Confirm exact fields and validation rules for all six Paddy forms against the approved source forms/SOPs.
7. Confirm data retention, farmer privacy, photo storage and audit retention requirements.
8. Confirm whether the pilot is restricted to synthetic/demo records until the field registry and user access are formally approved.

## Proposed implementation order
1. Resolve decisions above and freeze the pilot data dictionary.
2. Draft an executable foundation migration with foreign keys, checks, indexes, RLS, and least-privilege grants.
3. Revise weather/satellite migrations to the canonical UUID contract and run static/SQL validation in an isolated environment.
4. Add role and field-scope tests before deploying the read API.
5. Add server-side inspection persistence and sequence enforcement.
6. Integrate real Supabase Auth into the frontend only after the API tests pass.
7. Load a small approved pilot registry and verify every record against the source roster before any real inspection is entered.

## Not performed
No SQL or data changes have been made in Supabase. No function was deployed. No real farmer data was loaded. The production/default branch was not modified.
