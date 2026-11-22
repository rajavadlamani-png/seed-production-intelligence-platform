// Single Drainage Event: Sentinel-1 estimates aligned to Open-Meteo historical soil-moisture model output.
// These are model-aligned estimates, not ground-truth-calibrated 0–30 cm VWC measurements.
let sdeAlignedState = { fieldNo: '', from: '', to: '', loading: false, error: '', result: null };

function sdeAlignedMappedFields() {
  const source = typeof scoped === 'function' ? scoped() : (records || []);
  return (source || []).filter(r => Array.isArray(r.boundaryPoints) && r.boundaryPoints.length >= 3 && r.fieldNo);
}
function sdeAlignedDateBounds(fieldNo) {
  const dates = [];
  (satelliteOnlyRuns || []).forEach(run => (satelliteOnlyRunFields(run) || []).filter(f => String(f.fieldNo || '') === String(fieldNo)).forEach(field => {
    (Array.isArray(field.observationSeries) ? field.observationSeries : []).forEach(obs => {
      const date = String(obs.date || obs.interval?.to || obs.interval?.from || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && obs.vv !== null && obs.vv !== undefined && obs.vh !== null && obs.vh !== undefined) dates.push(date);
    });
  }));
  dates.sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
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
  return { fieldNo: String(field.fieldNo), reference, model: data.model || 'Open-Meteo historical reanalysis', grid: { latitude: data.latitude, longitude: data.longitude, elevation: data.elevation }, pointMethod: point.method || 'saved field coordinate' };
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
  const mapped = sdeAlignedMappedFields();
  const selected = mapped.find(field => String(field.fieldNo) === String(fieldNo));
  if (!selected) throw new Error('Select one of the mapped fields.');
  const satelliteByField = new Map(mapped.map(field => [String(field.fieldNo), sdeAlignedSatelliteRows(field.fieldNo, from, to)]));
  const withObservations = mapped.filter(field => (satelliteByField.get(String(field.fieldNo)) || []).length);
  if (!withObservations.length) throw new Error('No saved Sentinel-1 VV/VH observations were found for the mapped fields in this date range. Run and save a Sentinel-1 satellite observation first.');
  const references = await Promise.all(withObservations.map(field => sdeAlignedFetchReference(field, from, to)));
  const referenceByField = new Map(references.map(item => [item.fieldNo, item]));
  const pairs = [];
  withObservations.forEach(field => {
    const ref = referenceByField.get(String(field.fieldNo));
    pairs.push(...sdeAlignedMatchReference(satelliteByField.get(String(field.fieldNo)), ref.reference, 2));
  });
  const model = sdeAlignedFitModel(pairs, 1);
  const selectedRows = satelliteByField.get(String(fieldNo)) || [];
  if (!selectedRows.length) throw new Error('No saved Sentinel-1 observations are available for selected field ' + fieldNo + ' in this period.');
  const predictions = sdeAlignedBuildOperationalSeries(model, selectedRows);
  const classified = rootVwcClassifyOperational(predictions);
  const fieldStatus = classified.fields[0] || null;
  return {
    fieldNo: String(fieldNo), from, to, predictions, fieldStatus, model,
    matchedPairs: pairs.length, matchedFields: model.trainingFields,
    sourceModels: [...new Set(references.map(x => x.model))],
    referenceDepth: '7–28 cm daily mean',
    pointMethod: referenceByField.get(String(fieldNo))?.pointMethod || 'field coordinate',
    grid: referenceByField.get(String(fieldNo))?.grid || null,
    generatedAt: new Date().toISOString()
  };
}
function sdeAlignedChartMarkup(items) {
  const rows = (items || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return '<p class="root-vwc-muted">No Sentinel-1 observations in this period.</p>';
  const W = 760, H = 280, L = 62, R = 20, T = 24, B = 54;
  const vals = rows.map(x => x.predictedVwc), times = rows.map(x => Date.parse(x.date + 'T00:00:00Z'));
  const minT = Math.min(...times), maxT = Math.max(...times), low = Math.max(0, Math.min(ROOT_ZONE_VWC_THRESHOLD, ...vals) - .025), high = Math.min(1, Math.max(ROOT_ZONE_VWC_THRESHOLD, ...vals) + .025);
  const x = i => maxT === minT ? (L + W - R) / 2 : L + (times[i] - minT) * (W - L - R) / (maxT - minT);
  const y = value => T + (high - value) * (H - T - B) / (high - low || 1);
  const thresholdY = y(ROOT_ZONE_VWC_THRESHOLD);
  const points = rows.map((p, i) => x(i).toFixed(1) + ',' + y(p.predictedVwc).toFixed(1)).join(' ');
  const circles = rows.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.predictedVwc).toFixed(1) + '" r="5" fill="' + (p.predictedVwc < ROOT_ZONE_VWC_THRESHOLD ? '#c2410c' : '#2563eb') + '"><title>' + rootVwcEscape(p.date) + ': ' + p.predictedVwc.toFixed(3) + ' m³/m³</title></circle>').join('');
  const labels = rows.map((p, i) => '<text x="' + x(i).toFixed(1) + '" y="' + (H - 25) + '" text-anchor="middle" font-size="10" fill="currentColor">' + rootVwcEscape(p.date.slice(5)) + '</text>').join('');
  return '<div class="root-vwc-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Model-aligned Sentinel-1 root-zone moisture estimates"><line x1="' + L + '" y1="' + thresholdY + '" x2="' + (W - R) + '" y2="' + thresholdY + '" stroke="#c2410c" stroke-width="2" stroke-dasharray="6 4"/><text x="' + (W - R) + '" y="' + (thresholdY - 7) + '" text-anchor="end" font-size="11" fill="#c2410c">0.15 reference threshold</text><line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" stroke="currentColor" opacity=".45"/><line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="currentColor" opacity=".45"/><polyline points="' + points + '" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + circles + labels + '<text x="12" y="' + (T + 8) + '" font-size="10" fill="currentColor">' + high.toFixed(2) + '</text><text x="12" y="' + (H - B) + '" font-size="10" fill="currentColor">' + low.toFixed(2) + '</text><text x="' + (W / 2) + '" y="' + (H - 5) + '" text-anchor="middle" font-size="10" fill="currentColor">Sentinel-1 observation date</text></svg><p class="root-vwc-muted">One point per available Sentinel-1 observation. Lines are visual guides; no daily values are interpolated.</p></div>';
}
function sdeAlignedStatusMarkup(result) {
  const event = result.fieldStatus?.event;
  if (event) return '<div class="root-vwc-sde-status"><b>Provisional dryness signal identified</b><p>Two consecutive available Sentinel-1 observations are below 0.15 m³/m³.</p><p><b>Trigger observation:</b> ' + rootVwcEscape(event.triggerDate) + ' · <b>Previous qualifying observation:</b> ' + rootVwcEscape(event.from) + '</p></div>';
  if ((result.fieldStatus?.evaluableCount || 0) < 2) return '<div class="root-vwc-sde-status"><b>Insufficient observations</b><p>At least two available modelled Sentinel-1 observations are needed to assess the Option B sequence.</p></div>';
  return '<div class="root-vwc-sde-status"><b>No provisional dryness trigger</b><p>No two consecutive available observations were both strictly below 0.15 m³/m³ in the selected period.</p></div>';
}
function rootZoneVwcPocPage() {
  const fields = sdeAlignedMappedFields();
  if (!sdeAlignedState.fieldNo || !fields.some(x => String(x.fieldNo) === String(sdeAlignedState.fieldNo))) sdeAlignedState.fieldNo = String(fields[0]?.fieldNo || '');
  const bounds = sdeAlignedDateBounds(sdeAlignedState.fieldNo);
  if (bounds && !sdeAlignedState.from) sdeAlignedState.from = bounds.from;
  if (bounds && !sdeAlignedState.to) sdeAlignedState.to = bounds.to;
  const available = satelliteOnlyRuns.flatMap(run => satelliteOnlyRunFields(run)).map(f => String(f.fieldNo || ''));
  const options = fields.map(f => '<option value="' + rootVwcEscape(f.fieldNo) + '" ' + (String(f.fieldNo) === sdeAlignedState.fieldNo ? 'selected' : '') + '>' + rootVwcEscape(f.fieldNo) + (available.includes(String(f.fieldNo)) ? '' : ' · satellite data pending') + '</option>').join('');
  const result = sdeAlignedState.result && sdeAlignedState.result.fieldNo === sdeAlignedState.fieldNo ? sdeAlignedState.result : null;
  return '<section class="panel root-vwc-panel" id="rootZoneVwcPoc"><div class="panel-head"><div><p class="eyebrow">FIELD MOISTURE MONITORING</p><h2>Single Drainage Event (SDE)</h2><p class="muted">Select a mapped field and monitoring period.</p></div></div>' +
    (fields.length ? '<div class="root-vwc-controls"><label>Mapped field<select id="sdeAlignedField">' + options + '</select></label><label>From<input id="sdeAlignedFrom" type="date" value="' + rootVwcEscape(sdeAlignedState.from) + '"></label><label>To<input id="sdeAlignedTo" type="date" value="' + rootVwcEscape(sdeAlignedState.to) + '"></label><button type="button" class="primary" id="sdeAlignedRun" ' + (sdeAlignedState.loading ? 'disabled' : '') + '>' + (sdeAlignedState.loading ? 'Estimating…' : 'Generate VWC graph') + '</button></div>' : '<p class="root-vwc-muted">No mapped fields with a saved GPS boundary are available in the current workspace.</p>') +
    (sdeAlignedState.error ? '<p class="root-vwc-error" role="alert">' + rootVwcEscape(sdeAlignedState.error) + '</p>' : '') +
    (result ? '<div class="root-vwc-model-output"><p class="root-vwc-model-label">PROVISIONAL · MODEL-ALIGNED ESTIMATE</p><h3>' + rootVwcEscape(result.fieldNo) + ' · ' + rootVwcEscape(result.from) + ' to ' + rootVwcEscape(result.to) + '</h3>' + sdeAlignedChartMarkup(result.predictions) + sdeAlignedStatusMarkup(result) + '<p class="root-vwc-muted">Alignment observations: ' + result.matchedPairs + ' across ' + result.matchedFields + ' mapped field(s) · in-sample alignment RMSE ' + result.model.alignmentRmse.toFixed(3) + ' m³/m³ · source: ' + rootVwcEscape(result.sourceModels.join(', ')) + '.</p></div>' : '<p class="root-vwc-muted">Choose a field and date range, then generate its Sentinel-1 VWC estimate and SDE status.</p>') +
    '<p class="root-vwc-muted"><b>Method:</b> Sentinel-1 VV and VH backscatter are aligned to Open-Meteo historical daily soil-moisture estimates (7–28 cm) at the mapped field centroid. A ridge-regression model learns the relationship across mapped fields and estimates VWC at Sentinel-1 observation dates. This is model-to-model alignment, not ground-truth calibration. The reference depth is 7–28 cm, not an exact 0–30 cm field measurement; the 0.15 threshold and resulting status are therefore provisional. A dryness signal is not proof that a physical drainage operation occurred.</p></section>';
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
