import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const EARTHDATA_TOKEN = Deno.env.get("EARTHDATA_BEARER_TOKEN") ?? "";
const HARMONY_ROOT = (Deno.env.get("HARMONY_ROOT") ?? "https://harmony.earthdata.nasa.gov").replace(/\/$/, "");
const COLLECTION_SHORT_NAME = Deno.env.get("NISAR_GCOV_COLLECTION_SHORT_NAME") ?? "NISAR_L2_GCOV_PROVISIONAL_V1";
const PROCESSOR_URL = (Deno.env.get("NISAR_PROCESSOR_URL") ?? "").replace(/\/$/, "");
const PROCESSOR_TOKEN = Deno.env.get("NISAR_PROCESSOR_TOKEN") ?? "";
const PROCESSING_VERSION = "NISAR-GCOV-ZONAL-0.2.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function safeError(error: unknown) {
  return String((error as Error)?.message ?? error).replace(/https?:\/\/[^\s]+/g, "[provider-url]").slice(0, 500);
}

async function readResponse(response: Response) {
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { message: text.slice(0, 500) }; }
  if (!response.ok) {
    throw new Error("HTTP " + response.status + ": " +
      String(body.message ?? body.detail ?? body.error ?? body.description ?? "Provider request failed").slice(0, 350));
  }
  return body;
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await readResponse(response);
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw new Error("External processing request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function requireConfiguration() {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error("Supabase server configuration is incomplete.");
}

function getExactFieldPolygon(record: Record<string, any>) {
  const raw = record.boundaryPoints;
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 8000) {
    throw new Error("The saved field boundary must contain between 3 and 8,000 points.");
  }
  const ring: [number, number][] = raw.map((point: any, index: number) => {
    const lat = Number(point?.lat);
    const lon = Number(point?.lon ?? point?.lng ?? point?.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new Error("Saved field boundary contains an invalid coordinate at point " + (index + 1) + ".");
    }
    return [lon, lat];
  });
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  if (ring.length < 4) throw new Error("The saved field boundary is not a valid polygon ring.");
  const lons = ring.map(p => p[0]);
  const lats = ring.map(p => p[1]);
  return {
    geometry: { type: "Polygon", coordinates: [ring] },
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
    originalPointCount: raw.length
  };
}

function parseProductName(productName: string) {
  const parts = productName.replace(/\.h5$/i, "").split("_");
  if (parts.length < 18 || parts[0] !== "NISAR" || parts[1] !== "L2" || parts[3] !== "GCOV") {
    throw new Error("Expected a complete NISAR L2 GCOV granule filename.");
  }
  if (!["PR", "UR", "OD"].includes(parts[2])) throw new Error("Unrecognized NISAR GCOV processing type.");
  if (!/^\d{8}T\d{6}$/.test(parts[11])) throw new Error("The product filename has an invalid acquisition start time.");
  return {
    processingType: parts[2],
    mode: parts[8],
    polarizationMode: parts[9],
    acquiredAt: parts[11].slice(0, 4) + "-" + parts[11].slice(4, 6) + "-" + parts[11].slice(6, 8) +
      "T" + parts[11].slice(9, 11) + ":" + parts[11].slice(11, 13) + ":" + parts[11].slice(13, 15) + "Z",
    granuleName: productName.toLowerCase().endsWith(".h5") ? productName : productName + ".h5"
  };
}

function variableNames(capabilities: any): string[] {
  const items = Array.isArray(capabilities?.variables) ? capabilities.variables : [];
  return items.map((item: any) => String(
    item?.name ?? item?.path ?? item?.id ?? item?.variableName ?? item?.longName ?? ""
  )).filter(Boolean);
}

function findVariable(available: string[], frequency: string, shortName: string) {
  const suffix = "/frequency" + frequency + "/" + shortName;
  return available.find(name => name.endsWith(suffix)) ?? null;
}

