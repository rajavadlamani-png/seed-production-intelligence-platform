# SageHarvest — Seed Production Monitor

A mobile-first front-end prototype for field officers and seed production managers.

## Open the prototype

Open `index.html` in a browser, or use the [live demo](https://rajavadlamani-png.github.io/seed-production-intelligence-platform/). The management workspace and field officer app view are both interactive.

## Current scope

- Responsive production overview with sample fields, inspection progress, follow-ups and seed production snapshot.
- Sample role views for production managers, production officers, field officers, and aggregators.
- Editable Paddy baseline inspections across six screenshot-based reports: First Inspection, Vegetative, Pre Flowering, Flowering, Pre Harvesting, and Harvesting. Shared farmer, assignment, season, field number, area and SAP lot context is shown once per report.
- First Inspection includes conditional isolation follow-ups; “No” isolation or missing applicable answers create human-review flags. Pest/disease remarks and poor-purity reasons appear when relevant. These forms use Paddy screenshot fields; crop-specific rules remain unconfigured.
- Field officer GPS boundary capture and area measurement in acres, plus a clearly labeled sample walk for previewing the flow.
- Guided field app preview with a welcome screen, mobile-number entry, a clearly labeled demo verification code (`123456`), compact Today / Fields / Reports / More tabs, and one selected farmer/field at a time.
- Nearby-field suggestion can use the officer's location only when assigned field boundaries have been captured in the current browser session; otherwise officers choose from their assigned field list.
- The six inspection stages appear together as a stage navigator. Officers can preview later-stage fields and answer choices in read-only mode, but cannot enter or save those reports until the prior stage is completed. Saving a draft does not unlock the following stage. Completion state is only in-memory demo state and is not server-enforced.
- Branded field app header and footer with the approved Sage Harvest wordmark and fixed mobile navigation.
- Separate parent seed lot fields for male M-1/M-2/M-3 and female parents, with browser QR scanning when supported; master-list auto-fill remains planned.
- Farmer master-list and assignment workflow. Excel import is intentionally not enabled in the public prototype.
- Shared Sage Harvest corporate logo, favicon, color palette, and typography. The source artwork is in `assets/`.

All figures, locations and observations are illustrative. The mobile-number and demo-code screens are not authentication and do not send an OTP. The prototype does not include server-side persistence, production data, a backend, database, Excel import, SAP integration, satellite or weather feeds, or AI models. GPS capture runs in the browser only while the page is open; captured points and area are not sent to a server or retained after refresh. Nearby matching requires assigned field boundaries in the current browser session and does not run against production maps. Stage completion is a demo workflow gate, not a server-enforced permission. Do not enter or upload real farmer, mobile, or bank data on the public demo.

## Project development skill

The project-specific Codex skill is in `.agents/skills/sageharvest-seed-monitor/`. Use `$sageharvest-seed-monitor` for future work on this application to keep requirements, branding, and implementation boundaries consistent.

## Next stage

Confirm crop-specific isolation rules with the production team before adding automated compliance decisions. The six Paddy inspection report forms are the current baseline. Other crops should use separately confirmed, configurable field definitions. GitHub Pages can host this front-end prototype; production records and integrations require a separate secure backend.
