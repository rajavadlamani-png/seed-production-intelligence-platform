# First-Customer Onboarding — Design Only

Status: **NOT IMPLEMENTED; do not use this document as an executable procedure yet.**

## Intended safe flow

1. A trusted platform operator verifies the customer organization and approves onboarding.
2. The customer’s first user signs up through Supabase Auth using the approved authentication method.
3. A trusted server-side onboarding operation or owner-only SQL procedure creates the company row and attaches that exact Auth user as the initial customer administrator in one transaction.
4. The operation validates the Auth user ID, company name/slug uniqueness, and initial role. It must never accept an arbitrary role or company ID from an untrusted browser request.
5. The new administrator signs in and can manage company-approved reference data and customer form configuration, subject to server-validated permissions.
6. Invitations for later users must be authorized, company-scoped, role-limited, auditable, and revocable.
7. Membership changes and role elevation are recorded in trusted audit events.

## Security requirements

- No anonymous company creation.
- No client INSERT/UPDATE/DELETE policy on company memberships.
- No use of a service-role key in browser JavaScript or a mobile application.
- Never trust company ID, role, territory, or membership ID supplied by a client without server-side authorization.
- Platform administrator privileges must be granted only through a trusted operator process.
- The bootstrap operation must be idempotent or detect and safely reject duplicate requests.
- Test that an Alpha admin cannot invite, elevate, or remove a Beta user and cannot assign a platform administrator role.
- Audit company creation, invitation, membership activation/deactivation, and role changes.

## Not yet supplied

The implementation still needs a trusted server-side execution environment, exact invitation policy, audit handling, failure recovery, and integration tests. Until those are implemented and reviewed, do not create the first customer using direct client calls.
