# Configurable templates and designation demo — implementation notes

Status: prototype implementation on `feature/configurable-paddy-templates`. This document does not describe a production-ready configuration service.

## Pilot target displayed in the workspace
- Crop: Paddy
- State: Telangana
- District: Karimnagar
- Season: Rabi 2026–27
- Expected start: November 2026

The current sample roster remains synthetic and Maharashtra-based. No Karimnagar grower or village records were invented.

## Implemented in the static demo
- Six Paddy stage labels are read from `template-config.js` using stable stage keys.
- Manager navigation includes a Templates & designations workspace.
- Session-only template editor supports stage label changes; field label and required-flag editing; select-option editing; field ordering; hiding/showing fields; retiring fields from future entry; adding short text, long text, decimal, date, or single-select fields; and mobile/desktop preview layout.
- The editor's field changes feed the current in-browser report field arrays. Stable field keys are separate from display labels.
- Retired fields are filtered out of future report entry and stage preview rendering. Existing in-memory saved report objects are not deleted by the retire action.
- Designation titles and aliases can be edited independently. TFA and TPL are initialized as aliases for Temporary Field Assistant and Territory Production Lead respectively. Field Officer and Production Officer remain distinct. No role or permission mapping is inferred.
- The lifecycle Draft → Preview/Test → Submitted for Approval → Approved/Scheduled → Active → Retired is displayed as governance guidance.

## Explicit limitations
- Edits are in-memory/browser-session only; refresh resets them.
- This is not a secure or persistent Template Designer. There is no server-side validation, user authorization, approval action, publication, immutable version history, audit event storage, or historical form-version reference.
- Required flags are reflected in form controls but should not be treated as server-enforced validation.
- The static demo does not connect to Supabase or any production database.
- The live GitHub Pages site is unchanged by this work; this branch is not deployed or merged.
- Dynamic State → District → Village/Cluster → Grower → Field lookup data is not implemented; no real farmer personal data is used.
- The existing synthetic Maharashtra roster and Kharif labels remain as the original demo dataset; the pilot target is shown separately in the configuration workspace.

## Production gates still required
1. Review a database migration for company-scoped form definitions, immutable versions, field definitions/options, submissions, and audit events.
2. Implement authentication, authorization and row-level security; test cross-company isolation with synthetic accounts.
3. Make backend validation authoritative and preserve form version IDs on every submission.
4. Define approved designation-to-platform-role mappings, workflow responsibilities and permissions with the business owner; do not infer equivalence from titles.
5. Load and validate authorized Karimnagar village/grower/field master data before pilot operation.
6. Confirm the exact six Paddy report definitions and resolve any source-template ambiguity before treating them as approved operational forms.
