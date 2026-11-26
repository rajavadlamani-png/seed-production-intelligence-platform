import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const BHOONIDHI_USER_ID = Deno.env.get("BHOONIDHI_USER_ID") ?? "";
const BHOONIDHI_PASSWORD = Deno.env.get("BHOONIDHI_PASSWORD") ?? "";
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
  return typeof value === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}
function median(values: number[]) {
  const sorted = values.slice().sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}
function fieldGeometry(record: Record<string, any>) {
  const points = (Array.isArray(record.boundaryPoints) ? record.boundaryPoints : [])
    .map((p:any)=>({lat:Number(p?.lat),lon:Number(p?.lon??p?.lng??p?.longitude)}))
    .filter((p:any)=>Number.isFinite(p.lat)&&p.lat>=-90&&p.lat<=90&&Number.isFinite(p.lon)&&p.lon>=-180&&p.lon<=180);
  if (points.length >= 3) {
    const sampled = points.filter((_,i)=>i%Math.max(1,Math.ceil(points.length/100))===0);
    const last = sampled[sampled.length-1], first = sampled[0];
    if (!last || last.lat!==first.lat || last.lon!==first.lon) sampled.push({...first});
    const ring = sampled.map(p=>[p.lon,p.lat]);
    return {
      center:{lat:median(points.map(p=>p.lat)),lon:median(points.map(p=>p.lon)),method:"coordinate-wise median of saved field boundary points"},
      geometry:{type:"Polygon",coordinates:[ring]},
      boundaryPointCount:points.length
    };
  }
  const q = record.soilEstimate?.queryPoint || {};
  const lat = Number(record.latitude ?? record.gpsLat ?? record.lat ?? q.lat);
  const lon = Number(record.longitude ?? record.gpsLon ?? record.lon ?? q.lon);
  if (!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lon)||lon < -180||lon>180) return null;
  return {center:{lat,lon,method:"saved field GPS/query point"},geometry:{type:"Point",coordinates:[lon,lat]},boundaryPointCount:0};
}
async function fetchJson(url:string, init:RequestInit={}, timeoutMs=60000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response = await fetch(url,{...init,signal:controller.signal});
    const text = await response.text();
    let body:any={};
    try { body=text?JSON.parse(text):{}; } catch { body={message:text.slice(0,300)}; }
    if (!response.ok) throw new Error("HTTP "+response.status+": "+String(body.message||body.description||body.error||body.Description||body.ErrorCode||"Provider request failed").slice(0,250));
    return body;
  } catch(e) {
    if ((e as Error)?.name==="AbortError") throw new Error("Satellite catalogue request timed out.");
    throw e;
  } finally { clearTimeout(timer); }
}
function asfFeatures(body:any) {
  const features = Array.isArray(body?.features)?body.features:[];
  return features.map((f:any)=>{
    const p=f?.properties||{};
    return {
      id:String(f?.id||p?.sceneName||p?.granuleName||""),
      acquisitionDate:String(p?.startTime||p?.stopTime||p?.fileName||"").slice(0,10),
      product:String(p?.processingLevel||p?.productType||"NISAR product"),
      platform:String(p?.platform||"NISAR"),
      polarization:p?.polarization||p?.polarizationCombination||null,
      flightDirection:p?.flightDirection||null,
      dataMaturity:p?.dataMaturity||p?.processingConfiguration||null,
      geometry:f?.geometry||null,
      browse:String(p?.browse||""),
      url:String(p?.url||"")
    };
  }).filter((x:any)=>x.id);
}
async function searchAsf(geometry:any,from:string,to:string) {
  const ring = geometry.type==="Polygon" ? geometry.coordinates?.[0] : null;
  let wkt = "";
  if (Array.isArray(ring)&&ring.length>=4) wkt = "POLYGON(("+ring.map((p:number[])=>p[0]+" "+p[1]).join(",")+"))";
  else wkt = "POINT("+geometry.coordinates[0]+" "+geometry.coordinates[1]+")";
  const params = new URLSearchParams({
    dataset:"NISAR",
    processingLevel:"GCOV,GSLC",
    intersectsWith:wkt,
    start:from+"T00:00:00Z",
    end:to+"T23:59:59Z",
    output:"geojson",
    maxResults:"200"
  });
  const body = await fetchJson("https://api.daac.asf.alaska.edu/services/search/param?"+params.toString(),{headers:{Accept:"application/geo+json, application/json"}});
  return asfFeatures(body);
}
async function bhoonidhiToken() {
  const response = await fetchJson("https://bhoonidhi-api.nrsc.gov.in/auth/token",{
    method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({userId:BHOONIDHI_USER_ID,password:BHOONIDHI_PASSWORD,grant_type:"password"})
  });
  if (!response?.access_token) throw new Error("Bhoonidhi authentication did not return an access token.");
  return String(response.access_token);
}
async function searchBhoonidhi(collections:string[],geometry:any,from:string,to:string,token:string) {
  let body:any;
  try {
    body = await fetchJson("https://bhoonidhi-api.nrsc.gov.in/data/search",{
      method:"POST",
      headers:{"Content-Type":"application/json",Accept:"application/geo+json, application/json",Authorization:"Bearer "+token},
      body:JSON.stringify({collections,datetime:from+"T00:00:00Z/"+to+"T23:59:59Z",intersects:geometry,limit:500})
    });
  } catch(e) {
    // Treat the provider's explicit no-results response as an empty search result, not an outage.
    if (/HTTP 404:.*NO RESULTS FOUND/i.test(String((e as Error)?.message||e))) return [];
    throw e;
  }
  return (Array.isArray(body?.features)?body.features:[]).map((f:any)=>({
    id:String(f?.id||""),
    collection:String(f?.collection||f?.properties?.collection||""),
    acquisitionDate:String(f?.properties?.datetime||f?.properties?.start_datetime||"").slice(0,10),
    polarization:f?.properties?.Polarization||f?.properties?.polarization||null,
    online:f?.properties?.Online||f?.properties?.online||null,
    geometry:f?.geometry||null,
    assets:f?.assets||{},
    links:f?.links||[]
  })).filter((x:any)=>x.id);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  if(req.method!=="POST") return json({error:"Use POST."},405);
  if(!SUPABASE_URL||!ANON_KEY||!SERVICE_KEY) return json({error:"Supabase server configuration is incomplete."},500);
  const authorization=req.headers.get("Authorization")||"";
  if(!authorization.startsWith("Bearer ")) return json({error:"Sign in to run the satellite catalogue search."},401);
  const authClient=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await authClient.auth.getUser();
  if(authError||!authData?.user) return json({error:"Your session is invalid or expired. Sign in again."},401);
  let body:any;
  try {body=await req.json();} catch {return json({error:"Request body must be valid JSON."},400);}
  const fieldId=String(body?.fieldId||"");
  const from=body?.from,to=body?.to;
  if(!fieldId||!validDate(from)||!validDate(to)||from>to) return json({error:"A field and valid date range are required."},400);
  if((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000>365) return json({error:"The date range cannot exceed 365 days."},400);
  const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:memberships,error:membershipError}=await admin.from("company_memberships").select("company_id").eq("user_id",authData.user.id).eq("status","active");
  if(membershipError) return json({error:"Could not verify company access."},500);
  const companyIds=[...new Set((memberships||[]).map((m:any)=>m.company_id))];
  if(!companyIds.length) return json({error:"Your account has no active company membership."},403);
  const {data:field,error:fieldError}=await admin.from("beta_field_records").select("id,company_id,field_no,record_data").eq("id",fieldId).maybeSingle();
  if(fieldError||!field) return json({error:"The selected test field could not be found."},404);
  if(!companyIds.includes(field.company_id)) return json({error:"You do not have access to this field."},403);
  if(!/paddy|rice/i.test(String(field.record_data?.crop||""))) return json({error:"This pilot is currently limited to Paddy/Rice fields."},400);
  const aoi=fieldGeometry(field.record_data||{});
  if(!aoi) return json({error:"The selected field has no usable saved GPS boundary or point."},422);
  const sourceResults:any[]=[];
  try {
    const features=await searchAsf(aoi.geometry,from,to);
    sourceResults.push({source:"NISAR L-band (ASF DAAC)",status:"searched",count:features.length,products:features,access:"Catalogue metadata is public; data download/streaming requires a free NASA Earthdata Login.",note:"ASF catalogue search returned NISAR products intersecting the saved field geometry."});
  } catch(e) {
    sourceResults.push({source:"NISAR L-band (ASF DAAC)",status:"provider_error",count:0,products:[],error:String((e as Error)?.message||e)});
  }
  if(!BHOONIDHI_USER_ID||!BHOONIDHI_PASSWORD) {
    sourceResults.push({source:"NISAR S-band (ISRO Bhoonidhi)",status:"credentials_required",count:null,products:[],note:"Configure BHOONIDHI_USER_ID and BHOONIDHI_PASSWORD as Supabase Edge Function secrets to search this catalogue."});
    sourceResults.push({source:"EOS-04 (ISRO Bhoonidhi)",status:"credentials_required",count:null,products:[],note:"Configure BHOONIDHI_USER_ID and BHOONIDHI_PASSWORD as Supabase Edge Function secrets to search this catalogue."});
  } else {
    let token="";
    try {
      token=await bhoonidhiToken();
    } catch(e) {
      const message=String((e as Error)?.message||e);
      sourceResults.push({source:"Bhoonidhi authentication",status:"authentication_error",count:null,products:[],error:message});
      sourceResults.push({source:"NISAR S-band (ISRO Bhoonidhi)",status:"not_searched",count:null,products:[],note:"Catalogue search skipped because Bhoonidhi authentication failed."});
      sourceResults.push({source:"EOS-04 (ISRO Bhoonidhi)",status:"not_searched",count:null,products:[],note:"Catalogue search skipped because Bhoonidhi authentication failed."});
    }
    if(token) {
      const [nisarResult,eosPolygonResult,eosPointResult,eosBroadResult]=await Promise.allSettled([
        searchBhoonidhi(["NISAR_SSAR_GSLC","NISAR_SSAR_GCOV","NISAR_SSAR_RSLC"],aoi.geometry,from,to,token),
        searchBhoonidhi(["EOS-04_SAR-MRS_L2A"],aoi.geometry,from,to,token),
        searchBhoonidhi(["EOS-04_SAR-MRS_L2A"],{type:"Point",coordinates:[aoi.center.lon,aoi.center.lat]},from,to,token),
        searchBhoonidhi(["EOS-04_SAR-MRS_L2A"],aoi.geometry,"2024-01-01",to,token)
      ]);
      if(nisarResult.status==="fulfilled") {
        sourceResults.push({source:"NISAR S-band (ISRO Bhoonidhi)",status:"searched",count:nisarResult.value.length,products:nisarResult.value,access:"Bhoonidhi account/API access required."});
      } else {
        sourceResults.push({source:"NISAR S-band (ISRO Bhoonidhi)",status:"provider_error",count:null,products:[],error:String(nisarResult.reason?.message||nisarResult.reason)});
      }
      const eosTests=[
        {label:"Saved boundary · requested dates",result:eosPolygonResult},
        {label:"AOI centre point · requested dates",result:eosPointResult},
        {label:"Saved boundary · 1 Jan 2024 to end date",result:eosBroadResult}
      ];
      const eosErrors=eosTests.filter(t=>t.result.status==="rejected").map(t=>t.label+": "+String(t.result.reason?.message||t.result.reason));
      const eosProducts=eosTests.flatMap(t=>t.result.status==="fulfilled"?t.result.value:[]);
      const uniqueEos=[...new Map(eosProducts.map((p:any)=>[p.id,p])).values()];
      const eosDiagnostics=eosTests.map(t=>t.label+": "+(t.result.status==="fulfilled"?t.result.value.length+" products":"search error")).join(" | ");
      sourceResults.push({
        source:"EOS-04 (ISRO Bhoonidhi)",
        status:eosErrors.length===eosTests.length?"provider_error":uniqueEos.length?"searched":eosErrors.length?"partial_results":"searched",
        count:uniqueEos.length,products:uniqueEos,access:"Bhoonidhi account/API access required.",
        note:eosDiagnostics+(eosErrors.length?" | Errors: "+eosErrors.join("; "):" | Explicit no-results responses count as completed searches."),
        diagnostics:eosTests.map(t=>({test:t.label,status:t.result.status==="fulfilled"?"searched":"provider_error",count:t.result.status==="fulfilled"?t.result.value.length:null,error:t.result.status==="rejected"?String(t.result.reason?.message||t.result.reason):null}))
      });
    }
  }
  const total=sourceResults.reduce((n,s)=>n+(Number(s.count)||0),0);
  return json({
    ok:true,field:{id:field.id,fieldNo:field.field_no,crop:field.record_data?.crop||null},
    testAreaOfInterest:{center:{latitude:aoi.center.lat,longitude:aoi.center.lon,method:aoi.center.method},boundaryPointCount:aoi.boundaryPointCount,geometryType:aoi.geometry.type},
    from,to,sourceResults,totalCatalogueProducts:total,
    interpretation:"Catalogue discovery only. Product presence does not establish a drainage event. Product footprints, acquisition dates, processing levels, polarisation and data maturity must be reviewed before pixel-level analysis."
  });
});
