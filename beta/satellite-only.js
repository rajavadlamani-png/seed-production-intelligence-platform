// Satellite-only observation report. This module deliberately reads only saved satellite evidence runs.
let satelliteOnlyRuns = [];
let satelliteOnlyLoadedCompanyId = '';
let satelliteOnlyLoading = false;
let satelliteOnlyLoadError = '';
let satelliteOnlySelectedRunId = '';
let satelliteOnlySelectedFieldNo = '';
let satelliteOnlyReport = null;

function satelliteOnlyEsc(value) {
  return typeof escape === 'function' ? escape(String(value ?? '')) : String(value ?? '');
}
function satelliteOnlyDate(value) {
  if (!value) return '—';
  const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? satelliteOnlyEsc(value) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function satelliteOnlyRunFields(run) {
  const fields = run?.evidence_payload?.fields;
  return Array.isArray(fields) ? fields : [];
}
function satelliteOnlySelectedRun() {
  return satelliteOnlyRuns.find(run => run.id === satelliteOnlySelectedRunId) || satelliteOnlyRuns[0] || null;
}
async function loadSatelliteOnlyRuns() {
  if (!supabaseClient || !activeUser || !activeCompanyId) throw new Error('Sign in to a company workspace first.');
  const { data, error } = await supabaseClient
    .from('vm0051_drainage_evidence_runs')
    .select('id,season_key,methodology_version,monitoring_from,monitoring_to,generated_at,field_count,fields_with_boundary,fields_with_observations,evidence_payload,created_at')
    .eq('company_id', activeCompanyId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  satelliteOnlyRuns = data || [];
  satelliteOnlyLoadedCompanyId = activeCompanyId;
  if (!satelliteOnlyRuns.some(run => run.id === satelliteOnlySelectedRunId)) satelliteOnlySelectedRunId = satelliteOnlyRuns[0]?.id || '';
  satelliteOnlySelectedFieldNo = '';
  satelliteOnlyReport = null;
}
function satelliteOnlyEnsureLoaded() {
  if (!activeCompanyId || satelliteOnlyLoading || satelliteOnlyLoadedCompanyId === activeCompanyId) return;
  satelliteOnlyLoading = true;
  satelliteOnlyLoadError = '';
  loadSatelliteOnlyRuns()
    .catch(error => { satelliteOnlyLoadError = error?.message || 'Could not load saved satellite observations.'; })
    .finally(() => { satelliteOnlyLoading = false; if (typeof renderManager === 'function' && page === 'satellite-intelligence') renderManager(); });
}
function satelliteOnlySummaries(rows) {
  const keys = [
    ['ndvi', 'NDVI', 'Sentinel-2'],
    ['ndmi', 'NDMI', 'Sentinel-2'],
    ['ndre', 'NDRE', 'Sentinel-2'],
    ['evi', 'EVI', 'Sentinel-2'],
    ['savi', 'SAVI', 'Sentinel-2'],
    ['vv', 'VV backscatter', 'Sentinel-1'],
    ['vh', 'VH backscatter', 'Sentinel-1']
  ];
  return keys.map(([key, label, source]) => {
    const values = rows.filter(row => Number.isFinite(Number(row[key])) && row[key] !== null && row[key] !== '').map(row => ({ date: row.date, value: Number(row[key]) })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!values.length) return { key, label, source, count: 0, first: null, last: null, delta: null, direction: 'No values returned' };
    const first = values[0], last = values[values.length - 1], delta = last.value - first.value;
    const direction = Math.abs(delta) < 1e-9 ? 'No material numerical change' : delta > 0 ? 'Increased between first and last observation' : 'Decreased between first and last observation';
    return { key, label, source, count: values.length, first, last, delta, direction };
  });
}
function satelliteOnlyBuildReport(field, run, from, to) {
  if (!field || !run) throw new Error('Choose a saved satellite run and field.');
  if (!from || !to || from > to) throw new Error('Choose a valid monitoring date range.');
  const series = Array.isArray(field.observationSeries) ? field.observationSeries : [];
  const rows = series.filter(item => item?.date && item.date >= from && item.date <= to)
    .map(item => ({ date: String(item.date), ndvi: item.ndvi ?? null, ndmi: item.ndmi ?? null, ndre: item.ndre ?? null, evi: item.evi ?? null, savi: item.savi ?? null, vv: item.vv ?? null, vh: item.vh ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    runId: run.id, season: run.season_key || '', generatedAt: run.generated_at || run.created_at || '',
    monitoringFrom: from, monitoringTo: to, fieldNo: field.fieldNo || '', farmer: field.farmer || '',
    village: field.village || '', district: field.district || '', hybrid: field.hybrid || '',
    boundaryStatus: field.boundaryStatus || 'Not reported',
    sentinel1Status: field.sentinel1Status || 'Not reported', sentinel2Status: field.sentinel2Status || 'Not reported',
    rows, summaries: satelliteOnlySummaries(rows)
  };
}
function satelliteOnlyReportMarkup(report) {
  if (!report) return '<div class="satellite-only-empty">Select a saved satellite run, field and monitoring period, then generate the report.</div>';
  if (!report.rows.length) return '<div class="satellite-only-empty">No dated satellite observations are saved for this field within the selected period. This is a data-coverage result, not a finding about field conditions.</div>';
  const cards = report.summaries.map(item => {
    const first = item.first ? item.first.value.toFixed(4) + ' (' + satelliteOnlyDate(item.first.date) + ')' : '—';
    const last = item.last ? item.last.value.toFixed(4) + ' (' + satelliteOnlyDate(item.last.date) + ')' : '—';
    const delta = item.delta === null ? 'No values' : (item.delta > 0 ? '+' : '') + item.delta.toFixed(4);
    return '<article class="satellite-only-metric"><small>' + satelliteOnlyEsc(item.label) + ' · ' + satelliteOnlyEsc(item.source) + '</small><b>' + delta + '</b><span>' + item.count + ' observations · ' + satelliteOnlyEsc(item.direction) + '</span><small>First: ' + first + '<br>Latest: ' + last + '</small></article>';
  }).join('');
  const tableRows = report.rows.map(row => '<tr><td>' + satelliteOnlyDate(row.date) + '</td>' + ['ndvi','ndmi','ndre','evi','savi','vv','vh'].map(key => '<td>' + (Number.isFinite(Number(row[key])) && row[key] !== null ? Number(row[key]).toFixed(4) : '—') + '</td>').join('') + '</tr>').join('');
  return '<section class="satellite-only-report" id="satelliteOnlyPrintable"><div class="satellite-only-report-head"><div><p class="eyebrow">SATELLITE-ONLY OBSERVATION REPORT</p><h3>' + satelliteOnlyEsc(report.fieldNo) + ' · ' + satelliteOnlyEsc(report.farmer || 'Farmer not identified in satellite snapshot') + '</h3><p>' + satelliteOnlyEsc(report.village) + (report.district ? ', ' + satelliteOnlyEsc(report.district) : '') + (report.hybrid ? ' · ' + satelliteOnlyEsc(report.hybrid) : '') + '</p></div><span class="status-chip ok">SATELLITE DATA ONLY</span></div><div class="satellite-only-meta"><span><b>Monitoring period</b>' + satelliteOnlyDate(report.monitoringFrom) + ' to ' + satelliteOnlyDate(report.monitoringTo) + '</span><span><b>Satellite run generated</b>' + satelliteOnlyEsc(report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-IN') : 'Not recorded') + '</span><span><b>Field boundary</b>' + satelliteOnlyEsc(report.boundaryStatus) + '</span><span><b>Sentinel-1 / Sentinel-2</b>' + satelliteOnlyEsc(report.sentinel1Status) + ' / ' + satelliteOnlyEsc(report.sentinel2Status) + '</span></div><div class="satellite-only-metrics">' + cards + '</div><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Observation date</th><th>NDVI</th><th>NDMI</th><th>NDRE</th><th>EVI</th><th>SAVI</th><th>VV</th><th>VH</th></tr></thead><tbody>' + tableRows + '</tbody></table></div><p class="satellite-only-caveat"><b>Interpretation:</b> This report uses only saved Sentinel-1 / Sentinel-2 observation values. It does not read physical inspection reports, photographs, farmer confirmations or manual drainage-event entries. Index and backscatter changes are numerical remote-sensing observations; they are not, by themselves, proof of irrigation, drainage, crop stress, water depth or a VM0051-compliant event. No manual record is used to fill missing satellite observations.</p><p class="satellite-only-provenance">Source run ID: ' + satelliteOnlyEsc(report.runId) + ' · ' + report.rows.length + ' dated observation records shown.</p></section>';
}
function satelliteOnlyPage() {
  satelliteOnlyEnsureLoaded();
  if (satelliteOnlyLoading) return '<div class="page-heading"><div><p class="eyebrow">REMOTE SENSING · INDEPENDENT EVIDENCE</p><h1>Satellite Intelligence</h1><p class="muted">Loading saved satellite observations…</p></div></div>';
  if (satelliteOnlyLoadError) return '<div class="page-heading"><div><p class="eyebrow">REMOTE SENSING · INDEPENDENT EVIDENCE</p><h1>Satellite Intelligence</h1><p class="muted">' + satelliteOnlyEsc(satelliteOnlyLoadError) + '</p></div><button class="outline" data-satellite-only-retry>Retry</button></div>';
  const run = satelliteOnlySelectedRun();
  const fields = satelliteOnlyRunFields(run);
  if (!run) return '<div class="page-heading"><div><p class="eyebrow">REMOTE SENSING · INDEPENDENT EVIDENCE</p><h1>Satellite Intelligence</h1><p class="muted">No saved satellite observation runs are available for this company. Generate a satellite evidence run from Reports first.</p></div></div>';
  const selectedField = fields.find(item => String(item.fieldNo || '') === satelliteOnlySelectedFieldNo) || fields[0] || null;
  const selectedFieldNo = selectedField?.fieldNo || '';
  const options = fields.map(item => '<option value="' + satelliteOnlyEsc(item.fieldNo || '') + '" ' + (String(item.fieldNo || '') === String(selectedFieldNo) ? 'selected' : '') + '>' + satelliteOnlyEsc(item.fieldNo || 'Field not identified') + ' · ' + satelliteOnlyEsc(item.farmer || 'Farmer not identified') + '</option>').join('');
  const from = satelliteOnlyReport?.runId === run.id ? satelliteOnlyReport.monitoringFrom : run.monitoring_from;
  const to = satelliteOnlyReport?.runId === run.id ? satelliteOnlyReport.monitoringTo : run.monitoring_to;
  const runOptions = satelliteOnlyRuns.map(item => '<option value="' + satelliteOnlyEsc(item.id) + '" ' + (item.id === run.id ? 'selected' : '') + '>' + satelliteOnlyEsc(item.season_key || 'Season') + ' · ' + satelliteOnlyEsc(item.monitoring_from) + ' to ' + satelliteOnlyEsc(item.monitoring_to) + '</option>').join('');
  return '<div class="page-heading"><div><p class="eyebrow">REMOTE SENSING · INDEPENDENT EVIDENCE</p><h1>Satellite Intelligence</h1><p class="muted">A standalone field report generated exclusively from saved satellite observations. Manual inspections and photographs are not inputs to this report.</p></div></div><section class="panel satellite-only-panel"><div class="sat-evidence-note"><b>Independent data stream</b><p>This page reads the satellite observation snapshots saved in Supabase. It does not consult inspection forms, photographs, farmer statements or drainage-event submissions. A missing satellite observation remains missing; manual evidence is never substituted.</p></div><form id="satelliteOnlyForm" class="satellite-only-form"><label>Saved satellite run<select name="runId" id="satelliteOnlyRun">' + runOptions + '</select></label><label>Field<select name="fieldNo" id="satelliteOnlyField">' + options + '</select></label><div class="satellite-only-date-grid"><label>From date<input type="date" name="fromDate" value="' + satelliteOnlyEsc(from || run.monitoring_from) + '" min="' + satelliteOnlyEsc(run.monitoring_from) + '" max="' + satelliteOnlyEsc(run.monitoring_to) + '" required></label><label>To date<input type="date" name="toDate" value="' + satelliteOnlyEsc(to || run.monitoring_to) + '" min="' + satelliteOnlyEsc(run.monitoring_from) + '" max="' + satelliteOnlyEsc(run.monitoring_to) + '" required></label></div><button class="primary" type="submit">Generate satellite-only report</button></form><div class="satellite-only-actions">' + (satelliteOnlyReport ? '<button type="button" class="outline" data-satellite-only-download="csv">Download CSV</button><button type="button" class="outline" data-satellite-only-download="xlsx">Download Excel</button><button type="button" class="outline" data-satellite-only-print>Print / Save PDF</button>' : '') + '</div><div id="satelliteOnlyOutput">' + satelliteOnlyReportMarkup(satelliteOnlyReport) + '</div></section>';
}
function bindSatelliteOnlyPage() {
  document.getElementById('satelliteOnlyRun')?.addEventListener('change', event => {
    satelliteOnlySelectedRunId = event.target.value;
    satelliteOnlySelectedFieldNo = '';
    satelliteOnlyReport = null;
    renderManager();
  });
  document.getElementById('satelliteOnlyForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget, values = new FormData(form), run = satelliteOnlyRuns.find(item => item.id === String(values.get('runId')));
    const field = satelliteOnlyRunFields(run).find(item => String(item.fieldNo || '') === String(values.get('fieldNo')));
    try {
      satelliteOnlySelectedRunId = run?.id || '';
      satelliteOnlySelectedFieldNo = field?.fieldNo || '';
      satelliteOnlyReport = satelliteOnlyBuildReport(field, run, String(values.get('fromDate') || ''), String(values.get('toDate') || ''));
      renderManager();
    } catch (error) { notify(error?.message || 'Could not generate the satellite-only report.'); }
  });
  document.querySelector('[data-satellite-only-retry]')?.addEventListener('click', () => {
    satelliteOnlyLoadedCompanyId = '';
    satelliteOnlyLoadError = '';
    satelliteOnlyEnsureLoaded();
    renderManager();
  });
  document.querySelectorAll('[data-satellite-only-download]').forEach(button => button.addEventListener('click', () => satelliteOnlyDownload(button.dataset.satelliteOnlyDownload)));
  document.querySelector('[data-satellite-only-print]')?.addEventListener('click', () => window.print());
}
function satelliteOnlyDownload(format) {
  const report = satelliteOnlyReport;
  if (!report) return;
  const headers = ['Field number','Farmer','Village','District','Hybrid','Observation date','NDVI','NDMI','NDRE','EVI','SAVI','Sentinel-1 VV','Sentinel-1 VH'];
  const rows = report.rows.map(row => [report.fieldNo,report.farmer,report.village,report.district,report.hybrid,row.date,row.ndvi,row.ndmi,row.ndre,row.evi,row.savi,row.vv,row.vh]);
  const quote = value => '"' + String(value ?? '').replaceAll('"','""') + '"';
  const filename = 'satellite-only-' + String(report.fieldNo || 'field').replace(/[^a-z0-9_-]/gi,'-') + '-' + report.monitoringTo;
  if (format === 'csv') {
    const csv = '\uFEFF' + [headers,...rows].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  const XLSX = window.XLSX;
  if (!XLSX?.utils) { notify('Excel export is not available. Download the CSV instead.'); return; }
  const metadata = [['Satellite-only observation report'],['Field',report.fieldNo],['Farmer',report.farmer],['Village',report.village],['District',report.district],['Hybrid',report.hybrid],['Season',report.season],['Monitoring period',report.monitoringFrom + ' to ' + report.monitoringTo],['Satellite run ID',report.runId],['Generated at',report.generatedAt],[],headers,...rows];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metadata), 'Satellite observations');
  XLSX.writeFile(workbook, filename + '.xlsx');
}
