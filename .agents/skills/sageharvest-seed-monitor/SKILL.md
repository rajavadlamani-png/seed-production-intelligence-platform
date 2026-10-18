---
name: sageharvest-seed-monitor
description: Build and maintain the SageHarvest Seed Production Monitor, including its field officer experience, management dashboard, and production platform foundations.
---

# SageHarvest Seed Production Monitor

Use this skill for feature work, design changes, and technical planning in this product. Keep the product name **SageHarvest — Seed Production Monitor** and preserve its Sage Harvest visual identity.

## Brand source of truth

- Match the approved Sage Harvest corporate website at `https://rajavadlamani-png.github.io/Sage-Harvest/`. Use the supplied illustrated wordmark from `assets/sage-harvest-logo.svg` and matching favicon from `assets/favicon.svg`; do not replace the wordmark with a typed name or generic initial.
- Keep the shared palette: deep green `#123b2b`, sage `#8fa68e`, warm gold `#c9a75a`, off-white `#fbfaf6`, ink `#17231d`, muted text `#607066`, and border `#dce1da`.
- Use the corporate website’s Inter/system sans-serif typography. The app may retain its product descriptor, **Seed Production Monitor**, beside the shared logo.

## Product shape

- **Bulk onboarding is the starting point:** operations staff load the farmer and plot master list from the approved Excel template, validate rows, and assign records before field work begins. Field officers update assigned records and inspections; they do not start with an unscoped farmer registry.
- **Field officer mobile experience:** review assigned farmer and plot records, capture GPS boundaries, complete six-stage crop inspections, add photos and activity records, record observations, and enter harvest details for seed-lot creation. New master records arrive through controlled bulk onboarding and assignment.
- Keep the field app guided and mobile-first: welcome and phone sign-in entry, a single assigned farmer/seasonal field selection, optional nearest-field suggestion where assigned GPS boundaries exist, one active lot/report at a time, and compact navigation tabs. Any demo code or simulated location result must be labeled as prototype behavior; production phone verification and assignment/location lookup require secure backend services.
- **Management web experience:** production overview, field registry and GIS, satellite and weather monitoring, crop risk follow-ups, yield and production planning, seed traceability, and reports.
- **Production Officer overview:** show all field assistants and farmer records in that officer's assigned scope, recorded acreage, on-track and lagging workload, and a visual six-stage crop-inspection progress summary. Label demo figures and distinguish recorded area from missing area.
- These are connected experiences for one seed production workflow. Keep navigation and records consistent across them as implementation grows.

## Assignment and access model

- Model access through assigned scope, not merely hidden navigation. Enforce permissions in the backend for every record and operation.
- A farmer/plot can be associated with an organizer (aggregator), a field officer/assistant, a production officer, and a state-level production manager.
- A field officer/assistant can read and update only assigned farmer and plot records, including inspection data. A production officer can review their assigned team of roughly 10–15 field assistants and the records within that scope. A production manager can review the assigned state scope. Keep the aggregator's scope explicit in assignments.
- Treat farmer mobile numbers and bank account details as sensitive personal data. Exclude bank details from field officer and production dashboards. Restrict any bank-detail access to a separately authorized finance/operations role; mask values by default, log access, and protect them with server-side authorization and encryption.
- The First Inspection Report includes dropdown observations for statutory field isolation. If the field officer selects “No,” ask about time isolation and (when yes) whether it exceeds 30 days, nearby crop, distance in metres, and male border rows. Missing applicable answers and a “No” isolation answer create quality review flags. Capture and route observations only; do not calculate statutory or crop-specific compliance without approved crop/hybrid rules.
- Show all six inspection stages together in the field app. Let officers preview later-stage fields and observation choices in a read-only view, but keep entry and saving locked until the immediately prior report is explicitly completed. Saving a draft must not unlock the next stage. Completion and progression must be enforced by the backend in production, not just by the prototype UI.
- Include a stage-specific SOP snapshot alongside every editable report and locked-stage preview. When only legacy report fields are available, summarize the observations to capture and clearly label the snapshot as a draft reference; do not invent agronomic procedures, acceptance limits, or rejection rules. Replace it with approved company SOP content when supplied.
- Do not put real farmer records, contact details, or bank data in this public repository, sample fixtures, GitHub Pages, screenshots, logs, or browser local storage.
- Excel imports must validate required columns, duplicates, assignment references, and row errors before committing. Keep the original import traceable and log who imported and assigned each batch. Never treat a client-side file picker or UI filter as a security boundary.

## Seasonal field and SAP lot identifiers

