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

## Operational workflow — leadership plan to field execution

This workflow supersedes any interpretation that the farmer roster is the first operational step. The roster remains important, but it is downstream of the approved production plan and parent-seed distribution process.

### Entry: welcome and sign-in
- The application opens on a Sage Harvest welcome screen with username and password fields.
- For the public prototype only, use clearly labelled dummy/demo credentials and a demo role selector or preconfigured demo accounts.
- Successful demo sign-in routes to the landing dashboard for the selected role.
- This is a visual workflow simulation only. It is not authentication or a security boundary. Real company-specific, admin-authorised login, tenant isolation, role permissions, geography restrictions and audit logging require a secure backend.

### Stage 1 — Production Manager records leadership plan
Capture the plan as a versioned planning record with season, crop, hybrid, territory/state scope, planned acres, planned productivity and planned production volume. Record plan source, date, creator, approval/revision status and notes. Do not silently calculate or overwrite leadership-approved targets; if volume is calculated from acres × productivity, label it as calculated and reconcile it to the leadership-provided volume.

### Stage 2 — Production Manager allocates targets to Territory Managers
Allocate approved acreage and planned volume by crop/hybrid/season to each Territory Manager. Show original target, allocated amount, unallocated balance and any over-allocation. Preserve a history of revisions and the person who made them. Release allocations explicitly to the relevant Territory Managers.

### Stage 3 — Territory Managers plan and distribute parent seed
Territory Managers plan parent-seed requirements and distribution for their assigned areas against the allocated production target. Capture parent-seed type/parent (male M-1/M-2/M-3 and female where applicable), lot identifier, quantity, distribution/receipt dates, receiving party and status. Seed-rate assumptions must be configured and approved for the crop/hybrid; do not hard-code an agronomic rate without approval. Keep planned, issued, dispatched and received quantities distinct.

### Stage 4 — Grower list received and bulk uploaded
After the parent-seed distribution step as specified in the operating process, the grower list is received as Excel/CSV and uploaded by an authorised user. Keep the original filename, upload timestamp, uploader, season and upload batch ID. Preview rows and report validation errors before commit. Validate duplicates, missing required identifiers, crop/hybrid/season, acreage, village/district, territory and relevant parent-seed references. Do not discard invalid rows silently. Support re-upload and correction while preserving provenance.

### Stage 5 — Production Manager validates and routes grower records
The Production Manager reviews the imported grower/field list, resolves or assigns territory, checks acreage and hybrid totals against allocated targets, and routes approved records to Territory Managers. Display discrepancies and unallocated records. Do not silently force grower acreage to equal planned acreage; show the variance for authorised review.

### Stage 6 — Territory Managers allocate to Field Officers
Territory Managers allocate approved growers/fields to Field Officers. Each assignment must retain the farmer, seasonal field number, hybrid, planned acres, measured/GPS acres when available, parent-seed lot references, target, officer, territory and season. Show unassigned records and workload/acreage by officer. Assignment changes should be auditable.

### Stage 7 — Field execution and downstream monitoring
Field Officers use the existing mobile workflow to capture field boundaries and the six Paddy inspection reports, observations, corrective actions, harvest/dispatch details and evidence. The application then supports production progress, weather/satellite context when connected, risk exceptions, quality checks and parent-seed-to-final-lot traceability.

### Role landing pages and permissions
- Production Manager: approved plan, target allocation, parent-seed distribution oversight, grower upload review/routing, statewide progress and exceptions.
- Territory Manager: own allocated targets, parent-seed requirements/distribution, grower records routed to the territory, allocation to Field Officers and territory exceptions.
- Field Officer: assigned growers/fields, assigned targets, field visits, GPS and inspection workflow.
- Administrator: company setup, user authorisation, role and geographic scope. This role is a future secure-backend requirement, not a real security feature of the public prototype.

### Workflow gates and reconciliation
Use explicit statuses such as Draft, Submitted, Under review, Approved, Released, Partially allocated, Allocated, In progress and Closed where applicable. A downstream stage must show whether its predecessor is incomplete; avoid claiming a real workflow lock unless it is enforced server-side. Track quantities/acreage at each stage and surface variance, rather than overwriting upstream values. Keep all demo figures labelled as synthetic.

### Implementation sequence for this workflow
1. Welcome/sign-in screen with dummy demo accounts and role-specific landing routes; label it as prototype-only.
2. Production Manager planning form for acres, productivity and volume, with plan versioning in the browser demo and explicit calculated-vs-entered values.
3. Territory target allocation and reconciliation view.
4. Parent-seed requirement/distribution view.
5. Bulk grower import, validation, batch history and Production Manager routing.
6. Territory Manager-to-Field Officer assignment.
7. Connect this workflow to the existing six-stage inspection and traceability prototype.
8. Replace browser-only state with secure server-side persistence/authentication before any real company data is entered.
