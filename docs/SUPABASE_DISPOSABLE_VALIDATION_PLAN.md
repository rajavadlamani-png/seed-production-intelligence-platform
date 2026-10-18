# Supabase Disposable-Project Validation Plan

Status: **TEST PLAN ONLY — no database tests have been executed**

This plan is the gate before applying migrations 0001–0005 to the intended Supabase project. Use a separate disposable Supabase project. Do not use real grower, employee, production, or customer data.

## A. Preconditions

- Create a separate disposable Supabase project, not the intended production project and not the ANVORA project.
- Confirm the project is empty and its PostgreSQL version/extensions support the scripts.
- Keep service-role credentials server-side only. Never paste secrets into chat, commit them, or put them in browser JavaScript.
- Apply migrations in order only in the disposable project: 0001, 0002, 0003, 0004, 0005.
- Stop at the first error. Record the exact migration, statement, and error. Do not continue by skipping failed statements.

## B. Static SQL checks before execution

- Verify every referenced table, column, enum value, function, and policy exists at the point it is used.
- Check duplicate policy names and triggers.
- Verify policy names dropped in 0003/0005 exactly match policies created earlier.
- Review all permissive policies: PostgreSQL combines permissive policies with OR, so an old broad policy can defeat a narrower policy.
- Check RLS recursion for field/assignment relationships.
- Confirm all tenant-owned tables have RLS enabled and a deliberate SELECT/INSERT/UPDATE/DELETE policy decision.
- Confirm company_id cannot be changed by authenticated clients.
- Confirm direct updates cannot modify company status/slug, membership roles, audit events, or published form definitions.
- Confirm the Storage buckets are private and have separate object-level policies before uploading anything.

## C. Disposable test identities

Create two synthetic companies, Alpha and Beta, and separate Auth users:
- Alpha admin
- Alpha production manager
- Alpha territory manager for territory NORTH
- Alpha territory manager for territory SOUTH
- Alpha field officer assigned to one Alpha field in NORTH
- Alpha viewer
- Beta admin

Create only synthetic crops, hybrids, growers, fields, plans, assignments, forms, submissions, and documents. Never use real names or phone numbers.

## D. Required authorization tests

For each test, capture expected result, actual result, and pass/fail.

| Test | Expected result |
|---|---|
| Alpha admin reads Alpha records | Allowed |
| Alpha admin reads Beta records | No Beta rows visible |
| Alpha user inserts a row with Beta company_id | Rejected |
| Alpha user changes existing row company_id to Beta | Rejected by trigger/policy |
| Alpha NORTH territory manager reads NORTH field | Allowed |
| Alpha NORTH territory manager reads SOUTH-only field | Denied |
| Field officer reads assigned field | Allowed |
| Field officer reads unassigned field | Denied |
| Field officer changes field master data | Denied |
| Field officer captures boundary for assigned field | Allowed only if policy permits and parent field is authorized |
| Field officer changes boundary for an unassigned field | Denied |
| Customer admin changes company status or slug directly | Denied |
| Customer admin creates or elevates a membership directly | Denied |
| Authenticated user writes an audit event directly | Denied |
| Cross-company parent reference, such as Beta grower on Alpha field | Rejected |
| Submission uses a version from another form/company | Rejected |
| User modifies a published form version | Denied; revisions must create a new version |
| Unauthorized user approves/releases a plan | Denied |
| Viewer writes operational data | Denied |
| Anonymous user reads any tenant data | Denied |
| Storage object from Alpha is read by Beta user | Denied |

## E. Known limitations requiring implementation or proof

1. Migration 0005 is partial. Several tables remain company-scoped rather than territory-scoped; explicitly decide the access rules for growers, plans, allocations, parent-seed records, import batches/rows, documents, and audit-event reads.
2. Form submissions must enforce form_role_rules and field-specific access on both reads and writes. Broad role membership alone is insufficient.
3. Approval, release, upload commit, and form publication need trusted transition functions. Direct status-field updates must not bypass workflow.
4. Tenant relationship checks should be backed by composite unique keys/foreign keys where practical. Trigger-only checks need adversarial tests.
5. The initial customer/admin bootstrap must be a trusted operator procedure, never a public client write policy.
6. Validate security-definer helper functions: fixed search path, fully qualified names, minimal return values, restricted execute grants, and tests as authenticated users.
7. Check storage policy behavior separately from database RLS.

## F. Completion gate

Do not apply the migrations to the intended project until:
- all five migrations apply cleanly to the disposable project;
- all tests above pass;
- remaining table scopes and workflow transitions are implemented;
- a second review confirms no broad policy overrides a scoped policy;
- a rollback/recovery approach is documented.

A successful SQL execution alone is not a security pass.
