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
  document.getElementById('satelliteBhuvanTemplate')?.addEventListener('click', satelliteOnlyDownloadBhuvanTemplate);
  document.getElementById('satelliteHistoricalMoistureCsv')?.addEventListener('change', satelliteOnlyImportBhuvanFile);
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
let satelliteOnlyBhuvanDailyByField={},satelliteOnlyBhuvanImport=null;
const SAT_HIST_FIELDS=['WH-SYN-001','WH-SYN-004','WH-SYN-050'];
function satHistMedian(a){const x=a.filter(Number.isFinite).slice().sort((p,q)=>p-q);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function satHistScale(a){const m=satHistMedian(a);return m===null?null:(satHistMedian(a.map(x=>Math.abs(x-m)))*1.4826)}
function satHistGap(a){let g=0;for(let i=1;i<a.length;i++)g=Math.max(g,(Date.parse(a[i].date+'T00:00:00Z')-Date.parse(a[i-1].date+'T00:00:00Z'))/86400000);return a.length>1?g:null}
function satHistCsvParse(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else if(ch!=='\r')cell+=ch}
 if(quoted)throw new Error('The CSV contains an unclosed quoted value.');
 if(cell.length||row.length){row.push(cell);rows.push(row)}
 return rows.filter(r=>r.some(v=>String(v).trim()!==''));
}
function satHistImportBhuvanCsv(fileText,fileName){
 const rows=satHistCsvParse(fileText);if(rows.length<2)throw new Error('The CSV must contain a header and at least one daily record.');
 const norm=v=>String(v||'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[\s-]+/g,'_');
 const headers=rows[0].map(norm),col=(...names)=>{for(const n of names){const i=headers.indexOf(n);if(i>=0)return i}return -1};
 const fi=col('field_no','field','field_id'),di=col('date','observation_date'),mi=col('root_zone_moisture_m3_m3','root_zone_moisture','rootzone_moisture_m3_m3'),ti=col('dry_threshold_m3_m3','dry_threshold','root_zone_dry_threshold'),wi=col('surface_water_status','water_status');
 if(fi<0||di<0||mi<0&&wi<0)throw new Error('Required columns: field_no, date, and root_zone_moisture_m3_m3 (with dry_threshold_m3_m3) or surface_water_status.');
 const grouped={};let accepted=0,ignored=0;
 for(let i=1;i<rows.length;i++){
  const cells=rows[i],fieldNo=String(cells[fi]||'').trim(),date=String(cells[di]||'').trim().slice(0,10);
  if(!SAT_HIST_FIELDS.includes(fieldNo)){ignored++;continue}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<'2025-11-01'||date>'2026-04-30'){ignored++;continue}
  const rawMoisture=mi>=0?String(cells[mi]??'').trim():'',rawThreshold=ti>=0?String(cells[ti]??'').trim():'';
  const moisture=rawMoisture===''?null:Number(rawMoisture),threshold=rawThreshold===''?null:Number(rawThreshold);
  if(moisture!==null&&(!Number.isFinite(moisture)||moisture<0||moisture>1))throw new Error('Invalid root-zone moisture value on CSV row '+(i+1)+'. Values must be m³/m³ between 0 and 1.');
  if(threshold!==null&&(!Number.isFinite(threshold)||threshold<0||threshold>1))throw new Error('Invalid dry threshold on CSV row '+(i+1)+'. Values must be m³/m³ between 0 and 1.');
  const water=wi>=0?norm(cells[wi]):'';
  let dry=null;
  if(['wet','ponded','standing_water','water_present','inundated'].includes(water))dry=false;
  else if(['dry','no_water','not_ponded','non_ponded','no_standing_water'].includes(water))dry=true;
  else if(moisture!==null&&threshold!==null)dry=moisture<=threshold;
  if(!grouped[fieldNo])grouped[fieldNo]=[];
  if(grouped[fieldNo].some(x=>x.date===date))throw new Error('Duplicate field/date record: '+fieldNo+' / '+date+'. Resolve duplicates before importing.');
  grouped[fieldNo].push({date,rootZoneMoisture:moisture,dryThreshold:threshold,surfaceWaterStatus:water||'',dry});
  accepted++;
 }
 if(!accepted)throw new Error('No valid records found for the three demo fields in 1 Nov 2025–30 Apr 2026.');
 Object.keys(grouped).forEach(k=>grouped[k].sort((a,b)=>a.date.localeCompare(b.date)));
 satelliteOnlyBhuvanDailyByField=grouped;
 satelliteOnlyBhuvanImport={fileName:fileName||'Bhuvan daily moisture CSV',importedAt:new Date().toISOString(),accepted,ignored};
 satelliteOnlyHistoricalResults=(satelliteOnlyHistoricalResults||[]).map(x=>satHistClassify({...x,bhuvanDaily:grouped[x.fieldNo]||[]}));
}
function satHistClassify(f){
 const s=(f.observationSeries||f.series||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))),o=s.filter(x=>x.ndmi!==null&&Number.isFinite(Number(x.ndmi))),r=s.filter(x=>(x.vv!==null&&Number.isFinite(Number(x.vv)))||(x.vh!==null&&Number.isFinite(Number(x.vh))));
 const daily=(f.bhuvanDaily||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)),dates=new Map(daily.map(x=>[x.date,x])),runs=[];let run=[];
 for(let t=Date.parse('2025-11-01T00:00:00Z');t<=Date.parse('2026-04-30T00:00:00Z');t+=86400000){
  const date=new Date(t).toISOString().slice(0,10),item=dates.get(date);
  if(item&&item.dry===true)run.push(date);
  else{if(run.length>=7)runs.push({from:run[0],to:run[run.length-1],days:run.length});run=[]}
 }
 if(run.length>=7)runs.push({from:run[0],to:run[run.length-1],days:run.length});
 const totalDays=181,classifiedDays=daily.filter(x=>x.dry===true||x.dry===false).length,completeCoverage=classifiedDays===totalDays&&daily.length===totalDays;
 const status=runs.length?'green':completeCoverage?'red':'amber';
 const label=status==='green'?'GREEN · 7-day dry-spell trigger met':status==='red'?'RED · No 7-day dry spell detected':'AMBER · Insufficient daily moisture evidence';
 const reason=status==='green'?'At least seven consecutive daily records meet the supplied field-specific root-zone moisture threshold or explicitly report a non-ponded condition. One qualifying spell is counted as the single event trigger; any further spells are shown for review. This is a satellite/model evidence candidate, not proof of a physical drainage operation.':status==='red'?'Daily condition evidence covers every day of the 181-day monitoring window, with no seven-day consecutive dry spell.':'A complete daily dry/non-dry series is not available. Sentinel-1/2 acquisition intervals and NDMI alone cannot establish seven consecutive dry days. Import daily Bhuvan/ISRO moisture evidence with a field-specific dry threshold, or explicit daily surface-water status.';
 const og=satHistGap(o),rg=satHistGap(r),firstRun=runs[0]||null,event=firstRun?{from:firstRun.from,to:new Date(Date.parse(firstRun.from+'T00:00:00Z')+6*86400000).toISOString().slice(0,10),days:7,spellEnd:firstRun.to,spellDays:firstRun.days}:null;
 return {fieldNo:f.fieldNo,farmer:f.farmer||'',status,label,reason,ndmi:o.length,radar:r.length,og,rg,first:o[0]?.date||'',last:o[o.length-1]?.date||'',candidates:runs,event,rootZoneCount:daily.filter(x=>Number.isFinite(x.rootZoneMoisture)).length,dryDays:daily.filter(x=>x.dry===true).length,classifiedDays,completeCoverage,rootZoneFirst:daily[0]?.date||'',rootZoneLast:daily[daily.length-1]?.date||'',series:s,bhuvanDaily:daily};
}

