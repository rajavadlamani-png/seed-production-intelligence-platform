# Live Supabase Schema Drift Review — Crop & Hybrid Masters

**Review date:** 25 October 2026  
**Scope:** Read-only inspection of the intended Supabase project's public schema and the repository's migration baseline.  
**Decision:** Do not run migrations or change hosted policies as part of this review.

## Executive finding

The live Supabase schema is not a direct match for the repository's original migration baseline. The Crop & Hybrid Masters UI in PR #3 targets the columns that were observed in the live `crops` and `hybrids` tables, but this does not establish that the broader schema or authorization model is production-ready.

## Confirmed observations

- The live `public.crops` table has `id`, `company_id`, `crop_code`, `name`, `is_active`, and `created_at`.
- The live `public.hybrids` table has `id`, `company_id`, `crop_id`, `hybrid_code`, `name`, `is_active`, and `created_at`.
- Both tables have row-level security enabled.
- Read-only inspection found SELECT, INSERT, UPDATE, and DELETE policies on both tables. The observed DELETE policy checks for an active company membership, but does not check the member's role. That is broader than the intended controlled-archival approach described in the repository's migration baseline.
- The live `company_memberships` table uses `role_key` and text `status`; the repository's original migration 0001 defines a different membership structure (`role` enum and `is_active` boolean).
- The live schema includes domain tables such as `crop_seasons`, `field_seasons`, `production_targets`, and `inspection_stage_templates`; the original migration 0001 instead defines `seasons`, `production_plans`, and a different field/production model.

## Implications for PR #3

1. The current read-only queries in PR #3 use the observed live column names for crops and hybrids.
2. Keep the interface read-only. Do not add create, edit, or delete actions until the permissions model has been reviewed and tested.
3. The client-side `company_id` filter is useful defense-in-depth, but database RLS must remain the authoritative access boundary.
4. Do not infer that the existing hosted schema was created by the repository migrations. Establish migration provenance before planning any schema change.
5. Do not apply migrations 0001–0013 to the intended project. The repository's `docs/SUPABASE_MIGRATION_REVIEW.md` explicitly says the migration sequence is not approved for production execution and hosted staging validation is outstanding.

## Required next checks

- Establish which migrations or deployment process produced the live schema, using migration history and repository/deployment records.
- Review table grants as well as RLS policies for `crops` and `hybrids`, including whether authenticated clients have DELETE privileges.
- Correct the overly broad DELETE authorization through a reviewed migration tested in a disposable or dedicated staging project first.
- Run the two-company, multi-role authorization tests against a dedicated staging project before any production policy change.
- Keep PR #3 unmerged until the UI is tested against the live read-only endpoints and the permission review is complete.

## Safety boundary

This document records schema and policy metadata only. No records were inserted, updated, or deleted, and no hosted schema or policy was changed during this review. Do not place real grower data in the public demo.
