# Satellite Observations Read API — pilot deployment guide

## Status

The authenticated, read-only Supabase Edge Function is implemented on the feature branch at `supabase/functions/satellite-observations/index.ts`. It is **not deployed** and has not been tested against a real pilot database. Do not describe the platform as live until the prerequisites and acceptance tests below pass.

## Endpoint contract

After deployment, the endpoint is:

`GET https://<approved-project-ref>.supabase.co/functions/v1/satellite-observations?company_id=<company-uuid>[&field_id=<field-id-or-code>]`

The caller must send a valid signed-in Supabase access token:

`Authorization: Bearer <user-access-token>`

Successful response shape:

```json
{
  "observations": [
    {
      "id": "…",
      "field_id": "…",
      "field_code": "…",
      "collection": "sentinel-1-grd",
      "interval_start": "2026-11-01",
      "interval_end": "2026-11-05",
      "indices": {},
      "plain_language_interpretation": {},
      "review_status": "pending"
    }
  ],
  "count": 1,
  "scope": "company",
  "retrieved_at": "…"
}
```

The actual observation rows come only from `public.seed_satellite_observations`. An empty array means no matching records were returned; it does not indicate healthy crop status.

## Server-side controls

- Verifies the caller's Supabase access token using Supabase Auth.
- Requires an active `company_memberships` record and an active `companies.status` for the requested company.
- Uses the service-role key only inside the Edge Function; it must never be placed in GitHub Pages or browser code.
- Limits field officers to currently active, date-valid `field_assignments`, resolving field codes from `fields`. If identifiers cannot be reconciled, it fails closed.
- Rejects `territory_manager` requests with HTTP 409 until a verified territory-to-field mapping is implemented. Do not relax this guard based on the client-side role selector.
- Restricts CORS to the comma-separated `ALLOWED_ORIGINS` environment variable.
- Allows only GET and OPTIONS and returns `Cache-Control: no-store`.
- Does not write observations, trigger satellite processing, or modify source data.

## Required prerequisites before deployment

1. Confirm the exact isolated pilot Supabase project reference. Do not use a production or ANVORA Beta Access project by assumption.
2. Review and, only after explicit approval, apply the foundation, weather and satellite audit-trail migrations to that isolated project in numeric order.
3. Verify that `companies`, `company_memberships`, `farmers`, `crop_seasons`, `fields`, `seasonal_field_records`, `field_assignments`, `seed_weather_locations`, and the satellite audit tables are present and that their UUID identifiers can be mapped for the pilot.
5. Configure `ALLOWED_ORIGINS` to the exact approved application origin(s). Do not use `*` when credentials are used.
6. Configure Supabase Edge Function environment variables securely: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Use the project-generated values in the Supabase dashboard/CLI; never paste them into chat or commit them.
7. Confirm the application's authentication flow issues a Supabase access token and that the client can pass it in the Authorization header. The current static prototype uses simulated roles and does not yet provide a verified sign-in/session flow; the API is not yet wired to the page.
8. Verify the pilot field registry uses stable identifiers, verified polygons, crop/season and planting dates. No synthetic demo field should be used as pilot evidence.

## Deployment and verification (only after project approval)

From a trusted development environment with the Supabase CLI authenticated to the approved pilot project:

1. Review the target project reference before any deployment.
2. Set the Edge Function secrets in the Supabase project dashboard or approved secret-management path.
3. Deploy only this function: `supabase functions deploy satellite-observations --project-ref <approved-pilot-project-ref>`.
4. Run authenticated tests for:
   - no Authorization header → 401;
   - expired/invalid token → 401;
   - valid token without active company membership → 403;
   - valid company member → only that company's rows;
   - field officer → only assigned field rows;
   - field officer requesting an unassigned field → 403;
   - territory manager without verified scope mapping → 409;
   - unsupported origin → 403;
   - empty result → 200 with `observations: []`;
   - request returns no cacheable response.
5. Inspect results for identifier mismatches and confirm that no service-role key or provider credential appears in browser requests, application source, logs or response bodies.

## Integration gap

The Seed Production Intelligence Platform's current GitHub Pages application is a static prototype with simulated roles. Its existing Satellite Monitoring adapter accepts a URL and browser cookies, but this Edge Function requires a real Supabase bearer access token and a `company_id`. Do not configure the frontend URL until the sign-in/session flow, company selection, field-scope mapping, and CORS origin are implemented and verified.

## Satellite evidence guardrails

A successful API response proves that records were returned, not that the observations are scientifically validated. Preserve acquisition provenance, collection, interval, valid-pixel coverage, algorithm/version and human review status. Do not infer disease, yield or farmer actions from satellite indices alone.
