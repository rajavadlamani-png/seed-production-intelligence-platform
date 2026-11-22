// Single Drainage Event: Sentinel-1 estimates aligned to Open-Meteo historical soil-moisture model output.
// These are model-aligned estimates, not ground-truth-calibrated 0–30 cm VWC measurements.
let sdeAlignedState = { fieldNo: '', from: '', to: '', loading: false, error: '', result: null };

function sdeAlignedMappedFields() {
  const source = typeof scoped === 'function' ? scoped() : (records || []);
  return (source || []).filter(r => Array.isArray(r.boundaryPoints) && r.boundaryPoints.length >= 3 && r.fieldNo);
}
function sdeAlignedDateBounds(fieldNo) {
  const now = new Date();
  const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const fromDate = new Date(Date.parse(to + 'T00:00:00Z') - 90 * 86400000);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}
function sdeAlignedSatelliteRows(fieldNo, from, to, runs = satelliteOnlyRuns) {
  const latest = new Map();
  (runs || []).forEach(run => {
    const generated = String(run.generated_at || run.created_at || '');
    (satelliteOnlyRunFields(run) || []).filter(f => String(f.fieldNo || '') === String(fieldNo)).forEach(field => {
      (Array.isArray(field.observationSeries) ? field.observationSeries : []).forEach(obs => {
        const date = String(obs.date || obs.interval?.to || obs.interval?.from || '').slice(0, 10);
        const vv = Number(obs.vv), vh = Number(obs.vh);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < from || date > to ||
            obs.vv === null || obs.vv === undefined || obs.vv === '' ||
            obs.vh === null || obs.vh === undefined || obs.vh === '' ||
            !Number.isFinite(vv) || !Number.isFinite(vh)) return;
        const old = latest.get(date);
        if (!old || generated >= old.generated) latest.set(date, { fieldNo: String(fieldNo), date, vv, vh, generated });
      });
    });
  });
  return [...latest.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function sdeAlignedArchiveUrl(point, from, to) {
  const params = new URLSearchParams({
    latitude: Number(point.lat).toFixed(4),
    longitude: Number(point.lon).toFixed(4),
    start_date: from,
    end_date: to,
    daily: 'soil_moisture_7_to_28cm_mean',
    models: 'era5_land',
    timezone: 'auto'
  });
  return 'https://archive-api.open-meteo.com/v1/archive?' + params.toString();
}
async function sdeAlignedFetchReference(field, from, to) {
  const point = typeof soilCoordinateForRecord === 'function' ? soilCoordinateForRecord(field) : null;
  if (!point) throw new Error('Field ' + field.fieldNo + ' has no usable GPS boundary or coordinate.');
  const response = await fetch(sdeAlignedArchiveUrl(point, from, to));
  if (!response.ok) throw new Error('Open-Meteo historical soil-moisture data unavailable for ' + field.fieldNo + ' (' + response.status + ').');
  const data = await response.json();
  const daily = data?.daily || {}, dates = daily.time || [], values = daily.soil_moisture_7_to_28cm_mean || [];
  if (!dates.length || dates.length !== values.length) throw new Error('Open-Meteo returned no complete 7–28 cm daily soil-moisture series for ' + field.fieldNo + '.');
  const reference = new Map();
  dates.forEach((date, i) => {
    const value = Number(values[i]);
    if (values[i] !== null && values[i] !== undefined && Number.isFinite(value) && value >= 0 && value <= 1) reference.set(String(date).slice(0, 10), value);
  });
  return { fieldNo: String(field.fieldNo), reference, model: 'Open-Meteo ERA5-Land reanalysis', grid: { latitude: data.latitude, longitude: data.longitude, elevation: data.elevation }, pointMethod: point.method || 'saved field coordinate' };
}
function sdeAlignedMatchReference(satelliteRows, reference, toleranceDays = 2) {
  const pairs = [];
  satelliteRows.forEach(row => {
    let bestDate = '', bestGap = Infinity;
    reference.forEach((value, date) => {
      const gap = rootVwcDaysBetween(row.date, date);
      if (gap < bestGap) { bestGap = gap; bestDate = date; }
    });
    if (bestDate && bestGap <= toleranceDays) pairs.push({ ...row, referenceDate: bestDate, gapDays: bestGap, targetVwc: reference.get(bestDate) });
  });
  return pairs;
}
function sdeAlignedSolve(matrix, vector) {
  const n = vector.length, a = matrix.map((row, i) => row.slice().concat([vector[i]]));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('Sentinel-1 calibration matrix is singular; the available VV/VH observations do not contain enough variation.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map(row => row[n]);
}
function sdeAlignedFitModel(pairs, alpha = 1) {
  if (!Array.isArray(pairs) || pairs.length < 8) throw new Error('At least 8 matched Sentinel-1 / Open-Meteo observations are required to fit the provisional alignment model; found ' + (pairs || []).length + '.');
  if (new Set(pairs.map(x => x.fieldNo)).size < 2) throw new Error('Matched observations from at least 2 mapped fields are required for the provisional cross-field alignment model.');
  const keys = ['vv', 'vh'], means = {}, scales = {};
  keys.forEach(key => {
    means[key] = pairs.reduce((sum, row) => sum + row[key], 0) / pairs.length;
    const variance = pairs.reduce((sum, row) => sum + (row[key] - means[key]) ** 2, 0) / pairs.length;
    scales[key] = Math.sqrt(variance) || 1;
  });
  const p = keys.length + 1, xtx = Array.from({ length: p }, () => Array(p).fill(0)), xty = Array(p).fill(0);
  pairs.forEach(row => {
    const x = [1, ...keys.map(key => (row[key] - means[key]) / scales[key])];
    for (let i = 0; i < p; i++) {
      xty[i] += x[i] * row.targetVwc;
      for (let j = 0; j < p; j++) xtx[i][j] += x[i] * x[j];
    }
  });
  for (let i = 1; i < p; i++) xtx[i][i] += alpha;
  const model = { keys, means, scales, coefficients: sdeAlignedSolve(xtx, xty), alpha, trainingCount: pairs.length, trainingFields: new Set(pairs.map(x => x.fieldNo)).size };
  const residuals = pairs.map(row => sdeAlignedApplyModel(model, row) - row.targetVwc);
  model.alignmentRmse = Math.sqrt(residuals.reduce((sum, x) => sum + x * x, 0) / residuals.length);
  model.alignmentMae = residuals.reduce((sum, x) => sum + Math.abs(x), 0) / residuals.length;
  return model;
}
function sdeAlignedApplyModel(model, row) {
  const x = [1, ...model.keys.map(key => (row[key] - model.means[key]) / model.scales[key])];
  const raw = x.reduce((sum, value, i) => sum + value * model.coefficients[i], 0);
  return Math.max(0, Math.min(1, raw));
}
function sdeAlignedBuildOperationalSeries(model, satelliteRows) {
  return satelliteRows.map(row => ({
    fieldNo: row.fieldNo, date: row.date, predictedVwc: sdeAlignedApplyModel(model, row),
    modelVersion: 'S1-OPENMETEO-ALIGN-0.1', split: 'operational', windowId: 'OPEN-METEO-ERA5LAND-7-28CM'
  }));
}
async function sdeAlignedGenerate(fieldNo, from, to) {
  if (!from || !to || from > to) throw new Error('Choose a valid monitoring date range.');
  if (!supabaseClient || !activeCompanyId) throw new Error('Sign in to a company workspace to load saved VWC observations.');
  const selected = sdeAlignedMappedFields().find(field => String(field.fieldNo) === String(fieldNo));
  if (!selected) throw new Error('Select one of the mapped fields.');
  const { data, error } = await supabaseClient
    .from('field_vwc_observations')
    .select('observed_on,vwc_m3_m3,source,source_label,provider,product_or_sensor,depth_cm,source_observed_at,captured_at,model_version,quality_flag,metadata')
    .eq('company_id', activeCompanyId)
    .eq('field_record_id', selected.id)
    .gte('observed_on', from)
    .lte('observed_on', to)
    .order('observed_on', { ascending: true });
  if (error) throw new Error('Could not load stored VWC observations: ' + error.message);
  const stored = (data || []).filter(row => Number.isFinite(Number(row.vwc_m3_m3)) && Number(row.vwc_m3_m3) >= 0 && Number(row.vwc_m3_m3) <= 1);
  if (!stored.length) throw new Error('No stored VWC observations are available for this field and date range yet. The daily capture starts from its first successful run.');
  const priority = source => source === 'open_meteo_soil_moisture' ? 0 : 1;
  const selectedByDate = new Map();
  stored.forEach(row => {
    const date = String(row.observed_on).slice(0, 10);
    const old = selectedByDate.get(date);
    if (!old || priority(row.source) < priority(old.source)) selectedByDate.set(date, row);
  });
  const predictions = [...selectedByDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, row]) => ({
    fieldNo: String(fieldNo), date, predictedVwc: Number(row.vwc_m3_m3),
    source: row.source, sourceLabel: row.source_label, provider: row.provider,
    productOrSensor: row.product_or_sensor, depthCm: row.depth_cm,
    qualityFlag: row.quality_flag, modelVersion: row.model_version,
    capturedAt: row.captured_at, metadata: row.metadata || {},
    windowId: 'SOURCE-PRIORITY-VWC'
  }));
  const satellitePredictions = stored.filter(row => row.source === 'sentinel1_model_estimate').map(row => ({
    fieldNo: String(fieldNo), date: String(row.observed_on).slice(0, 10),
    predictedVwc: Number(row.vwc_m3_m3), windowId: 'SENTINEL1-MODEL-ALIGNED'
  }));
  const classified = satellitePredictions.length ? rootVwcClassifyOperational(satellitePredictions) : null;
  const fieldStatus = classified?.fields?.[0] || { event: null, evaluableCount: 0 };
  const chosenOpenMeteo = predictions.filter(row => row.source === 'open_meteo_soil_moisture').length;
  const chosenSentinel = predictions.filter(row => row.source === 'sentinel1_model_estimate').length;
  const latestCapturedAt = stored.map(row => row.captured_at).filter(Boolean).sort().slice(-1)[0] || null;
  const modelMetadata = stored.filter(row => row.source === 'sentinel1_model_estimate').map(row => row.metadata || {});
  return {
    fieldNo: String(fieldNo), from, to, predictions, fieldStatus,
    openMeteoCount: chosenOpenMeteo, sentinel1Count: chosenSentinel,
    satelliteStoredCount: satellitePredictions.length, storedCount: stored.length,
    latestCapturedAt,
    trainingPairs: Number(modelMetadata[0]?.training_pairs || 0),
    trainingFields: Number(modelMetadata[0]?.training_fields || 0),
    modelVersion: modelMetadata[0]?.model_version || stored.find(row => row.model_version)?.model_version || 'Source-priority VWC'
  };
}
function sdeAlignedChartMarkup(items) {
  const rows = (items || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return '<p class="root-vwc-muted">No VWC observations in this period.</p>';
  const L = 62, R = 28, T = 34, B = 58, H = 300;
  const vals = rows.map(x => x.predictedVwc);
  const times = rows.map(x => Date.parse(x.date + 'T00:00:00Z'));
  const minT = Math.min(...times), maxT = Math.max(...times);
  const rawLow = Math.min(ROOT_ZONE_VWC_THRESHOLD, ...vals), rawHigh = Math.max(ROOT_ZONE_VWC_THRESHOLD, ...vals);
  const pad = Math.max(0.035, (rawHigh - rawLow) * 0.16);
  const low = Math.max(0, rawLow - pad), high = Math.min(1, rawHigh + pad);
  const xPositions = [];
  let cursor = L + 24;
  rows.forEach((row, i) => {
    if (i > 0) cursor += Math.max(58, ((times[i] - times[i - 1]) / 86400000) * 8);
    xPositions.push(cursor);
  });
  const W = Math.max(760, cursor + R + 28);
  const x = i => xPositions[i];
  const y = value => T + (high - value) * (H - T - B) / (high - low || 1);
  const thresholdY = y(ROOT_ZONE_VWC_THRESHOLD);
  const points = rows.map((p, i) => x(i).toFixed(1) + ',' + y(p.predictedVwc).toFixed(1)).join(' ');
  const circles = rows.map((p, i) => {
    const color = p.source === 'open_meteo_soil_moisture' ? '#166534' : '#c2410c';
    const source = p.sourceLabel || p.source || 'VWC observation';
    return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.predictedVwc).toFixed(1) + '" r="5.5" fill="' + color + '" stroke="Canvas" stroke-width="1.5"><title>' + rootVwcEscape(p.date) + ': ' + (p.predictedVwc * 100).toFixed(1) + '% VWC · ' + rootVwcEscape(source) + ' · ' + rootVwcEscape(p.depthCm || 'depth not recorded') + ' cm</title></circle>';
  }).join('');
  const valueLabels = rows.map((p, i) => {
    const pct = Number((p.predictedVwc * 100).toFixed(1));
    const label = (Number.isInteger(pct) ? String(pct) : pct.toFixed(1)) + '%';
    const pointY = y(p.predictedVwc);
    const labelY = pointY - 14 < T + 8 ? pointY + 23 : pointY - 14;
    return '<text x="' + x(i).toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="750" fill="currentColor" stroke="Canvas" stroke-width="3.5" paint-order="stroke">' + label + '</text>';
  }).join('');
  const dateLabels = rows.map((p, i) => '<text x="' + x(i).toFixed(1) + '" y="' + (H - 27) + '" text-anchor="middle" font-size="10" fill="currentColor">' + rootVwcEscape(p.date.slice(5)) + '</text>').join('');
  const yTop = (high * 100).toFixed(0) + '%', yBottom = (low * 100).toFixed(0) + '%';
  return '<div class="root-vwc-chart-scroll"><svg class="root-vwc-chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily Open-Meteo and Sentinel-1 model-aligned VWC observations with a visible percentage label at every observation"><line x1="' + L + '" y1="' + thresholdY + '" x2="' + (W - R) + '" y2="' + thresholdY + '" stroke="#c2410c" stroke-width="2" stroke-dasharray="6 4"/><text x="' + (W - R) + '" y="' + (thresholdY - 8) + '" text-anchor="end" font-size="11" font-weight="700" fill="#c2410c">15% reference threshold</text><line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" stroke="currentColor" opacity=".45"/><line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="currentColor" opacity=".45"/><polyline points="' + points + '" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + circles + valueLabels + dateLabels + '<text x="12" y="' + (T + 8) + '" font-size="10" fill="currentColor">' + yTop + '</text><text x="12" y="' + (H - B) + '" font-size="10" fill="currentColor">' + yBottom + '</text><text x="' + (W / 2) + '" y="' + (H - 5) + '" text-anchor="middle" font-size="10" fill="currentColor">Observation date · all points labelled</text></svg></div><div class="root-vwc-source-legend"><span><i class="open-meteo"></i> Open-Meteo primary · Soil-moisture tab (9–27 cm)</span><span><i class="sentinel1"></i> Sentinel-1 VV/VH · provisional model fallback (7–28 cm reference)</span></div><p class="root-vwc-muted">One stored observation per date is plotted. Open-Meteo takes priority when both sources exist on the same date; otherwise the Sentinel-1 model-aligned estimate is used. Dates without a valid stored observation are left blank. No daily Sentinel-1 acquisitions or interpolated values are invented. Scroll horizontally to inspect every percentage label.</p>';
}
function sdeAlignedStatusMarkup(result) {
  const event = result.fieldStatus?.event;
  if (event) return '<div class="root-vwc-sde-status"><b>Provisional Sentinel-1 dryness signal identified</b><p>Two consecutive available Sentinel-1 model estimates are below 0.15 m³/m³. This is not a confirmed drainage event.</p><p><b>Trigger observation:</b> ' + rootVwcEscape(event.triggerDate) + ' · <b>Previous qualifying observation:</b> ' + rootVwcEscape(event.from) + '</p></div>';
  if ((result.fieldStatus?.evaluableCount || 0) < 2) return '<div class="root-vwc-sde-status"><b>Insufficient Sentinel-1 observations for SDE status</b><p>The graph can display Open-Meteo values, but the existing two-observation SDE rule is assessed only on Sentinel-1 model estimates.</p></div>';
  return '<div class="root-vwc-sde-status"><b>No provisional Sentinel-1 dryness trigger</b><p>No two consecutive available Sentinel-1 model estimates were both strictly below 0.15 m³/m³ in the selected period.</p></div>';
}
function rootZoneVwcPocPage() {
  const fields = sdeAlignedMappedFields();
  if (!sdeAlignedState.fieldNo || !fields.some(x => String(x.fieldNo) === String(sdeAlignedState.fieldNo))) sdeAlignedState.fieldNo = String(fields[0]?.fieldNo || '');
  const bounds = sdeAlignedDateBounds(sdeAlignedState.fieldNo);
  if (!sdeAlignedState.from) sdeAlignedState.from = bounds.from;
  if (!sdeAlignedState.to) sdeAlignedState.to = bounds.to;
  const options = fields.map(f => '<option value="' + rootVwcEscape(f.fieldNo) + '" ' + (String(f.fieldNo) === sdeAlignedState.fieldNo ? 'selected' : '') + '>' + rootVwcEscape(f.fieldNo) + '</option>').join('');
  const result = sdeAlignedState.result && sdeAlignedState.result.fieldNo === sdeAlignedState.fieldNo ? sdeAlignedState.result : null;
  return '<section class="panel root-vwc-panel" id="rootZoneVwcPoc"><div class="panel-head"><div><p class="eyebrow">FIELD MOISTURE MONITORING · AUTOMATIC DAILY CAPTURE</p><h2>Single Drainage Event (SDE)</h2><p class="muted">Open-Meteo primary VWC, with Sentinel-1 model-aligned fallback where the primary observation is unavailable.</p></div></div>' +
    (fields.length ? '<div class="root-vwc-controls"><label>Mapped field<select id="sdeAlignedField">' + options + '</select></label><label>From<input id="sdeAlignedFrom" type="date" value="' + rootVwcEscape(sdeAlignedState.from) + '"></label><label>To<input id="sdeAlignedTo" type="date" value="' + rootVwcEscape(sdeAlignedState.to) + '"></label><button type="button" class="primary" id="sdeAlignedRun" ' + (sdeAlignedState.loading ? 'disabled' : '') + '>' + (sdeAlignedState.loading ? 'Loading…' : 'Generate VWC graph') + '</button></div>' : '<p class="root-vwc-muted">No mapped fields with a saved GPS boundary are available in the current workspace.</p>') +
    (sdeAlignedState.error ? '<p class="root-vwc-error" role="alert">' + rootVwcEscape(sdeAlignedState.error) + '</p>' : '') +
    (result ? '<div class="root-vwc-model-output"><p class="root-vwc-model-label">AUTOMATICALLY CAPTURED · SOURCE-PRIORITISED VWC</p><h3>' + rootVwcEscape(result.fieldNo) + ' · ' + rootVwcEscape(result.from) + ' to ' + rootVwcEscape(result.to) + '</h3>' + sdeAlignedChartMarkup(result.predictions) + '<div class="root-vwc-capture-summary"><span><b>' + result.openMeteoCount + '</b><small>Open-Meteo points selected</small></span><span><b>' + result.sentinel1Count + '</b><small>Sentinel-1 fallback points selected</small></span><span><b>' + result.satelliteStoredCount + '</b><small>Sentinel-1 estimates stored</small></span><span><b>' + (result.latestCapturedAt ? rootVwcEscape(new Date(result.latestCapturedAt).toLocaleString('en-IN')) : '—') + '</b><small>Latest capture time</small></span></div>' + sdeAlignedStatusMarkup(result) + '<p class="root-vwc-muted">Sentinel-1 model training: ' + result.trainingPairs + ' matched pairs across ' + result.trainingFields + ' fields · model version ' + rootVwcEscape(result.modelVersion) + '. The SDE status uses Sentinel-1 model estimates only; the graph shows the source-prioritised combined series.</p></div>' : '<p class="root-vwc-muted">Choose a field and date range. The graph reads observations already captured and stored in the backend; it does not trigger an on-demand satellite request.</p>') +
    '<p class="root-vwc-muted"><b>Daily capture:</b> backend schedule at 12:00 PM India time. Open-Meteo soil_moisture_9_to_27cm is captured as the primary model estimate using the same six-hour averaging approach as the Soil-moisture tab. Sentinel-1 VV/VH acquisitions are checked daily and converted to provisional VWC only when the multi-field model has at least 8 matched observations across at least 2 fields. Sentinel-1 does not acquire data every day. The two sources have slightly different reference depths (9–27 cm and 7–28 cm); neither is a ground-truth 0–30 cm measurement. The 15% threshold and SDE status remain provisional.</p></section>';
}
function bindRootZoneVwcPocPage() {
  if (typeof satelliteOnlyEnsureLoaded === 'function') satelliteOnlyEnsureLoaded();
  document.getElementById('sdeAlignedField')?.addEventListener('change', event => {
    sdeAlignedState.fieldNo = event.target.value;
    sdeAlignedState.result = null;
    sdeAlignedState.error = '';
    renderManager();
  });
  document.getElementById('sdeAlignedRun')?.addEventListener('click', async () => {
    const fieldNo = document.getElementById('sdeAlignedField')?.value || '';
    const from = document.getElementById('sdeAlignedFrom')?.value || '';
    const to = document.getElementById('sdeAlignedTo')?.value || '';
    sdeAlignedState.fieldNo = fieldNo; sdeAlignedState.from = from; sdeAlignedState.to = to;
    sdeAlignedState.loading = true; sdeAlignedState.error = ''; sdeAlignedState.result = null;
    renderManager();
    try {
      sdeAlignedState.result = await sdeAlignedGenerate(fieldNo, from, to);
    } catch (error) {
      sdeAlignedState.error = error?.message || 'Could not generate the model-aligned VWC estimate.';
    } finally {
      sdeAlignedState.loading = false;
      renderManager();
    }
  });
}
