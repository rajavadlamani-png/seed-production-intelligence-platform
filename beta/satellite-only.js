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
    .finally(() => { satelliteOnlyLoading = false; if (typeof renderManager === 'function') renderManager(); });
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
  return '<div class="page-heading"><div><p class="eyebrow">FIELD MOISTURE MONITORING</p><h1>Single Drainage Event</h1><p class="muted">A focused field-level view using the agreed Option B root-zone VWC rule.</p></div></div>'+rootZoneVwcPocPage();
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
  document.getElementById('satelliteHistoricalWeather')?.addEventListener('click', satelliteOnlyRetrieveWeather);
  document.querySelector('[data-satellite-environment-download]')?.addEventListener('click', satelliteOnlyDownloadEnvironmentalEvidence);
  document.querySelector('[data-satellite-environment-print]')?.addEventListener('click', () => window.print());
  document.querySelector('[data-satellite-historical-download]')?.addEventListener('click', satelliteOnlyDownloadHistoricalTest);
  bindRootZoneVwcPocPage();
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
 return '<section class="panel sat-historical-panel"><div class="panel-head"><div><p class="eyebrow">HISTORICAL RETRIEVAL · DEMO BOUNDARIES ONLY</p><h2>Rabi 2025–26 · Seven-day dry-spell test</h2><p class="muted">WH-SYN-001, WH-SYN-004 and WH-SYN-050 · 1 Nov 2025 to 30 Apr 2026</p></div><span class="status-chip planned">EXPLORATORY TEST</span></div><div class="sat-evidence-note"><b>Seven-day event rule</b><p>GREEN requires at least seven consecutive daily dry/non-ponded records. For root-zone moisture, each daily value is compared with the field-specific dry threshold supplied in the CSV. RED is permitted only when all 181 days have classified daily evidence and no seven-day spell exists. Otherwise the result is AMBER. Sparse Sentinel-1/2 acquisitions and NDMI alone are not treated as proof of seven consecutive dry days. One qualifying spell is counted as the single event trigger; additional spells are shown for review. This is not a confirmed drainage operation or VM0051 compliance finding.</p></div><div class="sat-historical-controls"><button type="button" class="primary" id="satelliteHistoricalRun" '+(satelliteOnlyHistoricalRunning?'disabled':'')+'>'+(satelliteOnlyHistoricalRunning?'Retrieving…':'Retrieve Sentinel-1 and Sentinel-2 for the three demo fields')+'</button><button type="button" class="outline" id="satelliteBhuvanTemplate">Download Bhuvan CSV template</button><label class="outline sat-moisture-upload-label" for="satelliteHistoricalMoistureCsv">Import daily Bhuvan moisture CSV</label><input type="file" id="satelliteHistoricalMoistureCsv" accept=".csv,text/csv" class="sat-moisture-file-input">'+(a.length?'<button type="button" class="outline" data-satellite-historical-download>Download CSV report</button>':'')+'</div><p id="satelliteHistoricalProgress" class="muted">'+(satelliteOnlyHistoricalRunning?'Retrieving historical Sentinel-1 and Sentinel-2 observations…':a.length?'Results from the latest browser-session test.':'No historical test has been run yet.')+'</p><p class="muted sat-bhuvan-import-status">'+satelliteOnlyEsc(imported)+'</p><p class="sat-bhuvan-instructions">CSV columns: field_no,date,root_zone_moisture_m3_m3,dry_threshold_m3_m3. One row per field per day. Moisture and threshold must be volumetric m³/m³ values from 0 to 1. A field-specific threshold must be established by the project agronomist using soil/crop context; the platform does not invent one. Optional surface_water_status accepts dry / not_ponded or wet / ponded. Obtain daily root-zone products from the registered Bhuvan–NHP service and prepare field/date rows from the source grid. NHP is a coarse, model-derived grid, not a field sensor.</p>'+(a.length?'<div class="sat-historical-results">'+cards+'</div>':'')+'</section>'+satelliteOnlyEnvironmentalPanel();
}


