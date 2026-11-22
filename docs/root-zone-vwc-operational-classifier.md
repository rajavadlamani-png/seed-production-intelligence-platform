# Root-zone VWC SDE classifier — Option B

## Methodology change

**Option B is the selected SDE rule for this release.** It replaces the earlier draft rule that required at least 80% of total mapped field area below the VWC threshold and at least 80% valid field coverage. Those 80% criteria are **not applied** by this classifier and must not be reported as the current SDE methodology.

## Operational rule

The Beta classifier applies the following rule to operational, per-field observation outputs:

- Root-zone depth: 0–30 cm.
- Metric: field-average root-zone volumetric water content (VWC), in m³/m³.
- Threshold: field-average VWC **strictly below 0.15 m³/m³**. A value equal to 0.15 does not qualify.
- Temporal rule: the condition must occur on two consecutive available modelled observation dates.
- Trigger date: the second qualifying available observation.
- Event window: the first qualifying date is the event start. Further consecutive qualifying observations update the same event and its last qualifying date.
- Grouping: one event per field and observation window in this classifier preview.

“Consecutive” means consecutive available observations in the imported series, not consecutive calendar days. A non-qualifying available observation breaks the qualifying run. Once the event run is broken, later qualifying observations do not extend that event.

## Prediction CSV

Use the prediction template in Satellite Intelligence. Required columns:

- `field_no`
- `date` (YYYY-MM-DD)
- `predicted_vwc_0_30_m3_m3` (field-average estimate, m³/m³)
- `model_version`
- `validation_split` (use `operational` for SDE classification; `train`, `validation`, and `test` are reserved for model evaluation)
- `observation_window_id` (required for operational predictions)

The following spatial fields may still be included as optional metadata, but they do not determine the Option B SDE trigger:

- `area_below_threshold_pct`
- `valid_area_pct`

The parser validates optional percentages when supplied. It does not require them for operational Option B classification.

## Graph and evidence interpretation

The SDE graph plots the imported field-average VWC at each actual available observation date and shows a horizontal 0.15 m³/m³ threshold. Observations below the threshold are highlighted. Lines between points are visual guides only; the graph does not imply daily measurements or interpolate missing observations.

The event CSV identifies the methodology version, field, observation window, first qualifying date, trigger date, last consecutive qualifying date, qualifying observation count, minimum and mean qualifying field-average VWC, and model version.

If spatial valid-coverage information is available, it may be disclosed separately as a data-quality indicator. It is not an eligibility threshold under Option B.

## Important limitations

- A field-average value below 0.15 m³/m³ does not mean that every part of the field is below the threshold. Option B deliberately classifies using the field average; it does not claim an affected-area percentage.
- A VWC-based dryness classification is not, by itself, evidence that a physical drainage operation occurred. Physical drainage should be supported separately by field confirmation or other auditable operational evidence.
- This release implements the SDE rule and visualisation for supplied operational predictions. It does **not** establish that Sentinel-1/2 alone currently produces calibrated, independently validated 0–30 cm VWC for every field.
- The existing spatial model POC estimates field means from cell-level predictions, but model quality, field-held-out performance, sensor coverage, and ground-sample representativeness must be reviewed before operational or audit use.
- Operational classifications remain browser-session results in this POC. They are not written to Supabase or to the VM0051 audit register.

## Change control

Methodology identifier in event exports: `OPTION_B_FIELD_AVERAGE_VWC_LT_0_15`.

This identifier distinguishes Option B outputs from earlier draft outputs based on field-area and coverage percentages. Do not combine the two rule sets in one audit series without explicitly versioning and explaining the methodology change.
