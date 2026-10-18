# Seed Production Intelligence Platform — Product Requirements Baseline

Status: Working requirements baseline for prototype development. This document records agreed direction; it does not imply production integrations or validated AI are already implemented.

## Product objective
Build a mobile-first seed-production operations platform with connected desktop management views. Preserve the existing prototype and Sage Harvest visual identity. GitHub Pages is for the front-end demonstration only; production records require a secure backend and database.

## Management navigation
1. Overview
2. Farmers & Fields
3. Inspections
4. Production & Traceability
5. Reports

A Weather & Crop Intelligence view may be added when connected weather/satellite data is available. Until then, all sample figures, locations, forecasts and alerts must be clearly labelled illustrative.

## Core workflow
Farmer/contract/season and field setup -> parent seed lot identification -> field assignment and GPS boundary -> stage-based inspection -> exception/corrective action -> pre-harvest assessment -> harvesting -> lot/quality/processing/dispatch traceability -> actual-versus-plan reporting.

## Paddy inspection baseline
Use the user's supplied existing inspection forms as the reference. Preserve the six report forms:
1. First Inspection Report
2. Vegetative Report
3. Pre Flowering Report
4. Flowering Report
5. Pre Harvesting Report
6. Harvesting Report

Retain original business fields and terminology, including grower, village, production area, contract/M.R./lot context, production personnel, male and female parent details, dates, isolation, crop condition, synchronization, parental purity, yield estimates, harvest records, STN/dispatch and quality details. Do not invent agronomic thresholds or make optional fields mandatory without operational confirmation. Crop-specific forms and rules must be configurable; do not assume Paddy rules apply to Cotton or other crops.

## Mobile field officer experience
- Responsive, touch-friendly forms; one assigned field at a time.
- Offline-first capture with reliable sync planned for production implementation.
- GPS boundary capture with accuracy, timestamp, captured area and source provenance.
- Inspection stage status distinguishes not started, draft, submitted, review required and approved where the workflow is agreed.
- Photos/evidence, observations, activity/input log, corrective action, owner and due date.
- Draft saves must not mark reports complete or unlock later stages. Completion and permissions must be server-enforced in production.
- Never present browser-only data as saved to a server.

## Management and reporting
- Overview: planned vs actual acreage/production, inspection progress, overdue work, high-priority exceptions and yield outlook only when supported by approved assumptions/models.
- Farmers & Fields: growers, contracts, season, crop/hybrid, field number, GPS boundary, assigned team, male/female parent seed identity and lot context.
- Inspections: progress across six Paddy reports, outstanding inspections, evidence, exceptions and corrective-action closure.
- Production & Traceability: estimated vs actual harvest, harvest lot, processing lot, quality/lab results, packing and dispatch, with forward/reverse genealogy.
- Reports: filter/aggregate by crop, hybrid, season, grower, village, territory, district and state.
- Dashboard values must derive from records, not fixed decorative numbers. Sample records must be marked illustrative.

## Weather and crop intelligence
Planned capability; not connected until a provider and service are implemented.
- Field-specific current conditions and 7-day forecast; rainfall, temperature, humidity and wind where provider coverage supports them.
- Relevant alerts for heavy rainfall, heat, dry spells and other validated hazards.
- Crop-stage-aware advisories, especially around flowering/pollination and harvest, subject to agronomist-reviewed rules.
- Store source/provider, issue time, valid period, location/field match and freshness.
- Weather is decision support, not proof of crop loss or a guaranteed agronomic prescription.

## Satellite monitoring
Planned capability; not connected until imagery/data service is implemented.
- Time-series vegetation indicators (e.g. NDVI/NDRE where available), anomalies and historical comparison.
- Compare with inspection observations and field boundaries.
- Show image date, resolution/source, cloud/quality limitations and confidence.
- Satellite signals flag areas for investigation; they do not independently confirm disease, varietal purity, activity completion or quality.

## Risk, yield and AI
- Explainable configurable risk/exception status, with evidence and human review.
- Yield prediction only after historical data, crop/hybrid assumptions, target definitions and validation methodology are approved.
- Record predictions, confidence/uncertainty, model version, actual outcomes and performance over time.
- Conversational AI must respect user permissions and distinguish known records from inference. Do not claim voice/AI services are connected unless implemented and tested.
- Recommendations remain advisory; consequential decisions require authorised human review.

## Traceability and reconciliation
Maintain traceable links: parent seed lot -> grower/field/crop/hybrid/season -> inspections and activities -> harvest lot -> processing lot -> laboratory/quality -> packing/final lot -> dispatch. Record quantity and area changes with provenance and audit history. Integrations (e.g. SAP) require confirmed APIs and credentials in a secure backend; do not imply connected integration prematurely.

## Security and data governance
- Production implementation requires server-side authentication, tenant isolation, role/geographic permissions, secure storage, audit trail, backup/recovery and retention controls.
- UI-only role switching is not access control.
- Never place secrets in public GitHub Pages or frontend source.
- Do not upload real farmer personal/bank data to the public prototype.
- Retain original uploaded documents and record extraction/validation provenance where secure bulk import is implemented.

## Development sequence
1. Validate existing management dashboard and mobile workflow against these requirements and the source inspection forms.
2. Fix the operational data model, dynamic dashboard calculations, inspection status and exception handling.
3. Establish secure backend/database architecture before real records are used.
4. Add a provider-independent weather service and field-level forecast/alert UI.
5. Add satellite ingestion and field time-series UI.
6. Add validated risk/yield intelligence and actual-versus-predicted monitoring.
7. Add enterprise integrations and expand crop-specific workflows.

## Acceptance principles
- No hard-coded sample metric is presented as real operating data.
- Each inspection field can be traced to the original form or an explicitly approved enhancement.
- Draft, submitted, reviewed and completed statuses are distinct.
- Dashboard totals reconcile to underlying records and state their units/time period.
- Weather/satellite information shows provenance and freshness.
- AI predictions are labelled as predictions and are evaluated against actual outcomes.
- Prototype-only capabilities are clearly disclosed.
