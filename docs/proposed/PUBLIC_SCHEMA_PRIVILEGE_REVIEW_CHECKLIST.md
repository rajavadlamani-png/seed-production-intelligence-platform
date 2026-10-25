# Public Schema Privilege Review Checklist

**Status:** read-only assessment plan; no hosted changes authorized by this document.  
**Project:** `seed-production-intelligence` (live project ref is tracked internally; do not substitute ANVORA).  
**Date:** 25 October 2026.

## Verified catalog findings

1. `public.crops` and `public.hybrids` have explicit table ACLs granting `anon` all table privileges and `authenticated` SELECT/INSERT/UPDATE plus TRUNCATE, REFERENCES, and TRIGGER.
2. Effective privilege checks confirm `anon` can SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER on both tables. `authenticated` can SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, and TRIGGER; DELETE is not effectively granted.
3. The query of `information_schema.table_privileges` returned no direct `PUBLIC` grants on those two tables. This does not rule out role inheritance, owner rights, default ACL effects on other objects, or access through functions.
4. `public` schema ACL grants USAGE to `anon`, `authenticated`, and `service_role`.
5. Default ACLs for objects created in `public` are broad:
   - Owners `postgres` and `supabase_admin`, object type `r` (tables): `anon` and `authenticated` receive `arwdDxtm`.
   - Both owners, object type `S` (sequences): `anon` and `authenticated` receive `rwU`.
   - Both owners, object type `f` (functions): `anon` and `authenticated` receive EXECUTE.
6. A read-only query of `information_schema.routine_privileges` for routines in schema `public` granted to `PUBLIC`, `anon`, or `authenticated` returned no rows. This should be cross-checked against `pg_proc` ACLs and all non-public exposed schemas before concluding no RPC exposure exists.
7. Live public schema inventory currently reports RLS enabled for every listed table. There are 47 public tables; only `companies` (1 row) and `company_memberships` (2 rows) have rows in the compact inventory; other listed tables currently report zero rows. RLS enabled is not proof that policies and grants are safe.

## Public table inventory (from read-only table listing)

`companies`, `company_memberships`, `geographies`, `growers`, `crops`, `hybrids`, `fields`, `field_boundary_versions`, `crop_seasons`, `field_seasons`, `parent_seed_lots`, `parent_seed_allocations`, `inspection_stage_templates`, `inspections`, `farm_activities`, `evidence_records`, `evidence_links`, `harvest_lots`, `processing_lots`, `final_seed_lots`, `lot_transformations`, `lot_transformation_inputs`, `lot_transformation_outputs`, `quality_tests`, `satellite_observations`, `weather_observations`, `ai_model_versions`, `ai_predictions`, `audit_events`, `user_geography_access`, `production_targets`, `inspection_checklist_templates`, `inspection_responses`, `activity_inputs`, `activity_approvals`, `attachments`, `quality_standards`, `quality_test_results`, `packing_lots`, `recommendations`, `ai_prediction_outcomes`, `data_import_batches`, `data_import_mappings`, `data_validation_issues`, `climate_evidence_links`, `integration_events`, `sync_operations`.

## Required next checks

### A. Per-table effective privileges and RLS policy matrix
For every table above, record:
- direct ACLs and effective privileges for `anon`, `authenticated`, and `service_role`;
- table owner and any inherited role paths;
- RLS enabled/forced status;
- every SELECT/INSERT/UPDATE/DELETE policy, including `USING` and `WITH CHECK`;
- company/territory/field scope and whether `company_id` can be changed;
- whether direct client DELETE/TRUNCATE/REFERENCES/TRIGGER privileges are needed (default answer should be no, unless documented and justified).

### B. Default privileges
Review defaults for each object-creating role and schema, not just `postgres` and `supabase_admin` in `public`. Design a scoped `ALTER DEFAULT PRIVILEGES FOR ROLE ... IN SCHEMA ...` proposal only after enumerating:
- tables/views;
- sequences;
- functions/RPCs;
- intended anon endpoints;
- existing migrations and application call sites.

Do not revoke EXECUTE globally from functions until intentional public RPCs and Supabase Auth/storage integration requirements are inventoried.

### C. Application dependency review
Search the frontend, Edge Functions, SQL migrations, and tests for use of:
- anonymous client access to public tables;
- RPC calls and expected role;
- client-side DELETE or sequence operations;
- any dependency on broad default grants.

### D. Staging gate
The dedicated hosted staging project is empty. Do not apply the repository's original migrations 0001–0018 to live, and do not apply this proposal to live. Prepare a schema-only staging snapshot from the live schema using a reviewed process, with synthetic test data only. Confirm target project identity before any DDL. Test role behavior using real staging Auth sessions and verify tenant isolation, least privilege, and rollback evidence.

## Decision

No grants, policies, schema, or rows were changed. This checklist is for review and safe preparation of a staged remediation; it is not executable SQL and does not authorize production changes.
