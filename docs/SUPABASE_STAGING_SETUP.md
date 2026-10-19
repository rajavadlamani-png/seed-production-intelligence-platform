# Separate Supabase staging project and GitHub Actions setup

This guide keeps staging separate from the existing ANVORA Beta Access project and from any future production project. Never paste passwords, access tokens, database URLs, service-role keys, or secret values into ChatGPT, issues, commits, or logs.

## A. Create the staging project

1. Sign in to the Supabase Dashboard.
2. Choose **New project** and create a new project named **Seed Production Intelligence – Staging** (or a clearly equivalent name).
3. Create it in the region you intend to use for staging. Use a new strong database password generated and stored in your password manager.
4. Wait for provisioning to finish.
5. Open **Project Settings → General** and copy the **Project ID / reference**. This identifier is not a password.
6. Open the project's SQL Editor and verify it is the new staging project, not ANVORA Beta Access. Do not run a destructive reset against any project containing real data.
7. Keep staging synthetic. Do not import actual grower, employee, farm boundary, or customer data.

## B. Add GitHub Actions secrets

In the GitHub repository `rajavadlamani-png/seed-production-intelligence-platform`:

1. Open **Settings → Secrets and variables → Actions**.
2. Under **Repository secrets**, select **New repository secret**.
3. Add the following secrets, entering values directly into GitHub's secret form:
   - `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token created in your Supabase account settings. Grant only the access needed for the staging deployment workflow; revoke it if no longer needed.
   - `SUPABASE_DB_PASSWORD`: the database password chosen for this staging project.
   - `SUPABASE_STAGING_PROJECT_REF`: the project reference from step A.5. Project reference is not a secret by itself, but storing it as a secret lets the workflow use one consistent variable.
4. Never add the service-role key to a browser/frontend environment, and do not add any secret to a `VITE_*`, `NEXT_PUBLIC_*`, or other client-exposed variable.
5. Do not run a remote migration workflow until the workflow explicitly targets the staging project reference and has a safe, non-destructive migration command. Never use `db reset --linked` against production; it is destructive.

## C. Apply migrations safely through GitHub Actions

The repository now contains a manual-only workflow at `.github/workflows/supabase-staging-migration.yml`. Use it only after the Supabase CLI local-stack workflow passes on the latest commit, you have created a separate empty staging project, and the three repository secrets above are configured. The staging workflow checks that your typed project reference matches the configured staging secret, previews pending migrations, and then applies them. It is not yet verified against a hosted project.

When the staging workflow is available:

1. Open **Actions** in GitHub.
2. Select the workflow named **Supabase staging migration**.
3. Select **Run workflow** on the `main` branch.
4. Confirm the displayed target is the staging project (never production).
5. Run it and open the job logs.
6. Confirm the job reports the expected migration versions and success. If it fails, stop; do not retry with a different project or bypass the failing migration.
7. In Supabase Dashboard, open the staging project’s **SQL Editor** and run a read-only migration-history check specified by the workflow documentation. Confirm the applied migration list matches the expected repository state.
8. Run the authorization tests against staging synthetic fixtures before using the project for demos.

## D. Secret-handling rules

- Do not paste secret values into chat. The assistant only needs confirmation that the secrets were saved, not their contents.
- Use a dedicated staging project; do not reuse ANVORA Beta Access.
- Do not expose the service-role key in GitHub Pages, client-side JavaScript, or a public repository.
- Do not enable a staging deployment until CI proves migrations apply on the local Supabase stack and the staging workflow has a reviewed target guard.
- A successful disposable PostgreSQL test is not evidence of successful Supabase Auth, Storage, or hosted staging behavior.

## Current status

This document is the setup procedure, not proof that staging exists or that remote migrations have been applied. Staging project creation, secret creation, and hosted validation require dashboard access by the project owner. No credentials are requested in chat.
