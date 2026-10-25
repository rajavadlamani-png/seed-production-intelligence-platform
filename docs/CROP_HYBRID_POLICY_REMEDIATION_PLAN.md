# Crop & Hybrid Master Authorization Remediation Plan

**Status:** Proposed plan only — no hosted changes authorized  
**Review date:** 25 October 2026  
**Scope:** Live Supabase `public.crops` and `public.hybrids` authorization, and the evidence required before changing it.

## 1. Why this work is required

The read-only review recorded that the live `crops` and `hybrids` tables have row-level security enabled, but the observed DELETE policies check active company membership without checking role. That appears broader than the repository's intended controlled-archival model. Table grants also need to be inspected alongside RLS: a policy alone does not establish whether a role has SQL DELETE privilege.

The live schema differs materially from the repository's migration baseline. In particular, the live master tables use `crop_code` and `hybrid_code`, while repository migration examples use `code`; live memberships use `role_key` and text `status`, while the repository baseline uses a `role` enum and `is_active`. Therefore, do not copy or run a repository migration against the live project without reconciling the actual schema and migration provenance.

## 2. Non-negotiable safety boundaries

- Do not apply repository migrations `0001`–`0018` to the intended live project as part of this task.
- Do not change live policies, grants, tables, or data during this planning step.
- Do not test with real grower, field, production, or customer data.
- Keep the Crop & Hybrid Masters UI read-only until both database authorization and UI access are validated.
- The client-side `company_id` filter is defense-in-depth only; RLS is the authoritative tenant boundary.
- Test the proposed policy change in a disposable or dedicated staging project that is confirmed separate from the live project.

## 3. Required discovery before drafting a migration

Capture and review the following read-only evidence from the actual target project:

1. `pg_policies` definitions for SELECT, INSERT, UPDATE, and DELETE on `public.crops` and `public.hybrids`.
2. Table and column privileges for `anon`, `authenticated`, and any application roles, including direct DELETE and UPDATE grants.
3. Relevant helper-function definitions and execution privileges used by the policies, including how active company membership and role are resolved.
4. Constraints and foreign keys, especially `hybrids.crop_id` → `crops.id`, and whether they enforce same-company relationships.
5. Live membership role/status values and the intended company-admin, agronomist, field-officer, and read-only roles.
6. Migration history and deployment provenance, reconciling the five hosted history entries documented in the live-schema review with the repository and any out-of-band changes.

Record the outputs as a review artifact without including credentials, tokens, or personal grower data.

## 4. Intended authorization contract to validate

This is a proposed contract, not a claim that the live system currently implements it.

| Operation | Expected control |
|---|---|
| SELECT crops/hybrids | Active members see only records belonging to their authorized company; cross-company UUID lookups return no rows. |
| INSERT | Denied to ordinary authenticated clients unless a specifically approved role and validated workflow require it. |
| UPDATE | Denied to ordinary authenticated clients unless a specifically approved role and validated workflow require it; company identity and crop-parent relationships cannot be reassigned across tenants. |
| DELETE | No direct DELETE for ordinary authenticated clients. If removal is needed, use a reviewed privileged workflow or controlled archival process with explicit role checks and audit evidence. |
| Hybrid-to-crop relationship | A hybrid must reference a crop in the same company; test attempts to attach a Beta hybrid to an Alpha crop and vice versa. |
| Company boundary | Membership and role checks must be server-side. A client-supplied company ID, guessed UUID, or manipulated JWT claim must not grant access to another tenant. |

Before implementation, product owners must confirm the allowed write roles and whether archival is required. Do not silently infer these permissions from the UI.

## 5. Staging test matrix

Use synthetic Alpha and Beta tenants and real Supabase Auth sessions for each relevant role.

- Verify each role's SELECT, INSERT, UPDATE, and DELETE behavior for both master tables.
- Attempt cross-tenant reads by company filter and by known UUID.
- Attempt cross-tenant INSERTs, UPDATEs, and hybrid-to-crop reassignment.
- Verify users cannot alter `company_id`, elevate their membership role, or reactivate/change their own membership.
- Test with missing, inactive, and multi-company memberships where supported by the actual data model.
- Check SQL grants as well as RLS outcomes; a row filtered by RLS is not proof that the role lacks the SQL privilege.
- Assert the intended result for every test (expected row count or explicit denial), and ensure fixtures are rolled back or the test database is disposable.
- Run the full existing local-stack suite and frontend syntax checks after the change.

## 6. Release gate

A policy/grant migration may be proposed only after:

1. The actual live schema and policy/helper definitions are captured and reviewed.
2. The migration is written specifically for that schema, with an explicit rollback strategy.
3. A dedicated staging target is positively identified as separate from the live project.
4. The complete test matrix passes on staging and in CI.
5. The change is reviewed before any hosted deployment.

**Current decision: no hosted policy change and no migration execution.** The next implementation artifact should be a staging-tested, schema-specific migration PR only after the discovery and test gates above are satisfied.