function selectGcoveVariables(capabilities: any, polarizationMode: string) {
  if (capabilities?.variableSubset !== true) throw new Error("Harmony does not report variable-subsetting support for the configured GCOV collection.");
  const formats = Array.isArray(capabilities?.outputFormats) ? capabilities.outputFormats.map(String) : [];
  if (formats.length && !formats.some(value => value.toLowerCase().includes("tiff"))) {
    throw new Error("Harmony capabilities do not advertise GeoTIFF output for this collection.");
  }
  const available = variableNames(capabilities);
  if (!available.length) throw new Error("Harmony returned no variable inventory for the configured GCOV collection.");

  const mode = polarizationMode.slice(0, 2);
  const terms: Record<string, string[]> = {
    SH: ["HHHH"],
    SV: ["VVVV"],
    DH: ["HHHH", "HVHV"],
    DV: ["VVVV", "VHVH"],
    QP: ["HHHH", "HVHV", "VVVV", "VHVH"]
  };
  const requestedTerms = terms[mode];
  if (!requestedTerms) {
    throw new Error("The product polarization mode " + mode + " needs a validated layer mapping before automated extraction.");
  }

  const backscatter = requestedTerms.map(term => findVariable(available, "A", term)).filter(Boolean) as string[];
  if (!backscatter.length) throw new Error("No Frequency A backscatter variables for the product polarization were found in the live Harmony capabilities.");
  const quality: Record<string, string | null> = {
    mask: findVariable(available, "A", "mask"),
    numberOfLooks: findVariable(available, "A", "numberOfLooks"),
    rtcGammaToSigmaFactor: findVariable(available, "A", "rtcGammaToSigmaFactor")
  };
  return { backscatter, quality, all: [...backscatter, ...Object.values(quality).filter(Boolean) as string[]] };
}

async function authenticate(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Response(JSON.stringify({ error: "Sign in to process satellite data." }), { status: 401, headers: CORS });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) throw new Response(JSON.stringify({ error: "Your session is invalid or expired." }), { status: 401, headers: CORS });
  return data.user;
}

async function authorizedField(admin: any, userId: string, fieldId: string) {
  const { data: field, error: fieldError } = await admin.from("beta_field_records")
    .select("id,company_id,field_no,record_data")
    .eq("id", fieldId).maybeSingle();
  if (fieldError || !field) throw new Error("The selected field could not be found.");
  const { data: memberships, error: membershipError } = await admin.from("company_memberships")
    .select("company_id").eq("user_id", userId).eq("status", "active").eq("company_id", field.company_id);
  if (membershipError) throw new Error("Could not verify company access.");
  if (!memberships?.length) throw new Error("You do not have active access to this field's company.");
  return field;
}

async function getCapabilities(collectionShortName: string) {
  if (!EARTHDATA_TOKEN) throw new Error("EARTHDATA_BEARER_TOKEN is not configured in Edge Function secrets.");
  const url = new URL(HARMONY_ROOT + "/capabilities");
  url.searchParams.set("shortName", collectionShortName);
  url.searchParams.set("version", "2");
  return await fetchJson(url.toString(), {
    headers: { Authorization: "Bearer " + EARTHDATA_TOKEN, Accept: "application/json" }
  });
}

