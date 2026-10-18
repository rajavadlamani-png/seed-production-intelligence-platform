# SageHarvest — Seed Production Monitor

A mobile-first front-end prototype for field officers and seed production managers.

## Open the prototype

Open `index.html` in a browser. The Manager / Field Officer switch shows the two responsive views.

## Current scope

- Responsive production overview with sample fields, inspection progress, follow-ups and seed production snapshot.
- Mobile field officer home with a sample day schedule, follow-up alert and quick action affordances.
- Six-stage inspection cycle represented in the manager view.
- Field registration prototype with grower, plot, crop, area and sowing details; submitted demo records are stored in the current browser only.

All figures, locations and observations are illustrative. The prototype does not include authentication, server-side persistence, GPS boundary capture, production data, a backend, database, satellite or weather feeds, or AI models. Browser-local field entries are demo-only and are not shared with managers or other devices. Buttons that lead to unbuilt features identify them as planned.

## Project development skill

The project-specific Codex skill is in `.agents/skills/sageharvest-seed-monitor/`. Use `$sageharvest-seed-monitor` for future work on this application to keep requirements, branding, and implementation boundaries consistent.

## Next stage

Review the source platform brief, confirm field and crop terminology, then implement field registration and the first inspection capture flow. GitHub Pages can host this front-end prototype; production records and integrations require a separate secure backend.
