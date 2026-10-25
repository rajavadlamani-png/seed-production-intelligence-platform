# Proposed Live Crop & Hybrid ACL Remediation

**State: review proposal only — not a migration, not approved for execution.**  
**Target schema:** the observed live schema for `seed-production-intelligence`, not the repository's original migration baseline.  
**Date:** 25 October 2026.

## Findings this proposal addresses

Read-only catalog inspection of the live project found:

- RLS enabled on `public.crops` and `public.hybrids`.
- Broad table ACLs grant `anon` DELETE and TRUNCATE; effective privilege checks report TRUNCATE for both `anon` and `authenticated`.
- `authenticated` has SELECT, INSERT and UPDATE, but no direct DELETE privilege at the time of inspection.
- The authenticated DELETE policies nevertheless exist and check only active company membership, not role.
- Current SELECT/INSERT/UPDATE policy definitions use the live `company_memberships(role_key, status)` shape and helper `private.has_company_role(uuid,text[])`.

RLS does not filter TRUNCATE. This is a grant-level problem, not merely a policy predicate problem.

## Proposed SQL for review

**Do not run this block against the live project.** It is a draft for review and isolated staging validation only. The current staging project is empty and does not contain the target schema, so this block has not been validated against a staging copy.

```sql
begin;

-- Revoke all direct access from the unauthenticated role on these master tables.
revoke all privileges on table public.crops, public.hybrids from anon;

-- Keep intended authenticated read/write capabilities, but remove destructive
-- and non-application privileges. RLS remains responsible for row-level access.
revoke delete, truncate, references, trigger
  on table public.crops, public.hybrids
  from authenticated;

grant select, insert, update
  on table public.crops, public.hybrids
  to authenticated;

-- Remove unused DELETE policies. Direct DELETE is also denied by the table ACL.
drop policy if exists crops_tenant_delete on public.crops;
drop policy if exists hybrids_tenant_delete on public.hybrids;

commit;
```

This is intentionally a small, table-specific proposal. It does not modify SELECT, INSERT, UPDATE policies, schema, rows, or company memberships.

## Required preflight checks

Before creating a deployable migration:

1. Confirm the connected project is a dedicated staging target, not `seed-production-intelligence` and not ANVORA Beta Access.
2. Provision the matching live-schema snapshot in staging using a reviewed, non-sensitive schema-only process; keep all rows synthetic.
3. Confirm the exact table names, policy names, helper definitions, and grants in staging match the reviewed live observations.
4. Inspect role membership and inherited/PUBLIC grants as well as direct ACLs; the SQL above must be extended if any inherited privilege path remains.
5. Confirm that application behavior does not rely on unauthenticated access to these master tables.
6. Run the privilege assertions as a privileged test role, then exercise SELECT/INSERT/UPDATE with actual Supabase Auth sessions for at least company admin, seed production manager, field officer, and executive read-only roles.
7. Verify cross-tenant reads are denied by RLS, write policies remain role-scoped, and hybrids cannot reference a crop from a different company.
8. Confirm after the proposed change that `has_table_privilege('anon', ..., 'TRUNCATE')`, `has_table_privilege('authenticated', ..., 'TRUNCATE')`, and both roles' DELETE checks are false for both tables.
9. Check the final grants/policies and run the full staging test suite. Record evidence before proposing a production deployment.

## Rollback consideration

A rollback that restores the previous broad `anon` privileges or client TRUNCATE grants is not acceptable. If the change needs to be reversed due to an application issue, first diagnose the missing least-privilege grant and restore only the narrow, justified non-destructive privilege. Keep direct client TRUNCATE and DELETE denied.

## Current decision

- No SQL has been executed from this proposal.
- No hosted policy, grant, schema, or data was changed.
- Do not merge this proposal as a deployable migration until isolated staging validation is complete.
- The existing hosted staging project is currently empty; staging validation therefore requires a schema-only staging setup step first.