async function submitHarmonyJob(productName: string, variables: string[], bbox: number[], label: string) {
  if (!EARTHDATA_TOKEN) throw new Error("EARTHDATA_BEARER_TOKEN is not configured in Edge Function secrets.");
  const url = new URL(
    HARMONY_ROOT + "/" + encodeURIComponent(COLLECTION_SHORT_NAME) +
    "/ogc-api-coverages/1.0.0/collections/parameter_vars/coverage/rangeset"
  );
  url.searchParams.set("granuleName", productName);
  url.searchParams.set("variable", variables.join(","));
  url.searchParams.append("subset", "lon(" + bbox[0] + ":" + bbox[2] + ")");
  url.searchParams.append("subset", "lat(" + bbox[1] + ":" + bbox[3] + ")");
  url.searchParams.set("format", "image/tiff");
  url.searchParams.set("forceAsync", "true");
  url.searchParams.set("skipPreview", "true");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("ignoreErrors", "false");
  url.searchParams.set("label", label.slice(0, 200));

  const response = await fetch(url.toString(), {
    method: "GET",
    redirect: "manual",
    headers: { Authorization: "Bearer " + EARTHDATA_TOKEN, Accept: "application/json" },
    signal: AbortSignal.timeout(60000)
  });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { message: text.slice(0, 300) }; }
  const location = response.headers.get("location") ?? "";
  const locationMatch = location.match(/\/jobs\/([A-Za-z0-9-]+)/);
  const jobId = String(body?.jobID ?? body?.jobId ?? body?.id ?? locationMatch?.[1] ?? "");
  if (!response.ok && ![301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error("Harmony submission HTTP " + response.status + ": " + String(body.message ?? body.detail ?? body.error ?? "Request failed").slice(0, 350));
  }
  if (!jobId) {
    throw new Error("Harmony did not return a job ID. Response status " + response.status + "; inspect the Harmony response before retrying.");
  }
  return { jobId, requestUrl: url.toString(), response: body };
}

function configuredCogHosts() {
  return new Set((Deno.env.get("NISAR_COG_ALLOWED_HOSTS") ?? "harmony.earthdata.nasa.gov")
    .split(",").map(host => host.trim().toLowerCase()).filter(Boolean));
}

function validateCogHref(href: unknown) {
  if (typeof href !== "string") throw new Error("Harmony returned a non-string COG asset URL.");
  const url = new URL(href);
  if (url.protocol !== "https:" || !configuredCogHosts().has(url.hostname.toLowerCase())) {
    throw new Error("Harmony COG asset host is not in NISAR_COG_ALLOWED_HOSTS: " + url.hostname);
  }
  return href;
}

async function getStacAssets(jobId: string) {
  const root = await fetchJson(HARMONY_ROOT + "/stac/" + encodeURIComponent(jobId), {
    headers: { Authorization: "Bearer " + EARTHDATA_TOKEN, Accept: "application/json" }
  });
  const itemLinks = Array.isArray(root?.links) ? root.links.filter((link: any) => link?.rel === "item" && typeof link?.href === "string") : [];
  const items: any[] = [];
  if (itemLinks.length) {
    for (const link of itemLinks.slice(0, 100)) {
      const href = new URL(link.href, HARMONY_ROOT);
      if (href.origin !== new URL(HARMONY_ROOT).origin) throw new Error("Harmony STAC item link points outside the Harmony service.");
      items.push(await fetchJson(href.toString(), {
        headers: { Authorization: "Bearer " + EARTHDATA_TOKEN, Accept: "application/geo+json, application/json" }
      }));
    }
  } else if (root?.type === "Feature" || root?.assets) {
    items.push(root);
  } else {
    throw new Error("Harmony job completed but its STAC catalogue contained no output items.");
  }

  const assets: { key: string; title: string; href: string }[] = [];
  for (const item of items) {
    for (const [key, asset] of Object.entries(item?.assets ?? {})) {
      const entry = asset as any;
      if (typeof entry?.href !== "string") continue;
      assets.push({
        key: String(key),
        title: String(entry.title ?? entry.description ?? key),
        href: validateCogHref(new URL(entry.href, HARMONY_ROOT).toString())
      });
    }
  }
  return assets;
}

function findAsset(assets: { key: string; title: string; href: string }[], variablePath: string) {
  const leaf = variablePath.split("/").pop()?.toLowerCase() ?? "";
  const matches = assets.filter(asset =>
    (asset.key + " " + asset.title + " " + asset.href).toLowerCase().includes(leaf)
  );
  if (matches.length !== 1) {
    throw new Error("Expected one Harmony COG asset for " + leaf + "; found " + matches.length +
      ". Returned asset labels: " + assets.map(asset => asset.key + "/" + asset.title).join(", ").slice(0, 300));
  }
  return matches[0].href;
}

