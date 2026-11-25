import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const CONNECTOR_URL = "https://anvora-eo-connector.raja-vadlamani.workers.dev/api/sentinel1";
const STAC_SEARCH_URL = "https://stac.dataspace.copernicus.eu/v1/search";
const PROCESSING_VERSION = "S1-GRD-GAMMA0-TERRAIN-MEDIAN-DB-1.0";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}
function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}
function finiteCoordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function fieldCenter(record: Record<string, unknown>) {
  const lat = finiteCoordinate(record.latitude ?? record.gpsLat ?? record.lat, -90, 90);
  const lon = finiteCoordinate(record.longitude ?? record.gpsLon ?? record.lon, -180, 180);
  if (lat !== null && lon !== null) return { lat, lon, method: "saved GPS point" };

  const raw = Array.isArray(record.boundaryPoints) ? record.boundaryPoints : [];
  const points: { lat: number; lon: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const accuracy = finiteCoordinate(p.accuracy, 0, 10000);
    if (accuracy !== null && accuracy > 30) continue;
    const pointLat = finiteCoordinate(p.lat, -90, 90);
    const pointLon = finiteCoordinate(p.lon ?? p.lng ?? p.longitude, -180, 180);
    if (pointLat !== null && pointLon !== null) points.push({ lat: pointLat, lon: pointLon });
  }
  if (points.length < 3) return null;
  return {
    lat: median(points.map(p => p.lat)),
    lon: median(points.map(p => p.lon)),
    method: "coordinate-wise median of saved GPS boundary points"
  };
}
function circleGeometry(lat: number, lon: number, radiusM: number) {
  const ring: [number, number][] = [];
  const latRad = lat * Math.PI / 180;
  for (let i = 0; i <= 48; i++) {
    const angle = (2 * Math.PI * i) / 48;
    const dLat = (radiusM * Math.cos(angle)) / 110574;
    const dLon = (radiusM * Math.sin(angle)) / (111320 * Math.max(0.01, Math.cos(latRad)));
    ring.push([lon + dLon, lat + dLat]);
  }
  const lons = ring.map(p => p[0]), lats = ring.map(p => p[1]);
  return {
    type: "Polygon",
    coordinates: [ring],
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
  };
}
async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const bodyText = await response.text();
    let body: any = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; }
    catch { body = { message: bodyText.slice(0, 400) }; }
    if (!response.ok) {
      throw new Error("HTTP " + response.status + ": " +
        String(body.error || body.message || body.detail || "Provider request failed").slice(0, 300));
    }
    return body;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw new Error("Satellite provider request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function itemOrbit(item: any) {
  const p = item?.properties || {};
  const orbit = Number(p["sat:relative_orbit"] ?? p["sat:relative_orbit_number"] ?? p.relativeOrbitNumber);
  const rawDirection = String(p["sat:orbit_state"] ?? p.orbitDirection ?? p.orbit_direction ?? "").toUpperCase();
  const direction = rawDirection.includes("ASC") ? "ASCENDING" :
    rawDirection.includes("DESC") ? "DESCENDING" : "";
  const mode = String(p["sar:instrument_mode"] ?? p.instrumentMode ?? "IW").toUpperCase();
  const pol = p["sar:polarizations"] ?? p["s1:polarization"] ?? p.polarisationChannels;
  const polText = Array.isArray(pol) ? pol.join(" ").toUpperCase() : String(pol ?? "").toUpperCase();
  if (mode !== "IW" || !Number.isInteger(orbit) || orbit < 1 || orbit > 175 || !direction) return null;
  if (polText && !(polText.includes("VV") && polText.includes("VH")) && !polText.includes("DV")) return null;
  return { orbit, direction };
}
async function catalogItems(geometry: any, from: string, to: string) {
  const body = await fetchJson(STAC_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/geo+json, application/json" },
    body: JSON.stringify({
      collections: ["sentinel-1-grd"],
      intersects: geometry,
      datetime: from + "T00:00:00Z/" + to + "T23:59:59Z",
      limit: 200
    })
  });
  const features = Array.isArray(body.features) ? body.features : [];
  return features.map((item: any) => {
    const orbit = itemOrbit(item);
    const acquiredAt = String(item?.properties?.datetime || item?.properties?.start_datetime || "");
    const date = acquiredAt.slice(0, 10);
    if (!orbit || !validDate(date) || date < from || date > to) return null;
    return {
      id: String(item.id || ""),
      acquiredAt,
      date,
      relativeOrbit: orbit.orbit,
      orbitDirection: orbit.direction,
      platform: String(item?.properties?.platform || ""),
      collection: String(item?.collection || "sentinel-1-grd")
    };
  }).filter((x: any) => x && x.id);
}
function chooseOrbit(items: any[], requestedOrbit: number | null, requestedDirection: string | null) {
  const filtered = items.filter(item =>
    (requestedOrbit === null || item.relativeOrbit === requestedOrbit) &&
    (!requestedDirection || item.orbitDirection === requestedDirection)
  );
  if (!filtered.length) throw new Error("No Sentinel-1 IW VV/VH acquisitions match this field, date range and orbit filter.");
  const counts = new Map<string, { orbit: number; direction: string; count: number }>();
  filtered.forEach(item => {
    const key = item.relativeOrbit + "|" + item.orbitDirection;
    const old = counts.get(key) || { orbit: item.relativeOrbit, direction: item.orbitDirection, count: 0 };
    old.count++;
    counts.set(key, old);
  });
  const options = [...counts.values()].sort((a, b) =>
    b.count - a.count || a.orbit - b.orbit || a.direction.localeCompare(b.direction)
  );
  const selected = options[0];
  const selectedItems = filtered.filter(item =>
    item.relativeOrbit === selected.orbit && item.orbitDirection === selected.direction
  );
  const byDate = new Map<string, any[]>();
  selectedItems.forEach(item => {
    const group = byDate.get(item.date) || [];
    group.push(item);
    byDate.set(item.date, group);
  });
  return {
    selected,
    options,
    acquisitions: [...byDate.entries()].map(([date, group]) => ({
      date,
      acquiredAt: group.map(x => x.acquiredAt).sort()[0],
      acquisitionId: group.map(x => x.id).sort().join("|"),
      itemIds: group.map(x => x.id).sort(),
      platform: [...new Set(group.map(x => x.platform).filter(Boolean))].join(",")
    })).sort((a, b) => a.date.localeCompare(b.date))
  };
}
const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "dataMask"], units: ["LINEAR_POWER", "LINEAR_POWER", "DN"] }],
    output: [
      { id: "vvDb", bands: 1, sampleType: "FLOAT32" },
      { id: "vhDb", bands: 1, sampleType: "FLOAT32" },
      { id: "differenceDb", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  if (s.dataMask === 0 || s.VV <= 0 || s.VH <= 0) {
    return { vvDb: [0], vhDb: [0], differenceDb: [0], dataMask: [0] };
  }
  var vv = 10 * Math.log(s.VV) / Math.LN10;
  var vh = 10 * Math.log(s.VH) / Math.LN10;
  return { vvDb: [vv], vhDb: [vh], differenceDb: [vv - vh], dataMask: [s.dataMask] };
}`;
function medianFrom(stats: any) {
  const value = stats?.percentiles?.["50.0"] ?? stats?.percentiles?.["50"];
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
}
function statFor(outputs: any, outputId: string) {
  return outputs?.[outputId]?.bands?.B0?.stats ??
    outputs?.[outputId]?.bands?.default?.stats ??
    null;
}
async function requestStatistics(geometry: any, from: string, to: string, direction: string) {
  const lat = (geometry.bbox[1] + geometry.bbox[3]) / 2;
  const resx = 10 / (111320 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  const resy = 10 / 110574;
  const payload = {
    operation: "sentinel1-statistics",
    input: {
      bounds: {
        bbox: geometry.bbox,
        geometry,
        properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" }
      },
      data: [{
        type: "sentinel-1-grd",
        dataFilter: { acquisitionMode: "IW", polarization: "DV", orbitDirection: direction },
        processing: { orthorectify: true, backCoeff: "GAMMA0_TERRAIN", demInstance: "COPERNICUS_30" }
      }]
    },
    aggregation: {
      timeRange: {
        from: new Date(from + "T00:00:00.000Z").toISOString(),
        to: new Date(to + "T23:59:59.999Z").toISOString()
      },
      aggregationInterval: { of: "P1D" },
      evalscript: EVALSCRIPT,
      resx,
      resy
    },
    calculations: {
      vvDb: { statistics: { default: { percentiles: { k: [50] } } } },
      vhDb: { statistics: { default: { percentiles: { k: [50] } } } },
      differenceDb: { statistics: { default: { percentiles: { k: [50] } } } }
    },
    providerEndpoint: "https://sh.dataspace.copernicus.eu/statistics/v1",
    requestedAt: new Date().toISOString(),
    clientVersion: PROCESSING_VERSION
  };
  return await fetchJson(CONNECTOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  }, 90000);
}
async function processField(admin: any, field: any, from: string, to: string,
  bufferM: number, requestedOrbit: number | null, requestedDirection: string | null) {
  const record = field.record_data || {};
  const center = fieldCenter(record);
  if (!center) throw new Error("No reliable GPS reference point. At least three valid saved GPS boundary points or a saved GPS point are required.");
  const geometry = circleGeometry(center.lat, center.lon, bufferM);
  const items = await catalogItems(geometry, from, to);
  const chosen = chooseOrbit(items, requestedOrbit, requestedDirection);
  const statsResponse = await requestStatistics(geometry, from, to, chosen.selected.direction);
  const intervals = Array.isArray(statsResponse?.data?.data) ? statsResponse.data.data :
    Array.isArray(statsResponse?.data) ? statsResponse.data : [];
  const byDate = new Map<string, any>();
  intervals.forEach((item: any) => {
    const date = String(item?.interval?.from || item?.interval?.to || "").slice(0, 10);
    if (validDate(date)) byDate.set(date, item);
  });
  const rows: any[] = [];
  const missingDates: string[] = [];
  for (const acquisition of chosen.acquisitions) {
    const interval = byDate.get(acquisition.date);
    const outputs = interval?.outputs || {};
    const vvStats = statFor(outputs, "vvDb");
    const vhStats = statFor(outputs, "vhDb");
    const diffStats = statFor(outputs, "differenceDb");
    const vv = medianFrom(vvStats), vh = medianFrom(vhStats), diff = medianFrom(diffStats);
    const sampleCount = Number(vvStats?.sampleCount ?? 0);
    const noDataCount = Number(vvStats?.noDataCount ?? 0);
    const pixelCount = Math.max(0, sampleCount - noDataCount);
    if (vv === null || vh === null || diff === null || pixelCount < 1) {
      missingDates.push(acquisition.date);
      continue;
    }
    rows.push({
      company_id: field.company_id,
      field_record_id: field.id,
      field_no: field.field_no,
      acquisition_id: acquisition.acquisitionId,
      acquired_at: acquisition.acquiredAt,
      relative_orbit: chosen.selected.orbit,
      orbit_direction: chosen.selected.direction,
      vv_db: Number(vv.toFixed(4)),
      vh_db: Number(vh.toFixed(4)),
      vv_minus_vh_db: Number(diff.toFixed(4)),
      pixel_count: pixelCount,
      buffer_m: bufferM,
      center_lat: center.lat,
      center_lon: center.lon,
      center_method: center.method,
      processing_version: PROCESSING_VERSION,
      source_metadata: {
        collection: "sentinel-1-grd",
        instrument_mode: "IW",
        polarisation: ["VV", "VH"],
        backscatter_coefficient: "Gamma0 terrain-corrected",
        units: "dB",
        item_ids: acquisition.itemIds,
        platform: acquisition.platform,
        acquisition_date: acquisition.date,
        statistics: "50th percentile of valid pixels within the circular buffer",
        sample_count: sampleCount,
        no_data_count: noDataCount,
        catalog_relative_orbit: chosen.selected.orbit,
        catalog_orbit_direction: chosen.selected.direction
      }
    });
  }
  if (rows.length) {
    const { error } = await admin.from("s1_backscatter_observations").upsert(rows, {
      onConflict: "company_id,field_record_id,acquisition_id,buffer_m,processing_version"
    });
    if (error) throw new Error("Could not persist backscatter observations: " + error.message);
  }
  return {
    fieldId: field.id,
    fieldNo: field.field_no,
    center: { latitude: center.lat, longitude: center.lon, method: center.method },
    bufferM,
    orbit: chosen.selected.orbit,
    orbitDirection: chosen.selected.direction,
    orbitOptions: chosen.options,
    acquisitionCount: chosen.acquisitions.length,
    savedCount: rows.length,
    missingDates,
    observations: rows.map(row => ({
      acquisitionId: row.acquisition_id,
      date: row.acquired_at.slice(0, 10),
      acquiredAt: row.acquired_at,
      relativeOrbit: row.relative_orbit,
      orbitDirection: row.orbit_direction,
      vvDb: row.vv_db,
      vhDb: row.vh_db,
      vvMinusVhDb: row.vv_minus_vh_db,
      pixelCount: row.pixel_count
    }))
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return json({ error: "Supabase server configuration is incomplete." }, 500);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in to run backscatter analysis." }, 401);
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const fieldIds = Array.isArray(body.fieldIds) ? [...new Set(body.fieldIds.map(String))] : [];
  const from = body.from, to = body.to;
  const bufferM = Number(body.bufferM ?? 50);
  const requestedOrbit = body.relativeOrbit === null || body.relativeOrbit === undefined || body.relativeOrbit === "" ? null : Number(body.relativeOrbit);
  const requestedDirection = body.orbitDirection === "ASCENDING" || body.orbitDirection === "DESCENDING" ? body.orbitDirection : null;
  if (!fieldIds.length || fieldIds.length > 5) return json({ error: "Select between one and five fields." }, 400);
  if (!validDate(from) || !validDate(to) || from > to) return json({ error: "Choose a valid date range." }, 400);
  if ((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000 > 365) return json({ error: "The date range cannot exceed 365 days." }, 400);
  if (!Number.isInteger(bufferM) || bufferM < 10 || bufferM > 500) return json({ error: "Buffer radius must be between 10 and 500 metres." }, 400);
  if (requestedOrbit !== null && (!Number.isInteger(requestedOrbit) || requestedOrbit < 1 || requestedOrbit > 175)) return json({ error: "Relative orbit must be an integer from 1 to 175." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: memberships, error: membershipError } = await admin.from("company_memberships")
    .select("company_id").eq("user_id", authData.user.id).eq("status", "active");
  if (membershipError) return json({ error: "Could not verify company access." }, 500);
  const companyIds = [...new Set((memberships || []).map((m: any) => m.company_id))];
  if (!companyIds.length) return json({ error: "Your account has no active company membership." }, 403);

  const { data: fields, error: fieldError } = await admin.from("beta_field_records")
    .select("id,company_id,field_no,record_data").in("id", fieldIds);
  if (fieldError) return json({ error: "Could not load the selected field records." }, 500);
  if (!fields || fields.length !== fieldIds.length || fields.some((f: any) => !companyIds.includes(f.company_id))) {
    return json({ error: "One or more selected fields are unavailable in your company workspace." }, 403);
  }
  const companySet = new Set(fields.map((f: any) => f.company_id));
  if (companySet.size !== 1) return json({ error: "Select fields from one company workspace at a time." }, 400);
  const nonPaddy = fields.filter((f: any) => !/paddy|rice/i.test(String(f.record_data?.crop || "")));
  if (nonPaddy.length) return json({ error: "This screening view is currently limited to Paddy/Rice field records." }, 400);

  const results: any[] = [];
  const errors: any[] = [];
  for (const field of fields) {
    try {
      results.push(await processField(admin, field, from, to, bufferM, requestedOrbit, requestedDirection));
    } catch (error) {
      errors.push({ fieldNo: field.field_no, error: String((error as Error)?.message || error).slice(0, 500) });
    }
  }
  if (!results.length) return json({ error: "Backscatter analysis could not be completed for the selected fields.", details: errors }, 502);
  return json({
    ok: true,
    from,
    to,
    bufferM,
    processingVersion: PROCESSING_VERSION,
    fields: results,
    errors,
    note: "Screening view only. Backscatter trends are not soil moisture and do not confirm a drainage event on their own."
  });
});
