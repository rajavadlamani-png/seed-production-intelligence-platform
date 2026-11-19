# Satellite-Only Observation Report

## Purpose
The Beta Manager workspace includes a separate Satellite Intelligence page. It produces a field-level report from saved satellite observation runs without consulting physical inspection forms, inspection photographs, farmer confirmations, or submitted drainage-event records.

## Data source and isolation
- Reads saved records from `public.vm0051_drainage_evidence_runs`, scoped to the active company.
- Uses the satellite run's `evidence_payload.fields[].observationSeries` and satellite source/status metadata.
- Uses the field number and farmer/location labels carried in the saved satellite snapshot.
- Does not query `beta_field_records`, inspection reports, `vm0051_drainage_events`, evidence attachments, or audit history.
- Does not display or use the inspection-date metadata carried in older shared evidence snapshots.
- No new database table or policy is introduced; existing company-scoped RLS governs access to saved runs.

## User workflow
1. Open **Satellite Intelligence** in the Manager workspace.
2. Select a saved satellite run.
3. Select a field contained in that run.
4. Select the monitoring date range and generate the report.
5. Review the dated Sentinel-2 indices (NDVI, NDMI, NDRE, EVI, SAVI) and Sentinel-1 backscatter values (VV, VH), where returned.
6. Export CSV/Excel or print/save as PDF.

## Interpretation safeguards
- First-to-last differences are numerical changes between available observations, not a validated crop-health, soil-moisture, inundation, or drainage classifier.
- VV/VH are radar backscatter values; optical indices are remote-sensing indices. Their interpretation depends on crop stage, field conditions, processing and acquisition quality.
- A change in an index or backscatter value does not by itself prove irrigation, drainage, water depth, crop stress, or a VM0051-compliant event.
- No satellite observation in the selected period means coverage is unavailable in that saved run; it is not evidence that a field condition did or did not occur.
- Manual inspection evidence remains a separate stream and can be compared in a separate review workflow, but it cannot fill or overwrite satellite observations.

## Current implementation boundary
The report is based on previously saved satellite runs. It does not automatically trigger a new Copernicus query from this page. To create a new run, use the existing Satellite Evidence report in **Reports**, then return to Satellite Intelligence and select the new run. The existing satellite provider integrations and saved acquisition series are reused.

## Validation
The frontend syntax workflow checks `beta/satellite-only.js` and asserts the module remains isolated from manual inspection and drainage-event sources. A real account-level browser acceptance test is still required to validate company membership, run visibility, date filtering and export behavior in the deployed Beta.
