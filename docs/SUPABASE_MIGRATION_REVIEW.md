# Supabase Migration Review — Staging and Production Readiness Gate

Status: **NOT APPROVED FOR PRODUCTION OR LIVE CUSTOMER EXECUTION**

Reviewed files:
- `supabase/migrations/0001_core_customer_config.sql`
- `supabase/migrations/0002_tenant_relationship_guards.sql`
- `supabase/migrations/0003_role_write_policies.sql`
- `supabase/migrations/0004_tenant_identity_hardening.sql` (draft)
- `supabase/migrations/0005_scoped_field_access.sql` (draft)

The current repository migrations 0001–0012 have been applied in the disposable PostgreSQL/PostGIS compatibility workflow, and the synthetic authorization smoke test passed on commit `4fc94c5a1041f8165b3879825b45211b794c3db6` ([run](https://github.com/rajavadlamani-png/seed-production-intelligence-platform/actions/runs/39223144978)). This is not a live Supabase test: the environment uses a minimal authentication shim and does not reproduce every Supabase grant, Storage, Auth, or deployment setting. Production execution remains blocked pending the remaining items below and dedicated Supabase staging validation.

## Blocking findings

1. **Tenant identity can be changed on rows.** Row-level security policies check the new `company_id`, but they do not make that column immutable. A user who belongs to more than one customer could potentially move a row between those companies on tables without relationship triggers. Add a database-level guard against changing `company_id` after insert.

2. **Territory-level access is not implemented.** Migration 0003 limits writes by role, but the policies generally operate at company scope. A Territory Manager or Field Officer can potentially see or modify records outside their assigned territory/field if they are in the same company. Implement and test row-level scope for fields, boundaries, assignments, and form submissions before operational use.

3. **Company administration is too broad.** The `companies_update_admin` policy lets customer admins update any column on their company row, including `status` and `slug`. Remove direct client updates and use a trusted, validated administrative function for allowed profile changes.

4. **Cross-company relationships rely on triggers, not composite foreign keys.** Migration 0002 checks many parent-child relationships, but not all possible relationships. Add composite keys/foreign keys where practical and verify every reference. Keep triggers as supplemental validation, not the sole tenant boundary.

5. **The relationship trigger functions need a security review.** `assert_related_company` and `assert_same_company_relationships` are `SECURITY INVOKER`; visibility under RLS can affect what the trigger can see. Test both valid same-company references and invalid cross-company references under authenticated roles. Any switch to `SECURITY DEFINER` must use a locked-down search path, fully qualified names, restricted execute permissions, and a narrow, fixed set of table names.

6. **Workflow transitions are not yet enforced.** Role policies allow operational updates to status fields. Approval/release, upload-batch commit, form publication, and immutable published form versions should be performed through validated server-side functions or database functions with explicit transition rules.

7. **Customer onboarding is incomplete by design.** There is no public company bootstrap and no client membership-write policy. This is safer than exposing arbitrary membership creation, but a trusted owner-only onboarding procedure must be prepared and tested before the first user can access a company.

8. **Security helper function privileges need verification.** Review execute grants and function search paths for `is_company_member` and `has_company_role`; ensure callers cannot use helper functions or other grants to expose membership data or bypass intended checks.

9. **Storage and audit controls are not complete in these migrations.** Private Storage bucket policies, object-level tenant authorization, and trusted audit-event insertion still need a separate setup and test. Do not store real grower data or documents until these are configured.

## Additional draft changes

- Migration 0004 adds an immutable `company_id` trigger to tenant-owned rows and removes direct company-row update access. It has not been executed or tested.
- Migration 0005 adds scoped read/update policies for fields, field assignments, field boundaries, and form submissions. It uses a boolean security-definer helper to avoid recursive row-level-security policy evaluation between fields and assignments. The helper's privileges and behavior must be tested in the disposable project.
- Migration 0005 is only a partial scope model. Other company-wide tables (including growers, production plans, parent-seed records, upload batches/rows, documents and audit views) still need a deliberate role/territory access decision. Submission authorization must also be checked against form-specific `form_role_rules`, not just the broad role list.

## Required pre-production tests

- Two synthetic companies with separate users; verify no cross-company SELECT, INSERT, UPDATE, or DELETE.
- A user belonging to two companies cannot move records across company IDs.
- Territory Manager can access only their permitted territory.
- Field Officer can access only assigned fields and permitted related submissions/documents.
- Customer Admin cannot alter company status, create memberships, elevate roles, or rewrite published form versions through direct table updates.
- Cross-company references are rejected for every parent-child relationship.
- Role-specific workflow transitions reject unauthorized approval, release, publication, and import commit.
- Storage object access and audit writes are tenant-scoped and server-controlled.
- Apply all migrations to a clean disposable Supabase project; confirm they complete, then run tests before using the intended project.

## Decision

Do **not** execute migrations 0001–0003 yet. Correct the blockers, prepare a trusted first-customer onboarding path, and run the migration sequence plus authorization tests in a disposable project first. The current scripts are a useful draft, not a production-ready security boundary.


## Latest follow-up (18 October 2026)

- The disposable PostgreSQL/PostGIS migration smoke test passed for migrations 0001–0005 and the RLS-enabled check. This confirms the scripts apply in the compatibility test environment; it does not prove Supabase Auth behavior or tenant/territory authorization.
- Migration 0005 was further tightened so field-officer and territory-manager access to form submissions requires both access to the linked field through `user_can_access_field` and a matching `form_role_rules` entry: `can_view` for SELECT and `can_edit` for UPDATE. Admins and production managers retain the explicit manager path.
- This policy change is awaiting its own migration smoke-test result and has not been executed against the intended Supabase project.
- Remaining required work: automated authorization tests with two synthetic companies and users, verify field assignment/territory isolation, test cross-company foreign-key relationships under RLS, review helper-function grants/search paths, and implement/test trusted onboarding, workflow transition RPCs, private Storage policies, and trusted audit writes.

## Latest follow-up (19 October 2026)

- The GitHub Actions disposable PostgreSQL/PostGIS compatibility smoke test passed for migrations 0001–0007, the synthetic tenant/field authorization test suite, and the RLS-enabled check. Run: https://github.com/rajavadlamani-png/seed-production-intelligence-platform/actions/runs/39215319224
- The suite now checks rejection of a cross-company grower relationship, field-officer visibility boundaries, rejection of submission creation without `can_create`/`can_submit`, acceptance when the permission is granted, and rejection of an unauthorized cross-tenant submission update.
- This is a compatibility-harness result only. It is not a live test against the actual Supabase project and does not certify production readiness.
- Next required stage: expand tests to cover relationship triggers while authenticated under RLS, field assignment/boundary scoping, direct edits to sensitive submission lifecycle columns, and immutable published form versions. Then validate the migration sequence in a clean disposable Supabase project before touching the intended project.
- Production remains blocked pending trusted onboarding, validated workflow-transition functions, private Storage policies, trusted audit writes, and live Supabase staging validation.


## Follow-up hardening added on 19 October 2026

The repository now includes supplemental migrations 0008–0012. These are still **not approved for production execution**; successful disposable tests do not establish live Supabase readiness.

- **0008 — submission update grants:** removes broad direct update privileges on form_submissions and grants authenticated users update access to payload only. Workflow status transitions need validated server-side functions.
- **0009 — RLS-safe relationship trigger:** replaces the relationship trigger function with a SECURITY DEFINER implementation using an empty search path and revokes direct execute grants. It must be validated against the real Supabase role and RLS behavior.
- **0010 — published form immutability:** prevents editing/deleting published form versions and prevents insert/update/delete of sections, field definitions, and field options attached to published versions. New changes must use a new draft version.
- **0011 — direct publication restriction:** removes broad update grants on form versions and permits authenticated clients to update only the draft snapshot column. Direct status changes such as publishing are blocked until a validated publishing RPC is implemented.
- **0012 — submission lifecycle RPC:** adds `transition_form_submission`, which checks active company membership, field access and form-role permissions; allows only defined status transitions; and writes an audit event. This is an initial submission workflow, not a complete workflow engine. It still needs full role-matrix tests and real Supabase staging validation.

The synthetic authorization test suite now checks cross-company relationships while authenticated, submission payload-only updates, direct lifecycle status rejection, published form version immutability, and direct publication rejection. Check the current GitHub Actions run before treating these latest changes as test-passing:
https://github.com/rajavadlamani-png/seed-production-intelligence-platform/actions

## Remaining production blockers

1. Implement and test validated RPCs for form publication, submission transitions, production-plan/target-allocation approval and release, and upload-batch commit.
2. Complete field/territory authorization tests and review authorization for growers, production plans, parent-seed records, imports, documents, and other tenant-owned tables.
3. Add trusted first-customer onboarding and membership administration; do not expose membership creation to ordinary clients.
4. Configure private Supabase Storage buckets and object-level tenant policies; test upload/download authorization.
5. Implement trusted audit-event insertion and verify audit coverage for sensitive operations.
6. Run migrations and the full test suite in a dedicated Supabase staging project, review actual grants/RLS/function ownership, and test using separate customer accounts before any production rollout.

**Current gate:** disposable PostgreSQL/PostGIS compatibility tests only. No live Supabase staging validation has been completed. Do not enter real grower or customer data in the public demo.