- The approved master list carries a field number unique within the season. Keep that value distinct from the SAP lot number.
- SAP is the source of truth for the lot number, which is unique to the farmer-season. Do not invent or generate it in the app. A future secure backend integration should fetch SAP results, match them to the correct farmer-season record using stable identifiers, and handle retries without creating duplicate records.
- Show the seasonal field number as soon as the master record is assigned. Show the SAP lot as `Awaiting SAP` until a confirmed value is returned, then display the returned value read-only to the assigned field officer. Include a clear sync status when relevant.
- Keep SAP credentials and integration secrets server-side. Do not claim the SAP integration works until it is connected and verified.


- For the First Inspection Report, keep parent seed identities and lot numbers distinct for male M-1, M-2, M-3, and female. A future approved master import should prefill these by farmer-season/hybrid. QR scanning may capture the packet’s lot code into its matching parent field; verify it before saving and do not assume a payload format or combine male/female lots. The public prototype can scan with browser QR support or accept manual lot entry, but it does not look up parent records from Excel or a seed registry yet.
- Every inspection stage can capture optional fertilizer/agrochemical use (category, product, quantity, unit, and purpose) and a field/leaf photo preview. Treat these as in-memory prototype data only: no upload, diagnosis, or production persistence.
- The field officer has a separate satellite observations page that is read only. Keep it explicitly unavailable until an approved satellite source is connected; never fabricate imagery, vegetation indices, moisture values, or alerts.
- AI photo assessment is deferred at the user's request. Do not set up provider credentials or claim image diagnosis until the user asks to resume and a secure backend integration is designed.
- When all six stage reports are complete, show the field officer a final summary of net G.S. acres, productivity per acre, dispatch challan (DC), STN, dispatch date, seed weight, moisture and quality status. Use recorded data only; calculate productivity only when the area, weight, and weight unit are present. Clearly label the public prototype summary as unverified and session-only.
- Include **Ask Ram** as the field officer's conversational and multilingual voice-assistant concept, with a preferred-language selector, suggested prompts and contextual help entry points for assigned work. Until Google AI is connected, keep microphone access, speech recognition, spoken replies and AI answers clearly marked unavailable. A local chat preview may echo a typed question and show a non-AI service-unavailable notice; never simulate live AI advice or claim broad language support works. Keep direct navigation tabs for Today, Fields, Inspections, Ask Ram, and More visible throughout the signed-in field workflow; link Satellite and the completed-season summary from More, and provide a clear back-to-Inspections action in Ask Ram.
## Implementation guidance

- Start from the current repository and its existing interface. Preserve agreed workflows and branding while making targeted improvements.
- Keep field use mobile-first and make management views work well on desktop and smaller screens.
- Keep Ask Ram easy to find across the field app with its branded green callout and friendly illustrated assistant avatar; label voice and AI as planned until their services are connected.
- Build in verifiable stages. Prefer completing a coherent user flow, such as registering a field or submitting an inspection, over adding disconnected controls.
- Keep UI copy clear for field officers and production managers. Use crop, season, units, and terminology appropriate to the confirmed operating context; flag assumptions when the source brief does not confirm them.
- Keep examples and mock records visibly labeled as sample data. Never present estimates, locations, weather, satellite observations, AI assessments, or field activity as live unless connected to a verified source.
- Treat GitHub Pages as static front-end hosting only. Do not claim authentication, authorization, database persistence, file storage, GPS capture, offline sync, external APIs, or AI models are operational until they are implemented and verified.
- When planning backend work, define data ownership, roles, validation, audit history, and integration boundaries before connecting production records or services.
- Keep credentials and private field or grower data out of source control and public demo content.

## Project context and boundaries

- The Paddy reference baseline has six inspection reports transcribed from the supplied legacy screenshots: First Inspection Report; Vegetative Report; Pre Flowering Report; Flowering Report; Pre Harvesting Report; Harvesting Report. Preserve each report’s business fields while presenting one mobile-friendly report at a time. Share farmer, seasonal field, team assignment, crop/hybrid, area, season, and read-only SAP lot context across reports. Conditional examples include time-isolation questions after a “No” statutory-isolation answer, pest/disease remarks after “Yes”, and a purity reason after “Poor”. Flag isolation issues for human quality review; do not assert statutory/crop-specific compliance. Confirm fields and rules before adapting the Paddy baseline to other crops.
- The current prototype is a static HTML/CSS/JavaScript interface. Check its README and source before selecting a framework or changing structure.
- The original `AI Crop Monitoring Platform.txt` brief was not present when the initial prototype was built. Do not invent its contents; use confirmed requirements and ask for the brief when a decision depends on it.
- Treat any synced `sources/` folder as read-only reference material. Do not edit, move, rename, or delete its files.

## Before finishing a change

- Check the affected screens at relevant mobile and desktop sizes when the environment permits.
- Verify the behavior that changed, and describe what remains sample-only or unimplemented.
- Keep the README aligned with current capabilities. Do not describe planned features as working features.
