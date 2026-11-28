// Sentinel-1 backscatter trend screening. Kept separate from the existing VWC/SDE logic.
let s1BackscatterState = {
  selectedIds: [], from: "", to: "", bufferM: 50, relativeOrbit: "", orbitDirection: "AUTO",
  loading: false, loadingSaved: false, loadRequestId: 0, savedKey: "", error: "", result: null, annotations: [], selectionTouched: false,
  annotationFieldId: "", annotationType: "planting", annotationDate: "", annotationNotes: "",
  showVV: true, showVH: true, showDifference: true, showValueLabels: true
};

function s1BackscatterEscape(value) {
  return typeof rootVwcEscape === "function" ? rootVwcEscape(value) :
    String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function s1BackscatterFields() {
  const source = typeof scoped === "function" ? scoped() : (records || []);
  return (source || []).filter(record => {
    if (!record?.id || !record?.fieldNo || !/paddy|rice/i.test(String(record.crop || ""))) return false;
    const lat = Number(record.latitude ?? record.gpsLat ?? record.lat);
    const lon = Number(record.longitude ?? record.gpsLon ?? record.lon);
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180) return true;
    const points = (Array.isArray(record.boundaryPoints) ? record.boundaryPoints : []).filter(point => {
      const pointLat = Number(point?.lat), pointLon = Number(point?.lon ?? point?.lng ?? point?.longitude);
      const accuracy = point?.accuracy === null || point?.accuracy === undefined || point?.accuracy === "" ? null : Number(point.accuracy);
      return Number.isFinite(pointLat) && pointLat >= -90 && pointLat <= 90 &&
        Number.isFinite(pointLon) && pointLon >= -180 && pointLon <= 180 &&
        (!Number.isFinite(accuracy) || accuracy <= 30);
    });
    return points.length >= 3;
  });
}
function s1BackscatterEnsureDefaults(fields) {
  const ids = fields.map(f => String(f.id));
  s1BackscatterState.selectedIds = s1BackscatterState.selectedIds.filter(id => ids.includes(id)).slice(0, 1);
  if (!s1BackscatterState.selectedIds.length && fields.length && !s1BackscatterState.selectionTouched) s1BackscatterState.selectedIds = [String(fields[0].id)];
  const first = fields.find(f => String(f.id) === s1BackscatterState.selectedIds[0]);
  if (first && (!s1BackscatterState.from || !s1BackscatterState.to)) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const start = new Date(today + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() - 180);
    s1BackscatterState.from = s1BackscatterState.from || start.toISOString().slice(0, 10);
    s1BackscatterState.to = s1BackscatterState.to || today;
  }
  if (first) s1BackscatterState.annotationFieldId = String(first.id);
  else s1BackscatterState.annotationFieldId = "";
  if (!s1BackscatterState.annotationDate) s1BackscatterState.annotationDate = s1BackscatterState.from;
}
function s1BackscatterFieldMarkup(fields) {
  return fields.map(field => {
    const id = String(field.id), checked = s1BackscatterState.selectedIds.includes(id);
    return '<label class="s1-field-choice"><input type="checkbox" data-s1-field="' + s1BackscatterEscape(id) + '" ' + (checked ? "checked" : "") + '><span><b>' + s1BackscatterEscape(field.fieldNo) + '</b><small>' + s1BackscatterEscape(field.village || field.district || "Paddy field") + '</small></span></label>';
  }).join("");
}
function s1BackscatterReferenceBands() {
  return [
    { key: "flooded", label: "Open / potentially flooded", vv: [-18, -15], vh: [-24, -21], color: "#2563eb" },
    { key: "dry", label: "Dry-like bare-soil signature", vv: [-16, -13], vh: [-22, -19], color: "#d97706" },
    { key: "wet", label: "Wet / potentially saturated soil", vv: [-12, -8], vh: [-18, -15], color: "#0f766e" },
    { key: "vegetated", label: "Vegetation-influenced rice signature", vv: [-10, -6], vh: [-16, -12], color: "#7c3aed" }
  ];
}
function s1BackscatterClassify(row) {
  const vv = Number(row.vvDb), vh = Number(row.vhDb);
  if (!Number.isFinite(vv) || !Number.isFinite(vh)) return [];
  return s1BackscatterReferenceBands().filter(b => vv >= b.vv[0] && vv <= b.vv[1] && vh >= b.vh[0] && vh <= b.vh[1]);
}
function s1BackscatterObservationClass(row) {
  const matches = s1BackscatterClassify(row);
  return matches.length === 1 ? matches[0] : null;
}
function s1BackscatterDryIntervals(observations) {
  const rows = observations.slice().sort((a,b) => a.date.localeCompare(b.date));
  const intervals = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2) intervals.push(run.slice());
    run = [];
  };
  rows.forEach(row => {
    const isDry = s1BackscatterClassify(row).some(b => b.key === "dry");
    if (!isDry) { flush(); return; }
    if (run.length) {
      const gap = (Date.parse(row.date + "T00:00:00Z") - Date.parse(run[run.length-1].date + "T00:00:00Z")) / 86400000;
      if (gap > 18) flush();
    }
    run.push(row);
  });
  flush();
  return intervals;
}
function s1BackscatterSingleDrainageEvents(observations) {
  const rows = (observations || []).slice().sort((a,b) => a.date.localeCompare(b.date));
  const events = [];
  for (let i = 1; i < rows.length; i++) {
    const before = rows[i-1], after = rows[i];
    const beforeClass = s1BackscatterObservationClass(before);
    const afterClass = s1BackscatterObservationClass(after);
    const gapDays = (Date.parse(after.date + "T00:00:00Z") - Date.parse(before.date + "T00:00:00Z")) / 86400000;
    const valid = [before.vvDb,before.vhDb,after.vvDb,after.vhDb].every(v => Number.isFinite(Number(v)));
    // One observed transition is sufficient: a preceding open-water-like OR
    // wet/saturated signature is followed by an acquisition matching neither band.
    // A wet-to-unclassified transition is deliberately lower-confidence evidence.
    const beforeWaterLike = ["flooded","wet"].includes(beforeClass?.key);
    const afterWaterLike = ["flooded","wet"].includes(afterClass?.key);
    if (valid && beforeWaterLike && !afterWaterLike && gapDays > 0 && gapDays <= 18) {
      const start = after.date;
      const endDate = new Date(Date.parse(start + "T00:00:00Z") + 10 * 86400000).toISOString().slice(0,10);
      const signalBasis = beforeClass.key === "flooded" ? "Open-water-like signature exit" : "Wet/saturated signature exit";
      const confidence = beforeClass.key === "flooded" ? "Moderate screening signal" : "Low screening signal";
      events.push({
        before, after, start, end: endDate, gapDays, signalBasis, confidence,
        vvChange: Number(after.vvDb) - Number(before.vvDb),
        vhChange: Number(after.vhDb) - Number(before.vhDb),
        differenceChange: Number(after.vvMinusVhDb) - Number(before.vvMinusVhDb)
      });
    }
  }
  return events;
}
function s1BackscatterChartMarkup() {
  const result = s1BackscatterState.result;
  const fields = result?.fields || [];
  const observations = fields.flatMap(f => (f.observations || []).map(o => ({ ...o, fieldNo: f.fieldNo })));
  if (!observations.length) return '<div class="s1-empty s1-data-empty"><b>No Sentinel-1 acquisition data is loaded for this date range.</b><p>This is a data-availability message, not a dryness or drainage result. Set the start and end dates, then select <b>Extract Sentinel-1 data</b>. Satellite observations will be shown whether or not a signature is identified.</p></div>';
  const metrics = [
    { key: "vvDb", label: "VV (dB)", enabled: s1BackscatterState.showVV, dash: "" },
    { key: "vhDb", label: "VH (dB)", enabled: s1BackscatterState.showVH, dash: "7 4" },
    { key: "vvMinusVhDb", label: "VV − VH (dB)", enabled: s1BackscatterState.showDifference, dash: "2 4" }
  ].filter(m => m.enabled);
  if (!metrics.length) return '<div class="s1-empty">Turn on at least one backscatter series.</div>';
  const allDates = observations.map(o => Date.parse(o.date + "T00:00:00Z")).filter(Number.isFinite);
  const allValues = observations.flatMap(o => metrics.map(m => Number(o[m.key]))).filter(Number.isFinite);
  if (!allValues.length) return '<div class="s1-empty">No valid backscatter values are available for the selected series.</div>';
  const drainageEvents = fields.flatMap(field => s1BackscatterSingleDrainageEvents(field.observations || []).map(event => ({ ...event, fieldNo: field.fieldNo })));
  const minT = Math.min(...allDates), maxObservedT = Math.max(...allDates);
  const maxT = Math.max(maxObservedT, ...drainageEvents.map(event => Date.parse(event.end + "T00:00:00Z")));
  const tSpan = Math.max(1, maxT - minT);
  const rawMin = Math.min(...allValues), rawMax = Math.max(...allValues);
  const pad = Math.max(1.5, (rawMax - rawMin) * 0.12);
  const low = rawMin - pad, high = rawMax + pad;
  const W = 1000, H = 390, L = 72, R = 28, T = 42, B = 64;
  const x = date => L + ((Date.parse(date + "T00:00:00Z") - minT) / tSpan) * (W - L - R);
  const y = value => T + ((high - value) / (high - low || 1)) * (H - T - B);
  const colors = ["#2563eb", "#0f766e", "#b45309", "#7c3aed", "#be123c"];
  const fieldLines = fields.map((field, fieldIndex) => {
    const color = colors[fieldIndex % colors.length];
    const rows = (field.observations || []).slice().sort((a,b) => a.date.localeCompare(b.date));
    return metrics.map((metric, metricIndex) => {
      const segments = [];
      let current = [];
      rows.forEach(row => {
        const value = Number(row[metric.key]);
        if (!Number.isFinite(value)) return;
        if (current.length && (Date.parse(row.date + "T00:00:00Z") - Date.parse(current[current.length - 1].date + "T00:00:00Z")) / 86400000 > 18) {
          segments.push(current); current = [];
        }
        current.push(row);
      });
      if (current.length) segments.push(current);
      const polylines = segments.filter(s => s.length > 1).map(segment =>
        '<polyline points="' + segment.map(row => x(row.date).toFixed(1) + ',' + y(Number(row[metric.key])).toFixed(1)).join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2.2" ' + (metric.dash ? 'stroke-dasharray="' + metric.dash + '"' : "") + ' stroke-linejoin="round" stroke-linecap="round"/>'
      ).join("");
      const markers = rows.filter(row => Number.isFinite(Number(row[metric.key]))).map(row => {
        const value = Number(row[metric.key]);
        const title = row.date + " · " + field.fieldNo + " · orbit " + row.relativeOrbit + " " + row.orbitDirection +
          " · VV " + Number(row.vvDb).toFixed(2) + " dB · VH " + Number(row.vhDb).toFixed(2) +
          " dB · VV−VH " + Number(row.vvMinusVhDb).toFixed(2) + " dB · " + row.pixelCount + " valid pixels";
        const pointX = x(row.date).toFixed(1), pointY = y(value).toFixed(1);
        const status = s1BackscatterObservationClass(row);
        const markerColor = status?.color || "#64748b";
        const dryHighlight = status?.key === "dry"
          ? '<circle cx="' + pointX + '" cy="' + pointY + '" r="10" fill="none" stroke="#dc2626" stroke-width="2.8" opacity=".98"><title>Candidate dry-like signal · highlighted for attention, not confirmed field dryness</title></circle>'
          : "";
        const valueLabel = s1BackscatterState.showValueLabels ? '<text x="' + pointX + '" y="' + (y(value) - 9 - metricIndex * 11).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="' + color + '" stroke="Canvas" stroke-width="3" paint-order="stroke">' + value.toFixed(2) + '</text>' : "";
        return dryHighlight + '<circle cx="' + pointX + '" cy="' + pointY + '" r="4.5" fill="' + markerColor + '" stroke="Canvas" stroke-width="1.4"><title>' + s1BackscatterEscape(title + " · " + (status?.label || "No direct paired reference-band match")) + '</title></circle>' + valueLabel;
      }).join("");
      return polylines + markers;
    }).join("");
  }).join("");
  const drainageOverlay = drainageEvents.map(event => {
    const startX = Math.max(L, Math.min(W-R, x(event.start)));
    const endX = Math.max(L, Math.min(W-R, x(event.end)));
    if (endX <= startX) return "";
    return '<rect x="' + startX.toFixed(1) + '" y="' + T + '" width="' + (endX-startX).toFixed(1) + '" height="' + (H-T-B) + '" fill="#dc2626" opacity=".13"><title>Candidate single drainage event · estimated 10-day window ' + s1BackscatterEscape(event.start + " to " + event.end) + '</title></rect><text x="' + (startX+4).toFixed(1) + '" y="' + (T+27) + '" font-size="10" font-weight="800" fill="#b91c1c">CANDIDATE DRAINAGE · 10 DAYS</text>';
  }).join("");
  const annotations = (s1BackscatterState.annotations || []).filter(a => a.event_date >= s1BackscatterState.from && a.event_date <= s1BackscatterState.to);
  const eventColors = { planting: "#15803d", drainage: "#d97706", harvest: "#7c3aed" };
  const annotationLines = annotations.map(a => {
    const px = x(a.event_date);
    const c = eventColors[a.event_type] || "#64748b";
    return '<line x1="' + px.toFixed(1) + '" y1="' + T + '" x2="' + px.toFixed(1) + '" y2="' + (H-B) + '" stroke="' + c + '" stroke-width="1.7" stroke-dasharray="5 4"><title>' + s1BackscatterEscape(a.event_type + " · " + a.field_no + " · " + a.event_date + (a.notes ? " · " + a.notes : "")) + '</title></line><text x="' + (px+4).toFixed(1) + '" y="' + (T+14).toFixed(1) + '" font-size="10" fill="' + c + '">' + s1BackscatterEscape(a.event_type + " " + a.field_no) + '</text>';
  }).join("");
  const yGrid = Array.from({length:5},(_,i)=>{
    const value = high - (high-low)*i/4, py = y(value);
    return '<line x1="' + L + '" y1="' + py.toFixed(1) + '" x2="' + (W-R) + '" y2="' + py.toFixed(1) + '" stroke="currentColor" opacity=".13"/><text x="' + (L-10) + '" y="' + (py+4).toFixed(1) + '" text-anchor="end" font-size="11" fill="currentColor">' + value.toFixed(1) + '</text>';
  }).join("");
  const dateTicks = Array.from({length:6},(_,i)=>{
    const time = minT + tSpan*i/5, d = new Date(time).toISOString().slice(0,10), px = L+(W-L-R)*i/5;
    return '<text x="' + px.toFixed(1) + '" y="' + (H-30) + '" text-anchor="middle" font-size="10" fill="currentColor">' + d.slice(5) + '</text>';
  }).join("");
  const fieldLegend = fields.map((f,i)=>'<span><i style="background:' + colors[i%colors.length] + '"></i>' + s1BackscatterEscape(f.fieldNo) + ' · orbit ' + f.orbit + ' ' + s1BackscatterEscape(f.orbitDirection) + '</span>').join("");
  const metricLegend = metrics.map(m=>'<span><i class="s1-line-swatch" style="' + (m.dash ? 'border-top-style:dashed;' : '') + '"></i>' + m.label + '</span>').join("");
  const statusLegend = s1BackscatterReferenceBands().map(b=>'<span><i style="background:' + b.color + '"></i>' + s1BackscatterEscape(b.label) + '</span>').join("") + '<span><i style="background:#64748b"></i>No direct match</span><span class="s1-dry-ring-legend"><i></i>Red circle = fixed-band dry-like point</span><span class="s1-event-window-legend"><i></i>Red shade = candidate single drainage · 10-day estimate</span>';
  return '<div class="s1-chart-scroll"><svg id="s1BackscatterChart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sentinel-1 backscatter observations at actual acquisition dates"><text x="' + (W/2) + '" y="18" text-anchor="middle" font-size="12" fill="currentColor">Sentinel-1 GRD · Gamma0 terrain-corrected · median backscatter (dB)</text>' + yGrid + drainageOverlay + annotationLines + fieldLines + '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H-B) + '" stroke="currentColor" opacity=".5"/><line x1="' + L + '" y1="' + (H-B) + '" x2="' + (W-R) + '" y2="' + (H-B) + '" stroke="currentColor" opacity=".5"/>' + dateTicks + '<text x="18" y="' + (H/2) + '" transform="rotate(-90 18 ' + (H/2) + ')" text-anchor="middle" font-size="11" fill="currentColor">Backscatter (dB)</text><text x="' + (W/2) + '" y="' + (H-7) + '" text-anchor="middle" font-size="11" fill="currentColor">Acquisition date · no daily interpolation</text></svg></div><div class="s1-legend">' + fieldLegend + metricLegend + statusLegend + '</div>';
}
function s1BackscatterInterpretationMarkup() {
  const bands = s1BackscatterReferenceBands();
  const fields = (s1BackscatterState.result?.fields || []).filter(field => (field.observations || []).length);
  if (!fields.length) return '<section class="s1-interpretation"><h3>Signature interpretation</h3><p>No acquisition observations are loaded for this date range. This does not mean the field is dry or wet; extract the satellite data first. Raw VV, VH and VV−VH observations remain available even when no signature is identified.</p></section>';
  const fmt = value => Number(value).toFixed(2);
  const summaries = fields.map(field => {
    const observations = (field.observations || []).slice().sort((a,b)=>a.date.localeCompare(b.date));
    const dryRuns = s1BackscatterDryIntervals(observations);
    const drainageEvents = s1BackscatterSingleDrainageEvents(observations);
    const latest = observations[observations.length-1];
    const latestClass = s1BackscatterObservationClass(latest);
    const dryCards = dryRuns.length ? dryRuns.map((run,index) => {
      const first = run[0], last = run[run.length-1];
      const firstIndex = observations.findIndex(o=>o.date===first.date);
      const prior = firstIndex > 0 ? observations[firstIndex-1] : null;
      const priorClass = prior ? s1BackscatterObservationClass(prior) : null;
      const gap = prior ? (Date.parse(first.date+"T00:00:00Z")-Date.parse(prior.date+"T00:00:00Z"))/86400000 : null;
      const transition = prior && priorClass?.key === "flooded" && gap <= 18;
      const bracket = prior ? 'Possible transition window: ' + prior.date + ' to ' + first.date + '.' : 'The start is only bounded by the first available dry-like acquisition.';
      const persistence = run.length + ' consecutive acquisitions, from ' + first.date + ' to ' + last.date + '.';
      const continuation = last.date === latest.date ? ' The pattern is present at the latest available acquisition.' : ' A later acquisition changed category; review the timeline for the end of this interval.';
      return '<div class="s1-period-card"><b>Candidate dry-like period ' + (index+1) + '</b><p>' + s1BackscatterEscape(persistence + continuation) + '</p><p>' + s1BackscatterEscape(bracket) + '</p>' +
        (transition ? '<p><b>Possible drainage-related transition:</b> the previous acquisition matched the open-water-like reference band and the following dry-like signature persisted. This is not confirmation of drainage.</p>' : '<p>No immediately preceding open-water-like observation was found to bracket a possible drainage transition.</p>') +
        '</div>';
    }).join("") : '<p class="s1-reference-caveat">No persistent dry-like interval was identified. A single matching acquisition is treated as an isolated observation, not a period.</p>';
    const drainageCards = drainageEvents.length ? drainageEvents.map((event,index) =>
      '<div class="s1-period-card s1-drainage-event-card"><b>Candidate single drainage event ' + (index+1) + '</b>' +
      '<p><b>Estimated red window:</b> ' + s1BackscatterEscape(event.start + ' to ' + event.end) + ' (10 calendar days)</p>' +
      '<p><b>Signal basis:</b> ' + s1BackscatterEscape(event.signalBasis) + ' · ' + s1BackscatterEscape(event.confidence) + '.</p>' +
      '<p>Previous acquisition ' + s1BackscatterEscape(event.before.date) + ' matched the ' + (s1BackscatterObservationClass(event.before)?.key === "flooded" ? "open-water-like" : "wet / potentially saturated") + ' reference band. Acquisition ' + s1BackscatterEscape(event.after.date) + ' no longer matched either water-related band (' + event.gapDays.toFixed(0) + '-day observation gap).</p>' +
      '<p>VV change: ' + (event.vvChange >= 0 ? '+' : '') + event.vvChange.toFixed(2) + ' dB · VH change: ' + (event.vhChange >= 0 ? '+' : '') + event.vhChange.toFixed(2) + ' dB · VV−VH change: ' + (event.differenceChange >= 0 ? '+' : '') + event.differenceChange.toFixed(2) + ' dB.</p>' +
      '<p><b>Interpretation:</b> one candidate transition consistent with recession of a water-related radar signature. It is not proof of the farmer physically opening a drain; crop growth, surface roughness and mixed pixels can also change backscatter.</p></div>'
    ).join("") : '<p class="s1-reference-caveat">No single drainage transition was flagged. This requires a preceding paired open-water-like or wet/saturated signature followed by an acquisition that matches neither band, within an 18-day interval. A wet-to-unclassified transition is lower-confidence. No event is inferred where that sequence is absent.</p>';
    const statusTimeline = observations.map((row,index) => {
      const status = s1BackscatterObservationClass(row);
      const color = status?.color || "#64748b";
      const label = status?.label || "No direct paired reference-band match";
      const previous = index ? Date.parse(observations[index-1].date+"T00:00:00Z") : null;
      const current = Date.parse(row.date+"T00:00:00Z");
      const next = index < observations.length-1 ? Date.parse(observations[index+1].date+"T00:00:00Z") : null;
      const left = previous === null ? 0 : Math.max(0, Math.min(50, (current-previous)/86400000/2));
      const right = next === null ? 0 : Math.max(0, Math.min(50, (next-current)/86400000/2));
      return '<div class="s1-timeline-point"><i style="background:' + color + '"></i><span>' + s1BackscatterEscape(row.date) + '</span><small>VV ' + fmt(row.vvDb) + ' · VH ' + fmt(row.vhDb) + ' dB · ' + s1BackscatterEscape(label) + '</small></div>';
    }).join("");
    const rows = observations.map(row => {
      const matches = s1BackscatterClassify(row);
      const label = matches.length === 1 ? matches[0].label : matches.length > 1 ? 'Overlapping: ' + matches.map(m=>m.label).join(' / ') : 'No direct paired reference-band match';
      const color = matches.length === 1 ? matches[0].color : "#64748b";
      return '<tr><td>' + s1BackscatterEscape(row.date) + '</td><td>' + fmt(row.vvDb) + '</td><td>' + fmt(row.vhDb) + '</td><td><span class="s1-status-label"><i style="background:' + color + '"></i>' + s1BackscatterEscape(label) + '</span></td></tr>';
    }).join("");
    return '<article class="s1-field-interpretation"><h4>' + s1BackscatterEscape(field.fieldNo) + '</h4><p><b>Latest acquisition:</b> ' + s1BackscatterEscape(latest.date) + ' · VV ' + fmt(latest.vvDb) + ' dB · VH ' + fmt(latest.vhDb) + ' dB · ' + s1BackscatterEscape(latestClass?.label || "No direct paired reference-band match") + '</p><h5>Field condition timeline (actual acquisition dates)</h5><div class="s1-status-timeline">' + statusTimeline + '</div><h5>Single drainage event screen</h5>' + drainageCards + '<h5>Persistent dry-like reference-band periods (separate legacy view)</h5>' + dryCards + '<details class="s1-record-details"><summary>View field reference comparisons · ' + observations.length + ' observations</summary><div class="s1-record-scroll"><table><thead><tr><th>Date</th><th>VV (dB)</th><th>VH (dB)</th><th>Reference comparison</th></tr></thead><tbody>' + rows + '</tbody></table></div></details></article>';
  }).join("");
  const referenceRows = bands.map(b=>'<tr><td><span class="s1-status-label"><i style="background:'+b.color+'"></i>'+s1BackscatterEscape(b.label)+'</span></td><td>'+b.vv[0]+' to '+b.vv[1]+'</td><td>'+b.vh[0]+' to '+b.vh[1]+'</td></tr>').join("");
  const hasDrainageOrDry = fields.some(field => s1BackscatterSingleDrainageEvents(field.observations || []).length || s1BackscatterDryIntervals(field.observations || []).length);
  const hasAnyReferenceMatch = fields.some(field => (field.observations || []).some(row => s1BackscatterObservationClass(row)));
  const overallNarration = hasDrainageOrDry ? '<div class="s1-signature-status is-detected"><b>Candidate dryness or drainage-related pattern identified</b><p>The acquisition sequence contains a pattern matching the screening rules. Review the event-specific dates, backscatter changes and confidence below. This is a radar screening result, not field confirmation.</p></div>' : hasAnyReferenceMatch ? '<div class="s1-signature-status is-detected"><b>Radar reference-band signature present; no dryness or drainage event flagged</b><p>One or more acquisitions match an indicative open-water-like, wet/saturated or vegetation-influenced reference band. However, the sequence does not meet the current rules for a persistent dry-like period or a candidate single drainage transition. The underlying satellite observations remain available below.</p></div>' : '<div class="s1-signature-status is-none"><b>No paired reference-band match or candidate dryness/drainage pattern identified</b><p>The Sentinel-1 acquisition data remain valid and are displayed in the graph and acquisition table. The current indicative screening ranges did not classify these observations into a paired reference band and did not identify a persistent dry-like period or candidate single drainage transition. This does not prove that the field remained wet or dry. Review VV, VH and VV−VH alongside field inspection, rainfall and crop-stage records.</p></div>';
  return '<section class="s1-interpretation" aria-label="Field-specific Sentinel-1 interpretation"><h3>Signature interpretation</h3>' + overallNarration + '<p>Two interpretations are shown separately. The single-event screen flags one transition from a paired open-water-like or wet/saturated signature to a subsequent acquisition that matches neither; it does not require complete moisture depletion or persistence across two dry-like acquisitions. The legacy dry-like period view still requires two consecutive reference-band matches.</p>' + summaries + '<h4>Colour reference bands</h4><div class="s1-record-scroll"><table><thead><tr><th>Reference condition</th><th>VV (dB)</th><th>VH (dB)</th></tr></thead><tbody>' + referenceRows + '</tbody></table></div><p class="s1-reference-caveat"><b>Scientific limitation:</b> These are indicative screening ranges, not locally calibrated thresholds. A candidate single drainage event means a paired open-water-like or wet/saturated radar signature was present on one acquisition and absent on the next; it is an indirect surface-water proxy, not direct observation of standing water or proof of a farmer&#39;s drainage activity. The red 10-calendar-day window is an operational estimate anchored to the first acquisition matching neither water-related band, not ten days of continuous satellite observation. Crop phenology, surface roughness, incidence geometry and mixed pixels can produce similar changes.</p></section>';
}
function s1BackscatterTableMarkup() {
  const rows = (s1BackscatterState.result?.fields || []).flatMap(field =>
    (field.observations || []).map(row => ({ fieldNo: field.fieldNo, ...row }))
  ).sort((a,b)=>a.date.localeCompare(b.date) || a.fieldNo.localeCompare(b.fieldNo));
  if (!rows.length) return '<div class="s1-empty">No acquisition records are available in this date range yet. Extract Sentinel-1 data to populate the observation table.</div>';
  const body = rows.map(row => '<tr><td>' + s1BackscatterEscape(row.fieldNo) + '</td><td>' +
    s1BackscatterEscape(row.date) + '</td><td>' + s1BackscatterEscape(row.relativeOrbit) + '</td><td>' +
    s1BackscatterEscape(row.orbitDirection) + '</td><td>' + Number(row.vvDb).toFixed(2) + '</td><td>' +
    Number(row.vhDb).toFixed(2) + '</td><td>' + Number(row.vvMinusVhDb).toFixed(2) + '</td><td>' +
    s1BackscatterEscape(row.pixelCount) + '</td></tr>').join("");
  return '<details class="s1-record-details"><summary>View acquisition records · ' + rows.length + ' rows</summary><div class="s1-record-scroll"><table><thead><tr><th>Field</th><th>Acquisition date</th><th>Relative orbit</th><th>Pass</th><th>VV dB</th><th>VH dB</th><th>VV−VH dB</th><th>Valid pixels</th></tr></thead><tbody>' + body + '</tbody></table></div></details>';
}
function s1BackscatterPanelMarkup() {
  const fields = s1BackscatterFields();
  s1BackscatterEnsureDefaults(fields);
  const selected = fields.filter(f => s1BackscatterState.selectedIds.includes(String(f.id)));
  const annotationOptions = selected.map(f => '<option value="' + s1BackscatterEscape(f.id) + '" ' + (String(f.id) === s1BackscatterState.annotationFieldId ? "selected" : "") + '>' + s1BackscatterEscape(f.fieldNo) + '</option>').join("");
  const result = s1BackscatterState.result;
  const total = (result?.fields || []).reduce((n,f)=>n+(f.observations||[]).length,0);
  const errors = (result?.errors || []).map(e=>'<p class="s1-error">' + s1BackscatterEscape(e.fieldNo + ": " + e.error) + '</p>').join("");
  const annotationList = (s1BackscatterState.annotations || []).map(a=>'<div class="s1-annotation-row"><b>' + s1BackscatterEscape(a.event_type) + '</b><span>' + s1BackscatterEscape(a.field_no) + ' · ' + s1BackscatterEscape(a.event_date) + '</span><small>' + s1BackscatterEscape(a.notes || "") + '</small></div>').join("");
  return '<section class="panel s1-backscatter-panel" id="s1BackscatterPanel"><div class="panel-head"><div><p class="eyebrow">RADAR EVIDENCE · INDEPENDENT OF VWC</p><h2>Sentinel-1 Backscatter Trend Analysis</h2><p class="muted">Choose your own acquisition date range and extract Sentinel-1 VV, VH and VV−VH at actual satellite acquisition dates. Raw satellite observations are displayed independently of signature detection. A dryness or drainage interpretation is an additional screening layer—not a condition for displaying the data.</p><p><a class="outline" href="multisensor-drainage-pilot.html" target="_blank" rel="noopener">Open multi-sensor drainage pilot →</a></p></div></div>' +
    (fields.length ? '<div class="s1-controls-grid"><div class="s1-field-picker"><b>Select one field at a time</b><div class="s1-field-list">' + s1BackscatterFieldMarkup(fields) + '</div><small id="s1SelectedCount">' + s1BackscatterState.selectedIds.length + ' of 1 selected</small></div><div class="s1-control-column"><div class="s1-date-range-control"><label>Acquisition start date<input id="s1From" type="date" value="' + s1BackscatterEscape(s1BackscatterState.from) + '"></label><label>Acquisition end date<input id="s1To" type="date" value="' + s1BackscatterEscape(s1BackscatterState.to) + '"></label><small>Custom date range · maximum 365 days · results contain actual satellite acquisition dates only; no daily values are interpolated.</small></div><label>Buffer radius around GPS reference point (metres)<input id="s1Buffer" type="number" min="10" max="500" step="10" value="' + s1BackscatterState.bufferM + '"></label><label>Relative orbit number · blank = most frequent<input id="s1Orbit" type="number" min="1" max="175" placeholder="Automatic" value="' + s1BackscatterEscape(s1BackscatterState.relativeOrbit) + '"></label><label>Pass direction<select id="s1Direction"><option value="AUTO" ' + (s1BackscatterState.orbitDirection==="AUTO"?"selected":"") + '>Automatic · most frequent</option><option value="ASCENDING" ' + (s1BackscatterState.orbitDirection==="ASCENDING"?"selected":"") + '>Ascending</option><option value="DESCENDING" ' + (s1BackscatterState.orbitDirection==="DESCENDING"?"selected":"") + '>Descending</option></select></label><button type="button" class="primary" id="s1Run" ' + (s1BackscatterState.loading?"disabled":"") + '>' + (s1BackscatterState.loading?"Extracting satellite data…":"Extract Sentinel-1 data →") + '</button></div></div>' : '<p class="s1-empty">No Paddy fields with a usable saved GPS point or at least three valid saved GPS points are available in this workspace.</p>') +
    (s1BackscatterState.error ? '<p class="s1-error" role="alert">' + s1BackscatterEscape(s1BackscatterState.error) + '</p>' : '') +
    (result ? '<div class="s1-result-summary"><b>' + total + ' Sentinel-1 acquisition observations available</b><span>Requested range: ' + s1BackscatterEscape(result.from) + ' to ' + s1BackscatterEscape(result.to) + ' · ' + result.bufferM + ' m buffer</span><span>Processing: ' + s1BackscatterEscape(result.processingVersion) + '</span><span>Raw data display is independent of signature detection.</span></div>' : '<div class="s1-data-guidance"><b>Define your acquisition period</b><p>Choose a start date and end date, select one mapped paddy field, and extract its available Sentinel-1 acquisitions. Signature detection runs separately after the observations are loaded.</p></div>') +
    '<div class="s1-metric-toggles"><label><input type="checkbox" data-s1-metric="showVV" ' + (s1BackscatterState.showVV?"checked":"") + '> VV (dB)</label><label><input type="checkbox" data-s1-metric="showVH" ' + (s1BackscatterState.showVH?"checked":"") + '> VH (dB)</label><label><input type="checkbox" data-s1-metric="showDifference" ' + (s1BackscatterState.showDifference?"checked":"") + '> VV − VH (dB)</label></div>' +
    '<div class="s1-value-label-toggle"><label><input type="checkbox" data-s1-value-labels="true" ' + (s1BackscatterState.showValueLabels ? "checked" : "") + '> Show numerical values on graph</label><small>Values are displayed in dB at each actual acquisition point.</small></div>' +
    s1BackscatterChartMarkup() + s1BackscatterInterpretationMarkup() + s1BackscatterTableMarkup() + errors +
    '<div class="s1-actions"><button type="button" class="outline" id="s1ExportCsv" ' + (total?"":"disabled") + '>Export CSV</button><button type="button" class="outline" id="s1ExportPng" ' + (total?"":"disabled") + '>Export chart PNG</button></div>' +
    '<div class="s1-annotation-panel"><h3>Field activity markers</h3><p class="muted">Add a planting, drainage or harvest date. These are user-entered annotations, not satellite-detected events.</p><div class="s1-annotation-form"><label>Field<select id="s1AnnotationField">' + annotationOptions + '</select></label><label>Event<select id="s1AnnotationType"><option value="planting">Planting</option><option value="drainage">Drainage</option><option value="harvest">Harvest</option></select></label><label>Date<input id="s1AnnotationDate" type="date" value="' + s1BackscatterEscape(s1BackscatterState.annotationDate) + '"></label><label>Notes<input id="s1AnnotationNotes" type="text" maxlength="300" placeholder="Optional context"></label><button type="button" class="outline" id="s1SaveAnnotation" ' + (selected.length?"":"disabled") + '>Save marker</button></div><div class="s1-annotation-list">' + (annotationList || '<small>No user-entered markers in this date range.</small>') + '</div></div>' +
    '<p class="root-vwc-muted">Default date window: last 180 days (approximately one crop season, editable). The centre is taken from a saved GPS point where available; otherwise the coordinate-wise median of valid saved GPS boundary points is used. The initial 50 m radius is a screening default, not a validated field sampling footprint. Orbit and pass are selected per field by the most frequent available combination unless specified. A gap longer than 18 days is shown as a line break; no values are interpolated.</p>' +
    '<p class="s1-screening-note">Screening view only. The red 10-day highlight is a candidate surface-water recession window inferred from two actual acquisitions. Treat it as supporting evidence alongside field inspection, farmer activity records and rainfall context—not as standalone confirmation.</p></section>';
}
async function s1BackscatterLoadAnnotations() {
  const ids = s1BackscatterState.selectedIds || [];
  if (!supabaseClient || !activeCompanyId || !ids.length) { s1BackscatterState.annotations = []; return; }
  const { data, error } = await supabaseClient.from("s1_backscatter_annotations")
    .select("id,field_record_id,field_no,event_type,event_date,notes,created_at")
    .eq("company_id", activeCompanyId).in("field_record_id", ids)
    .gte("event_date", s1BackscatterState.from).lte("event_date", s1BackscatterState.to)
    .order("event_date", { ascending: true });
  if (error) throw new Error("Could not load field activity markers: " + error.message);
  s1BackscatterState.annotations = data || [];
}
function s1BackscatterDownload(name, blob) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function s1BackscatterExportCsv() {
  const rows = (s1BackscatterState.result?.fields || []).flatMap(f => (f.observations || []).map(o => ({
    field_no: f.fieldNo, acquired_at: o.acquiredAt, relative_orbit: o.relativeOrbit,
    orbit_direction: o.orbitDirection, vv_db: o.vvDb, vh_db: o.vhDb,
    vv_minus_vh_db: o.vvMinusVhDb, pixel_count: o.pixelCount,
    buffer_m: s1BackscatterState.result.bufferM,
    center_lat: f.center?.latitude, center_lon: f.center?.longitude,
    center_method: f.center?.method
  })));
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(row => keys.map(k => '"' + String(row[k] ?? "").replace(/"/g,'""') + '"').join(","))].join("\r\n");
  s1BackscatterDownload("sentinel1-backscatter-observations.csv", new Blob([csv], { type: "text/csv;charset=utf-8" }));
}
function s1BackscatterExportPng() {
  const svg = document.getElementById("s1BackscatterChart");
  if (!svg) return;
  const clone = svg.cloneNode(true);
  clone.setAttribute("width", "2000"); clone.setAttribute("height", "780");
  const source = new XMLSerializer().serializeToString(clone);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  image.onload = () => {
    const canvas = document.createElement("canvas"); canvas.width = 2000; canvas.height = 780;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#ffffff"; context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      canvas.toBlob(blob => { if (blob) s1BackscatterDownload("sentinel1-backscatter-trend.png",blob); URL.revokeObjectURL(url); },"image/png");
    } else URL.revokeObjectURL(url);
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}
function s1BackscatterCurrentKey() {
  return [activeCompanyId || "", [...s1BackscatterState.selectedIds].sort().join(","), s1BackscatterState.from,
    s1BackscatterState.to, s1BackscatterState.bufferM, s1BackscatterState.relativeOrbit,
    s1BackscatterState.orbitDirection].join("|");
}
async function s1BackscatterLoadSaved(force = false) {
  const ids = s1BackscatterState.selectedIds || [];
  if (!supabaseClient || !activeCompanyId || !ids.length || !s1BackscatterState.from || !s1BackscatterState.to) return;
  const key = s1BackscatterCurrentKey();
  if (!force && (key === s1BackscatterState.savedKey || s1BackscatterState.loadingSaved)) return;
  s1BackscatterState.loadingSaved = true;
  const requestId = ++s1BackscatterState.loadRequestId;
  try {
    let query = supabaseClient.from("s1_backscatter_observations")
      .select("field_record_id,field_no,acquisition_id,acquired_at,relative_orbit,orbit_direction,vv_db,vh_db,vv_minus_vh_db,pixel_count,buffer_m,center_lat,center_lon,center_method")
      .eq("company_id", activeCompanyId).in("field_record_id", ids)
      .gte("acquired_at", s1BackscatterState.from + "T00:00:00.000Z")
      .lte("acquired_at", s1BackscatterState.to + "T23:59:59.999Z")
      .eq("buffer_m", Number(s1BackscatterState.bufferM || 50))
      .order("acquired_at", { ascending: true });
    if (s1BackscatterState.relativeOrbit) query = query.eq("relative_orbit", Number(s1BackscatterState.relativeOrbit));
    if (s1BackscatterState.orbitDirection !== "AUTO") query = query.eq("orbit_direction", s1BackscatterState.orbitDirection);
    const { data, error } = await query;
    if (error) throw new Error("Could not load saved backscatter observations: " + error.message);
    if (requestId !== s1BackscatterState.loadRequestId) return;
    const groups = new Map();
    (data || []).forEach(row => {
      const key = String(row.field_record_id);
      const list = groups.get(key) || [];
      list.push(row); groups.set(key, list);
    });
    const fields = [];
    groups.forEach((rows, fieldId) => {
      const pairs = new Map();
      rows.forEach(row => {
        const key = row.relative_orbit + "|" + row.orbit_direction;
        const pair = pairs.get(key) || { orbit: row.relative_orbit, direction: row.orbit_direction, rows: [] };
        pair.rows.push(row); pairs.set(key, pair);
      });
      const pair = [...pairs.values()].sort((a,b)=>b.rows.length-a.rows.length || a.orbit-b.orbit)[0];
      if (!pair) return;
      fields.push({
        fieldId, fieldNo: pair.rows[0].field_no, orbit: pair.orbit, orbitDirection: pair.direction,
        center: { latitude: Number(pair.rows[0].center_lat), longitude: Number(pair.rows[0].center_lon), method: pair.rows[0].center_method },
        bufferM: Number(pair.rows[0].buffer_m),
        observations: pair.rows.map(row => ({
          acquisitionId: row.acquisition_id, date: String(row.acquired_at).slice(0,10), acquiredAt: row.acquired_at,
          relativeOrbit: Number(row.relative_orbit), orbitDirection: row.orbit_direction,
          vvDb: Number(row.vv_db), vhDb: Number(row.vh_db), vvMinusVhDb: Number(row.vv_minus_vh_db),
          pixelCount: Number(row.pixel_count)
        }))
      });
    });
    s1BackscatterState.result = {
      ok: true, from: s1BackscatterState.from, to: s1BackscatterState.to,
      bufferM: Number(s1BackscatterState.bufferM || 50), processingVersion: "Saved observations",
      fields, errors: []
    };
    s1BackscatterState.savedKey = key;
    await s1BackscatterLoadAnnotations();
  } catch (error) {
    s1BackscatterState.error = error?.message || "Could not load saved backscatter data.";
  } finally {
    if (requestId === s1BackscatterState.loadRequestId) {
      s1BackscatterState.loadingSaved = false;
      if (typeof renderManager === "function") renderManager();
    }
  }
}
function bindS1BackscatterPanel() {
  const panel = document.getElementById("s1BackscatterPanel");
  if (!panel) return;
  panel.querySelectorAll("[data-s1-field]").forEach(input => input.addEventListener("change", () => {
    const id = String(input.dataset.s1Field);
    if (input.checked) {
      s1BackscatterState.selectedIds = [id];
    } else {
      s1BackscatterState.selectedIds = s1BackscatterState.selectedIds.filter(x => x !== id);
    }
    s1BackscatterState.selectionTouched = true;
    s1BackscatterState.savedKey = "";
    s1BackscatterState.result = null;
    s1BackscatterState.annotations = [];
    s1BackscatterState.annotationFieldId = s1BackscatterState.selectedIds[0] || "";
    const count = document.getElementById("s1SelectedCount");
    if (count) count.textContent = s1BackscatterState.selectedIds.length + " of 1 selected";
    if (typeof renderManager === "function") renderManager();
    if (s1BackscatterState.selectedIds.length) s1BackscatterLoadSaved(true);
  }));
  panel.querySelectorAll("[data-s1-value-labels]").forEach(input => input.addEventListener("change", () => {
    s1BackscatterState.showValueLabels = input.checked;
    renderManager();
  }));
  panel.querySelectorAll("[data-s1-metric]").forEach(input => input.addEventListener("change", () => {
    s1BackscatterState[input.dataset.s1Metric] = input.checked;
    renderManager();
  }));
  document.getElementById("s1Run")?.addEventListener("click", async () => {
    const fieldIds = s1BackscatterState.selectedIds.slice();
    const from = document.getElementById("s1From")?.value || "";
    const to = document.getElementById("s1To")?.value || "";
    const bufferM = Number(document.getElementById("s1Buffer")?.value || 50);
    const orbitText = document.getElementById("s1Orbit")?.value || "";
    const orbitDirection = document.getElementById("s1Direction")?.value || "AUTO";
    if (!fieldIds.length) { s1BackscatterState.error = "Select one mapped paddy field."; renderManager(); return; }
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) { s1BackscatterState.error = "Enter a valid start date and end date."; renderManager(); return; }
    if (from > to) { s1BackscatterState.error = "The start date must be on or before the end date."; renderManager(); return; }
    if ((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000 > 365) { s1BackscatterState.error = "The selected date range cannot exceed 365 days. Choose a shorter period."; renderManager(); return; }
    s1BackscatterState.from = from; s1BackscatterState.to = to; s1BackscatterState.bufferM = bufferM; s1BackscatterState.savedKey = "";
    s1BackscatterState.relativeOrbit = orbitText; s1BackscatterState.orbitDirection = orbitDirection;
    s1BackscatterState.loadRequestId++;
    s1BackscatterState.loadingSaved = false;
    s1BackscatterState.loading = true; s1BackscatterState.error = ""; s1BackscatterState.result = null;
    renderManager();
    try {
      const { data, error } = await supabaseClient.functions.invoke("s1-backscatter-trend", {
        body: { fieldIds, from, to, bufferM, relativeOrbit: orbitText ? Number(orbitText) : null,
          orbitDirection: orbitDirection === "AUTO" ? null : orbitDirection }
      });
      if (error) throw new Error(data?.error || error.message || "Backscatter analysis request failed.");
      if (!data?.ok) throw new Error(data?.error || "Backscatter analysis returned no result.");
      s1BackscatterState.result = data;
      s1BackscatterState.savedKey = s1BackscatterCurrentKey();
      await s1BackscatterLoadAnnotations();
    } catch (error) {
      s1BackscatterState.error = error?.message || "Could not generate the Sentinel-1 backscatter trend.";
    } finally {
      s1BackscatterState.loading = false;
      renderManager();
    }
  });
  document.getElementById("s1ExportCsv")?.addEventListener("click", s1BackscatterExportCsv);
  s1BackscatterLoadSaved();
  document.getElementById("s1ExportPng")?.addEventListener("click", s1BackscatterExportPng);
  document.getElementById("s1AnnotationField")?.addEventListener("change", e => s1BackscatterState.annotationFieldId = e.target.value);
  document.getElementById("s1AnnotationType")?.addEventListener("change", e => s1BackscatterState.annotationType = e.target.value);
  document.getElementById("s1AnnotationDate")?.addEventListener("change", e => s1BackscatterState.annotationDate = e.target.value);
  document.getElementById("s1AnnotationNotes")?.addEventListener("change", e => s1BackscatterState.annotationNotes = e.target.value);
  ["s1From","s1To","s1Buffer","s1Orbit","s1Direction"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", event => {
      if (id === "s1From") s1BackscatterState.from = event.target.value;
      if (id === "s1To") s1BackscatterState.to = event.target.value;
      if (id === "s1Buffer") s1BackscatterState.bufferM = Number(event.target.value || 50);
      if (id === "s1Orbit") s1BackscatterState.relativeOrbit = event.target.value;
      if (id === "s1Direction") s1BackscatterState.orbitDirection = event.target.value;
      s1BackscatterState.savedKey = "";
      s1BackscatterLoadSaved(true);
    });
  });
  document.getElementById("s1SaveAnnotation")?.addEventListener("click", async () => {
    const field = s1BackscatterFields().find(f => String(f.id) === String(s1BackscatterState.annotationFieldId));
    const eventDate = document.getElementById("s1AnnotationDate")?.value || "";
    const eventType = document.getElementById("s1AnnotationType")?.value || "planting";
    const notes = document.getElementById("s1AnnotationNotes")?.value || "";
    if (!field || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) { if (typeof notify === "function") notify("Choose a field and valid event date."); return; }
    const { error } = await supabaseClient.from("s1_backscatter_annotations").insert({
      company_id: activeCompanyId, field_record_id: field.id, field_no: field.fieldNo,
      event_type: eventType, event_date: eventDate, notes: notes || null
    });
    if (error) { s1BackscatterState.error = "Could not save marker: " + error.message; renderManager(); return; }
    s1BackscatterState.annotationDate = eventDate; s1BackscatterState.annotationNotes = "";
    try { await s1BackscatterLoadAnnotations(); } catch (e) { s1BackscatterState.error = e.message; }
    renderManager();
    if (typeof notify === "function") notify("Field activity marker saved.");
  });
}
