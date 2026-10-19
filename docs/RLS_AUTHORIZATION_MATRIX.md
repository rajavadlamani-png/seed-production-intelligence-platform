# Row-Level Security (RLS) Authorization Matrix

Status: **IMPLEMENTED as a test specification; not yet fully verified against the Supabase local stack.**

This matrix is the required expected-access contract for tenant-owned tables. It is deliberately conservative: anonymous access is denied everywhere; company B can never access company A data; field officers and territory managers are limited to their authorized field/territory scope; only trusted server-side functions may append audit events or administer memberships. "Admin" below means an active `customer_admin` for the row's own company; `platform_admin` exceptions must be explicit and tested rather than inferred from the name.

## Roles and scope

- **Anonymous:** no authenticated identity; all tenant rows denied.
- **Company A user:** authenticated `viewer` member of A; company-scoped read only where a policy grants it.
- **Company B user:** authenticated member of B; never reads/writes A rows.
- **Field officer:** active membership plus active assignment to the field; field-linked records must be in assigned scope.
- **Territory manager:** active membership; rows with `territory_code` must match membership territory; field-linked records must be within that territory. Field assignment administration is not implied.
- **Admin:** active customer admin of the same company. Admin access does not cross tenant boundaries. Platform-level actions must use a separate trusted path and tests.

Legend: **D** = denied; **R** = select/read only; **S** = scoped select/insert/update as explicitly authorized; **A** = same-company admin operation; **T** = trusted server-side operation only. Delete is denied to ordinary clients unless a future table-specific policy explicitly documents otherwise. A letter is an expected policy contract, not a claim that every cell has passed a test.

## Table/action matrix

| Tenant-owned table | Anonymous | Company A user (viewer) | Company B user against A | Field officer | Territory manager | Company A admin |
|---|---|---|---|---|---|---|
| companies | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | R/D/D/D |
| company_memberships | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | R/T/T/T |
| seasons | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| crops | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| hybrids | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| growers | D/D/D/D | D/D/D/D | D/D/D/D | S/D/D/D | S/D/S/D | A/A/A/D |
| fields | D/D/D/D | D/D/D/D | D/D/D/D | S/D/D/D | S/S/S/D | A/A/A/D |
| production_plans | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | S/D/D/D | A/A/A/D |
| target_allocations | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | S/S/S/D | A/A/A/D |
| parent_seed_lots | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | A/A/A/D |
| parent_seed_distributions | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | S/S/S/D | A/A/A/D |
| grower_upload_batches | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | A/A/A/D |
| grower_upload_rows | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | A/A/A/D |
| field_assignments | D/D/D/D | D/D/D/D | D/D/D/D | S/D/D/D | S/S/S/D | A/A/A/D |
| field_boundaries | D/D/D/D | D/D/D/D | D/D/D/D | S/S/S/D | S/S/S/D | A/A/A/D |
| form_definitions | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| form_versions | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/D/D/D |
| form_sections | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| field_definitions | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| field_options | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| form_role_rules | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| workflow_definitions | D/D/D/D | R/D/D/D | D/D/D/D | R/D/D/D | R/D/D/D | A/A/A/D |
| form_submissions | D/D/D/D | D/D/D/D | D/D/D/D | S/S/S/D | S/S/S/D | A/S/S/D |
| documents | D/D/D/D | D/D/D/D | D/D/D/D | S/S/D/D | S/S/D/D | A/A/A/D |
| audit_events | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | D/D/D/D | R/D/D/D |

Each cell lists **SELECT / INSERT / UPDATE / DELETE** in that order. Where the current schema's policies are broader than this expected contract, the implementation must be narrowed before the cell can be considered satisfied. In particular, membership administration and audit writes are trusted-only, and generic company-membership policies are not sufficient for field or territory scope.

## Mandatory test cases

For each table and each role, tests must cover all four actions. A test must assert both positive access where allowed and denial/no mutation where denied; an empty SELECT result alone is not enough to prove that INSERT/UPDATE/DELETE are denied. Use two synthetic companies, at least two territories in Company A, at least two fields in a territory, and users with viewer, field officer, territory manager, customer admin and anonymous contexts.

1. Anonymous SELECT/INSERT/UPDATE/DELETE.
2. Company A viewer can read allowed A rows, cannot mutate them, and cannot see B rows.
3. Company B user cannot read or mutate A rows, including by supplying known UUIDs.
4. Field officer can access assigned field records only, cannot access a different field in the same territory unless assigned, and cannot access another territory.
5. Territory manager can access rows in their own territory only, cannot access another territory in the same company, and cannot bypass scope through form submissions, boundaries, upload rows or direct UUIDs.
6. Company admin can administer same-company business/configuration rows but cannot change company identity, grant memberships through direct SQL, forge audit events, or access another company.
7. For every table: direct DELETE is denied to ordinary client roles; if deletion is required, add a documented trusted lifecycle operation and test it.
8. For protected workflow entities, direct status/lifecycle writes fail; valid RPC transitions succeed atomically and create immutable audit events.

## Current verification boundary

The compatibility workflow that passed migrations 0001–0012 uses a minimal Auth shim. It does **not** verify these matrix cells against Supabase Auth, Storage, default grants, PostgREST, or actual local-stack roles. Do not mark a cell VERIFIED until the Supabase CLI local-stack workflow executes its corresponding assertion.
