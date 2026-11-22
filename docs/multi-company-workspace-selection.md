# Multi-company workspace selection

**Milestone:** Tenant identity and company context  
**Status:** Implemented on a feature branch; pending CI and browser acceptance  
**Scope:** Seed Production Intelligence Platform only

## Purpose

Allow one authenticated person to hold active memberships in more than one company and explicitly select the company context for the current session.

This is a capability within the existing Seed Production Intelligence Platform. It is not a separate application or climate/MRV product.

## Behaviour

1. Authenticate the person through Supabase Auth.
2. Retrieve all active `company_memberships` rows for the authenticated user.
3. Include only memberships whose related company is also active.
4. If there is one eligible membership, select it automatically.
5. If there are multiple eligible memberships, require the person to choose one from the returned authorized list.
6. Display the selected company and role in the secure session screen.
7. Permit switching only among the memberships returned for the authenticated user.
8. Clear the selected company context on sign-out and password-recovery flow.

## Security boundary

The selected company is a user-interface/workspace context. It is **not** an authorization credential.

- Supabase Row Level Security remains the enforcement boundary for every database request.
- Company IDs, roles or permissions supplied by browser state must never be trusted by the database.
- Future live data queries must apply the selected `company_id` as a query filter and still rely on RLS.
- Company membership provisioning and role changes must use a trusted server-side workflow; this change does not add direct client-side membership writes.
- A suspended or archived company is not selectable even if an old membership row remains active.

## Data and deployment impact

- No database migration.
- No table, policy, grant or production-data changes.
- No invitations, membership creation, role editing or geography assignment UI in this milestone.
- The secure session continues to hide the public sample-data workspace because operational screens are not yet connected to live records.

## Acceptance checks

| Scenario | Expected result |
|---|---|
| User has no active membership | Session is rejected and signed out |
| Membership belongs to inactive company | Membership is not selectable |
| User has one active company membership | Company context is selected automatically |
| User has multiple active company memberships | Explicit company selection is required |
| User selects an unlisted company ID | Selection is rejected |
| User switches company | Context changes only to another returned membership |
| User signs out | Selected company context is cleared |
| Database request crosses tenant boundary | Supabase RLS must deny unauthorized access |

The automated source-contract test checks the frontend wiring. It does not replace browser testing with real authenticated accounts or database-level RLS tests.
