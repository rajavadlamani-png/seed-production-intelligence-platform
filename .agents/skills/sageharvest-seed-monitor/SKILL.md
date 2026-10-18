---
name: sageharvest-seed-monitor
description: Build and maintain the SageHarvest Seed Production Monitor, including its field officer experience, management dashboard, and production platform foundations.
---

# SageHarvest Seed Production Monitor

Use this skill for feature work, design changes, and technical planning in this product. Keep the product name **SageHarvest — Seed Production Monitor** and preserve its Sage Harvest visual identity.

## Product shape

- **Field officer mobile experience:** field and grower registration, GPS boundary capture, six-stage crop inspections, photos and activity records, observations, harvest details, and seed-lot creation.
- **Management web experience:** production overview, field registry and GIS, satellite and weather monitoring, crop risk follow-ups, yield and production planning, seed traceability, and reports.
- These are connected experiences for one seed production workflow. Keep navigation and records consistent across them as implementation grows.

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