let satelliteOnlyWeatherByField = {};
let satelliteOnlyWeatherRunning = false;
const SAT_HIST_WEATHER_SOURCE = 'Open-Meteo Historical Weather API · ERA5-Land reanalysis';
function satHistBoundaryPointMean(record) {
 const points=Array.isArray(record?.boundaryPoints)?record.boundaryPoints:[];
 const valid=points.filter(p=>Number.isFinite(Number(p?.lat))&&Number.isFinite(Number(p?.lon)));
 if(!valid.length)return null;
 return {latitude:valid.reduce((sum,p)=>sum+Number(p.lat),0)/valid.length,longitude:valid.reduce((sum,p)=>sum+Number(p.lon),0)/valid.length,pointCount:valid.length};
}
function satHistLongestZeroRainRun(rows) {
 let current=[],best=null;
 for(const row of rows||[]){
  if(Number.isFinite(row.precipitation)&&row.precipitation===0){current.push(row.date)}
  else{if(current.length&&(!best||current.length>best.days))best={from:current[0],to:current[current.length-1],days:current.length};current=[]}
 }
 if(current.length&&(!best||current.length>best.days))best={from:current[0],to:current[current.length-1],days:current.length};
 return best;
}
function satHistWeatherSummary(weather) {
 const rows=weather?.daily||[];
 const vals=key=>rows.map(x=>x[key]).filter(v=>Number.isFinite(v));
 const sum=a=>a.length?a.reduce((n,v)=>n+v,0):null;
 const avg=a=>a.length?sum(a)/a.length:null;
 const rain=vals('precipitation'),soil=vals('soilMoisture'),et0=vals('et0'),temp=vals('temperature');
 return {days:rows.length,rainDays:rain.filter(v=>v>0).length,zeroRainDays:rain.filter(v=>v===0).length,totalRain:sum(rain),meanSoilMoisture:avg(soil),minSoilMoisture:soil.length?Math.min(...soil):null,maxSoilMoisture:soil.length?Math.max(...soil):null,totalEt0:sum(et0),meanTemperature:avg(temp),longestZeroRainRun:satHistLongestZeroRainRun(rows)};
}
function satHistWeatherNumber(value,digits) {
 return value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'—':Number(value).toFixed(digits===undefined?2:digits);
}
async function satelliteOnlyRetrieveWeather() {
 if(satelliteOnlyWeatherRunning)return;
 satelliteOnlyWeatherRunning=true;
 satelliteOnlyWeatherByField={};
 renderManager();
 for(let i=0;i<SAT_HIST_FIELDS.length;i++){
  const fieldNo=SAT_HIST_FIELDS[i],record=(records||[]).find(x=>String(x.fieldNo||'')===fieldNo);
  if(!record){satelliteOnlyWeatherByField[fieldNo]={error:'Demo field record was not found.'};continue}
  const point=satHistBoundaryPointMean(record);
  if(!point){satelliteOnlyWeatherByField[fieldNo]={error:'No valid GPS boundary points are available for this field.'};continue}
  try{
   const params=new URLSearchParams({
    latitude:point.latitude.toFixed(6),longitude:point.longitude.toFixed(6),
    start_date:'2025-11-01',end_date:'2026-04-30',
    daily:'precipitation_sum,temperature_2m_mean,et0_fao_evapotranspiration,soil_moisture_0_to_100cm_mean',
    timezone:'Asia/Kolkata',models:'era5_land',precipitation_unit:'mm',temperature_unit:'celsius'
   });
   const sourceUrl='https://archive-api.open-meteo.com/v1/archive?'+params.toString();
   const response=await fetch(sourceUrl,{headers:{Accept:'application/json'}});
   if(!response.ok)throw new Error('Weather provider returned HTTP '+response.status+'.');
   const payload=await response.json(),daily=payload.daily||{},times=Array.isArray(daily.time)?daily.time:[];
   if(!times.length)throw new Error('The weather provider returned no daily records for the requested period.');
   const numeric=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
   const rows=times.map((date,index)=>({
    date,
    precipitation:numeric(daily.precipitation_sum?.[index]),
    temperature:numeric(daily.temperature_2m_mean?.[index]),
    et0:numeric(daily.et0_fao_evapotranspiration?.[index]),
    soilMoisture:numeric(daily.soil_moisture_0_to_100cm_mean?.[index])
   }));
   satelliteOnlyWeatherByField[fieldNo]={
    fieldNo,farmer:record.name||'',village:record.village||'',district:record.district||'',
    requestedLatitude:point.latitude,requestedLongitude:point.longitude,boundaryPointCount:point.pointCount,
    resolvedLatitude:payload.latitude??null,resolvedLongitude:payload.longitude??null,elevation:payload.elevation??null,
    timezone:payload.timezone||'Asia/Kolkata',model:'ERA5-Land',source:SAT_HIST_WEATHER_SOURCE,
    sourceUrl:'https://open-meteo.com/en/docs/historical-weather-api',license:'CC BY 4.0; verify commercial-use terms before production deployment',
    units:daily&&payload.daily_units?payload.daily_units:{},daily:rows,summary:satHistWeatherSummary({daily:rows})
   };
  }catch(error){satelliteOnlyWeatherByField[fieldNo]={fieldNo,error:error?.message||'Weather retrieval failed.'}}
 }
 satelliteOnlyWeatherRunning=false;
 renderManager();
}
function satelliteOnlyEnvironmentalPanel() {
 const loaded=Object.keys(satelliteOnlyWeatherByField).length>0;
 const cards=SAT_HIST_FIELDS.map(fieldNo=>{
  const w=satelliteOnlyWeatherByField[fieldNo];
  if(!w)return '<article class="sat-env-card"><b>'+satelliteOnlyEsc(fieldNo)+'</b><p>Daily weather not retrieved yet.</p></article>';
  if(w.error)return '<article class="sat-env-card sat-env-error"><b>'+satelliteOnlyEsc(fieldNo)+'</b><p>'+satelliteOnlyEsc(w.error)+'</p></article>';
  const s=w.summary||satHistWeatherSummary(w);
  const rainRun=s.longestZeroRainRun?satelliteOnlyDate(s.longestZeroRainRun.from)+' to '+satelliteOnlyDate(s.longestZeroRainRun.to)+' ('+s.longestZeroRainRun.days+' days)':'No zero-precipitation run identified';
  const dailyRows=w.daily.map(row=>'<tr><td>'+satelliteOnlyEsc(row.date)+'</td><td>'+satHistWeatherNumber(row.precipitation)+'</td><td>'+satHistWeatherNumber(row.soilMoisture,3)+'</td><td>'+satHistWeatherNumber(row.et0)+'</td><td>'+satHistWeatherNumber(row.temperature)+'</td></tr>').join('');
  return '<article class="sat-env-card"><div class="sat-env-head"><b>'+satelliteOnlyEsc(fieldNo)+'</b><span>'+satelliteOnlyEsc(w.farmer)+'</span></div><p>'+satelliteOnlyEsc(w.village)+(w.district?', '+satelliteOnlyEsc(w.district):'')+'</p><div class="sat-env-stats"><span>Daily records<b>'+s.days+'/181</b></span><span>Total precipitation<b>'+satHistWeatherNumber(s.totalRain)+' mm</b></span><span>Zero-rain days<b>'+s.zeroRainDays+'</b></span><span>Longest zero-rain spell<b>'+satelliteOnlyEsc(rainRun)+'</b></span><span>Mean soil moisture, 0–100 cm<b>'+satHistWeatherNumber(s.meanSoilMoisture,3)+' m³/m³</b></span><span>Total reference ET₀<b>'+satHistWeatherNumber(s.totalEt0)+' mm</b></span></div><p class="sat-env-coords">Boundary-point mean: '+w.requestedLatitude.toFixed(5)+', '+w.requestedLongitude.toFixed(5)+' · Provider grid: '+satelliteOnlyEsc(w.resolvedLatitude)+', '+satelliteOnlyEsc(w.resolvedLongitude)+' · '+w.boundaryPointCount+' boundary points</p><details class="sat-env-details"><summary>View daily weather and modelled soil-moisture data ('+w.daily.length+' rows)</summary><div class="table-wrap"><table class="satellite-only-table"><thead><tr><th>Date</th><th>Precipitation (mm)</th><th>Soil moisture 0–100 cm (m³/m³)</th><th>ET₀ (mm)</th><th>Mean temp (°C)</th></tr></thead><tbody>'+dailyRows+'</tbody></table></div></details><p class="sat-env-source">Source: '+satelliteOnlyEsc(w.source)+'. Reanalysis/model estimates, not field measurements. Coordinates are derived from the stored DEMO boundary; village/district alignment has not been independently verified.</p></article>';
 }).join('');
 return '<section class="panel sat-env-panel"><div class="panel-head"><div><p class="eyebrow">ENVIRONMENTAL CORROBORATION · DEMO BOUNDARIES</p><h2>Daily weather and modelled soil-moisture evidence</h2><p class="muted">Historical period: 1 Nov 2025 to 30 Apr 2026 · ERA5-Land reanalysis</p></div><span class="status-chip planned">SUPPORTING EVIDENCE</span></div><div class="sat-evidence-note"><b>How to interpret this source</b><p>Daily precipitation, reference evapotranspiration and modelled 0–100 cm soil moisture are retrieved from Open-Meteo Historical Weather API using the ERA5-Land reanalysis. Zero-precipitation runs indicate rain-free weather periods only; they do not prove that a field was dry or drained. Modelled soil moisture is displayed as a separate supporting series and is not used to change the seven-day drainage trigger classification. The location is the mean of the stored boundary points and must be checked against the actual field location.</p></div><div class="sat-historical-controls"><button type="button" class="primary" id="satelliteHistoricalWeather" '+(satelliteOnlyWeatherRunning?'disabled':'')+'>'+(satelliteOnlyWeatherRunning?'Retrieving daily weather…':'Retrieve daily weather and modelled soil moisture')+'</button>'+(loaded?'<button type="button" class="outline" data-satellite-environment-download>Download combined evidence CSV</button><button type="button" class="outline" data-satellite-environment-print>Print / Save evidence PDF</button>':'')+'</div><p class="sat-env-status">'+(satelliteOnlyWeatherRunning?'Retrieving historical daily weather for the three demo boundaries…':loaded?'Weather retrieval results from this browser session.':'No historical weather retrieval has been run yet.')+'</p>'+(loaded?'<div class="sat-env-grid">'+cards+'</div>':'')+'<p class="sat-env-license">Attribution: Open-Meteo Historical Weather API, ERA5-Land reanalysis (CC BY 4.0). Confirm the provider’s current commercial-use terms before using this feed in a production commercial service. This report is exploratory supporting evidence, not an auditor acceptance or VM0051 compliance determination.</p></section>';
}
function satelliteOnlyDownloadEnvironmentalEvidence() {
 const headers=['Field','Farmer (demo)','Village','District','Date','Precipitation (mm)','ERA5-Land soil moisture 0-100 cm (m3/m3)','Reference ET0 (mm)','Mean temperature (C)','Bhuvan root-zone moisture (m3/m3)','Bhuvan dry status','NDMI','Sentinel-1 VV','Sentinel-1 VH','Boundary mean latitude','Boundary mean longitude','Weather provider grid latitude','Weather provider grid longitude','Weather model','Source'];
 const rows=[];
 for(const fieldNo of SAT_HIST_FIELDS){
  const w=satelliteOnlyWeatherByField[fieldNo];if(!w||w.error)continue;
  const historical=(satelliteOnlyHistoricalResults||[]).find(x=>x.fieldNo===fieldNo);
  const optical=new Map((historical?.series||[]).map(x=>[x.date,x]));
  const moisture=new Map((satelliteOnlyBhuvanDailyByField[fieldNo]||[]).map(x=>[x.date,x]));
  for(const day of w.daily){
   const sat=optical.get(day.date)||{},b=moisture.get(day.date)||{};
   rows.push([fieldNo,w.farmer,w.village,w.district,day.date,day.precipitation,day.soilMoisture,day.et0,day.temperature,b.rootZoneMoisture??'',b.dry===true?'dry':b.dry===false?'non-dry':'',sat.ndmi??'',sat.vv??'',sat.vh??'',w.requestedLatitude,w.requestedLongitude,w.resolvedLatitude??'',w.resolvedLongitude??'',w.model,w.source]);
  }
 }
 const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
 const csv='\uFEFF'+[headers,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
 link.href=url;link.download='rabi-2025-26-environmental-evidence.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
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

