# Supabase Authentication Integration — Milestone 1

## Purpose

Add a real Supabase sign-in path to the existing static HTML/CSS/JavaScript prototype without converting it to Next.js or changing the published `main` branch.

## Implemented in this branch

- Loads Supabase JS v2 through its browser CDN build.
- Uses the project's Supabase URL and public publishable key in `supabase-config.js`.
- Adds a company-email/password sign-in form.
- Authenticates with `auth.signInWithPassword`.
- Queries `public.company_memberships` for an active membership belonging to the signed-in user. The database's RLS policies remain the authorization boundary.
- Displays the signed-in email, company name, and role after membership verification.
- Restores an existing Supabase session and rechecks membership.
- Provides sign-out.
- Keeps the old demo available separately and labels it as sample-only.
- Hides the prototype dashboard in a secure session. No demo farmer, acreage, or inspection records are shown as if they were live.

## Configuration and key handling

`supabase-config.js` contains the Supabase project URL and a publishable key. Publishable keys are intended for browser applications. Never place a Supabase service-role key, secret key, password, or other privileged credential in this file or in GitHub Pages.

The application depends on the existing database RLS policies. A publishable key is not a substitute for RLS.

## Current limitation

This milestone verifies identity and one active company membership, then stops at a secure status screen. It does **not** yet connect the operational UI to database records. Multi-company selection is not yet implemented; the initial SeedWorks administrator currently has one active company membership.

## Manual verification checklist

These checks must be completed in a browser after a safe preview/deployment of this branch:

1. Valid SeedWorks email/password authenticates successfully.
2. The membership check displays the SeedWorks company and the user's assigned role.
3. Invalid credentials show a clear error without exposing technical details.
4. A user with no active company membership is signed out and denied access.
5. Sign-out returns to the welcome screen and ends the Supabase session.
6. Reloading with a valid session rechecks membership.
7. The secure session never displays the prototype's sample dashboard.
8. The separate demo path still works and remains visibly labeled as sample-only.

These are planned checks, not claims that browser testing has already passed.

## Deployment safety

Changes are on `feature/supabase-auth-integration`. Do not merge to `main` until the browser checks above pass. The public GitHub Pages demo continues to serve `main` until then.
