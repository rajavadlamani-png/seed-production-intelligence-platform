# Rabi 2025–26 seven-day dry-spell test

## Scope
The historical test remains limited to the three DEMO boundaries:
- WH-SYN-001
- WH-SYN-004
- WH-SYN-050

Monitoring period: **1 November 2025 to 30 April 2026** (181 calendar days).

## Revised event rule
The earlier rule searched for a sudden NDMI decrease coincident with a Sentinel-1 backscatter change. That was not suitable for fields that remain dry for much of the crop cycle.

The revised rule evaluates daily condition records:
- A daily record is dry when its root-zone moisture is at or below the supplied field-specific dry threshold, or when an explicit daily surface-water status is dry / not_ponded.
- An explicit wet / ponded / standing_water / water_present / inundated status overrides the moisture threshold for that day.
- A qualifying spell is at least **seven consecutive calendar days** with a dry status on every day. Missing dates and unknown statuses break the run.
- The earliest qualifying spell is counted as the one single-event trigger for the crop cycle. Further qualifying spells are listed separately for review and are not counted as additional single-drainage events.
- GREEN: at least one qualifying seven-day spell.
- RED: all 181 days have classified daily dry/non-dry records and no qualifying spell exists.
- AMBER: daily evidence is absent or incomplete, or does not cover every day needed to support a conclusion.

This rule identifies a dry-spell trigger candidate. It does not independently prove a physical drainage operation or establish VM0051 compliance.

## Daily moisture CSV import
The Beta panel accepts a CSV with these columns:

field_no,date,root_zone_moisture_m3_m3,dry_threshold_m3_m3,surface_water_status

One row per field per day. Required identifiers are field_no and ISO date (YYYY-MM-DD). For moisture-based classification, both moisture and threshold must be volumetric m³/m³ values from 0 to 1. surface_water_status is optional and accepts dry/non-ponded or wet/ponded labels.

The threshold is field-specific and must be established by the project agronomist using relevant soil and crop context. The platform does not invent a universal root-zone moisture threshold.

## Bhuvan source limitation
The application does not currently have a direct authenticated Bhuvan NHP data API integration. The NHP daily root-zone product is a model-derived grid at approximately 5.5 km resolution and is not a field sensor or field-scale measurement. Its download portal requires Bhuvan registration. The current implementation therefore supports a controlled CSV import of prepared field/date values; it does not claim to fetch Bhuvan data automatically. Source grid identifier, extraction method and data provenance should be retained by the project when preparing the CSV.

## Satellite observations
The historical test continues to retrieve Sentinel-1 and Sentinel-2 through the existing signed-in browser integrations. NDMI and VV/VH remain supporting context only. The existing Sentinel-2 five-day and Sentinel-1 one-day aggregation intervals are not equivalent to daily physical observations. Missing acquisitions are never converted into dry days.

## Data isolation
- Uses only the three named DEMO records and their stored boundaries.
- Does not read physical inspection reports, photographs, farmer confirmations, or drainage-event records.
- Does not write results into Supabase or any formal audit table.
- CSV import and classifications remain in the browser session.
- Does not change the formal VM0051 Audit Register.

## Limitations
- Root-zone moisture is not a direct measurement of standing surface water.
- NHP grid resolution is coarse relative to individual fields; nearby fields can share the same grid-cell value.
- A seven-day modelled soil-moisture dry spell is a remote-sensing/model evidence candidate, not proof that the field was physically drained or remained free of standing water.
- The three boundaries and farmer names are DEMO data; they are suitable for technical testing only.
- Thresholds and interpretation require calibration against field water-level records and the project's approved monitoring plan before production carbon/MRV use.

## Validation
CI runs JavaScript syntax checks and deterministic unit tests for consecutive-day logic, missing-day handling, wet-day interruption, one-event counting, and RED/AMBER coverage gates. CI does not validate the satellite retrieval services or Bhuvan source data. The authenticated user must run the retrieval in Beta and import an appropriately prepared daily moisture CSV.


## Additional daily weather and modelled soil-moisture corroboration

The historical evidence panel also supports a separate browser-session retrieval from the Open-Meteo Historical Weather API using the ERA5-Land reanalysis model for the three DEMO field boundaries and the same 1 November 2025–30 April 2026 period.

Daily variables displayed:
- precipitation sum (mm);
- mean 2 m air temperature (°C);
- FAO reference evapotranspiration ET₀ (mm);
- mean modelled soil moisture for 0–100 cm (m³/m³).

The request uses the mean of the stored boundary GPS points as its query coordinate. The API's returned grid coordinates and elevation are retained in the browser-session result. The report explicitly warns that the saved DEMO boundary coordinates and their village/district labels have not been independently verified. Coordinate validation is required before interpreting the weather series as relevant to the named field.

A zero-precipitation run is described only as a rain-free weather interval. It is not used as a dry-field or drainage classification. ERA5-Land soil moisture remains a modelled reanalysis estimate and is displayed separately; it does not override or fill the Bhuvan daily moisture series and does not change the seven-day trigger status.

The combined CSV export joins daily weather rows with same-date available Sentinel-1/2 observations and imported Bhuvan daily values. Blank cells mean no observation was available on that date; no interpolation or backfilling is performed. Results remain in the browser session and are not written to Supabase or the formal VM0051 register.

Open-Meteo source documentation: https://open-meteo.com/en/docs/historical-weather-api. Attribution is CC BY 4.0. The provider offers separate usage terms for commercial services; confirm the current licence before production deployment.


Weather data retrieval is an explicit user-initiated action in the Beta page. It is not scheduled or silently refreshed. Each successful result remains visible only in the current browser session until exported; refreshing or closing the page requires retrieval again.
