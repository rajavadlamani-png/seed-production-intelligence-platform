const endpoint = 'https://anvora-eo-connector.raja-vadlamani.workers.dev/api/sentinel1';

const bbox = [79.0, 17.0, 79.1, 17.1];
const ring = [
  [79.0, 17.0],
  [79.1, 17.0],
  [79.1, 17.1],
  [79.0, 17.1],
  [79.0, 17.0]
];

const evalscript = '//VERSION=3\nfunction setup(){return {input:[{bands:["VV","VH","dataMask"]}],output:[{id:"backscatter",bands:2,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]};}\nfunction evaluatePixel(samples){return {backscatter:[samples.VV,samples.VH],dataMask:[samples.dataMask]};}';
const payload = {
  operation: 'sentinel1-statistics',
  input: {
      bounds: {
        bbox,
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' }
      },
      data: [{
        type: 'sentinel-1-grd',
        dataFilter: {},
        processing: { orthorectify: true, backCoeff: 'GAMMA0_TERRAIN' }
      }]
    },
    aggregation: {
      timeRange: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-26T23:59:59.999Z' },
      aggregationInterval: { of: 'P1D' },
      evalscript,
      resx: 10,
      resy: 10
    },
    calculations: { default: { statistics: { default: { percentiles: { k: [10, 50, 90] } } } } },
  providerEndpoint: 'https://sh.dataspace.copernicus.eu/statistics/v1',
  acquisition: {
    plotId: 'PLOT-R002',
    acquisitionId: null,
    acquisitionDateTime: null,
    requestedBbox: bbox
  },
  requestedAt: new Date().toISOString(),
  clientVersion: 'SEED-PRODUCTION-MONITOR-EO-SMOKE-0.1'
};

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(90000)
});
const raw = await response.text();
let result;
try { result = raw ? JSON.parse(raw) : {}; }
catch { throw new Error(`Worker returned non-JSON (HTTP ${response.status}).`); }

if (!response.ok) {
  throw new Error(`Worker HTTP ${response.status}: ${String(result.error || result.message || JSON.stringify(result)).slice(0, 1000)}`);
}
if (result.status !== 'OK' || result.simulated === true) {
  throw new Error(`Worker did not confirm a real observation. status=${String(result.status)} provider=${String(result.provider || 'not stated')}`);
}
console.log(JSON.stringify({
  test: 'Sentinel-1 Worker polygon smoke test',
  status: result.status,
  provider: result.provider || null,
  plotId: result.plotId || result.acquisition?.plotId || 'PLOT-R002',
  measuredAt: result.measuredAt || null,
  upstreamHttpStatus: result.upstreamHttpStatus || null
}, null, 2));
