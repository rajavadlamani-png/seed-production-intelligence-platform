---
name: sageharvest-seed-monitor
description: Build and maintain the SageHarvest Seed Production Monitor, including its field officer experience, management dashboard, and production platform foundations.
---

# SageHarvest Seed Production Monitor

Use this skill for feature work, design changes, and technical planning in this product. Keep the product name **SageHarvest — Seed Production Monitor** and preserve its Sage Harvest visual identity.

## Product shape

- **Bulk onboarding is the starting point:** operations staff load the farmer and plot master list from the approved Excel template, validate rows, and assign records before field work begins. Field officers update assigned records and inspections; they do not start with an unscoped farmer registry.
- **Field officer mobile experience:** review assigned farmer and plot records, capture GPS boundaries, complete six-stage crop inspections, add photos and activity records, record observations, and enter harvest details for seed-lot creation. New master records arrive through controlled bulk onboarding and assignment.
- **Management web experience:** production overview, field registry and GIS, satellite and weather monitoring, crop risk follow-ups, yield and production planning, seed traceability, and reports.
- These are connected experiences for one seed production workflow. Keep navigation and records consistent across them as implementation grows.

## Assignment and access model

- Model access through assigned scope, not merely hidden navigation. Enforce permissions in the backend for every record and operation.
- A farmer/plot can be associated with an organizer (aggregator), a field officer/assistant, a production officer, and a state-level production manager.
- A field officer/assistant can read and update only assigned farmer and plot records, including inspection data. A production officer can review their assigned team of roughly 10–15 field assistants and the records within that scope. A production manager can review the assigned state scope. Keep the aggregator's scope explicit in assignments.
- Treat farmer mobile numbers and bank account details as sensitive personal data. Exclude bank details from field officer and production dashboards. Restrict any bank-detail access to a separately authorized finance/operations role; mask values by default, log access, and protect them with server-side authorization and encryption.
- Do not put real farmer records, contact details, or bank data in this public repository, sample fixtures, GitHub Pages, screenshots, logs, or browser local storage.
- Excel imports must validate required columns, duplicates, assignment references, and row errors before committing. Keep the original import traceable and log who imported and assigned each batch. Never treat a client-side file picker or UI filter as a security boundary.

## Seasonal field and SAP lot identifiers

- The approved master list carries a field number unique within the season. Keep that value distinct from the SAP lot number.
- SAP is the source of truth for the lot number, which is unique to the farmer-season. Do not invent or generate it in the app. A future secure backend integration should fetch SAP results, match them to the correct farmer-season record using stable identifiers, and handle retries without creating duplicate records.
- Show the seasonal field number as soon as the master record is assigned. Show the SAP lot as `Awaiting SAP` until a confirmed value is returned, then display the returned value read-only to the assigned field officer. Include a clear sync status when relevant.
- Keep SAP credentials and integration secrets server-side. Do not claim the SAP integration works until it is connected and verified.

## Implementation guidance

- Start from the current repository and its existing interface. Preserve agreed workflows and branding while making targeted improvements.
- Keep field use mobile-first and make management views work well on desktop and smaller screens.
- Build in verifiable stages. Prefer completing a coherent user flow, such as registering a field or submitting an inspection, over adding disconnected controls.
- Keep UI copy clear for field officers and production managers. Use crop, season, units, and terminology appropriate to the confirmed operating context; flag assumptions when the source brief does not confirm them.
- Keep examples and mock records visibly labeled as sample data. Never present estimates, locations, weather, satellite observations, AI assessments, or field activity as live unless connected to a verified source.
- Treat GitHub Pages as static front-end hosting only. Do not claim authentication, authorization, database persistence, file storage, GPS capture, offline sync, external APIs, or AI models are operational until they are implemented and verified.
- When planning backend work, define data ownership, roles, validation, audit history, and integration boundaries before connecting production records or services.
- Keep credentials and private field or grower data out of source control and public demo content.

## Project context and boundaries

- The agreed inspection lifecycle has six stages: land preparation; sowing and emergence; vegetative growth; flowering and reproduction; harvest readiness; harvest and seed-lot creation.
- The current prototype is a static HTML/CSS/JavaScript interface. Check its README and source before selecting a framework or changing structure.
- The original `AI Crop Monitoring Platform.txt` brief was not present when the initial prototype was built. Do not invent its contents; use confirmed requirements and ask for the brief when a decision depends on it.
- Treat any synced `sources/` folder as read-only reference material. Do not edit, move, rename, or delete its files.

## Before finishing a change

- Check the affected screens at relevant mobile and desktop sizes when the environment permits.
- Verify the behavior that changed, and describe what remains sample-only or unimplemented.
- Keep the README aligned with current capabilities. Do not describe planned features as working features.
