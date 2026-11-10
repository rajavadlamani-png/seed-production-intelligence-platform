# Live-Schema Staging Validation Runbook

**Purpose:** establish a safe, isolated staging schema that can validate a targeted remediation for the live `public.crops` and `public.hybrids` ACL findings.

**Current status:** planning document only. The dedicated staging project `afhifiiwmaxuiwctstzo` was checked and found to have no public tables and no migration history. No hosted schema or grant changes have been made.

## Non-negotiable safety boundaries

- Do not run repository migrations `0001–0018` against the live project. They define a materially different baseline.
- Do not run `supabase db reset --linked` against any hosted project.
- Do not copy production table rows, grower information, employee information, farm boundaries, customer data, or audit data into staging.
- Do not use service-role credentials in browser code, chat, issues, or commits.
- Do not use the ANVORA project as staging.
- Do not apply the proposed ACL SQL until the staging schema and existing grants/policies have been independently reviewed.
- If any target, schema, policy name, or migration history is unexpected, stop and investigate rather than retrying with another project.

## Why a simple schema export is not automatically safe

A schema-only export can still contain security-sensitive definitions, function bodies, role grants, extension references, ownership assumptions, and environment-specific objects. The live project also differs from the repository baseline. Therefore, an unreviewed dump must not be restored wholesale into staging.

## Controlled workflow

### Gate 1 — Confirm the target

An authorized project owner verifies in the Supabase Dashboard that the project selected is **Seed Production Intelligence – Staging** and checks the project reference against the expected staging reference. Do not proceed if it resolves to production or ANVORA.

### Gate 2 — Capture only the required metadata

Using read-only inspection, record the following for `public.crops` and `public.hybrids`:

- columns and data types;
- primary, unique, and foreign-key constraints;
- RLS enabled/forced status;
- policy names, commands, roles, USING predicates, and WITH CHECK predicates;
- table and schema grants for `anon`, `authenticated`, `PUBLIC`, and relevant inherited roles;
- relevant helper function signatures, security mode, and search path;
- relevant triggers and indexes.

Do not export row data. Avoid broad dumps of unrelated schemas. Have a second reviewer compare the metadata with the previously recorded live-schema observations.

### Gate 3 — Build a minimal staging-only harness

Create only the two master tables and the minimum synthetic company/membership/helper objects needed to exercise their real policies. The harness must use clearly synthetic identifiers and values. It must not include actual customer, grower, field, or hybrid data. Keep the harness separate from deployment migrations until reviewed.

The harness should match the observed live column naming:
- `crops`: `id, company_id, crop_code, name, is_active, created_at`
- `hybrids`: `id, company_id, crop_id, hybrid_code, name, is_active, created_at`
- membership role/status fields: `role_key` and `status`

These listed columns are the previously observed minimum, not a substitute for a complete schema comparison.

### Gate 4 — Baseline tests before changing grants

Record the current privileges and policy behavior in staging. Test the effective privilege checks for both `anon` and `authenticated` without executing destructive operations. Use synthetic rows to test tenant visibility and same-company hybrid-to-crop references. Include a known-UUID cross-tenant read attempt.

### Gate 5 — Apply the reviewed proposal in staging only

After review, apply the proposed narrow ACL change in staging. Re-run privilege checks and Auth-backed RLS tests. Confirm:
- `anon` has no access to these tables;
- `authenticated` cannot DELETE or TRUNCATE;
- authenticated SELECT/INSERT/UPDATE still work only where intended by RLS;
- cross-company rows remain invisible and cross-company references are rejected;
- unrelated roles and application workflows are unaffected.

No DELETE or TRUNCATE statement should be executed as a test; verify grants and policies instead.

### Gate 6 — Review evidence and decide

Attach the before/after privilege results, RLS test results, schema comparison, and CI links to the remediation PR. Only then may a separate production migration be prepared for review. Production deployment requires an explicit release decision and a separately verified migration targeting the actual live schema.

## Stop conditions

Stop immediately if:
- staging target cannot be verified;
- any real data appears in staging;
- schema/policy names differ from the recorded assumptions;
- any required test is skipped or fails;
- a proposed command would touch production or use an unverified linked target.

## What this runbook does not do

This document does not create tables, export schema, apply grants, modify policies, or connect to a hosted database. The hosted staging project remains empty until an explicitly reviewed staging setup is performed.
