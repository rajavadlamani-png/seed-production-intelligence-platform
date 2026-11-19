// VM0051 Field-Level Audit Evidence Register. Loaded before beta/app.js.
let vm0051AuditEvents = [];
let vm0051AuditEvidence = [];
let vm0051AuditHistory = [];
let vm0051AuditLoadedCompany = '';
let vm0051AuditLoading = false;
const VM0051_AUDIT_BUCKET = 'vm0051-audit-evidence';
const VM0051_AUDIT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const VM0051_AUDIT_MIME_TYPES = new Set([
  'application/pdf','image/jpeg','image/png','text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

function vm0051AuditEsc(value) {
  return typeof escape === 'function' ? escape(String(value ?? '')) : String(value ?? '');
}
function vm0051AuditDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? vm0051AuditEsc(value) : vm0051AuditEsc(date.toLocaleString('en-IN'));
}
function vm0051AuditInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,16);
}
function vm0051AuditStatus(status) {
  const labels = {submitted:'Awaiting review',reviewed:'Reviewed · internal',returned:'Returned for correction'};
  return labels[status] || status || 'Unknown';
}
function vm0051AuditFields(list) {
  return (role === 'manager' ? records : list).filter(record => record?.id && record?.fieldNo);
}
function vm0051AuditPanel(list) {
  const fields = vm0051AuditFields(list);
  const options = fields.map(record => '<option value="'+vm0051AuditEsc(record.id)+'">'+vm0051AuditEsc(record.fieldNo)+' · '+vm0051AuditEsc(record.name||'Farmer')+' · '+vm0051AuditEsc(record.village||'')+'</option>').join('');
  const runs = (typeof satelliteEvidenceSavedRuns !== 'undefined' ? satelliteEvidenceSavedRuns : []).map(run =>
    '<option value="'+vm0051AuditEsc(run.id)+'">'+vm0051AuditEsc(run.monitoring_from)+' to '+vm0051AuditEsc(run.monitoring_to)+' · '+vm0051AuditEsc(run.id.slice(0,8))+'</option>'
  ).join('');
  const evidenceByEvent = new Map();
  vm0051AuditEvidence.forEach(item => {
    if (!evidenceByEvent.has(item.event_id)) evidenceByEvent.set(item.event_id, []);
    evidenceByEvent.get(item.event_id).push(item);
  });
  const eventRows = vm0051AuditEvents.map(event => {
    const files = evidenceByEvent.get(event.id) || [];
    const fileMarkup = files.length ? '<ul class="vm0051-file-list">'+files.map(file =>
      '<li><span>'+vm0051AuditEsc(file.file_name)+'</span><small>'+vm0051AuditEsc(file.evidence_type.replaceAll('_',' '))+' · SHA-256 '+vm0051AuditEsc(file.sha256_hex.slice(0,12))+'…</small><button type="button" class="text-button" data-vm0051-open-evidence="'+vm0051AuditEsc(file.id)+'">Open file</button></li>'
    ).join('')+'</ul>' : '<small class="muted">No attachments recorded</small>';
    const canReview = event.status === 'submitted' && (role === 'manager' || role === 'territory');
    const review = canReview ? '<details class="vm0051-review-details"><summary>Review evidence</summary><form data-vm0051-review-form="'+vm0051AuditEsc(event.id)+'"><label>Decision<select name="decision" required><option value="reviewed">Reviewed · internal checklist complete</option><option value="returned">Return for correction</option></select></label><div class="vm0051-review-checks">'+[
      ['water_level_measurements_reviewed','Water-level readings and measurement dates checked'],
      ['drainage_records_reviewed','Irrigation/drainage records checked'],
      ['farmer_or_officer_confirmation_reviewed','Farmer / field-officer confirmation reviewed or absence recorded'],
      ['attachments_reviewed','Uploaded files and provenance reviewed'],
      ['monitoring_plan_crosscheck_reviewed','Cross-checked against the project monitoring plan']
    ].map(([name,label])=>'<label><input type="checkbox" name="'+name+'"> '+label+'</label>').join('')+'</div><label>Reviewer notes<textarea name="reviewerNotes" rows="2" placeholder="Required when returning a record"></textarea></label><button class="primary" type="submit">Save review decision</button></form></details>' : (event.status !== 'submitted' ? '<small class="muted">'+vm0051AuditEsc(event.reviewer_notes||'Review decision recorded')+'</small>' : '');
    return '<tr><td><b>'+vm0051AuditEsc(event.field_no)+'</b><small>'+vm0051AuditEsc(event.farmer_name)+'</small><small>'+vm0051AuditEsc(event.village||'')+', '+vm0051AuditEsc(event.district||'')+'</small></td><td>'+vm0051AuditDate(event.drainage_started_at)+'<small>Completed: '+vm0051AuditDate(event.drainage_completed_at)+'</small></td><td>'+(event.water_level_before_cm==null?'—':vm0051AuditEsc(event.water_level_before_cm)+' cm')+'<small>After: '+(event.water_level_after_cm==null?'—':vm0051AuditEsc(event.water_level_after_cm)+' cm')+'</small></td><td>'+vm0051AuditEsc(event.field_officer_name)+'<small>Submitted by account: '+vm0051AuditEsc(event.created_by)+'</small><small>Field officer confirmation: '+(event.field_officer_confirmed?'Recorded':'Not recorded')+'</small><small>Farmer confirmation: '+(event.farmer_confirmed?'Recorded':'Not recorded')+'</small></td><td><span class="vm0051-status '+vm0051AuditEsc(event.status)+'">'+vm0051AuditEsc(vm0051AuditStatus(event.status))+'</span></td><td><details><summary>'+files.length+' file(s)</summary>'+fileMarkup+'</details></td><td>'+vm0051AuditDate(event.created_at)+review+'</td></tr>';
  }).join('');
  const historyRows = vm0051AuditHistory.slice(0,40).map(item =>
    '<tr><td>'+vm0051AuditDate(item.created_at)+'</td><td>'+vm0051AuditEsc(item.action.replaceAll('_',' '))+'</td><td>'+vm0051AuditEsc(item.event_id.slice(0,8))+'</td><td>'+vm0051AuditEsc(item.actor_id||'System')+'</td></tr>'
  ).join('');
  const submitDisabled = !fields.length || vm0051AuditLoading;
  return '<section class="panel vm0051-audit-panel"><div class="panel-head"><div><p class="eyebrow">CARBON MRV · VERRA VM0051</p><h2>Field-level drainage evidence register</h2><p class="muted">Capture the field event, water-level observations, supporting records and internal review history.</p></div><span class="status-chip planned">EVIDENCE REGISTER</span></div><div class="sat-evidence-note"><b>Evidence status, not carbon-credit approval</b><p>This register records source evidence and internal review. A submitted or internally reviewed record does not establish VM0051 compliance or carbon-credit eligibility. Satellite indices are contextual evidence, not direct field water-level measurements. The project monitoring plan and current methodology requirements must be checked separately.</p></div><div class="vm0051-audit-summary"><article><small>Field records in scope</small><b>'+fields.length+'</b></article><article><small>Submitted</small><b>'+vm0051AuditEvents.filter(x=>x.status==='submitted').length+'</b></article><article><small>Reviewed internally</small><b>'+vm0051AuditEvents.filter(x=>x.status==='reviewed').length+'</b></article><article><small>Evidence files</small><b>'+vm0051AuditEvidence.length+'</b></article></div><details class="vm0051-capture-details" open><summary>Record a single-drainage event</summary><form id="vm0051DrainageEventForm" class="vm0051-audit-form"><label>Company field record<select name="fieldRecordId" required><option value="">Select field</option>'+options+'</select></label><label>Drainage initiation date & time<input name="drainageStartedAt" type="datetime-local" required></label><label>Drainage completion date & time<input name="drainageCompletedAt" type="datetime-local"></label><div class="vm0051-form-grid"><label>Water level before drainage (cm)<input name="waterBefore" type="number" min="0" step="0.1" placeholder="Not recorded"></label><label>Measurement date & time<input name="waterBeforeAt" type="datetime-local"></label><label>Water level after drainage (cm)<input name="waterAfter" type="number" min="0" step="0.1" placeholder="Not recorded"></label><label>Measurement date & time<input name="waterAfterAt" type="datetime-local"></label></div><label>Measurement method<select name="measurementMethod"><option value="">Not recorded</option><option value="staff_gauge">Staff gauge</option><option value="measuring_ruler">Measuring ruler</option><option value="other">Other / described in notes</option></select></label><label>Water-level measurement notes<textarea name="measurementNotes" rows="2" maxlength="1500" placeholder="Record the measurement context or instrument details"></textarea></label><label>Field officer name (as reported)<input name="fieldOfficerName" required maxlength="160" placeholder="Name of officer who observed the event"><small>The account submitting this record is captured separately in the audit history.</small></label><div class="vm0051-form-grid"><label><span>Field officer confirmation recorded</span><span class="vm0051-inline-check"><input type="checkbox" name="fieldOfficerConfirmed"> Field officer personally confirmed the event details to the submitter</span></label><label>Confirmation method<select name="fieldOfficerConfirmationMethod"><option value="">Not recorded</option><option value="verbal">Verbal acknowledgement</option><option value="paper_record">Paper record</option><option value="digital_record">Digital record</option><option value="other">Other</option></select></label><label>Confirmation date & time<input name="fieldOfficerConfirmedAt" type="datetime-local"></label><label>Confirmation reference<input name="fieldOfficerConfirmationReference" maxlength="180"></label></div><div class="vm0051-form-grid"><label><span>Farmer confirmation recorded</span><span class="vm0051-inline-check"><input type="checkbox" name="farmerConfirmed"> Confirmation was reported by the field officer</span></label><label>Farmer name (if confirmed)<input name="farmerName" maxlength="160"></label><label>Confirmation method<select name="farmerConfirmationMethod"><option value="">Not recorded</option><option value="verbal">Verbal acknowledgement</option><option value="paper_record">Paper record</option><option value="photo_record">Photograph / document</option><option value="other">Other</option></select></label><label>Confirmation date & time<input name="farmerConfirmedAt" type="datetime-local"></label></div><div class="vm0051-form-grid"><label>Irrigation log reference<input name="irrigationLogReference" maxlength="180"></label><label>Drainage log reference<input name="drainageLogReference" maxlength="180"></label></div><div class="vm0051-form-grid"><label>Methodology version (from approved project documents)<input name="methodologyVersion" maxlength="100" placeholder="Enter the approved VM0051 version"></label><label>Monitoring plan reference<input name="monitoringPlanReference" maxlength="180" placeholder="Document ID / version / section"></label></div><label>Project reference<input name="projectReference" maxlength="180" placeholder="Project ID or internal code"></label><label>Link an existing satellite evidence run<select name="satelliteRunId"><option value="">No satellite run linked</option>'+runs+'</select></label><div class="vm0051-gps-row"><span id="vm0051GpsStatus">GPS location not captured</span><button type="button" class="outline" data-vm0051-capture-gps>Capture current GPS</button><small>Optional submitter location only; it does not prove the drainage activity occurred at this coordinate.</small><input type="hidden" name="gpsLatitude"><input type="hidden" name="gpsLongitude"><input type="hidden" name="gpsAccuracyM"><input type="hidden" name="gpsCapturedAt"></div><label>Field observations / context<textarea name="fieldNotes" rows="3" maxlength="3000" placeholder="Record what was observed. Keep reported facts separate from interpretation."></textarea></label><div class="vm0051-form-grid"><label>Attachment category<select name="evidenceType"><option value="field_photo">Field photograph</option><option value="water_level_record">Water-level measurement record</option><option value="irrigation_drainage_log">Irrigation / drainage log</option><option value="farmer_confirmation">Farmer confirmation record</option><option value="satellite_export">Satellite export</option><option value="other">Other supporting file</option></select></label><label>Evidence date & time (if known)<input name="evidenceCapturedAt" type="datetime-local"></label></div><label>Supporting files<input name="evidenceFiles" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx,application/pdf,image/jpeg,image/png,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><small>Private upload · PDF, JPEG, PNG, CSV or XLSX · maximum 25 MB per file. Original files are retained; the system records a SHA-256 digest.</small></label><label class="vm0051-inline-check"><input type="checkbox" name="submissionAttestation" required> I confirm that the information above is recorded as reported/observed and that missing measurements have not been estimated.</label><button class="primary" type="submit" '+(submitDisabled?'disabled':'')+'>'+ (vm0051AuditLoading?'Saving…':'Submit field evidence for review')+'</button><p class="muted vm0051-audit-note">Submitting creates a new event record. Source observations and uploaded evidence cannot be edited or deleted by ordinary client users. Corrections should be submitted as a new record with an explanation.</p></form></details><div class="vm0051-audit-actions"><button type="button" class="outline" data-vm0051-audit-download>Download register CSV</button><button type="button" class="outline" data-vm0051-audit-workbook>Download audit workbook</button><button type="button" class="outline" data-vm0051-audit-print>Print / Save PDF</button><span>Records and audit history are loaded from Supabase for the active company.</span></div><div class="table-wrap vm0051-audit-table-wrap"><table><thead><tr><th>Field</th><th>Drainage chronology</th><th>Water-level evidence</th><th>Reported by</th><th>Status</th><th>Attachments</th><th>Submission / review</th></tr></thead><tbody>'+(eventRows||'<tr><td colspan="7">No drainage event submissions have been captured for this company.</td></tr>')+'</tbody></table></div><section class="vm0051-audit-history"><h3>Append-only audit history · latest 40 of '+vm0051AuditHistory.length+'</h3><div class="table-wrap"><table><thead><tr><th>Timestamp</th><th>Action</th><th>Event reference</th><th>Actor user ID</th></tr></thead><tbody>'+(historyRows||'<tr><td colspan="4">No audit entries yet.</td></tr>')+'</tbody></table></div></section></section>';
}
function vm0051AuditPage(list) {
  return '<div class="page-heading"><div><p class="eyebrow">CLIMATE EVIDENCE · FIELD OPERATIONS</p><h1>VM0051 Audit Register</h1><p class="muted">Field-level drainage event records, supporting evidence and reviewer traceability.</p></div></div>'+vm0051AuditPanel(list);
}
async function vm0051AuditFetchAll(table,columns) {
  const rows=[];
  const pageSize=500;
  for(let offset=0;offset<=50000;offset+=pageSize){
    const {data,error}=await supabaseClient.from(table).select(columns)
      .eq('company_id',activeCompanyId).order('created_at',{ascending:false})
      .range(offset,offset+pageSize-1);
    if(error)throw error;
    rows.push(...(data||[]));
    if(!data||data.length<pageSize)return rows;
  }
  throw new Error('The audit register exceeds the 50,000-row browser retrieval safeguard. Use a server-side export for this company.');
}
async function loadVm0051AuditData() {
  if (!supabaseClient || !activeUser || !activeCompanyId) return;
  vm0051AuditLoading = true;
  try {
    const [events,evidence,history] = await Promise.all([
      vm0051AuditFetchAll('vm0051_drainage_events','*'),
      vm0051AuditFetchAll('vm0051_drainage_event_evidence','*'),
      vm0051AuditFetchAll('vm0051_drainage_event_audit','*')
    ]);
    vm0051AuditEvents=events;
    vm0051AuditEvidence=evidence;
    vm0051AuditHistory=history;
    vm0051AuditLoadedCompany=activeCompanyId;
  } finally {
    vm0051AuditLoading=false;
  }
}
async function vm0051AuditSha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
}
function vm0051AuditCsv() {
  const headers = ['Event ID','Company ID','Field record ID','Season','Field number','Farmer','Village','District','Methodology version','Monitoring plan reference','Project reference','Submitted by user ID','Reported field-officer user ID','Drainage start','Drainage completion','Water before cm','Water before measured at','Water after cm','Water after measured at','Measurement method','Water-level measurement notes','Field officer','Field officer confirmation recorded','Field officer confirmation method','Field officer confirmed at','Field officer confirmation reference','Farmer confirmation recorded','Farmer name','Farmer confirmation method','Farmer confirmation time','Irrigation log reference','Drainage log reference','Field observations','GPS latitude','GPS longitude','GPS accuracy (m)','GPS captured at','Satellite run ID','Status','Reviewer notes','Review checklist JSON','Submitted at','Created at','Reviewed at','Evidence file count'];
  const rows = vm0051AuditEvents.map(event => {
    const files = vm0051AuditEvidence.filter(file => file.event_id === event.id);
    return [event.id,event.company_id,event.field_record_id,event.season_key,event.field_no,event.farmer_name,event.village,event.district,event.methodology_version,event.monitoring_plan_reference,event.project_reference,event.created_by,event.field_officer_user_id,event.drainage_started_at,event.drainage_completed_at,event.water_level_before_cm,event.water_level_before_measured_at,event.water_level_after_cm,event.water_level_after_measured_at,event.measurement_method,event.measurement_notes,event.field_officer_name,event.field_officer_confirmed,event.field_officer_confirmation_method,event.field_officer_confirmed_at,event.field_officer_confirmation_reference,event.farmer_confirmed,event.farmer_confirmation_name,event.farmer_confirmation_method,event.farmer_confirmed_at,event.irrigation_log_reference,event.drainage_log_reference,event.field_notes,event.gps_latitude,event.gps_longitude,event.gps_accuracy_m,event.gps_captured_at,event.satellite_run_id,event.status,event.reviewer_notes,JSON.stringify(event.review_checklist||{}),event.submitted_at,event.created_at,event.reviewed_at,files.length];
  });
  const cell = value => '"'+String(value ?? '').replace(/"/g,'""')+'"';
  return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
}
async function submitVm0051AuditEvent(form,list) {
  const data = new FormData(form);
  const field = vm0051AuditFields(list).find(item => item.id === String(data.get('fieldRecordId')||''));
  if (!field) throw new Error('Select a field record from the active company.');
  const confirmed = data.get('farmerConfirmed') === 'on';
  const officerConfirmed = data.get('fieldOfficerConfirmed') === 'on';
  if (confirmed && !String(data.get('farmerName')||'').trim()) throw new Error('Enter the farmer name when farmer confirmation is recorded.');
  if (confirmed && (!data.get('farmerConfirmationMethod') || !data.get('farmerConfirmedAt'))) throw new Error('Record the farmer confirmation method and date/time.');
  if (officerConfirmed && (!data.get('fieldOfficerConfirmationMethod') || !data.get('fieldOfficerConfirmedAt'))) throw new Error('Record the field-officer confirmation method and date/time.');
  const files = Array.from(data.getAll('evidenceFiles')).filter(file => file instanceof File && file.size > 0);
  for (const file of files) {
    if (file.size > VM0051_AUDIT_MAX_FILE_BYTES) throw new Error(file.name+' exceeds the 25 MB file limit.');
    const mime = file.type || ({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',csv:'text/csv',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[(file.name.split('.').pop()||'').toLowerCase()] || '');
    if (!VM0051_AUDIT_MIME_TYPES.has(mime)) throw new Error(file.name+' has an unsupported file type.');
  }
  const started = String(data.get('drainageStartedAt')||'');
  const completed = String(data.get('drainageCompletedAt')||'');
  if (completed && new Date(completed) < new Date(started)) throw new Error('Drainage completion cannot be earlier than initiation.');
  const optionalDate = value => value ? new Date(String(value)).toISOString() : null;
  const numeric = value => value === '' || value == null ? null : Number(value);
  const row = {
    company_id:activeCompanyId, field_record_id:field.id,
    season_key:String(field.seasonKey||productionPlan.season||''),
    field_no:String(field.fieldNo||''), farmer_name:String(field.name||'Unknown farmer'),
    village:String(field.village||''), district:String(field.district||''),
    crop:String(field.crop||''), hybrid:String(field.hybrid||''),
    event_type:'single_drainage', methodology_version:String(data.get('methodologyVersion')||'').trim()||null, monitoring_plan_reference:String(data.get('monitoringPlanReference')||'').trim()||null, project_reference:String(data.get('projectReference')||'').trim()||null, drainage_started_at:optionalDate(started),
    drainage_completed_at:optionalDate(completed),
    water_level_before_cm:numeric(data.get('waterBefore')),
    water_level_before_measured_at:optionalDate(data.get('waterBeforeAt')),
    water_level_after_cm:numeric(data.get('waterAfter')),
    water_level_after_measured_at:optionalDate(data.get('waterAfterAt')),
    measurement_method:String(data.get('measurementMethod')||'')||null,
    measurement_notes:String(data.get('measurementNotes')||'').trim()||null,
    field_officer_name:String(data.get('fieldOfficerName')||'').trim(),
    field_officer_user_id:null,
    field_officer_confirmed:officerConfirmed,
    field_officer_confirmation_method:String(data.get('fieldOfficerConfirmationMethod')||'')||null,
    field_officer_confirmed_at:optionalDate(data.get('fieldOfficerConfirmedAt')),
    field_officer_confirmation_reference:String(data.get('fieldOfficerConfirmationReference')||'').trim()||null,
    farmer_confirmed:confirmed,
    farmer_confirmation_name:String(data.get('farmerName')||'').trim()||null,
    farmer_confirmation_method:String(data.get('farmerConfirmationMethod')||'')||null,
    farmer_confirmed_at:optionalDate(data.get('farmerConfirmedAt')),
    irrigation_log_reference:String(data.get('irrigationLogReference')||'').trim()||null,
    drainage_log_reference:String(data.get('drainageLogReference')||'').trim()||null,
    field_notes:String(data.get('fieldNotes')||'').trim()||null,
    gps_latitude:numeric(data.get('gpsLatitude')), gps_longitude:numeric(data.get('gpsLongitude')), gps_accuracy_m:numeric(data.get('gpsAccuracyM')), gps_captured_at:optionalDate(data.get('gpsCapturedAt')),
    satellite_run_id:String(data.get('satelliteRunId')||'')||null,
    status:'submitted', created_by:activeUser.id
  };
  const {data:event,error} = await supabaseClient.from('vm0051_drainage_events').insert(row).select('*').single();
  if (error) throw error;
  const uploadErrors = [];
  for (const file of files) {
    try {
      const extension = (file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100) || 'evidence.'+extension;
      const storagePath = activeCompanyId+'/'+event.id+'/'+crypto.randomUUID()+'-'+safeName;
      const mime = file.type || ({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',csv:'text/csv',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[extension] || 'application/octet-stream');
      const digest = await vm0051AuditSha256(file);
      const upload = await supabaseClient.storage.from(VM0051_AUDIT_BUCKET).upload(storagePath,file,{contentType:mime,upsert:false});
      if (upload.error) throw upload.error;
      const evidenceType = String(data.get('evidenceType')||'other');
      const evidenceClass = evidenceType === 'satellite_export' ? 'satellite' : 'reported';
      const evidenceRow = {
        company_id:activeCompanyId,event_id:event.id,evidence_type:evidenceType,evidence_class:evidenceClass,
        storage_path:storagePath,file_name:file.name,mime_type:mime,file_size_bytes:file.size,
        sha256_hex:digest,captured_at:optionalDate(data.get('evidenceCapturedAt')),
        latitude:row.gps_latitude,longitude:row.gps_longitude,created_by:activeUser.id,
        metadata:{upload_source:'beta_manager_ui',browser_last_modified_ms:file.lastModified}
      };
      const saved = await supabaseClient.from('vm0051_drainage_event_evidence').insert(evidenceRow);
      if (saved.error) throw saved.error;
    } catch (error) {
      uploadErrors.push(file.name+': '+(error.message||'upload failed'));
    }
  }
  await loadVm0051AuditData();
  notify(uploadErrors.length ? 'Event submitted. Some attachments need retry: '+uploadErrors.join('; ') : 'Field evidence submitted and audit history recorded.');
  render();
}
async function reviewVm0051AuditEvent(form) {
  const eventId = form.dataset.vm0051ReviewForm;
  const data = new FormData(form);
  const decision = String(data.get('decision')||'');
  const notes = String(data.get('reviewerNotes')||'').trim();
  if (decision === 'returned' && !notes) throw new Error('Reviewer notes are required when returning a record.');
  const checklist = {};
  ['water_level_measurements_reviewed','drainage_records_reviewed','farmer_or_officer_confirmation_reviewed','attachments_reviewed','monitoring_plan_crosscheck_reviewed'].forEach(key => checklist[key] = data.get(key) === 'on');
  if (decision === 'reviewed' && Object.values(checklist).some(value => !value)) throw new Error('Complete all five internal review checks before marking this record reviewed.');
  const {data:updated,error} = await supabaseClient.from('vm0051_drainage_events').update({
    status:decision,review_checklist:checklist,reviewer_notes:notes||null,
    reviewed_by:activeUser.id,reviewed_at:new Date().toISOString()
  }).eq('company_id',activeCompanyId).eq('id',eventId).select('id').maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error('No event was updated. Check that the record is still awaiting review and that your account has reviewer permission.');
  await loadVm0051AuditData();
  notify(decision === 'reviewed' ? 'Internal evidence review recorded.' : 'Evidence returned with reviewer notes.');
  render();
}

async function vm0051AuditWorkbook() {
  const XLSX = window.XLSX;
  if (!XLSX?.utils) throw new Error('Excel export is not available. Download the CSV register instead.');
  const workbook = XLSX.utils.book_new();
  const runIds = [...new Set(vm0051AuditEvents.map(event=>event.satellite_run_id).filter(Boolean))];
  let satelliteRuns = [];
  if (runIds.length) {
    for(let offset=0;offset<runIds.length;offset+=100){
      const batch=runIds.slice(offset,offset+100);
      const {data,error} = await supabaseClient.from('vm0051_drainage_evidence_runs')
        .select('id,methodology_version,monitoring_from,monitoring_to,generated_at,evidence_payload')
        .eq('company_id',activeCompanyId).in('id',batch);
      if(error)throw error;
      satelliteRuns.push(...(data||[]));
    }
  }
  const events = [
    ['VM0051 field drainage evidence register'], ['Company', activeCompanyName],
    ['Exported at', new Date().toISOString()], [],
    ['Event ID','Field record ID','Season','Field number','Farmer','Village','District','Crop','Hybrid','Methodology version','Monitoring plan reference','Project reference','Submitted by user ID','Reported field-officer user ID','Drainage start','Drainage completion','Water before (cm)','Water before measured at','Water after (cm)','Water after measured at','Measurement method','Water-level measurement notes','Field officer','Field officer confirmation','Field officer confirmation method','Field officer confirmed at','Field officer confirmation reference','Farmer confirmation','Farmer name','Confirmation method','Confirmation time','Irrigation log ref','Drainage log ref','Field observations','GPS latitude','GPS longitude','GPS accuracy (m)','GPS captured at','Satellite run ID','Status','Reviewer notes','Review checklist JSON','Submitted at','Created at','Reviewed at','Evidence count'],
    ...vm0051AuditEvents.map(event => [event.id,event.field_record_id,event.season_key,event.field_no,event.farmer_name,event.village,event.district,event.crop,event.hybrid,event.methodology_version,event.monitoring_plan_reference,event.project_reference,event.created_by,event.field_officer_user_id,event.drainage_started_at,event.drainage_completed_at,event.water_level_before_cm,event.water_level_before_measured_at,event.water_level_after_cm,event.water_level_after_measured_at,event.measurement_method,event.measurement_notes,event.field_officer_name,event.field_officer_confirmed,event.field_officer_confirmation_method,event.field_officer_confirmed_at,event.field_officer_confirmation_reference,event.farmer_confirmed,event.farmer_confirmation_name,event.farmer_confirmation_method,event.farmer_confirmed_at,event.irrigation_log_reference,event.drainage_log_reference,event.field_notes,event.gps_latitude,event.gps_longitude,event.gps_accuracy_m,event.gps_captured_at,event.satellite_run_id,event.status,event.reviewer_notes,JSON.stringify(event.review_checklist||{}),event.submitted_at,event.created_at,event.reviewed_at,vm0051AuditEvidence.filter(file=>file.event_id===event.id).length])
  ];
  const evidence = [
    ['Evidence ID','Event ID','Evidence type','Source class','File name','MIME type','File size bytes','SHA-256','Storage path','Evidence date/time','Latitude','Longitude','Uploaded by','Uploaded at'],
    ...vm0051AuditEvidence.map(file=>[file.id,file.event_id,file.evidence_type,file.evidence_class,file.file_name,file.mime_type,file.file_size_bytes,file.sha256_hex,file.storage_path,file.captured_at,file.latitude,file.longitude,file.created_by,file.created_at])
  ];
  const history = [
    ['Audit ID','Event ID','Action','Actor user ID','Timestamp','Previous values JSON','New values JSON'],
    ...vm0051AuditHistory.map(item=>[item.id,item.event_id,item.action,item.actor_id,item.created_at,JSON.stringify(item.old_values||{}),JSON.stringify(item.new_values||{})])
  ];
  const boundaries = [['Event ID','Field record ID','Field number','Boundary point number','Latitude','Longitude']];
  vm0051AuditEvents.forEach(event=>{
    const field=records.find(item=>item.id===event.field_record_id);
    (field?.boundaryPoints||[]).forEach((point,index)=>boundaries.push([event.id,event.field_record_id,event.field_no,index+1,point.lat,point.lon]));
  });
  const satellite = [['Event ID','Field number','Satellite run ID','Methodology version','Monitoring from','Monitoring to','Run generated at','Acquisition date','NDVI','NDMI','NDRE','EVI','SAVI','VV','VH','Sentinel-2 status','Sentinel-1 status']];
  vm0051AuditEvents.forEach(event=>{
    const run=satelliteRuns.find(item=>item.id===event.satellite_run_id);
    if(!run){if(event.satellite_run_id)satellite.push([event.id,event.field_no,event.satellite_run_id,'Linked run unavailable or access restricted']);return;}
    const field=(run.evidence_payload?.fields||[]).find(item=>String(item.fieldNo||'')===String(event.field_no||''));
    if(!field){satellite.push([event.id,event.field_no,run.id,run.methodology_version,run.monitoring_from,run.monitoring_to,run.generated_at,'No matching field row in run']);return;}
    const series=field.observationSeries||[];
    if(!series.length){satellite.push([event.id,event.field_no,run.id,run.methodology_version,run.monitoring_from,run.monitoring_to,run.generated_at,'No dated observation rows',field.ndvi,field.ndmi,field.ndre,field.evi,field.savi,field.vv,field.vh,field.sentinel2Status,field.sentinel1Status]);return;}
    series.forEach(point=>satellite.push([event.id,event.field_no,run.id,run.methodology_version,run.monitoring_from,run.monitoring_to,run.generated_at,point.date,point.ndvi,point.ndmi,point.ndre,point.evi,point.savi,point.vv,point.vh,field.sentinel2Status,field.sentinel1Status]));
  });
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(events),'Drainage events');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(evidence),'Evidence files');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(history),'Audit history');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(boundaries),'Field boundaries');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(satellite),'Satellite observations');
  XLSX.writeFile(workbook,'VM0051-field-audit-'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function bindVm0051AuditRegister(list) {
  if (page !== 'carbon-audit') return;
  if (activeCompanyId && vm0051AuditLoadedCompany !== activeCompanyId && !vm0051AuditLoading) {
    loadVm0051AuditData().then(()=>{if(page==='carbon-audit')renderManager()}).catch(error=>notify('Could not load VM0051 audit register: '+(error.message||'database error')));
  }
  const form = document.getElementById('vm0051DrainageEventForm');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) {button.disabled=true;button.textContent='Saving evidence…';}
    try {await submitVm0051AuditEvent(form,list);}
    catch(error) {notify('Evidence not submitted: '+(error.message||'Unknown error'));if(button){button.disabled=false;button.textContent='Submit field evidence for review';}}
  });
  document.querySelectorAll('[data-vm0051-review-form]').forEach(reviewForm=>reviewForm.addEventListener('submit',async event=>{
    event.preventDefault();const button=reviewForm.querySelector('button[type="submit"]');if(button)button.disabled=true;
    try {await reviewVm0051AuditEvent(reviewForm);}
    catch(error){notify('Review not saved: '+(error.message||'Unknown error'));if(button)button.disabled=false;}
  }));
  document.querySelector('[data-vm0051-capture-gps]')?.addEventListener('click',()=>{
    const status=document.getElementById('vm0051GpsStatus');
    if(!navigator.geolocation){if(status)status.textContent='GPS is not available in this browser.';return;}
    if(status)status.textContent='Capturing current location…';
    navigator.geolocation.getCurrentPosition(position=>{
      form.elements.namedItem('gpsLatitude').value=position.coords.latitude;
      form.elements.namedItem('gpsLongitude').value=position.coords.longitude;
      form.elements.namedItem('gpsAccuracyM').value=position.coords.accuracy;
      form.elements.namedItem('gpsCapturedAt').value=new Date(position.timestamp||Date.now()).toISOString();
      if(status)status.textContent='Captured '+position.coords.latitude.toFixed(6)+', '+position.coords.longitude.toFixed(6)+' · accuracy '+Math.round(position.coords.accuracy)+' m';
    },error=>{if(status)status.textContent='GPS capture failed: '+error.message;},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
  document.querySelectorAll('[data-vm0051-open-evidence]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try {
      const item=vm0051AuditEvidence.find(file=>file.id===button.dataset.vm0051OpenEvidence);
      if(!item)throw new Error('Evidence metadata is not available.');
      const {data,error}=await supabaseClient.storage.from(VM0051_AUDIT_BUCKET).createSignedUrl(item.storage_path,60);
      if(error)throw error;
      const link=document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener';link.click();
    } catch(error){notify('Could not open evidence file: '+(error.message||'Access denied'));}
    finally{button.disabled=false;}
  }));
  document.querySelector('[data-vm0051-audit-download]')?.addEventListener('click',()=>{
    const blob=new Blob([vm0051AuditCsv()],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='VM0051-drainage-audit-register-'+new Date().toISOString().slice(0,10)+'.csv';
    anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  document.querySelector('[data-vm0051-audit-workbook]')?.addEventListener('click',async()=>{const button=document.querySelector('[data-vm0051-audit-workbook]');if(button)button.disabled=true;try{await vm0051AuditWorkbook()}catch(error){notify(error.message||'Could not create workbook')}finally{if(button)button.disabled=false}});
  document.querySelector('[data-vm0051-audit-print]')?.addEventListener('click',()=>window.print());
}