function satelliteOnlyHistoricalPanel(){
 const a=satelliteOnlyHistoricalResults||[],cls={green:'sat-historical-green',red:'sat-historical-red',amber:'sat-historical-amber'};
 const cards=a.map(x=>'<article class="sat-historical-card '+cls[x.status]+'"><div class="sat-historical-card-head"><b>'+satelliteOnlyEsc(x.fieldNo)+'</b><span>'+satelliteOnlyEsc(x.label)+'</span></div><small>'+satelliteOnlyEsc(x.farmer)+'</small><p>'+satelliteOnlyEsc(x.reason)+'</p><div class="sat-historical-stats"><span>NDMI observations <b>'+x.ndmi+'</b></span><span>Radar observations <b>'+x.radar+'</b></span><span>Daily moisture records <b>'+x.rootZoneCount+'</b></span><span>Consecutive dry days <b>'+x.dryDays+'</b></span></div><p>Optical: '+satelliteOnlyDate(x.first)+' to '+satelliteOnlyDate(x.last)+'</p>'+(x.event?'<p><b>Single-event trigger:</b> '+satelliteOnlyDate(x.event.from)+' → '+satelliteOnlyDate(x.event.to)+' ('+x.event.days+' consecutive days; dry spell continued through '+satelliteOnlyDate(x.event.spellEnd)+')</p>':'')+(x.candidates.length>1?'<p>Additional dry spells for review: '+x.candidates.slice(1).map(y=>satelliteOnlyDate(y.from)+' → '+satelliteOnlyDate(y.to)+' ('+y.days+' days)').join('; ')+'</p>':'')+(x.rootZoneCount?'<p>Bhuvan daily series: '+satelliteOnlyDate(x.rootZoneFirst)+' to '+satelliteOnlyDate(x.rootZoneLast)+' · classified days '+x.classifiedDays+'/181</p>':'')+'</article>').join('');
 const imported=satelliteOnlyBhuvanImport?'Loaded '+satelliteOnlyBhuvanImport.accepted+' daily rows from '+satelliteOnlyBhuvanImport.fileName+' · '+satelliteOnlyBhuvanImport.ignored+' rows outside scope ignored.':'No daily Bhuvan moisture file imported.';
 return '<section class="panel sat-historical-panel"><div class="panel-head"><div><p class="eyebrow">HISTORICAL RETRIEVAL · DEMO BOUNDARIES ONLY</p><h2>Rabi 2025–26 · Seven-day dry-spell test</h2><p class="muted">WH-SYN-001, WH-SYN-004 and WH-SYN-050 · 1 Nov 2025 to 30 Apr 2026</p></div><span class="status-chip planned">EXPLORATORY TEST</span></div><div class="sat-evidence-note"><b>Seven-day event rule</b><p>GREEN requires at least seven consecutive daily dry/non-ponded records. For root-zone moisture, each daily value is compared with the field-specific dry threshold supplied in the CSV. RED is permitted only when all 181 days have classified daily evidence and no seven-day spell exists. Otherwise the result is AMBER. Sparse Sentinel-1/2 acquisitions and NDMI alone are not treated as proof of seven consecutive dry days. One qualifying spell is counted as the single event trigger; additional spells are shown for review. This is not a confirmed drainage operation or VM0051 compliance finding.</p></div><div class="sat-historical-controls"><button type="button" class="primary" id="satelliteHistoricalRun" '+(satelliteOnlyHistoricalRunning?'disabled':'')+'>'+(satelliteOnlyHistoricalRunning?'Retrieving…':'Retrieve Sentinel-1 and Sentinel-2 for the three demo fields')+'</button><button type="button" class="outline" id="satelliteBhuvanTemplate">Download Bhuvan CSV template</button><label class="outline sat-moisture-upload-label" for="satelliteHistoricalMoistureCsv">Import daily Bhuvan moisture CSV</label><input type="file" id="satelliteHistoricalMoistureCsv" accept=".csv,text/csv" class="sat-moisture-file-input">'+(a.length?'<button type="button" class="outline" data-satellite-historical-download>Download CSV report</button>':'')+'</div><p id="satelliteHistoricalProgress" class="muted">'+(satelliteOnlyHistoricalRunning?'Retrieving historical Sentinel-1 and Sentinel-2 observations…':a.length?'Results from the latest browser-session test.':'No historical test has been run yet.')+'</p><p class="muted sat-bhuvan-import-status">'+satelliteOnlyEsc(imported)+'</p><p class="sat-bhuvan-instructions">CSV columns: field_no,date,root_zone_moisture_m3_m3,dry_threshold_m3_m3. One row per field per day. Moisture and threshold must be volumetric m³/m³ values from 0 to 1. A field-specific threshold must be established by the project agronomist using soil/crop context; the platform does not invent one. Optional surface_water_status accepts dry / not_ponded or wet / ponded. Obtain daily root-zone products from the registered Bhuvan–NHP service and prepare field/date rows from the source grid. NHP is a coarse, model-derived grid, not a field sensor.</p>'+(a.length?'<div class="sat-historical-results">'+cards+'</div>':'')+'</section>';
}

