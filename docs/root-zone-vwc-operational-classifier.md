# Root-zone VWC operational classifier

## Operational rule

The Beta classifier applies the selected operating rule to model-generated, per-field observation outputs:

- Root-zone depth: 0–30 cm.
- Moisture threshold: VWC strictly below 0.15 m³/m³.
- Field-area rule: at least 80% of the mapped field area is estimated below 0.15 m³/m³.
- Temporal rule: the condition is met on two consecutive available modelled observation dates.
- Minimum usable model coverage: at least 80% of the mapped field area must have valid model estimates on each observation date.

The area and coverage percentages are configurable in the page. The VWC threshold and depth are fixed at 0.15 m³/m³ and 0–30 cm in this release.

## Prediction CSV

Use the prediction template in Satellite Intelligence. Required columns:

- `field_no`
- `date` (YYYY-MM-DD)
- `predicted_vwc_0_30_m3_m3` (field mean estimate, m³/m³)
- `model_version`
- `validation_split` (use `operational` for production classification; `train`, `validation`, and `test` are reserved for model evaluation)

Required for operational classification:

- `area_below_threshold_pct`: percentage of the total mapped field area estimated below 0.15 m³/m³. This is not the percentage of valid pixels only.
- `valid_area_pct`: percentage of the total mapped field area with valid model output.

Optional model evaluation fields: `lower_90`, `upper_90`.

The parser rejects percentages outside 0–100 and rejects below-threshold area greater than valid area. It rejects duplicate field/date/model rows and multiple model versions in one import.

## Event window

A continuous run of qualifying available observations is represented as one period. The first qualifying date is shown as the period start; the second qualifying date is the trigger date; the last qualifying date is the end of the available observation run. Missing, low-coverage, or non-qualifying available prediction rows break the run. This is based on available modelled observation dates, not consecutive calendar days.

## Critical implementation boundary

This release implements the operational rule engine and CSV contract. It does **not** yet produce calibrated 0–30 cm VWC predictions from Sentinel-1/2. The existing saved satellite data contain field-level index/backscatter time series, not pixel-level VWC maps or area fractions. A model trained and independently tested against representative 0–30 cm ground profiles, plus pixel/field-area feature retrieval, is still required to generate trustworthy operational prediction CSVs.

The existing ground-profile import and field-held-out test metrics remain available. Operational classifications are browser-session results and are not written to Supabase or to the VM0051 audit register. A VWC-based dryness classification is not, by itself, proof that drainage was physically carried out.
