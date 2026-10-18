# SageHarvest — Seed Production Monitor

A mobile-first front-end prototype for field officers and seed production managers.

## Open the prototype

Open `index.html` in a browser, or use the [live demo](https://rajavadlamani-png.github.io/seed-production-intelligence-platform/). The management workspace and field officer app view are both interactive.

## Current scope

- Responsive production overview with sample fields, inspection progress, follow-ups and seed production snapshot.
- Sample role views for production managers, production officers, field officers, and aggregators.
- Editable six-stage inspections with observations, seasonal field numbers, and simulated SAP lot responses.
- Field officer GPS boundary capture and area measurement in acres, plus a clearly labeled sample walk for previewing the flow.
- Farmer master-list and assignment workflow. Excel import is intentionally not enabled in the public prototype.
- Shared Sage Harvest corporate logo, favicon, color palette, and typography. The source artwork is in `assets/`.

All figures, locations and observations are illustrative. The prototype does not include authentication, server-side persistence, production data, a backend, database, Excel import, SAP integration, satellite or weather feeds, or AI models. GPS capture runs in the browser only while the page is open; captured points and area are not sent to a server or retained after refresh. Do not enter or upload real farmer, mobile, or bank data on the public demo.

## Project development skill

The project-specific Codex skill is in `.agents/skills/sageharvest-seed-monitor/`. Use `$sageharvest-seed-monitor` for future work on this application to keep requirements, branding, and implementation boundaries consistent.

## Next stage

Review the source platform brief, confirm field and crop terminology, then implement field registration and the first inspection capture flow. GitHub Pages can host this front-end prototype; production records and integrations require a separate secure backend.
