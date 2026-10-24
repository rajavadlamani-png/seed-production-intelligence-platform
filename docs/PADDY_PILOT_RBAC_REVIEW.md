# Paddy Pilot — Workflow and Access-Control Review

Status: engineering review note for `feature/configurable-paddy-templates`. This is not an approved operational access matrix.

## Pilot scope in the prototype

- Crop: Paddy
- State / district: Telangana / Karimnagar
- Season: Rabi 2026–27
- Expected start: November 2026
- Stages, in order:
  1. First Inspection Report
  2. Vegetative Report
  3. Pre Flowering Report
  4. Flowering Report
  5. Pre Harvesting Report
  6. Harvesting Report

These are the six configured labels. The prototype does not yet define the approved field list, mandatory values, evidence requirements, or allowed transitions for each stage.

## Designations versus platform roles

The prototype keeps these business designations separate and intentionally unmapped:

- Temporary Field Assistant (TFA)
- Field Officer
- Production Officer
- Territory Production Lead (TPL)

The database currently defines platform roles: `platform_admin`, `customer_admin`, `production_manager`, `territory_manager`, `field_officer`, and `viewer`. A business designation must not be treated as equivalent to a database role without an explicit decision from the pilot business owner.

## Existing technical controls

- Tenant tables use row-level security policies.
- Field access is scoped by company, territory, or active field assignment in the applicable policies.
- Form submission status transitions use a validated database function and append audit events.
- Published form versions are guarded against schema changes.
- Migration 0018 revokes direct client `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges on listed tenant-owned tables.
- The static template editor is browser-session-only and is not connected to the database.

These controls have been exercised in disposable/local test environments. They do not by themselves certify a hosted Supabase deployment or approve the pilot access model.

## Decisions required before the pilot can use live records

1. Confirm the exact inspection checklist for each of the six stages, including required fields, units, allowed options, photo/GPS evidence, and conditional questions.
2. Define who may create, edit, submit, review, reject, approve, and release each stage/report.
3. Approve the mapping, if any, from TFA, Field Officer, Production Officer, and TPL to platform roles and company/territory assignments.
4. Decide whether a report can be reopened after submission or approval, and who may do so; preserve the original audit trail.
5. Confirm whether stages must be completed in sequence, whether any stages can be skipped, and how resubmission works after rejection.
6. Load only authorized Karimnagar village, grower, and field master data, with verified field boundaries and season links.

## Safe next implementation sequence

1. Capture the approved checklist and access matrix as a version-controlled specification.
2. Convert each approved decision into database validation and role/tenant-scoped tests using synthetic accounts.
3. Run the full migration, local-stack, browser, and satellite synthetic checks.
4. Keep live extraction and production deployment disabled until an isolated pilot database, approved project reference, and authorized field registry are confirmed.

No business permissions or field definitions are inferred by this review.