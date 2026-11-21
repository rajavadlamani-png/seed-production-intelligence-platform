# GPS Boundary Intelligence

## Scope

The page reads existing company-scoped field records and their `boundaryPoints`. It does not add or modify database tables, columns, RLS policies, or saved field records.

## Open imagery map

The page uses Leaflet 1.9.4 for map display and the OpenAerialMap / Open Imagery Network global imagery tile service:

`https://global.imagery.hotosm.org/{z}/{x}/{y}.png`

- No Google Maps API key or Google Cloud billing setup is required.
- OpenAerialMap imagery is openly licensed under CC BY 4.0; the map displays imagery attribution.
- The global service displays a coverage grid at zoom levels 0–13 and requests actual imagery at zoom 14 and above.
- High-resolution aerial/UAV coverage is contributed and uneven. A missing image at a farm location is possible; do not interpret the coverage grid as a photograph.
- OpenStreetMap is available as a reference layer, not as satellite imagery.
- Leaflet is loaded from the pinned unpkg CDN version 1.9.4.

## KML import

- Select a local `.kml` file. The browser parses KML Polygon/LinearRing geometries and overlays them on the map.
- The map zooms to the imported polygon automatically.
- Multiple polygons and inner rings are retained.
- Upload is local to the browser; the KML file is not sent to Supabase.
- Current importer accepts plain KML only, not zipped KMZ.
- Maximum file size is 20 MB.

## Implemented checks

The page calculates checks from saved GPS geometry:

- Valid latitude/longitude coordinates.
- Minimum three usable polygon vertices.
- Duplicate coordinates.
- Polygon self-intersection.
- GPS accuracy metadata presence and a review flag when a recorded point is worse than 30 m.
- Polygon area recalculated from stored vertices.
- Comparison against assigned acreage, with a review flag above 10% variance.

The 30 m and 10% values are review heuristics, not surveyed-boundary accuracy standards. An acreage variance is not proof that the GPS boundary is wrong. KML overlays are for visual inspection and do not automatically overwrite saved company field records.

## Important resolution and coverage limits

OpenAerialMap is a contributor imagery catalogue, not a guaranteed global high-resolution basemap. Some fields may have recent, high-resolution UAV/aerial imagery; other locations may have no contributed imagery. If no OAM image exists for a farm, this version does not silently substitute a lower-resolution satellite image and label it as high resolution. A later Copernicus Sentinel-2 layer can be added as a broad-coverage, lower-resolution fallback through the Copernicus Data Space Ecosystem, subject to its current API quotas and account/configuration requirements.

## Verification status

- JavaScript syntax and static render tests are performed before commit.
- Live imagery tile coverage and browser rendering must still be checked in the deployed app; this environment could not reach the public tile host during implementation.
- No database schema, RLS, or saved field data is changed.
- No automatic boundary extraction or correction from imagery is performed.

## Files

- `beta/gps-boundary-intelligence.js`: KML parsing, Leaflet map, OAM imagery layer, field polygon overlay and geometry assessment.
- `beta/app.js`: existing route rendering and page binding (unchanged).
- `beta/index.html`: Leaflet assets and cache-busted module loading.
- `beta/styles.css`: responsive map and assessment styling.
