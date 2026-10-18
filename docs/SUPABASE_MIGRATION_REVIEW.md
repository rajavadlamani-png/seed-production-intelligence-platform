# Supabase Migration Review — Pre-Execution Gate

Status: **NOT APPROVED FOR EXECUTION**

Reviewed files:
- `supabase/migrations/0001_core_customer_config.sql`
- `supabase/migrations/0002_tenant_relationship_guards.sql`
- `supabase/migrations/0003_role_write_policies.sql`
- `supabase/migrations/0004_tenant_identity_hardening.sql` (draft)
- `supabase/migrations/0005_scoped_field_access.sql` (draft)

This review is a static source review only. The migrations have not been executed against PostgreSQL/Supabase, and no automated database security tests have been run.

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
