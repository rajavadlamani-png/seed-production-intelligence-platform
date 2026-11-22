const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
  URLSearchParams,
  Date,
  Math,
  Number,
  Map,
  Set,
  Array,
  Object,
  String,
  Error,
  RegExp,
  ROOT_ZONE_VWC_THRESHOLD: 0.15,
  rootVwcEscape(value) { return String(value).replace(/[&<>\"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[ch])); },
  rootVwcDaysBetween(a, b) {
    return Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000;
  }
};
vm.runInNewContext(fs.readFileSync('beta/sde-model-aligned.js', 'utf8'), context);

const pairs = [];
for (let i = 0; i < 15; i++) {
  const vv = -16 + i * 0.35 + (i % 3) * 0.08;
  const vh = -23 + i * 0.22 + (i % 4) * 0.05;
  const targetVwc = Math.max(0.08, Math.min(0.42, 0.24 + 0.012 * (vv + 12) - 0.009 * (vh + 19)));
  pairs.push({ fieldNo: 'F-' + (i % 3 + 1), date: '2026-06-' + String(i + 1).padStart(2, '0'), vv, vh, targetVwc });
}
const model = context.sdeAlignedFitModel(pairs, 1);
assert.equal(model.trainingCount, 15);
assert.equal(model.trainingFields, 3);
assert.ok(Number.isFinite(model.alignmentRmse));
assert.ok(model.alignmentRmse < 0.08, 'ridge fit should align to the supplied model-reference series');
const estimate = context.sdeAlignedApplyModel(model, { vv: -12.5, vh: -19.5 });
assert.ok(estimate >= 0 && estimate <= 1, 'estimated VWC must remain within physical bounds');

const matched = context.sdeAlignedMatchReference(
  [{ fieldNo: 'F-1', date: '2026-06-10', vv: -12, vh: -19 }, { fieldNo: 'F-1', date: '2026-06-20', vv: -11, vh: -18 }],
  new Map([['2026-06-11', 0.21], ['2026-06-30', 0.18]]),
  2
);
assert.equal(matched.length, 1);
assert.equal(matched[0].referenceDate, '2026-06-11');
assert.equal(matched[0].targetVwc, 0.21);

const url = new URL(context.sdeAlignedArchiveUrl({ lat: 19.1234, lon: 73.9876 }, '2026-06-01', '2026-08-31'));
assert.equal(url.hostname, 'archive-api.open-meteo.com');
assert.equal(url.searchParams.get('daily'), 'soil_moisture_7_to_28cm_mean');
assert.equal(url.searchParams.get('models'), 'era5_land');
assert.equal(url.searchParams.get('start_date'), '2026-06-01');

const predictions = context.sdeAlignedBuildOperationalSeries(model, [{ fieldNo: 'F-1', date: '2026-08-01', vv: -12, vh: -19 }]);
assert.equal(predictions.length, 1);
assert.equal(predictions[0].split, 'operational');
assert.equal(predictions[0].windowId, 'OPEN-METEO-ERA5LAND-7-28CM');
assert.ok(predictions[0].predictedVwc >= 0 && predictions[0].predictedVwc <= 1);

const chart = context.sdeAlignedChartMarkup([
  { fieldNo: 'F-1', date: '2026-08-01', predictedVwc: 0.35 },
  { fieldNo: 'F-1', date: '2026-08-08', predictedVwc: 0.35 },
  { fieldNo: 'F-1', date: '2026-08-15', predictedVwc: 0.20 },
  { fieldNo: 'F-1', date: '2026-08-22', predictedVwc: 0.15 }
]);
assert.match(chart, />35%<\/text>/);
assert.match(chart, />20%<\/text>/);
assert.match(chart, />15%<\/text>/);
assert.match(chart, /15% reference threshold/);
assert.match(chart, /VWC/);

assert.throws(() => context.sdeAlignedFitModel(pairs.slice(0, 7)), /At least 8 matched/);
assert.throws(() => context.sdeAlignedFitModel(pairs.map(x => ({ ...x, fieldNo: 'ONE-FIELD' }))), /at least 2 mapped fields/);
console.log('SDE Sentinel-1 / Open-Meteo model-alignment tests passed.');
