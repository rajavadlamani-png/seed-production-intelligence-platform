# Sentinel spatial feature extractor — Root-Zone VWC POC

This utility retrieves field-clipped Sentinel-2 L2A and Sentinel-1 GRD rasters through the Copernicus Data Space Ecosystem (CDSE) Sentinel Hub Process API. It writes the one-row-per-cell CSV accepted by Field-wise Root-Zone VWC Estimation.

**It does not estimate VWC.** It extracts NDVI, NDMI, VV and VH predictors only. Root-zone VWC estimation still requires measured 0–30 cm ground samples matched to satellite cells and independent field-held-out validation. Sentinel-1 GRD is a radar backscatter observation and Sentinel-2 is optical vegetation/surface context; neither directly measures 0–30 cm VWC.

## Requirements and installation

- Python 3.10 or later.
- CDSE account and OAuth client with Sentinel Hub Process API access.
- GeoJSON field polygons and, for calibration, the VWC ground-measurement CSV with GPS coordinates filled.

\`\`\`bash
python -m venv .venv
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python sentinel_spatial_extractor.py --self-test
\`\`\`

## CDSE credentials

Create an OAuth client in the Copernicus Data Space Ecosystem account area. Set the client ID and secret in your local shell. Never put credentials in GeoJSON, CSV, GitHub, browser JavaScript or committed configuration.

Windows PowerShell:
\`\`\`powershell
$env:CDSE_CLIENT_ID = "YOUR_CLIENT_ID"
$env:CDSE_CLIENT_SECRET = "YOUR_CLIENT_SECRET"
\`\`\`

macOS/Linux:
\`\`\`bash
export CDSE_CLIENT_ID="YOUR_CLIENT_ID"
export CDSE_CLIENT_SECRET="YOUR_CLIENT_SECRET"
\`\`\`

## Field boundary input

Provide a GeoJSON FeatureCollection with one Polygon or MultiPolygon per field. Each feature needs properties.field_no matching the field number in the VWC ground CSV. Coordinates must be WGS84 longitude/latitude (EPSG:4326 / CRS84). Do not include farmer names, phone numbers, bank details or other personal data.

Example structure (replace the illustrative polygon and field ID with the actual field boundary):

\`\`\`json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {"field_no": "FIELD-001"},
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[78.0,17.0],[78.001,17.0],[78.001,17.001],[78.0,17.001],[78.0,17.0]]]
    }
  }]
}
\`\`\`

The beta's Export saved field polygons action creates this file from GPS boundaries in the currently signed-in company workspace. Review the exported polygons and field IDs before sending them to CDSE.

## Ground sample coordinates

Use the ground-measurement CSV from the VWC workbench. Keep field_no, date, sample_point_id, and validation_split identical to the ground measurement records. Fill latitude and longitude on every depth-layer row for the same sample point. All dates for a field must remain in one split: train, validation or test.

The script maps each point to the 20 m cell containing its GPS coordinate. If two sample points fall in the same cell, it stops rather than using one cell for two labels. Points outside the polygon or in cells without valid S1 and S2 data are reported as unmatched.

## Run one observation window

\`\`\`bash
python sentinel_spatial_extractor.py \\
  --fields company-field-boundaries.geojson \\
  --ground-csv root-zone-vwc-ground-measurements.csv \\
  --from-date 2026-07-01 \\
  --to-date 2026-07-05 \\
  --observation-date 2026-07-05 \\
  --window-id KHARIF26-W01 \\
  --split operational \\
  --output root-zone-vwc-spatial-pixels.csv
\`\`\`

- from-date / to-date: satellite acquisition search window.
- observation-date: date key used to match ground sample points; defaults to to-date. For calibration it must exactly match the ground CSV date.
- window-id: stable identifier shared by fields in the same observation window.
- split: split for fields without matched ground samples. Ground CSV split values take precedence for fields with samples.

The script requests Sentinel-2 and Sentinel-1 separately on the same projected UTM grid at 20 m. Sentinel-2 NDVI uses B08/B04; NDMI uses B08/B11. SCL classes 0, 1, 3, 8, 9, 10 and 11 are masked; tile cloud coverage is limited to 40%. Sentinel-1 uses VV/VH in linear power with GAMMA0_TERRAIN backscatter and orthorectification. Do not compare these VV/VH values with dB values from another source without conversion.

The output includes every grid cell intersecting the field, including no-data cells. Cell area is clipped to the field polygon. If either sensor is missing or invalid, all four feature columns are blank for that cell. Do not delete no-data rows before importing. A .metadata.json sidecar records coverage, selected settings and input-boundary hash.

## Import into the beta

1. Sign in to the correct company workspace.
2. Open Satellite Intelligence.
3. Under Field-wise Root-Zone VWC Estimation, import the generated CSV.
4. Import the matching measured ground profiles in the same browser session.
5. Click Train spatial model & estimate VWC.
6. Review independent test metrics and field-wise outputs. Treat the model as provisional until validation criteria are agreed and independent test performance is acceptable.
7. Retain the metadata sidecar as part of the evidence trail.

## Important limitations

- 20 m is the common predictor grid because Sentinel-2 B11 is native 20 m. Sentinel-2 10 m bands and Sentinel-1 GRD are resampled to this grid; this is not a claim that every source band is natively 20 m.
- The S1 and S2 acquisitions in a search window may not be on the same day. The CSV date is the matching key, not a same-day acquisition claim. Review the sidecar and acquisition dates before interpretation.
- Missing imagery remains missing; no satellite feature is fabricated.
- The grid resolution is not a direct measurement of 0–30 cm root-zone moisture.
- This first version processes each field individually for a controlled POC. A production-scale rollout needs a queued backend, retries, rate limits, persistent jobs and company-scoped storage.
- The script does not write to Supabase or change database schema, RLS policies, memberships or audit records.

## Official references

- [CDSE Sentinel Hub Process API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process/Process.html)
- [Sentinel-2 L2A bands, resolutions and cloud filtering](https://docs.sentinel-hub.com/api/latest/data/sentinel-2-l2a/)
- [Sentinel-1 GRD processing and backscatter units](https://docs.sentinel-hub.com/api/latest/data/sentinel-1-grd/)
- [Evalscript V3](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Evalscript.html)
