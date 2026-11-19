# Sentinel-1 / Sentinel-2 root-zone VWC model — POC v0.1

## What this release does

The Beta workbench now includes a browser-side supervised modelling pipeline. It joins imported 0–30 cm ground-measured VWC field-date references to company-scoped, saved satellite observations and fits a regularized linear regression model.

**This is a calibration POC, not a validated operational soil-moisture product.** It does not claim that C-band radar or optical indices directly measure 0–30 cm root-zone water content.

## Inputs

### Ground reference
Use the existing ground-measurement CSV template. A field-date reference is accepted only when at least three sample points each have a complete, contiguous, depth-weighted 0–30 cm profile. Field IDs must remain wholly within one train, validation or test split.

### Satellite predictors
The first model version uses four field-level features:

- Sentinel-2 NDVI
- Sentinel-2 NDMI
- Sentinel-1 VV backscatter
- Sentinel-1 VH backscatter

Sentinel-2 optical observations are paired with the nearest Sentinel-1 radar observation for the same field when the two dates are no more than five days apart. The ground sampling date is then matched to the nearest combined optical/radar date within a user-selected tolerance (0–15 days; default five). Each satellite field-date can be used for at most one ground-reference match in a training dataset, preventing repeated use of the same acquisition as multiple independent pairs.

Only saved satellite runs already loaded for the authenticated company are read. No new Copernicus request is made by the training button.

## Model

- Algorithm: ridge-regularized multiple linear regression.
- Predictors: standardized NDVI, NDMI, VV and VH.
- Training: only rows belonging to fields assigned to the training split.
- Hyperparameter selection: if there are at least four validation pairs from at least two validation fields, select ridge alpha from 0.01, 0.1, 1 and 10 using validation RMSE. Otherwise use alpha 1.0.
- Minimum fit: at least 12 matched training field-date pairs from at least four training fields.
- Test: test fields are not used for fitting or hyperparameter selection.
- Prediction range: model output is constrained to 0–1 m³/m³.

The model reports MAE, RMSE, bias and R² for validation and field-held-out test pairs. These are descriptive metrics; this release does not impose a claim of model acceptance. A sufficiently large, representative independent test set and agronomic review are required before operational reliance.

## Prediction output

The model generates a field-average 0–30 cm VWC estimate for each saved field-date with complete combined Sentinel-1/2 features. It assigns validation_split=operational only to fields not present in the ground-reference split allocation. Predictions for training, validation and test fields retain their respective split labels.

CSV output includes the field, date, estimate, model version, split and source satellite run ID.

## Critical spatial limitation

The saved satellite evidence currently contains field-level summary statistics, not per-pixel VWC predictions or a spatial VWC raster. Therefore this model estimates **field-average VWC only**.

It cannot calculate:

- percentage of mapped field area below 0.15 m³/m³;
- percentage of valid pixel/field coverage;
- a defensible 80%-of-field-area dryness condition.

Those fields are intentionally left blank. The operational classifier will not trigger from a field-average estimate. To implement the agreed area-based rule, a later spatial modelling stage must retrieve or process pixel-level Sentinel-1/2 features over the field polygon, estimate VWC for valid pixels, and aggregate the below-threshold and valid-area fractions. Ground calibration must also represent the spatial variability of each field.

## Data handling and governance

- Model fitting and predictions remain in browser memory for this POC session.
- No model, ground measurements or predictions are written to Supabase.
- The source satellite snapshots are read-only and remain company-scoped.
- No VM0051 audit register or drainage-event rows are created or changed.
- The output is an AI-derived estimate, not a physical soil probe reading.
- Each generated prediction retains the model version and source satellite run ID; human review and actual outcome feedback remain necessary.

## How to run

1. Sign in to the appropriate company workspace.
2. Open Manager → Satellite Intelligence → Root-Zone Soil Moisture Intelligence – POC.
3. Import representative 0–30 cm ground profiles using the ground-measurement template. Include separate field-level train, validation and test allocations.
4. Ensure the same company has saved Sentinel-1/2 evidence runs for those fields and dates.
5. Set the sample-to-satellite matching tolerance and select **Train model and predict saved fields**.
6. Review validation and independent test metrics. Download generated predictions CSV for retention and review.

If the model reports insufficient matched data, the missing requirement is genuine matched ground/satellite coverage—not a software error to bypass with synthetic values.
