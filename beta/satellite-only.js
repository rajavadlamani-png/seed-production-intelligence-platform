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
  return '<div class="page-heading"><div><p class="eyebrow">REMOTE SENSING · INDEPENDENT EVIDENCE</p><h1>Satellite Intelligence</h1><p class="muted">A standalone field report generated exclusively from saved satellite observations. Manual inspections and photographs are not inputs to this report.</p></div></div><section class="panel satellite-only-panel"><div class="sat-evidence-note"><b>Independent data stream</b><p>This page reads the satellite observation snapshots saved in Supabase. It does not consult inspection forms, photographs, farmer statements or drainage-event submissions. A missing satellite observation remains missing; manual evidence is never substituted.</p></div><form id="satelliteOnlyForm" class="satellite-only-form"><label>Saved satellite run<select name="runId" id="satelliteOnlyRun">' + runOptions + '</select></label><label>Field<select name="fieldNo" id="satelliteOnlyField">' + options + '</select></label><div class="satellite-only-date-grid"><label>From date<input type="date" name="fromDate" value="' + satelliteOnlyEsc(from || run.monitoring_from) + '" min="' + satelliteOnlyEsc(run.monitoring_from) + '" max="' + satelliteOnlyEsc(run.monitoring_to) + '" required></label><label>To date<input type="date" name="toDate" value="' + satelliteOnlyEsc(to || run.monitoring_to) + '" min="' + satelliteOnlyEsc(run.monitoring_from) + '" max="' + satelliteOnlyEsc(run.monitoring_to) + '" required></label></div><button class="primary" type="submit">Generate satellite-only report</button></form><div class="satellite-only-actions">' + (satelliteOnlyReport ? '<button type="button" class="outline" data-satellite-only-download="csv">Download CSV</button><button type="button" class="outline" data-satellite-only-download="xlsx">Download Excel</button><button type="button" class="outline" data-satellite-only-print>Print / Save PDF</button>' : '') + '</div><div id="satelliteOnlyOutput">' + satelliteOnlyReportMarkup(satelliteOnlyReport) + '</div></section>' + satelliteOnlyHistoricalPanel();
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
  document.getElementById('satelliteHistoricalRun')?.addEventListener('click', satelliteOnlyRunHistoricalTest);
  document.querySelector('[data-satellite-historical-download]')?.addEventListener('click', satelliteOnlyDownloadHistoricalTest);
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

