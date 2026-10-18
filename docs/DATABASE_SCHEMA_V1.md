# Seed Production Intelligence Platform — Database Schema v1

Status: design baseline for the free-tier prototype. This is not a deployed database and does not mean Supabase is connected.

## Design decisions

- Use PostgreSQL as the authoritative structured store; Supabase Free is the initial prototype target.
- Keep GitHub Pages as a synthetic-data demonstration only.
- The manager web app and future standalone Android app must use the same authenticated API/backend.
- Store documents and original Excel/KML uploads in object storage; store their metadata, ownership and validation outcomes in PostgreSQL.
- Every operational record is tenant-scoped. Never use a browser role selector as an access-control boundary.
- Use stable UUIDs, created/updated timestamps, explicit status fields and audit history.
- Preserve approved targets separately from calculated values and downstream actuals.
- Store area in acres as the business display unit, but retain geometry and source metadata for measured boundaries.
- Keep parent-seed planned, issued, dispatched and received quantities separate.
- Do not store passwords, service-role keys or Google AI keys in application tables or public JavaScript.

## Core entities

| Entity | Purpose | Key relationships |
|---|---|---|
| companies | Customer/tenant | Parent of all operational records |
| company_memberships | Maps authenticated users to a company, role and optional geography | Supabase Auth user + company |
| seasons | Crop year/season definitions | Company |
| growers | Grower master records | Company |
| fields | Seasonal field identity, declared area, crop, hybrid and geography | Grower + season |
| production_plans | Versioned leadership-approved plan and Sign Off Document metadata | Company + season |
| target_allocations | Target allocated to Territory Managers | Production plan + membership |
| parent_seed_lots | Parent seed identity, parent type and lot details | Company + season |
| parent_seed_distributions | Planned/issued/dispatched/received quantities by destination | Parent lot + allocation/territory |
| grower_upload_batches | Original upload metadata and processing status | Company + season + uploader |
| grower_upload_rows | Row-level validation status and errors | Upload batch |
| field_assignments | Assignment of approved seasonal fields to Field Officers | Field + membership |
| field_boundaries | Polygon geometry, measured acres, method (walk GPS/KML), accuracy and capture provenance | Field + capture user |
| inspections | Six-stage inspection records, status, submitted payload and timestamps | Field + assigned officer |
| documents | Metadata for Sign Off Documents and evidence files in object storage | Company + optional plan/field/inspection |
| audit_events | Append-oriented record of important changes | Company + actor + record reference |

## Important field semantics

### Production plan
- Store leadership-provided planned acres, productivity, productivity unit, planned volume and volume unit as entered.
- Calculated volume is a separate comparison value and must never overwrite the leadership-approved planned volume.
- Plan status should distinguish Draft, Submitted, Approved, Released, and Superseded.
- A Sign Off Document is an object-storage file plus metadata (original filename, storage key, MIME type, size, uploader, timestamp, checksum, version and linked plan).

### Parent seed
- Parent type should be data-driven but initially support male M-1, M-2, M-3 and female parent where applicable.
- Planned, issued, dispatched and received quantities are separate measures, each with a unit.
- Do not calculate required seed quantities until an approved crop/hybrid/parent-specific seed-rate assumption exists.

### Grower imports
- Retain original file and batch metadata.
- Validate and preview rows before committing valid records.
- Store row errors and do not silently discard invalid rows.
- Preserve the source row number and source values for correction/audit.
- Re-uploading a file must not create duplicates; use explicit batch identity and seasonal field uniqueness rules.

### Net GPS acres
- GPS walk measurement is the preferred capture method; KML upload is the alternative.
- Store polygon geometry, measured acres, capture method, capture timestamp, capture user and any GPS accuracy metadata.
- Declared acres, Net GPS acres and variance must remain distinct.
- Validate polygon geometry before accepting the measurement.

### Inspections
- Preserve the six existing Paddy report names and their business terminology.
- Use stage/status fields and a versioned JSON payload initially, while keeping core searchable fields relational where justified.
- A draft is not submitted or approved. Later-stage workflow gates must be enforced by backend rules, not just UI state.

## Security requirements before connecting real data

1. Enable Row Level Security (RLS) on every tenant-owned table.
2. Enforce company membership and role/geographic scope server-side.
3. Never expose Supabase service-role keys in browser or mobile clients.
4. Use authenticated client access with least-privilege RLS policies; sensitive workflow transitions should use validated server-side functions.
5. Configure private object storage buckets and policies for company-scoped documents.
6. Add audit events for plan approvals/revisions, target releases, parent-seed movements, grower imports/approvals, field assignments, boundary changes and inspection status transitions.
7. Test cross-company read/write denial before any real company data is entered.

## Delivery sequence

1. Confirm the dedicated Supabase Free project exists; do not reuse ANVORA Beta Access.
2. Implement and review the PostgreSQL migration and RLS policies.
3. Apply schema to the dedicated project and test tenant isolation with synthetic users.
4. Connect the planning and allocation workflow to the backend.
5. Add parent-seed distribution, grower upload/review/routing, then field-officer assignments.
6. Connect mobile sync, KML upload and Copernicus-derived observations after the operational data model is stable.

## Explicit prototype boundary

This document defines the target schema. The current public GitHub Pages demo still uses browser-session state and synthetic data. No database has been deployed or connected by this commit.
