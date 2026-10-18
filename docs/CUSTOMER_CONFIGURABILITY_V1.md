# Customer-Configurable Data Model — v1

Status: proposed design for review before the first Supabase migration. This document does not deploy or connect a database.

## Product principle

Each customer (company/tenant) can configure the data-input fields, forms, inspection stages, validation rules and role visibility needed for its own operations without requiring a code change for every new field. Customer configuration and operational data must be isolated by company.

Customer freedom applies to business data and form design. It does not extend to platform-controlled identity, tenant ownership, authorization, audit metadata, stable record identifiers or security policies.

## Architecture: core plus configuration

### 1. Stable relational core

Use relational columns for data that powers identity, relationships, access control, operational workflows and cross-customer analytics:

- companies and company_memberships
- seasons, crops and hybrids (standard catalog items may be company-specific or platform-provided)
- growers and seasonal fields
- production plans and target allocations
- parent-seed lots and distributions
- upload batches and row-level validation results
- field assignments and field boundaries
- form submissions / inspections
- documents and audit events

Core IDs use UUIDs. Every customer-owned operational record is scoped to a company. Declared acres, Net GPS acres and satellite-estimated area remain separate measurements with source and timestamp metadata.

### 2. Customer configuration tables

Proposed entities:

| Entity | Purpose |
|---|---|
| form_definitions | Company-owned form identity, name, business area, status and current published version |
| form_versions | Immutable version snapshots, draft/published/retired status, effective dates and author |
| form_sections | Sections and display order within a form version |
| field_definitions | Field key, label, type, help text, required flag, default, unit, visibility, editability, validation and display order |
| field_options | Controlled dropdown/multi-select options and ordering |
| form_role_rules | Which company roles can view, create, edit, submit, review or approve a form/version |
| workflow_definitions | Configurable stages, transitions, required roles and validation gates |
| customer_attribute_values | Typed values for customer-defined attributes attached to a supported record type and record ID, or a versioned JSONB payload for a form submission |
| configuration_audit_events | Audit of configuration edits, publication, retirement and migration actions |

Exact table names and implementation details will be finalized in the reviewed SQL migration. Avoid creating a separate database column for every customer-specific field.

### 3. Typed field types

Initial supported types should include:

- short_text, long_text
- integer, decimal, boolean
- date, time, datetime
- single_select, multi_select
- photo, file
- GPS point and field polygon references
- lookup to an approved core entity
- calculated/read-only value

Each field definition should support, where relevant: stable machine key, display label, description/help text, type, required/optional, default, unit, min/max, precision, allowed options, conditional visibility, read-only/calculated status, applicable roles, and order.

The server must validate submitted values against the published field definition. Browser/mobile validation is a usability aid, not a security boundary.

## Form lifecycle

1. Draft: customer administrator creates or edits the form.
2. Validate: check unique field keys, valid types/options, required rules and workflow compatibility.
3. Preview: preview the form for web and mobile roles.
4. Publish: create an immutable version and record who published it and when.
5. Use: new submissions pin to the published form version.
6. Revise: edits create a new draft/version; they do not silently alter historical submissions.
7. Retire: stop new submissions while retaining historical records and reports.

For mobile/offline use, every submission records its form version. If the form has changed since an offline draft was started, the app should retain the draft and flag it for compatibility review rather than silently dropping values.

## Storage recommendation

Use a hybrid model:

- Keep important cross-workflow fields relational: company ID, grower ID, field ID, season, crop, hybrid, plan target, approved volume, acreage measures, assignment, workflow status and timestamps.
- Store customer-defined form values as a versioned JSONB payload where the values belong to one form submission.
- For custom attributes that need to be filtered, aggregated or reported across many records, provide a typed attribute-value model or a curated reporting projection. Do not make all customer data an untyped JSON blob.
- Preserve units, option identifiers, field-definition/version references and provenance for values where needed.
- Store photos, documents and original Excel/KML uploads in private object storage; store metadata and access-controlled storage keys in PostgreSQL.

## Security and tenant isolation

- Enable RLS on all company-owned configuration and data tables.
- Derive company access from authenticated membership, not from a company ID supplied by the client alone.
- Verify company membership and role for every configuration and operational write.
- Only authorized customer administrators may edit or publish their company's configuration.
- A published form definition is readable only by authorized members of that company.
- Prevent a user from referencing another company's form, field definition, option, submission, document or record ID.
- Do not expose service-role keys in the web or Android app.
- Use private storage buckets and company-scoped policies.
- Record configuration changes and sensitive workflow transitions in append-oriented audit history.
- Test with synthetic users from at least two companies and verify cross-company reads/writes fail.

## Customer import mapping

Excel/CSV import should support a customer-defined mapping from source headers to standard core attributes or configured fields. The import preview must show unmapped columns, type errors, missing required fields, duplicates and row-level errors. Preserve original file, source row number, uploader, timestamp, batch ID and source values. Never silently discard invalid columns or rows.

## Analytics and interoperability

For meaningful cross-customer analytics, maintain a canonical core vocabulary and explicit mappings from customer-specific field keys, units and categories. Do not assume two customer fields have the same meaning just because their labels match. Store mapping version and transformation rules. Tenant data remains isolated unless a separate, explicitly authorized and privacy-safe aggregation process is implemented.

## Initial scope versus later enhancements

Initial database migration should include the core relational model, company isolation, configuration/form version tables, typed field definitions/options, form submissions with versioned payloads, audit metadata and basic RLS policies.

Later releases can add a visual drag-and-drop form builder, advanced conditional logic, configurable workflow designer, customer-specific analytics projections, import mapping UI, form migration tools and richer offline conflict resolution.

## Acceptance criteria before real customer data

1. Two synthetic companies can configure different forms without affecting each other.
2. One customer can add a field and publish a new form version without a database migration or application code change.
3. Historical submissions retain the form version and values used at submission time.
4. Server-side validation rejects unknown field keys, invalid types, invalid options and missing required values.
5. Customer A cannot read, edit or publish Customer B's forms, field definitions, submissions, documents or records.
6. A customer cannot change platform-controlled tenant IDs, audit identity, permissions or record IDs.
7. A sample Excel/CSV can be mapped, previewed, validated and rejected or accepted with clear row-level reasons.
8. Web and Android clients consume the same published form definitions and backend validation rules.

## Implementation boundary

This is a design specification. It has not been deployed to Supabase, and the existing GitHub Pages demo is not connected to a live database. The SQL migration must be reviewed and tested before it is run.
