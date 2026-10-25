# Live-Schema Staging Baseline Runbook

**Status:** preparation only. Do not execute against production or apply any schema to hosted staging until the generated dump is reviewed.  
**Date:** 25 October 2026.

## Goal

Build a dedicated, schema-matched staging baseline for testing the ACL remediation. The staging project `Seed Production Intelligence - Staging` (ref `afhifiiwmaxuiwctstzo`) was confirmed empty through the Supabase project tools. The live project is `seed-production-intelligence` (ref `xjtzvhtoeormizrhozoy`). Never substitute ANVORA Beta Access.

## Safety rules

- Do not use production data. Export schema and object definitions only; use synthetic fixtures for tests.
- Never paste database connection strings, passwords, access tokens, JWTs, service-role keys, or environment files into chat, GitHub issues, commits, logs, or pull requests.
- Do not apply the repository's original migrations 0001–0018 to live; its baseline differs materially from the actual hosted schema.
- Do not use the staging merge/reset workflow as a shortcut. Branch merge/reset can alter hosted schema.
- Review the generated schema file for sensitive literals, production rows, secrets, and ownership/grant statements before committing it.
- This runbook does not authorize applying the dump or changing any hosted database.

## Live baseline already observed

Read-only catalog checks identify 47 public tables, including `companies`, `company_memberships`, `crops`, `hybrids`, fields, seasons, inspection, evidence, harvest/processing/packing, quality, AI, audit, import, integration, and sync tables. The live schema also uses `company_memberships(role_key, status)` and `private.has_company_role(uuid,text[])`, unlike the repository's original migration baseline. RLS is reported enabled for all listed public tables, but policy correctness and table grants still require verification.

The two existing master tables have unsafe direct ACLs. Default privileges for tables, sequences and functions created in `public` are also broad for owners `postgres` and `supabase_admin`. See `LIVE_CROP_HYBRID_ACL_REMEDIATION.md` and `PUBLIC_SCHEMA_PRIVILEGE_REVIEW_CHECKLIST.md`.

## Procedure

### 1. Establish the local tooling environment

Use a trusted development workstation with the Supabase CLI and PostgreSQL client installed. If these tools are unavailable on the managed laptop, ask an authorized administrator to run the export in a controlled environment. Do not work around endpoint restrictions or install unapproved software.

### 2. Create a schema-only export

Use the documented Supabase CLI database dump workflow with the live database connection supplied locally through a protected environment variable or approved secret manager. Include the actual application schemas and required DDL dependencies identified from the live catalog; exclude all table data. Do not put the connection string inline in shell history or command output.

The exact CLI options should be checked against the installed CLI version before use. Preserve the raw export in a private, access-controlled workspace, not in a public repository.

### 3. Sanitize and review

Before using the dump:
- verify no `COPY` data blocks or INSERT statements contain real rows;
- remove or separately review ownership changes, grants, default ACLs, role creation, auth/storage system objects, and provider-managed extensions;
- ensure no secrets or production-specific identifiers beyond unavoidable schema references are included;
- verify functions, triggers, indexes, enums/domains, constraints, RLS policies, and required schemas are represented;
- compare table/column/constraint/policy counts against fresh read-only catalog inventory.

Do not silently normalize differences: document each excluded or provider-managed object and why it is excluded.

### 4. Rehearse against a disposable local database first

Restore the reviewed schema-only export into a disposable PostgreSQL database. Resolve dependency and extension issues there. Run the ACL contract tests and verify no real data was included. This local rehearsal is not proof of hosted Supabase Auth, Storage, or RLS behavior.

### 5. Stage only after a review gate

Before any hosted staging DDL:
- confirm the project ref in the UI and API is `afhifiiwmaxuiwctstzo`;
- confirm the project is still empty and the operation will not target `xjtzvhtoeormizrhozoy` or ANVORA;
- review the complete proposed SQL and rollback plan;
- confirm a safe recovery path and project backup/restore posture;
- require explicit approval for the specific staging import.

Then apply the reviewed schema-only baseline using the approved process, and insert only synthetic fixtures. Validate actual Supabase Auth sessions, RLS policies, tenant isolation, ACLs, default privileges, and intended RPC access.

### 6. Evidence required to pass

Record:
- schema object counts and a list of approved exclusions;
- effective privileges for `anon`, `authenticated`, and `service_role`;
- role memberships and default ACLs;
- RLS policy matrix for every public table;
- positive and negative tests for company/territory/field isolation;
- tested behavior for company admin, seed production manager, field officer, and read-only executive roles;
- final staging grants and policy inventory;
- test logs and confirmation no production data was copied.

Only after these gates pass should a production migration be drafted for separate review. Do not merge PR #8 or any production SQL as part of the staging-baseline task.

## Current status

- Live project catalog inspection: read-only findings collected; broad default privileges confirmed.
- Hosted staging project: empty, unchanged.
- Disposable PostgreSQL ACL contract harness: green in CI, but intentionally minimal.
- Schema-only export: not yet generated; the connected Supabase toolset provides catalog queries and migration operations, but no safe one-command schema dump/export operation. A reviewed local/authorized CLI export is required to create a faithful baseline.
- No hosted schema, grant, policy, or data changes have been made.
