import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const SENTINEL1_URL = "https://anvora-eo-connector.raja-vadlamani.workers.dev/api/sentinel1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-vwc-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}
function localDateIndia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return values.year + "-" + values.month + "-" + values.day;
}
function daysAgo(date: string, count: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - count);
  return d.toISOString().slice(0, 10);
}
function fieldBoundary(record: Record<string, unknown>) {
  const raw = Array.isArray(record.boundaryPoints) ? record.boundaryPoints : [];
  const ring: [number, number][] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const lat = Number(p.lat), lon = Number(p.lon ?? p.lng ?? p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const prev = ring[ring.length - 1];
    if (!prev || prev[0] !== lon || prev[1] !== lat) ring.push([lon, lat]);
  }
  if (ring.length < 3) return null;
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
  const lons = ring.map(p => p[0]), lats = ring.map(p => p[1]);
  const bbox: [number, number, number, number] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], cross = a[0] * b[1] - b[0] * a[1];
    area += cross; cx += (a[0] + b[0]) * cross; cy += (a[1] + b[1]) * cross;
  }
  const lat = Math.abs(area) > 1e-12 ? cy / (3 * area) : lats.reduce((s, v) => s + v, 0) / lats.length;
  const lon = Math.abs(area) > 1e-12 ? cx / (3 * area) : lons.reduce((s, v) => s + v, 0) / lons.length;
  return {
    geometry: { type: "Polygon", coordinates: [ring] },
    bbox, lat, lon,
    bounds: { bbox, geometry: { type: "Polygon", coordinates: [ring] }, properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } }
  };
}
async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 500) }; }
    if (!response.ok) throw new Error("HTTP " + response.status + ": " + String(body.error || body.message || "Provider request failed").slice(0, 300));
    return body;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw new Error("Provider request timed out.");
    throw error;
  } finally { clearTimeout(timer); }
}
function coordinateFor(record: Record<string, unknown>) {
  const b = fieldBoundary(record);
  if (b) return { lat: b.lat, lon: b.lon };
  const lat = Number(record.latitude ?? record.gpsLat ?? record.lat);
  const lon = Number(record.longitude ?? record.gpsLon ?? record.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
function gridKey(point: { lat: number; lon: number }) {
  return Number(point.lat).toFixed(2) + "," + Number(point.lon).toFixed(2);
}
async function openMeteoForecast(point: { lat: number; lon: number }, date: string) {
  const params = new URLSearchParams({
    latitude: Number(point.lat).toFixed(2), longitude: Number(point.lon).toFixed(2),
    timezone: "Asia/Kolkata", forecast_days: "7", hourly: "soil_moisture_9_to_27cm"
  });
  const data = await fetchJson("https://api.open-meteo.com/v1/forecast?" + params.toString());
  const times: string[] = data?.hourly?.time || [];
  const values: unknown[] = data?.hourly?.soil_moisture_9_to_27cm || [];
  const target = date + "T12:00";
  let index = times.findIndex(t => t === target);
  if (index < 0) {
    let best = Infinity;
    for (let i = 0; i < times.length; i++) {
      if (!String(times[i]).startsWith(date)) continue;
      const hour = Number(String(times[i]).slice(11, 13));
      const gap = Math.abs(hour - 12);
      if (gap < best) { best = gap; index = i; }
    }
  }
  if (index < 0) throw new Error("No 12:00 IST soil-moisture value returned for " + date + ".");
  const sample = values.slice(index, index + 6).map(Number).filter(v => Number.isFinite(v) && v >= 0 && v <= 1);
  if (!sample.length) throw new Error("No valid 9–27 cm soil-moisture values returned around 12:00 IST.");
  const vwc = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  return {
    vwc, validHours: sample.length, sourceTime: date + "T12:00:00+05:30",
    grid: { latitude: data.latitude, longitude: data.longitude, elevation: data.elevation, timezone: data.timezone }
  };
}
async function openMeteoArchive(point: { lat: number; lon: number }, from: string, to: string) {
  const params = new URLSearchParams({
    latitude: Number(point.lat).toFixed(2), longitude: Number(point.lon).toFixed(2),
    start_date: from, end_date: to, daily: "soil_moisture_7_to_28cm_mean",
    models: "era5_land", timezone: "Asia/Kolkata"
  });
  const data = await fetchJson("https://archive-api.open-meteo.com/v1/archive?" + params.toString());
  const dates: string[] = data?.daily?.time || [];
  const values: unknown[] = data?.daily?.soil_moisture_7_to_28cm_mean || [];
  const reference = new Map<string, number>();
  dates.forEach((date, i) => {
    const v = Number(values[i]);
    if (values[i] !== null && values[i] !== undefined && Number.isFinite(v) && v >= 0 && v <= 1) reference.set(date, v);
  });
  return { reference, grid: { latitude: data.latitude, longitude: data.longitude, elevation: data.elevation } };
}
async function sentinel1Rows(record: Record<string, unknown>, from: string, to: string) {
  const boundary = fieldBoundary(record);
  if (!boundary) throw new Error("No usable GPS field boundary.");
  const resx = 10 / (111320 * Math.cos(boundary.lat * Math.PI / 180));
  const resy = 10 / 110574;
  const evalscript = [
    "//VERSION=3",
    "function setup(){return {input:[{bands:[\"VV\",\"VH\",\"dataMask\"]}],output:[{id:\"backscatter\",bands:2,sampleType:\"FLOAT32\"},{id:\"dataMask\",bands:1}]};}",
    "function evaluatePixel(samples){return {backscatter:[samples.VV,samples.VH],dataMask:[samples.dataMask]};}"
  ].join("\n");
  const payload = {
    operation: "sentinel1-statistics",
    input: { bounds: boundary.bounds, data: [{ type: "sentinel-1-grd", dataFilter: {}, processing: { orthorectify: true, backCoeff: "GAMMA0_TERRAIN" } }] },
    aggregation: {
      timeRange: { from: new Date(from + "T00:00:00.000Z").toISOString(), to: new Date(to + "T23:59:59.999Z").toISOString() },
      aggregationInterval: { of: "P1D" }, evalscript, resx, resy
    },
    calculations: { default: { statistics: { default: { percentiles: { k: [10, 50, 90] } } } } },
    providerEndpoint: "https://sh.dataspace.copernicus.eu/statistics/v1",
    acquisition: { plotId: String(record.field_no || record.id || "FIELD"), acquisitionId: null, acquisitionDateTime: null, requestedBbox: boundary.bbox },
    requestedAt: new Date().toISOString(), clientVersion: "SEED-PRODUCTION-MONITOR-VWC-DAILY-1.0"
  };
  const data = await fetchJson(SENTINEL1_URL, {
    method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload)
  }, 45000);
  const intervals = Array.isArray(data?.data?.data) ? data.data.data : [];
  const rows: { date: string; vv: number; vh: number; acquisitionAt: string }[] = [];
  for (const item of intervals) {
    const bands = item?.outputs?.backscatter?.bands || {};
    const vvRaw = bands.B0?.stats?.mean ?? bands.B0?.mean;
    const vhRaw = bands.B1?.stats?.mean ?? bands.B1?.mean;
    const vv = Number(vvRaw), vh = Number(vhRaw);
    const date = String(item?.interval?.to || item?.interval?.from || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(vv) && Number.isFinite(vh)) {
      rows.push({ date, vv, vh, acquisitionAt: String(item?.interval?.to || item?.interval?.from || "") });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
function nearestReference(date: string, reference: Map<string, number>, tolerance = 2) {
  let best: { value: number; date: string; gap: number } | null = null;
  for (const [refDate, value] of reference.entries()) {
    const gap = Math.abs((Date.parse(date + "T00:00:00Z") - Date.parse(refDate + "T00:00:00Z")) / 86400000);
    if (!best || gap < best.gap) best = { value, date: refDate, gap };
  }
  return best && best.gap <= tolerance ? best : null;
}
function solve(matrix: number[][], vector: number[]) {
  const n = vector.length, a = matrix.map((row, i) => row.slice().concat([vector[i]]));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("Sentinel-1 ridge model matrix is singular.");
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
function fitModel(pairs: { fieldNo: string; vv: number; vh: number; target: number }[]) {
  if (pairs.length < 8 || new Set(pairs.map(x => x.fieldNo)).size < 2) return null;
  const keys = ["vv", "vh"], means: Record<string, number> = {}, scales: Record<string, number> = {};
  for (const key of keys) {
    means[key] = pairs.reduce((s, r) => s + (r as any)[key], 0) / pairs.length;
    const variance = pairs.reduce((s, r) => s + (((r as any)[key] - means[key]) ** 2), 0) / pairs.length;
    scales[key] = Math.sqrt(variance) || 1;
  }
  const p = keys.length + 1, xtx = Array.from({ length: p }, () => Array(p).fill(0)), xty = Array(p).fill(0);
  for (const row of pairs) {
    const x = [1, ...keys.map(key => ((row as any)[key] - means[key]) / scales[key])];
    for (let i = 0; i < p; i++) {
      xty[i] += x[i] * row.target;
      for (let j = 0; j < p; j++) xtx[i][j] += x[i] * x[j];
    }
  }
  for (let i = 1; i < p; i++) xtx[i][i] += 1;
  const coefficients = solve(xtx, xty);
  const model = { keys, means, scales, coefficients, trainingCount: pairs.length, trainingFields: new Set(pairs.map(x => x.fieldNo)).size, alpha: 1 };
  const residuals = pairs.map(row => applyModel(model, row.vv, row.vh) - row.target);
  return { ...model, alignmentRmse: Math.sqrt(residuals.reduce((s, x) => s + x * x, 0) / residuals.length) };
}
function applyModel(model: any, vv: number, vh: number) {
  const x = [1, (vv - model.means.vv) / model.scales.vv, (vh - model.means.vh) / model.scales.vh];
  return Math.max(0, Math.min(1, x.reduce((sum, value, i) => sum + value * model.coefficients[i], 0)));
}
async function eachLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return json({ error: "Supabase server configuration is incomplete." }, 500);

  const token = req.headers.get("x-vwc-cron-token") || "";
  if (!token) return json({ error: "Scheduled capture token is required." }, 401);
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authorised, error: authError } = await anon.rpc("verify_vwc_cron_token", { p_token: token });
  if (authError || authorised !== true) return json({ error: "Scheduled capture token is invalid.", detail: authError?.message || null, code: authError?.code || null, authorised }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = localDateIndia();
  const from = daysAgo(today, 90);
  const to = today;
  const startedAt = new Date().toISOString();

  const { data: records, error: recordError } = await admin
    .from("beta_field_records")
    .select("id,company_id,season_key,field_no,record_data")
    .limit(2000);
  if (recordError) return json({ error: "Could not load mapped field records.", detail: recordError.message }, 500);

  const mapped = (records || []).map((row: any) => ({
    id: row.id, companyId: row.company_id, seasonKey: row.season_key, fieldNo: row.field_no,
    record: { ...(row.record_data || {}), id: row.id, fieldNo: row.field_no }
  })).filter((x: any) => Array.isArray(x.record.boundaryPoints) && x.record.boundaryPoints.length >= 3 && fieldBoundary(x.record));

  const companies = [...new Set(mapped.map((x: any) => x.companyId))];
  const summaries: any[] = [];

  for (const companyId of companies) {
    const companyFields = mapped.filter((x: any) => x.companyId === companyId);
    const { data: run, error: runError } = await admin.from("field_vwc_capture_runs").insert({
      company_id: companyId, started_at: startedAt, status: "running", fields_scanned: companyFields.length
    }).select("id").single();
    if (runError) continue;

    let primarySaved = 0, sentinelSaved = 0, failed = 0;
    const errors: any[] = [];
    const forecastCache = new Map<string, Promise<any>>();
    const prepared = await eachLimit(companyFields, 5, async (field: any) => {
      const point = coordinateFor(field.record);
      if (!point) return { field, forecast: null, satellite: [], reference: new Map(), error: "No usable field coordinate." };
      const key = gridKey(point);
      if (!forecastCache.has(key)) forecastCache.set(key, openMeteoForecast(point, today));
      const [forecast, satelliteResult, archiveResult] = await Promise.allSettled([
        forecastCache.get(key) as Promise<any>,
        sentinel1Rows(field.record, from, to),
        openMeteoArchive(point, from, to)
      ]);
      return {
        field,
        forecast: forecast.status === "fulfilled" ? forecast.value : null,
        satellite: satelliteResult.status === "fulfilled" ? satelliteResult.value : [],
        reference: archiveResult.status === "fulfilled" ? archiveResult.value.reference : new Map<string, number>(),
        grid: archiveResult.status === "fulfilled" ? archiveResult.value.grid : null,
        forecastError: forecast.status === "rejected" ? String(forecast.reason?.message || forecast.reason) : "",
        satelliteError: satelliteResult.status === "rejected" ? String(satelliteResult.reason?.message || satelliteResult.reason) : "",
        archiveError: archiveResult.status === "rejected" ? String(archiveResult.reason?.message || archiveResult.reason) : ""
      };
    });

    const trainingPairs: any[] = [];
    for (const item of prepared) {
      if (item.satellite?.length && item.reference?.size) {
        for (const row of item.satellite) {
          const ref = nearestReference(row.date, item.reference, 2);
          if (ref) trainingPairs.push({ fieldNo: item.field.fieldNo, vv: row.vv, vh: row.vh, target: ref.value });
        }
      }
    }
    const model = fitModel(trainingPairs);
    const upserts: any[] = [];
    for (const item of prepared) {
      const field = item.field;
      if (item.forecast) {
        upserts.push({
          company_id: companyId, field_record_id: field.id, field_no: field.fieldNo, season_key: field.seasonKey,
          observed_on: today, vwc_m3_m3: Number(item.forecast.vwc.toFixed(6)),
          source: "open_meteo_soil_moisture", source_label: "Open-Meteo Soil-moisture tab series",
          provider: "Open-Meteo", product_or_sensor: "Forecast · soil_moisture_9_to_27cm",
          depth_cm: "9–27", source_observed_at: item.forecast.sourceTime,
          model_version: null, quality_flag: "model_estimate",
          metadata: { valid_hours: item.forecast.validHours, grid: item.forecast.grid, selection: "mean of up to six hourly values from 12:00 IST", timezone: "Asia/Kolkata" }
        });
      } else {
        errors.push({ fieldNo: field.fieldNo, source: "Open-Meteo forecast", error: item.forecastError || "No value returned." });
      }
      if (model && item.satellite?.length) {
        for (const row of item.satellite) {
          const vwc = applyModel(model, row.vv, row.vh);
          upserts.push({
            company_id: companyId, field_record_id: field.id, field_no: field.fieldNo, season_key: field.seasonKey,
            observed_on: row.date, vwc_m3_m3: Number(vwc.toFixed(6)),
            source: "sentinel1_model_estimate", source_label: "Sentinel-1 VV/VH · provisional model estimate",
            provider: "Copernicus Data Space via Anvora EO Connector", product_or_sensor: "Sentinel-1 GRD · VV/VH",
            depth_cm: "Model-aligned reference 7–28", source_observed_at: row.acquisitionAt || null,
            model_version: "S1-OPENMETEO-ALIGN-0.2",
            quality_flag: "provisional_model_aligned",
            metadata: { vv: row.vv, vh: row.vh, training_pairs: model.trainingCount, training_fields: model.trainingFields, alignment_rmse_m3_m3: model.alignmentRmse, alpha: model.alpha, reference: "Open-Meteo ERA5-Land soil_moisture_7_to_28cm_mean", reference_grid: item.grid || null }
          });
        }
      } else if (item.satelliteError) {
        errors.push({ fieldNo: field.fieldNo, source: "Sentinel-1", error: item.satelliteError });
      }
    }
    if (upserts.length) {
      const { error } = await admin.from("field_vwc_observations").upsert(upserts, {
        onConflict: "company_id,field_record_id,observed_on,source"
      });
      if (error) {
        failed += companyFields.length;
        errors.push({ source: "Database upsert", error: error.message });
      } else {
        primarySaved = upserts.filter(x => x.source === "open_meteo_soil_moisture").length;
        sentinelSaved = upserts.filter(x => x.source === "sentinel1_model_estimate").length;
      }
    }
    const failedFields = new Set(errors.map(x => x.fieldNo).filter(Boolean));
    failed = Math.max(failed, failedFields.size);
    const status = failed === 0 ? "completed" : (primarySaved + sentinelSaved > 0 ? "partial" : "failed");
    await admin.from("field_vwc_capture_runs").update({
      completed_at: new Date().toISOString(), status, open_meteo_saved: primarySaved,
      sentinel1_saved: sentinelSaved, fields_failed: failed,
      details: {
        scheduled_timezone: "Asia/Kolkata", scheduled_local_date: today,
        satellite_training_pairs: trainingPairs.length, satellite_training_fields: model?.trainingFields || 0,
        satellite_model_version: model ? "S1-OPENMETEO-ALIGN-0.2" : null,
        satellite_model_unavailable_reason: model ? null : "At least 8 matched pairs across at least 2 fields are required.",
        errors: errors.slice(0, 100)
      }
    }).eq("id", run.id);
    summaries.push({ companyId, runId: run.id, fieldsScanned: companyFields.length, openMeteoSaved: primarySaved, sentinel1Saved: sentinelSaved, fieldsFailed: failed, status });
  }

  return json({
    ok: true, scheduledLocalDate: today, timezone: "Asia/Kolkata",
    scheduleTarget: "12:00 PM IST", mappedFields: mapped.length, companies: summaries,
    note: "Open-Meteo values are model estimates from the Soil-moisture tab's 9–27 cm forecast. Sentinel-1 VWC is a provisional model-aligned estimate and is only available when enough matched multi-field training observations exist. Sentinel-1 acquisitions are not daily."
  });
});