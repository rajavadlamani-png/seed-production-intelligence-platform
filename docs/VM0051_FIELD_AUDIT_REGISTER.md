# VM0051 Field-Level Audit Evidence Register

## Purpose
Adds an operational evidence register to the Seed Production Monitor Beta. It records field-linked single-drainage event submissions, water-level observations, field-officer and farmer-reported confirmation, supporting files, satellite evidence-run linkage, reviewer decisions, and append-only audit history.

## Data model
- `vm0051_drainage_events`: one submitted drainage-event record linked to a company and a `beta_field_records` row.
- `vm0051_drainage_event_evidence`: uploaded evidence metadata, private Storage path, SHA-256 file digest, source classification, capture time and optional submitter GPS coordinates, accuracy and capture timestamp.
- `vm0051_drainage_event_audit`: trigger-generated event/evidence submission and review history.
- Storage bucket `vm0051-audit-evidence`: private; object keys are `<company UUID>/<event UUID>/<random UUID>-<filename>`.

## Workflow
1. An authorized manager/field officer selects a saved field record and submits the event chronology and any known water-level readings.
2. The submitter may attach field photographs, water-level records, irrigation/drainage logs, farmer confirmation records, satellite exports, or other supporting documents.
3. Each file is stored privately; its SHA-256 digest and metadata are written to the evidence table.
4. A company management reviewer records a decision: **Reviewed** or **Returned**. A Reviewed decision requires the internal review checklist to be completed and the approved methodology version and monitoring plan reference to be recorded. A Returned decision requires reviewer notes.
5. Database triggers append a read-only audit record for each event submission, review decision, and evidence attachment.

## Security
- Company-scoped row-level security is enabled on all three tables.
- Active company members can read event, evidence metadata and audit history.
- Event submission is restricted to authorized company management and field-officer roles. The authenticated account that submits the record is recorded separately from the field-officer name reported on the form.
- Only company management roles can record a review decision.
- Client roles cannot update/delete event evidence metadata or mutate the audit trail.
- Storage is private. Company membership and event identity are checked on reads; upload requires a submitted event and the event creator or an authorized manager.
- No service-role or secret key is used in the browser.

## Audit interpretation safeguards
- The field-officer name and confirmation method/time are recorded as reported information; the authenticated submitting account is separately captured in the event and audit history. Neither field-officer nor farmer confirmation is represented as a cryptographic signature. The farmer acknowledgement is a recorded field report, not a cryptographic farmer signature.
- A SHA-256 digest supports file-integrity comparison; it does not prove when, where, or by whom the source file was originally created.
- Satellite indices and radar backscatter remain supporting remote-sensing context, not direct field water-level measurements.
- **Reviewed** means an internal evidence review checklist was completed. It does not mean Verra has validated the project, that VM0051 requirements are met, or that carbon credits are eligible/issuable.
- Methodology version, monitoring plan, applicability, quantification and verification must be checked against the project-specific approved documents and the current Verra methodology.

## Validation
The Excel audit workbook contains event records, evidence metadata and hashes, append-only audit history, field-boundary coordinates, and linked satellite acquisition observations where an existing run is attached.\n\nRun `supabase/tests/vm0051_drainage_audit_smoke.sql` against a disposable/local Supabase stack. Browser acceptance requires a real authorized account, field record, GPS permission and evidence file; it is not simulated by the schema smoke test.

## Plain-language single-drainage event finder
The Manager VM0051 Audit Register includes a field finder. A user selects a GPS-mapped field (field number and farmer) and a monitoring date range. The result counts submitted single-drainage event records linked to that field and whose reported start date falls in the selected range. One record is shown as one event recorded; zero records is shown as no event recorded (not proof that drainage did not happen); multiple records are flagged for review.

Where a saved satellite evidence run overlaps the selected period, the finder shows dated observations for that field. For one reported event, it can show the last satellite acquisition on/before the reported start and the first acquisition on/after the reported completion (or start if completion is absent). These are observation bounds, not the exact drainage time. Missing satellite coverage is shown separately and is never treated as a no-event result. A green record status means a field event was entered; it does not mean Verra validation or carbon-credit eligibility.
