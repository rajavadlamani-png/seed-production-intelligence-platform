# Rabi 2025–26 historical satellite signal test

## Purpose
A targeted technical retrieval test for the three existing DEMO field boundaries:
- WH-SYN-001
- WH-SYN-004
- WH-SYN-050

Monitoring period: **1 November 2025 to 30 April 2026**.

The test calls the existing Sentinel-2 and Sentinel-1 worker integrations from the user's signed-in Beta browser. It does not query all company fields.

## Colour labels
These are exploratory signal-screening labels, not validated drainage-event classifications.

- **Green — Cross-sensor signal-shift candidate:** an unusually sharp within-field NDMI decrease coincides with an unusually large Sentinel-1 VV/VH backscatter change within 12 days. The rule uses within-field robust deviation scores (median absolute deviation) on the returned time series.
- **Red — No candidate signal shift detected:** the pilot coverage gate is met, but the exploratory rule identifies no coincident signal shift. This is not proof that no drainage occurred.
- **Amber — Insufficient evidence:** the pilot coverage gate is not met, the field is unavailable, or retrieval fails.

The pilot coverage gate requires at least 8 NDMI observations and 8 radar observations, with no gap greater than 25 days in either series. These are provisional engineering gates for this technical test, not validated scientific or methodology thresholds.

## Date and interval semantics
The existing integration requests Sentinel-2 at a five-day aggregation interval and Sentinel-1 at a one-day aggregation interval. The displayed dates are returned aggregation interval dates, not necessarily exact satellite acquisition timestamps. The test reports the interval dates exposed by the worker response.

## Data isolation
- Uses only the three named DEMO records and their stored boundaries.
- Uses the existing `satelliteEvidenceForField` browser request logic.
- Does not read physical inspection reports, photographs, farmer confirmations, or drainage-event records.
- Does not write results into `vm0051_drainage_evidence_runs` or any formal audit table.
- Results remain in the browser session and can be downloaded as a CSV.
- No Supabase schema or RLS change is required.

## Important limitations
- NDMI is an optical vegetation/canopy moisture-related index, not a direct field water-level or soil-water measurement.
- Sentinel-1 backscatter can respond to multiple surface, vegetation, moisture, geometry and processing factors. A change is not uniquely attributable to drainage.
- The green pattern is a candidate cross-sensor signal shift only; it does not determine wet-to-dry transition or prove a single drainage event.
- Red means no candidate pattern under the exploratory rule and available coverage; it does not mean no drainage happened.
- The three boundaries and farmer names are demo data. Earlier checks identified questionable location metadata for some boundaries. They are suitable only for technical connectivity testing, not actual agronomic or carbon-project evidence.
- No ground-truth wet/dry labels or confirmed drainage events are currently available in the queried database. The rule must be calibrated and validated against real field observations before any production Green/Red/Amber drainage-event classification is enabled.

## Validation
The frontend workflow runs JavaScript syntax checks and asserts that the three field IDs, historical date range and existing retrieval function are present. A successful CI run does not prove the external workers returned historical data. The actual retrieval test must be run by an authorised user in the deployed Beta browser.