async function runProcessor(job: any, assets: { key: string; title: string; href: string }[]) {
  if (!PROCESSOR_URL || !PROCESSOR_TOKEN) throw new Error("The private NISAR COG processor URL/token is not configured.");
  const processor = new URL(PROCESSOR_URL);
  if (processor.protocol !== "https:") throw new Error("NISAR_PROCESSOR_URL must use HTTPS.");
  const variables = job.selected_variables as string[];
  const backscatterVariables = variables.filter((name: string) => !/\/(mask|numberOfLooks|rtcGammaToSigmaFactor)$/.test(name));
  const layerMap: Record<string, string> = { HHHH: "HH", HVHV: "HV", VVVV: "VV", VHVH: "VH", RHRH: "RH", RVRV: "RV" };
  const layers = backscatterVariables.map((name: string) => {
    const leaf = name.split("/").pop() ?? "";
    return {
      name,
      url: findAsset(assets, name),
      frequency: "A",
      polarization: layerMap[leaf] ?? leaf,
      nominal_pixel_spacing_m: null,
      value_type: "gamma0_power"
    };
  });
  const quality: Record<string, string | null> = {};
  for (const [variable, key] of [
    ["mask", "mask"],
    ["numberOfLooks", "number_of_looks"],
    ["rtcGammaToSigmaFactor", "rtc_gamma_to_sigma_factor"]
  ]) {
    const path = variables.find((name: string) => name.endsWith("/" + variable));
    if (path) quality[key] = findAsset(assets, path);
  }
  const response = await fetch(PROCESSOR_URL + "/v1/zonal-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + PROCESSOR_TOKEN },
    body: JSON.stringify({
      field_id: job.field_record_id,
      source_product_id: job.product_id,
      acquired_at: job.acquired_at,
      field_polygon: job.polygon_snapshot,
      layers,
      quality_layers: quality,
      processing_version: PROCESSING_VERSION,
      minimum_valid_pixels: 5
    }),
    signal: AbortSignal.timeout(120000)
  });
  const result = await readResponse(response);
  return { result, variables: layers.map(layer => layer.name) };
}

async function persistObservation(admin: any, job: any, processing: any) {
  const { data: existing, error: lookupError } = await admin.from("satellite_observations")
    .select("id")
    .eq("company_id", job.company_id)
    .eq("field_id", job.field_record_id)
    .eq("provider", "NASA NISAR Harmony")
    .eq("source_reference", job.product_id)
    .maybeSingle();
  if (lookupError) throw new Error("Could not check for an existing NISAR observation: " + lookupError.message);

  const payload = {
    company_id: job.company_id,
    field_id: job.field_record_id,
    observed_at: job.acquired_at,
    provider: "NASA NISAR Harmony",
    product_or_sensor: "NISAR L-band GCOV",
    indicators: {
      sensor: "NISAR L-band",
      product: "GCOV",
      source_product_id: job.product_id,
      collection_short_name: job.collection_short_name,
      processing_version: PROCESSING_VERSION,
      field_polygon_method: "Exact saved beta_field_records.record_data.boundaryPoints",
      ...processing.result
    },
    source_reference: job.product_id
  };
  if (existing?.id) {
    const { error } = await admin.from("satellite_observations").update(payload).eq("id", existing.id);
    if (error) throw new Error("Could not update the NISAR observation: " + error.message);
  } else {
    const { error } = await admin.from("satellite_observations").insert(payload);
    if (error) throw new Error("Could not save the NISAR observation: " + error.message);
  }
}

