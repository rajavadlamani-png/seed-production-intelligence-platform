import proj4 from "npm:proj4@2.12.1";
import { fromArrayBuffer } from "npm:geotiff@2.1.3";

const allowedOrigin = "https://rajavadlamani-png.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};
const props = [
  { key: "phh2o", label: "pH (water)", unit: "pH", divide: 10, map: "phh2o" },
  { key: "soc", label: "Organic carbon", unit: "g/kg", divide: 10, map: "soc" },
  { key: "nitrogen", label: "Total nitrogen", unit: "g/kg", divide: 100, map: "nitrogen" },
  { key: "sand", label: "Sand", unit: "%", divide: 10, map: "sand" },
  { key: "silt", label: "Silt", unit: "%", divide: 10, map: "silt" },
  { key: "clay", label: "Clay", unit: "%", divide: 10, map: "clay" }
];
const soilCrs = "http://www.opengis.net/def/crs/EPSG/0/152160";
const indiaStates = new Set(["andhra pradesh","arunachal pradesh","assam","bihar","chhattisgarh","goa","gujarat","haryana","himachal pradesh","jharkhand","karnataka","kerala","madhya pradesh","maharashtra","manipur","meghalaya","mizoram","nagaland","odisha","punjab","rajasthan","sikkim","tamil nadu","telangana","tripura","uttar pradesh","uttarakhand","west bengal","andaman and nicobar islands","chandigarh","dadra and nagar haveli and daman and diu","delhi","jammu and kashmir","ladakh","lakshadweep","puducherry"]);
proj4.defs("SOILGRIDS:IGH", "+proj=igh +datum=WGS84 +units=m +no_defs +type=crs");

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function pixelValue(buffer: ArrayBuffer, x: number, y: number) {
  return fromArrayBuffer(buffer).then(async (tiff) => {
    const image = await tiff.getImage();
    const origin = image.getOrigin(), resolution = image.getResolution();
    const width = image.getWidth(), height = image.getHeight();
    const col = Math.floor((x - origin[0]) / resolution[0]);
    const row = Math.floor((y - origin[1]) / resolution[1]);
    if (col < 0 || row < 0 || col >= width || row >= height) return null;
    const raster = await image.readRasters({ window: [col, row, col + 1, row + 1] });
    const raw = Array.isArray(raster) ? Number(raster[0]?.[0]) : Number(raster[0]);
    const noData = Number(image.getGDALNoData());
    if (!Number.isFinite(raw) || (Number.isFinite(noData) && raw === noData)) return null;
    return raw;
  });
}
async function fetchProperty(property: typeof props[number], x: number, y: number) {
  const url = new URL("https://maps.isric.org/mapserv");
  url.searchParams.set("map", "/map/" + property.map + ".map");
  url.searchParams.set("SERVICE", "WCS");
  url.searchParams.set("VERSION", "2.0.1");
  url.searchParams.set("REQUEST", "GetCoverage");
  url.searchParams.set("COVERAGEID", property.map + "_5-15cm_Q0.5");
  url.searchParams.set("FORMAT", "GEOTIFF_INT16");
  url.searchParams.append("SUBSET", "X(" + (x - 150) + "," + (x + 150) + ")");
  url.searchParams.append("SUBSET", "Y(" + (y - 150) + "," + (y + 150) + ")");
  url.searchParams.set("SUBSETTINGCRS", soilCrs);
  url.searchParams.set("OUTPUTCRS", soilCrs);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 25000);
  try {
    const result = await fetch(url, { signal: abort.signal, headers: { "Accept": "image/tiff, application/octet-stream" } });
    if (!result.ok) throw new Error("Soil map service returned HTTP " + result.status);
    const type = result.headers.get("content-type") || "";
    const bytes = await result.arrayBuffer();
    if (!type.includes("tiff") && !type.includes("octet-stream") && bytes.byteLength < 8) {
      throw new Error("Soil map service did not return a raster.");
    }
    const raw = await pixelValue(bytes, x, y);
    return raw == null ? null : { label: property.label, value: Number((raw / property.divide).toFixed(2)), unit: property.unit };
  } finally {
    clearTimeout(timeout);
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Use POST." }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== allowedOrigin) return response({ error: "Origin is not allowed." }, 403);
  try {
    const body = await req.json();
    const lat = Number(body?.lat), lon = Number(body?.lon), state = String(body?.state || "").trim().toLowerCase();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 6 || lat > 38 || lon < 68 || lon > 98 || (state && !indiaStates.has(state))) {
      return response({ error: "Choose a field coordinate within the supported India area." }, 400);
    }
    const [x, y] = proj4("EPSG:4326", "SOILGRIDS:IGH", [lon, lat]);
    const values: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const property of props) {
      try {
        values[property.key] = await fetchProperty(property, x, y);
      } catch {
        values[property.key] = null;
        errors.push(property.key);
      }
    }
    if (Object.values(values).every((v) => v === null)) {
      return response({ error: "The free SoilGrids map service did not return values. Try again later.", failedProperties: errors }, 502);
    }
    return response({
      source: "ISRIC SoilGrids 2.0",
      sourceUrl: "https://www.isric.org/explore/soilgrids",
      license: "CC BY 4.0",
      resolutionMeters: 250,
      depth: "5-15 cm",
      statistic: "Q0.5 median prediction",
      estimateType: "modeled",
      queryPoint: { lat, lon },
      retrievedAt: new Date().toISOString(),
      properties: values,
      unavailable: ["Available phosphorus (P)", "Available potassium (K)", "Available zinc (Zn)", "Electrical conductivity / salinity"],
      failedProperties: errors
    });
  } catch {
    return response({ error: "Could not retrieve the indicative soil estimate. Check the connection and try again." }, 502);
  }
});