let satelliteOnlyHistoricalResults=null,satelliteOnlyHistoricalRunning=false;
const SAT_HIST_FIELDS=['WH-SYN-001','WH-SYN-004','WH-SYN-050'];
function satHistMedian(a){const x=a.filter(Number.isFinite).slice().sort((p,q)=>p-q);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function satHistScale(a){const m=satHistMedian(a);return m===null?null:(satHistMedian(a.map(x=>Math.abs(x-m)))*1.4826)}
function satHistGap(a){let g=0;for(let i=1;i<a.length;i++)g=Math.max(g,(Date.parse(a[i].date+'T00:00:00Z')-Date.parse(a[i-1].date+'T00:00:00Z'))/86400000);return a.length>1?g:null}
function satHistClassify(f){
 const s=(f.observationSeries||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)),o=s.filter(x=>x.ndmi!==null&&Number.isFinite(Number(x.ndmi))),r=s.filter(x=>(x.vv!==null&&Number.isFinite(Number(x.vv)))||(x.vh!==null&&Number.isFinite(Number(x.vh))));
 const og=satHistGap(o),rg=satHistGap(r),adequate=o.length>=8&&r.length>=8&&og!==null&&rg!==null&&og<=25&&rg<=25,od=[],rd=[];
 for(let i=1;i<o.length;i++){const g=(Date.parse(o[i].date+'T00:00:00Z')-Date.parse(o[i-1].date+'T00:00:00Z'))/86400000;if(g>0&&g<=12)od.push({date:o[i].date,prev:o[i-1].date,d:Number(o[i].ndmi)-Number(o[i-1].ndmi)})}
 for(let i=1;i<r.length;i++){const g=(Date.parse(r[i].date+'T00:00:00Z')-Date.parse(r[i-1].date+'T00:00:00Z'))/86400000;if(g>0&&g<=12){const d=['vv','vh'].filter(k=>r[i][k]!==null&&r[i-1][k]!==null&&Number.isFinite(Number(r[i][k]))&&Number.isFinite(Number(r[i-1][k]))).map(k=>Math.abs(Number(r[i][k])-Number(r[i-1][k])));if(d.length)rd.push({date:r[i].date,d:Math.max(...d)})}}
 const om=satHistMedian(od.map(x=>x.d)),os=satHistScale(od.map(x=>x.d)),rm=satHistMedian(rd.map(x=>x.d)),rs=satHistScale(rd.map(x=>x.d)),c=[];
 if(os!==null&&os>0&&rs!==null&&rs>0)for(const x of od){if(x.d>=0||(x.d-om)/os>-2)continue;const y=rd.filter(z=>Math.abs((Date.parse(z.date+'T00:00:00Z')-Date.parse(x.date+'T00:00:00Z'))/86400000)<=12).map(z=>({...z,zscore:(z.d-rm)/rs})).filter(z=>z.zscore>=2).sort((a,b)=>b.zscore-a.zscore)[0];if(y)c.push({from:x.prev,to:x.date,radar:y.date})}
 const status=!adequate?'amber':c.length?'green':'red';
 const label=status==='green'?'GREEN · Cross-sensor signal-shift candidate':status==='red'?'RED · No candidate signal shift detected':'AMBER · Insufficient evidence';
 const reason=status==='green'?'An unusually sharp NDMI decrease coincides with an unusually large Sentinel-1 backscatter change within 12 days. Exploratory signal only; not proof of wet-to-dry conditions or drainage.':status==='red'?'Coverage meets the pilot gate, but the exploratory rule found no candidate. This is not proof that no drainage occurred.':'Pilot coverage gate not met: requires at least 8 NDMI and 8 radar observations, with no gap over 25 days in either series.';
 return {fieldNo:f.fieldNo,farmer:f.farmer||'',status,label,reason,ndmi:o.length,radar:r.length,og,rg,first:o[0]?.date||'',last:o[o.length-1]?.date||'',candidates:c,series:s};
}
function satelliteOnlyHistoricalPanel(){
 const a=satelliteOnlyHistoricalResults||[],cls={green:'sat-historical-green',red:'sat-historical-red',amber:'sat-historical-amber'};
 const cards=a.map(x=>'<article class="sat-historical-card '+cls[x.status]+'"><div class="sat-historical-card-head"><b>'+satelliteOnlyEsc(x.fieldNo)+'</b><span>'+satelliteOnlyEsc(x.label)+'</span></div><small>'+satelliteOnlyEsc(x.farmer)+'</small><p>'+satelliteOnlyEsc(x.reason)+'</p><div class="sat-historical-stats"><span>NDMI observations <b>'+x.ndmi+'</b></span><span>Radar observations <b>'+x.radar+'</b></span><span>Max NDMI gap <b>'+(x.og??'—')+' days</b></span><span>Max radar gap <b>'+(x.rg??'—')+' days</b></span></div><p>Optical: '+satelliteOnlyDate(x.first)+' to '+satelliteOnlyDate(x.last)+'</p>'+(x.candidates.length?'<p>Candidate signal dates: '+x.candidates.map(y=>satelliteOnlyDate(y.from)+' → '+satelliteOnlyDate(y.to)+'; radar '+satelliteOnlyDate(y.radar)).join('; ')+'</p>':'')+'</article>').join('');
 return '<section class="panel sat-historical-panel"><div class="panel-head"><div><p class="eyebrow">HISTORICAL RETRIEVAL · DEMO BOUNDARIES ONLY</p><h2>Rabi 2025–26 satellite signal test</h2><p class="muted">WH-SYN-001, WH-SYN-004 and WH-SYN-050 · 1 Nov 2025 to 30 Apr 2026</p></div><span class="status-chip planned">EXPLORATORY TEST</span></div><div class="sat-evidence-note"><b>Interpretation limit</b><p>Colour labels are exploratory signal-screening outputs, not validated drainage classifications. Green means a coincident within-field NDMI decrease and Sentinel-1 backscatter shift; Red means no such pattern despite passing the pilot coverage gate; Amber means inadequate coverage. None proves wetness, dryness, drainage or VM0051 compliance. These boundaries are DEMO data only.</p></div><div class="sat-historical-controls"><button type="button" class="primary" id="satelliteHistoricalRun" '+(satelliteOnlyHistoricalRunning?'disabled':'')+'>'+(satelliteOnlyHistoricalRunning?'Retrieving…':'Retrieve and classify the three demo fields')+'</button>'+(a.length?'<button type="button" class="outline" data-satellite-historical-download>Download CSV</button>':'')+'</div><p id="satelliteHistoricalProgress" class="muted">'+(satelliteOnlyHistoricalRunning?'Retrieving historical Sentinel-1 and Sentinel-2 observations…':a.length?'Results from the latest browser-session test.':'No historical test has been run yet.')+'</p>'+(a.length?'<div class="sat-historical-results">'+cards+'</div>':'')+'</section>';
}
async function satelliteOnlyRunHistoricalTest(){
 if(satelliteOnlyHistoricalRunning)return;
 satelliteOnlyHistoricalRunning=true;satelliteOnlyHistoricalResults=null;renderManager();
 const out=[];
 for(let i=0;i<SAT_HIST_FIELDS.length;i++){
  const no=SAT_HIST_FIELDS[i],record=(records||[]).find(x=>String(x.fieldNo||'')===no),progress=document.getElementById('satelliteHistoricalProgress');
  if(progress)progress.textContent='Retrieving '+no+' ('+(i+1)+' of 3)…';
  if(!record){out.push({fieldNo:no,farmer:'',status:'amber',label:'AMBER · Field not found',reason:'Demo field not present in loaded company records.',ndmi:0,radar:0,og:null,rg:null,first:'',last:'',candidates:[]});continue}
  try{const q=await satelliteEvidenceForField(record,'2025-11-01','2026-04-30',new Date().toISOString());out.push(satHistClassify({...q,farmer:record.name||''}))}
  catch(e){out.push({fieldNo:no,farmer:record.name||'',status:'amber',label:'AMBER · Retrieval failed',reason:e?.message||'Satellite retrieval failed.',ndmi:0,radar:0,og:null,rg:null,first:'',last:'',candidates:[]})}
 }
 satelliteOnlyHistoricalResults=out;satelliteOnlyHistoricalRunning=false;renderManager();
}
function satelliteOnlyDownloadHistoricalTest(){
 const a=satelliteOnlyHistoricalResults;if(!a?.length)return;
 const h=['Field','Farmer (demo)','Status','Reason','NDMI count','Radar count','Max NDMI gap days','Max radar gap days','First optical date','Last optical date','Candidate dates'];
 const rows=a.map(x=>[x.fieldNo,x.farmer,x.label,x.reason,x.ndmi,x.radar,x.og,x.rg,x.first,x.last,x.candidates.map(y=>y.from+' to '+y.to+'; radar '+y.radar).join('; ')]);
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\uFEFF'+[h,...rows].map(r=>r.map(q).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='rabi-2025-26-demo-satellite-test.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