async function submitAction(admin: any, user: any, body: any) {
  const fieldId = String(body.fieldId ?? "");
  const productId = String(body.productId ?? "");
  const productName = String(body.productName ?? "");
  if (!fieldId || !productId || !productName) throw new Error("fieldId, productId and productName are required.");
  const field = await authorizedField(admin, user.id, fieldId);
  if (!/paddy|rice/i.test(String(field.record_data?.crop ?? ""))) throw new Error("The initial NISAR pilot is limited to Paddy/Rice fields.");
  const polygon = getExactFieldPolygon(field.record_data);
  const parsed = parseProductName(productName);
  const collection = String(body.collectionShortName ?? COLLECTION_SHORT_NAME);
  if (collection !== COLLECTION_SHORT_NAME) throw new Error("Use the configured NISAR GCOV collection short name.");
  const { data: existing, error: lookupError } = await admin.from("nisar_processing_jobs")
    .select("*").eq("field_record_id", fieldId).eq("product_id", productId)
    .eq("processing_version", PROCESSING_VERSION).maybeSingle();
  if (lookupError) throw new Error("NISAR job table is not ready. Apply the migration before submitting jobs.");

  if (existing && ["completed", "insufficient_valid_pixels"].includes(existing.status)) {
    return { ok: true, duplicate: true, job: existing, message: "This field/product/version has already been processed." };
  }
  if (existing?.harmony_job_id && ["harmony_submitted", "harmony_ready", "statistics_running"].includes(existing.status)) {
    return { ok: true, duplicate: true, job: existing, message: "A Harmony job is already in progress for this field/product." };
  }

  const capabilities = await getCapabilities(collection);
  const selected = selectGcoveVariables(capabilities, parsed.polarizationMode);
  const label = ("sageharvest-" + field.field_no + "-" + productId).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 200);

  const row = {
    company_id: field.company_id,
    field_record_id: field.id,
    field_no: field.field_no,
    product_id: productId,
    product_name: parsed.granuleName,
    collection_short_name: collection,
    acquired_at: parsed.acquiredAt,
    processing_version: PROCESSING_VERSION,
    status: "queued",
    polygon_snapshot: polygon.geometry,
    bbox: polygon.bbox,
    selected_variables: selected.all,
    product_metadata: {
      processing_type: parsed.processingType,
      polarization_mode: parsed.polarizationMode,
      original_boundary_point_count: polygon.originalPointCount,
      capabilities_version: capabilities.capabilitiesVersion ?? null,
      available_variable_count: variableNames(capabilities).length
    },
    submitted_by: user.id,
    harmony_job_id: null,
    harmony_request_url: null,
    harmony_metadata: {},
    processing_result: null,
    completed_at: null,
    error_message: null,
    attempts: Number(existing?.attempts ?? 0) + 1,
    updated_at: new Date().toISOString()
  };
  let job: any;
  if (existing?.id) {
    const { data, error } = await admin.from("nisar_processing_jobs").update(row).eq("id", existing.id).select("*").single();
    if (error) throw new Error("Could not reset the failed NISAR job: " + error.message);
    job = data;
  } else {
    const { data, error } = await admin.from("nisar_processing_jobs").insert(row).select("*").single();
    if (error) throw new Error("Could not create the NISAR job record: " + error.message);
    job = data;
  }

  try {
    const submitted = await submitHarmonyJob(parsed.granuleName, selected.all, polygon.bbox, label);
    const { data: updated, error } = await admin.from("nisar_processing_jobs").update({
      status: "harmony_submitted",
      harmony_job_id: submitted.jobId,
      harmony_request_url: submitted.requestUrl,
      harmony_metadata: { submission: submitted.response },
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null
    }).eq("id", job.id).select("*").single();
    if (error) throw new Error("Harmony accepted the request but the job ID could not be saved: " + error.message);
    return { ok: true, duplicate: false, job: updated, selectedVariables: selected.all };
  } catch (error) {
    await admin.from("nisar_processing_jobs").update({
      status: "harmony_failed",
      error_message: safeError(error),
      updated_at: new Date().toISOString()
    }).eq("id", job.id);
    throw error;
  }
}

