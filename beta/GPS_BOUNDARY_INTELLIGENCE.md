# GPS Boundary Intelligence

## Scope

This first implementation adds a company-scoped GPS field inspection page to the beta application. It reads existing `beta_field_records` and their `boundaryPoints` coordinates. It does not add or modify database tables, columns, RLS policies, or saved field records.

## Google Maps imagery

The page uses the Google Maps JavaScript API with `satellite` as the initial map type and offers `hybrid` and `roadmap` map types. Existing GPS polygons are drawn from the application's saved coordinates.

To enable imagery:

1. Create or select a Google Cloud project.
2. Enable Maps JavaScript API and attach billing.
3. Create a browser API key.
4. Apply an HTTP referrer restriction for the exact deployed application host(s).
5. Restrict API usage to Maps JavaScript API.
6. Set quota and budget alerts.
7. Sign in, open **GPS Boundary Intelligence**, paste the key and select **Load imagery**.

The key is stored in browser local storage on that device. It is not written to GitHub or Supabase. A browser Maps API key is visible to the browser by design; protect it with referrer and API restrictions. Clear the saved key from the page when needed.

Google's API requires a key and billing. Imagery availability, acquisition date and maximum useful zoom vary by location.

## Implemented checks

The page calculates checks from saved GPS geometry:

- Valid latitude/longitude coordinates.
- Minimum three usable polygon vertices.
- Duplicate coordinates.
- Polygon self-intersection.
- GPS accuracy metadata presence and a review flag when a recorded point is worse than 30 m.
- Polygon area recalculated from stored vertices.
- Comparison against assigned acreage, with a review flag above 10% variance.

The 30 m and 10% values are review heuristics, not surveyed-boundary accuracy standards. An acreage variance is not proof that the GPS boundary is wrong.

## Google imagery usage boundary

Google imagery is provided for visual inspection only. Do not scrape, export, cache, trace, digitise or run machine interpretation/object detection on Google Maps content. Geometry checks in this module use only the application's own saved GPS coordinates.

The module does not automatically detect or correct physical field edges. A correction must be obtained from a fresh authorised GPS boundary walk or a separately licensed geospatial source, reviewed by an authorised user, and saved through the existing field workflow.

## Verification performed

- JavaScript syntax check for the new module and modified application entry point.
- Static render test using a synthetic field record to confirm the screen renders its field, GPS assessment and API-key setup instructions.

Not yet verified:
- Live Google imagery, because no API key was supplied.
- Browser interaction on the deployed application.
- Google imagery coverage/clarity for actual production fields.
- Production deployment or live billing/quota behavior.

## Files

- `beta/gps-boundary-intelligence.js`: page, Google Maps loader, polygon overlay and geometry assessment.
- `beta/app.js`: route rendering and page binding.
- `beta/index.html`: navigation and script loading.
- `beta/styles.css`: responsive map and assessment layout.