async function satelliteOnlyRunHistoricalTest(){
 if(satelliteOnlyHistoricalRunning)return;
 satelliteOnlyHistoricalRunning=true;satelliteOnlyHistoricalResults=null;renderManager();
 const out=[];
 for(let i=0;i<SAT_HIST_FIELDS.length;i++){
  const no=SAT_HIST_FIELDS[i],record=(records||[]).find(x=>String(x.fieldNo||'')===no),progress=document.getElementById('satelliteHistoricalProgress');
  if(progress)progress.textContent='Retrieving '+no+' ('+(i+1)+' of 3)…';
  if(!record){out.push(satHistClassify({fieldNo:no,farmer:'',observationSeries:[],bhuvanDaily:satelliteOnlyBhuvanDailyByField[no]||[]}));continue}
  try{const q=await satelliteEvidenceForField(record,'2025-11-01','2026-04-30',new Date().toISOString());out.push(satHistClassify({...q,farmer:record.name||'',bhuvanDaily:satelliteOnlyBhuvanDailyByField[no]||[]}))}
  catch(e){out.push(satHistClassify({fieldNo:no,farmer:record.name||'',observationSeries:[],bhuvanDaily:satelliteOnlyBhuvanDailyByField[no]||[]}));out[out.length-1].reason='Satellite retrieval failed: '+(e?.message||'Request failed.')+' Daily moisture evidence is assessed separately.'}
 }
 satelliteOnlyHistoricalResults=out;satelliteOnlyHistoricalRunning=false;renderManager();
}
function satelliteOnlyDownloadHistoricalTest(){
 const a=satelliteOnlyHistoricalResults;if(!a?.length)return;
 const h=['Field','Farmer (demo)','Status','Reason','NDMI count','Radar count','Daily moisture records','Classified days','Dry days','Longest dry spell days','Single-event start','Single-event trigger date','Full dry-spell end','Other qualifying dry spells','First optical date','Last optical date'];
 const rows=a.map(x=>[x.fieldNo,x.farmer,x.label,x.reason,x.ndmi,x.radar,x.rootZoneCount,x.classifiedDays,x.dryDays,x.candidates.reduce((m,y)=>Math.max(m,y.days),0),x.event?.from||'',x.event?.to||'',x.event?.spellEnd||'',x.candidates.slice(1).map(y=>y.from+' to '+y.to+' ('+y.days+' days)').join('; '),x.first,x.last]);
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"',csv='\uFEFF'+[h,...rows].map(r=>r.map(q).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='rabi-2025-26-seven-day-dry-spell-test.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function satelliteOnlyDownloadBhuvanTemplate(){
 const headers=['field_no','date','root_zone_moisture_m3_m3','dry_threshold_m3_m3','surface_water_status'];
 const csv='\uFEFF'+headers.join(',')+'\r\n';
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='bhuvan-daily-root-zone-moisture-template.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function satelliteOnlyImportBhuvanFile(event){
 const file=event.target.files?.[0];if(!file)return;
 try{
  satHistImportBhuvanCsv(await file.text(),file.name);
  if(satelliteOnlyHistoricalResults?.length)notify('Daily moisture data imported and the three field classifications recalculated.');
  else notify('Daily moisture data imported. Run the three-field historical test to classify the fields.');
  renderManager();
 }catch(error){notify(error?.message||'Could not import the daily moisture CSV.')}
 finally{event.target.value=''}
}