async function pollAction(admin: any, user: any, body: any) {
  const jobId = String(body.jobId ?? "");
  if (!jobId) throw new Error("jobId is required.");
  const { data: job, error } = await admin.from("nisar_processing_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error || !job) throw new Error("NISAR processing job was not found.");
  const field = await authorizedField(admin, user.id, job.field_record_id);
  if (field.company_id !== job.company_id) throw new Error("NISAR job company does not match the registered field.");
  if (!EARTHDATA_TOKEN) throw new Error("EARTHDATA_BEARER_TOKEN is not configured in Edge Function secrets.");
  if (["completed", "insufficient_valid_pixels"].includes(job.status)) return { ok: true, job, alreadyComplete: true };
  if (!job.harmony_job_id) throw new Error("The NISAR job has no saved Harmony job ID.");

  const harmony = await fetchJson(HARMONY_ROOT + "/jobs/" + encodeURIComponent(job.harmony_job_id), {
    headers: { Authorization: "Bearer " + EARTHDATA_TOKEN, Accept: "application/json" }
  });
  const state = String(harmony.status ?? "").toLowerCase();
  if (["failed", "canceled", "cancelled", "error"].includes(state)) {
    const message = String(harmony.message ?? harmony.errors?.[0]?.message ?? "Harmony processing failed.");
    const { data: updated } = await admin.from("nisar_processing_jobs").update({
      status: "harmony_failed",
      harmony_metadata: harmony,
      error_message: message.slice(0, 500),
      updated_at: new Date().toISOString()
    }).eq("id", job.id).select("*").single();
    return { ok: false, job: updated ?? job, harmonyStatus: state };
  }
  if (!["successful", "completed", "complete", "done"].includes(state)) {
    const { data: updated } = await admin.from("nisar_processing_jobs").update({
      status: "harmony_submitted",
      harmony_metadata: harmony,
      updated_at: new Date().toISOString()
    }).eq("id", job.id).select("*").single();
    return { ok: true, pending: true, harmonyStatus: state || "unknown", progress: harmony.progress ?? null, job: updated ?? job };
  }

  await admin.from("nisar_processing_jobs").update({
    status: "harmony_ready",
    harmony_metadata: harmony,
    updated_at: new Date().toISOString()
  }).eq("id", job.id);

  try {
    const assets = await getStacAssets(job.harmony_job_id);
    await admin.from("nisar_processing_jobs").update({
      status: "statistics_running",
      updated_at: new Date().toISOString()
    }).eq("id", job.id);
    const processing = await runProcessor(job, assets);
    await persistObservation(admin, job, processing);
    const finalStatus = processing.result.quality_status === "sufficient_valid_pixels"
      ? "completed" : "insufficient_valid_pixels";
    const { data: updated, error: updateError } = await admin.from("nisar_processing_jobs").update({
      status: finalStatus,
      processing_result: processing.result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null
    }).eq("id", job.id).select("*").single();
    if (updateError) throw new Error("Metrics were processed but job status could not be saved: " + updateError.message);
    return { ok: true, pending: false, job: updated, result: processing.result };
  } catch (error) {
    const { data: updated } = await admin.from("nisar_processing_jobs").update({
      status: "processing_failed",
      error_message: safeError(error),
      updated_at: new Date().toISOString()
    }).eq("id", job.id).select("*").single();
    return { ok: false, job: updated ?? job, error: safeError(error) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    requireConfiguration();
    const user = await authenticate(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Request body must be valid JSON." }, 400);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const action = String(body.action ?? "");
    if (action === "capabilities") {
      const collection = String(body.collectionShortName ?? COLLECTION_SHORT_NAME);
      if (collection !== COLLECTION_SHORT_NAME) return json({ error: "Use the configured NISAR GCOV collection." }, 400);
      const capabilities = await getCapabilities(collection);
      return json({
        ok: true,
        collection: capabilities.shortName ?? collection,
        conceptId: capabilities.conceptId ?? null,
        capabilitiesVersion: capabilities.capabilitiesVersion ?? null,
        variableSubset: capabilities.variableSubset ?? false,
        bboxSubset: capabilities.bboxSubset ?? false,
        outputFormats: capabilities.outputFormats ?? [],
        variables: variableNames(capabilities)
      });
    }
    if (action === "submit") return json(await submitAction(admin, user, body), 202);
    if (action === "poll") return json(await pollAction(admin, user, body));
    return json({ error: "action must be capabilities, submit or poll." }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: safeError(error) }, 400);
  }
});
