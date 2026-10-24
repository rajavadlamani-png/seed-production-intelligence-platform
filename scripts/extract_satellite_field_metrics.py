#!/usr/bin/env python3
"""Initial Sentinel Hub Statistical API extraction scaffold.
Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CDSE_CLIENT_ID and CDSE_CLIENT_SECRET.
Only verified field polygons are processed. Satellite indices are not direct yield measurements.
"""
import hashlib,json,os,sys,time,urllib.parse,urllib.request
from datetime import date,datetime,timedelta,timezone
DB_URL=os.environ.get("SUPABASE_URL","").rstrip("/")
DB_KEY=os.environ.get("SUPABASE_SERVICE_ROLE_KEY","")
CLIENT=os.environ.get("CDSE_CLIENT_ID","")
SECRET=os.environ.get("CDSE_CLIENT_SECRET","")
WORKER_URL=os.environ.get("COPERNICUS_EO_WORKER_URL","https://anvora-eo-connector.raja-vadlamani.workers.dev/api/sentinel1").rstrip("/")
WORKER_STAT_URL="https://sh.dataspace.copernicus.eu/statistics/v1"
TOKEN_URL="https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
STAT_URL="https://sh.dataspace.copernicus.eu/api/v1/statistics"
CATALOG_URL="https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search"
PROVIDER="Copernicus Data Space / Sentinel Hub"
CADENCE=max(1,int(os.environ.get("SATELLITE_CADENCE_DAYS","5")))
DEFAULT_COLLECTIONS="sentinel-2-l2a,sentinel-1-grd" if CLIENT and SECRET else "sentinel-1-grd"
COLLECTIONS=[x.strip() for x in os.environ.get("SATELLITE_COLLECTIONS",DEFAULT_COLLECTIONS).split(",") if x.strip()]
S2="""//VERSION=3
function setup(){return {input:[{bands:["B02","B03","B04","B05","B06","B07","B08","B8A","B11","B12","SCL","dataMask"]}],output:[{id:"default",bands:16,sampleType:"FLOAT32"},{id:"dataMask",bands:1,sampleType:"UINT8"}]};}
function evaluatePixel(s){let mask=s.dataMask*( [3,8,9,10,11].indexOf(s.SCL)===-1?1:0 );let ndvi=(s.B08+s.B04)!==0?(s.B08-s.B04)/(s.B08+s.B04):0;let ndre=(s.B8A+s.B05)!==0?(s.B8A-s.B05)/(s.B8A+s.B05):0;let ndmi=(s.B8A+s.B11)!==0?(s.B8A-s.B11)/(s.B8A+s.B11):0;let ndwi=(s.B03+s.B08)!==0?(s.B03-s.B08)/(s.B03+s.B08):0;let evi=(s.B08+6*s.B04-7.5*s.B02+1)!==0?2.5*(s.B08-s.B04)/(s.B08+6*s.B04-7.5*s.B02+1):0;let savi=(s.B08+s.B04+0.5)!==0?1.5*(s.B08-s.B04)/(s.B08+s.B04+0.5):0;return {default:[s.B02,s.B03,s.B04,s.B05,s.B06,s.B07,s.B08,s.B8A,s.B11,s.B12,ndvi,ndre,ndmi,ndwi,evi,savi],dataMask:[mask]};}"""
S1="""//VERSION=3
function setup(){return {input:[{bands:["VV","VH","dataMask"]}],output:[{id:"backscatter",bands:4,sampleType:"FLOAT32"},{id:"dataMask",bands:1,sampleType:"UINT8"}]};}
function evaluatePixel(s){return {backscatter:[s.VV,s.VH,s.VV-s.VH,(s.VH!==0?s.VV/s.VH:0)],dataMask:[s.dataMask]};}"""
def req(url,method="GET",payload=None,headers=None):
 data=None if payload is None else json.dumps(payload,separators=(",",":")).encode()
 h={"Accept":"application/json","User-Agent":"SeedProductionSatelliteAudit/1.0"}
 if headers:h.update(headers)
 if data is not None:h["Content-Type"]="application/json"
 with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=h,method=method),timeout=90) as r:
  raw=r.read();return r.status,json.loads(raw.decode()) if raw else None,raw
def db(path,method="GET",payload=None,prefer=None):
 h={"apikey":DB_KEY,"Authorization":"Bearer "+DB_KEY}
 if prefer:h["Prefer"]=prefer
 return req(DB_URL+"/rest/v1/"+path,method,payload,h)
def token():
 form=urllib.parse.urlencode({"grant_type":"client_credentials","client_id":CLIENT,"client_secret":SECRET}).encode()
 with urllib.request.urlopen(urllib.request.Request(TOKEN_URL,data=form,headers={"Content-Type":"application/x-www-form-urlencoded"}),timeout=45) as r:return json.loads(r.read().decode())["access_token"]
def catalog_products(access,collection,start,interval_end,polygon):
 """Return actual catalogue acquisition dates and product IDs for the requested field/time window."""
 payload={"collections":[collection],"datetime":start.isoformat()+"T00:00:00Z/"+interval_end.isoformat()+"T23:59:59Z","intersects":polygon,"limit":100}
 _,result,raw=req(CATALOG_URL,"POST",payload,{"Authorization":"Bearer "+access})
 features=result.get("features") or []
 dates=set();ids=[];cloud=[]
 for feature in features:
  props=feature.get("properties") or {}
  acquired=props.get("datetime") or props.get("start_datetime")
  if acquired:
   try:dates.add(datetime.fromisoformat(acquired.replace("Z","+00:00")).date().isoformat())
   except ValueError:pass
  if feature.get("id"):ids.append(feature["id"])
  value=props.get("eo:cloud_cover")
  if isinstance(value,(int,float)):cloud.append(float(value))
 return sorted(dates),ids,(round(sum(cloud)/len(cloud),2) if cloud else None),hashlib.sha256(raw).hexdigest()

def polygon_bbox(polygon):
 """Return a bbox for connector provenance only; statistics use the actual polygon geometry."""
 points=[]
 def walk(value):
  if isinstance(value,(list,tuple)):
   if len(value)>=2 and isinstance(value[0],(int,float)) and isinstance(value[1],(int,float)):
    points.append((float(value[0]),float(value[1])))
   else:
    for item in value:walk(item)
 walk(polygon.get("coordinates",polygon) if isinstance(polygon,dict) else polygon)
 if not points:raise ValueError("Field polygon has no valid coordinate pairs")
 xs=[p[0] for p in points];ys=[p[1] for p in points]
 return [min(xs),min(ys),max(xs),max(ys)]
def worker_statistics(polygon,start,interval_end):
 """Use the existing ANVORA Cloudflare Worker for authenticated Sentinel-1 statistics."""
 from_ts=start.isoformat()+"T00:00:00Z"
 to_ts=interval_end.isoformat()+"T23:59:59Z"
 bbox=polygon_bbox(polygon)
 provider_request={"input":{"bounds":{"bbox":bbox,"geometry":polygon,"properties":{"crs":"http://www.opengis.net/def/crs/EPSG/0/4326"}},"data":[{"type":"sentinel-1-grd","dataFilter":{},"processing":{"orthorectify":True,"backCoeff":"GAMMA0_TERRAIN"}}]},"aggregation":{"timeRange":{"from":from_ts,"to":to_ts},"aggregationInterval":{"of":"P"+str(CADENCE)+"D"},"resx":20,"resy":20,"evalscript":S1},"calculations":{"default":{"statistics":{"default":{"percentiles":{"k":[10,50,90]}}}}}}
 envelope={"operation":"sentinel1-statistics","request":provider_request,**provider_request,"providerEndpoint":WORKER_STAT_URL,"acquisition":{"plotId":None,"acquisitionId":None,"acquisitionDateTime":None,"requestedBbox":polygon_bbox(polygon)},"requestedAt":datetime.now(timezone.utc).isoformat(),"clientVersion":"SeedProductionSatelliteAudit/1.0"}
 status,data,raw=req(WORKER_URL,"POST",envelope,{"Accept":"application/json"})
 if not isinstance(data,dict):raise ValueError("Cloudflare Worker returned a non-object response")
 if status<200 or status>=300 or str(data.get("status","")).upper() not in ("OK","SUCCESS"):
  raise ValueError("Cloudflare Worker did not confirm success: "+json.dumps(data)[:1000])
 candidates=[data.get("statistics"),data.get("result"),data.get("data")]
 result=next((x for x in candidates if isinstance(x,dict) and isinstance(x.get("data"),list)),None)
 if result is None:
  result=next(({"data":x} for x in candidates if isinstance(x,list)),None)
 if result is None:
  raise ValueError("Worker response has no recognised Statistical API interval array; inspect connector contract before treating it as measured")
 return result,raw,data

def explain(collection,stats,valid_pct):
 notes=[]
 def mean(k):
  try:return float(stats[k]["mean"])
  except (KeyError,TypeError,ValueError):return None
 if valid_pct is not None and valid_pct<50:notes.append({"indicator":"data_quality","level":"caution","message":"Too little of the field had valid pixels. Treat this observation as low confidence."})
 if collection=="sentinel-2-l2a":
  n=mean("NDVI")
  if n is not None:
   if n<.25:m="Green vegetation signal is low. This may mean bare soil, early growth, harvest, stress or poor pixels; check crop stage and field observations."
   elif n<.55:m="The green vegetation signal is moderate. Compare with this field's earlier observations and similar fields at the same crop stage."
   else:m="The field has a strong green-vegetation signal. This alone does not prove crop health or predict yield."
   notes.append({"indicator":"NDVI","value":round(n,4),"level":"informational","message":m})
  for key,msg in [("NDRE","Red-edge response can help follow canopy and chlorophyll-related changes; compare like-for-like crop stages."),("NDMI","This NIR/SWIR index is sensitive to canopy water content and background; it is not a direct soil-moisture measurement."),("NDWI","This index can respond to water-related surface/vegetation signals and needs local context.")]:
   v=mean(key)
   if v is not None:notes.append({"indicator":key,"value":round(v,4),"level":"informational","message":msg})
  notes.append({"indicator":"yield","level":"not_estimated","message":"Satellite indicators do not directly measure yield. A yield model needs crop, hybrid and stage calibration against actual harvest records."})
 else:
  notes.append({"indicator":"SAR","level":"informational","message":"Radar backscatter responds to crop structure, surface roughness, water and acquisition geometry. A single value cannot uniquely diagnose stress or soil moisture."})
  for key,msg in [("VV","Compare VV with earlier passes using compatible orbit geometry."),("VH","VH can help track vegetation-structure changes over time."),("VV_VH_RATIO","Use the VV/VH relationship as a time-series feature alongside optical indices and field observations.")]:
   v=mean(key)
   if v is not None:notes.append({"indicator":key,"value":round(v,4),"level":"informational","message":msg})
 return {"language":"en","method":"heuristics-v1; explanatory only, not diagnosis or calibrated yield","notes":notes}
def main():
 if not all([DB_URL,DB_KEY]):print("ERROR: database URL and service-role key are required.",file=sys.stderr);return 2
 direct_available=bool(CLIENT and SECRET)
 if not direct_available and not WORKER_URL:print("ERROR: configure the Cloudflare EO Worker or CDSE credentials.",file=sys.stderr);return 2
 cutoff=date.today()-timedelta(days=1)
 fields="id,company_id,crop_season_id,farmer_id,field_id,field_code,village,district,state,crop,hybrid,latitude,longitude,field_boundary_geojson,crop_start_date,expected_harvest_date,planting_date,active"
 q=urllib.parse.urlencode({"select":fields,"active":"eq.true","order":"id.asc"})
 try:_,locations,_=db("seed_weather_locations?"+q);access=token() if direct_available else None
 except Exception as e:print("ERROR setup or field registry: "+str(e),file=sys.stderr);return 2
 errors=0;saved=0
 for loc in locations:
  anchor_text=loc.get("crop_start_date") or loc.get("planting_date")
  if not anchor_text:
   print("SKIP field="+str(loc.get("field_id"))+": crop start / planting date required; no interval can be assigned to an auditable extraction attempt",file=sys.stderr)
   continue
  anchor=date.fromisoformat(anchor_text[:10])
  complete_blocks=max(0,((cutoff-anchor).days+1)//CADENCE)
  if complete_blocks<1:continue
  # Backfill every completed crop interval; successful collection/interval runs are skipped below.
  for block_index in range(complete_blocks):
   start=anchor+timedelta(days=block_index*CADENCE)
   interval_end=start+timedelta(days=CADENCE-1)
   if start>cutoff: break
   if loc.get("expected_harvest_date") and start>date.fromisoformat(loc["expected_harvest_date"][:10]): break
   if interval_end>cutoff: interval_end=cutoff
   if loc.get("expected_harvest_date") and interval_end>date.fromisoformat(loc["expected_harvest_date"][:10]):
    interval_end=date.fromisoformat(loc["expected_harvest_date"][:10])
   for collection in COLLECTIONS:
    exists_q=urllib.parse.urlencode({"select":"id","company_id":"eq."+loc["company_id"],"crop_season_id":"eq."+loc["crop_season_id"],"field_id":"eq."+loc["field_id"],"collection":"eq."+collection,"interval_start":"eq."+start.isoformat(),"interval_end":"eq."+interval_end.isoformat(),"status":"eq.success","limit":"1"})
    try:
     _,done,_=db("seed_satellite_ingestion_runs?"+exists_q)
     if done:continue
    except Exception as check_error:
     print("WARN cannot check prior successful run: "+str(check_error),file=sys.stderr)
    started=datetime.now(timezone.utc);run_id=None
    use_worker=(collection=="sentinel-1-grd" and bool(WORKER_URL))
    url=WORKER_URL if use_worker else STAT_URL
    try:
     polygon=loc.get("field_boundary_geojson")
     if not polygon:raise ValueError("Verified field polygon missing; field statistics cannot be computed from a centroid alone")
     if isinstance(polygon,str):polygon=json.loads(polygon)
     evalscript=S2 if collection=="sentinel-2-l2a" else S1
     payload={"input":{"bounds":{"geometry":polygon,"properties":{"crs":"http://www.opengis.net/def/crs/EPSG/0/4326"}},"data":[{"type":collection,"dataFilter":{"timeRange":{"from":start.isoformat()+"T00:00:00Z","to":interval_end.isoformat()+"T23:59:59Z"}}}]},"aggregation":{"timeRange":{"from":start.isoformat()+"T00:00:00Z","to":interval_end.isoformat()+"T23:59:59Z"},"aggregationInterval":{"of":"P"+str(CADENCE)+"D"},"resx":10 if collection=="sentinel-2-l2a" else 20,"resy":10 if collection=="sentinel-2-l2a" else 20,"evalscript":evalscript},"calculations":{"default":{"statistics":{"default":{"percentiles":{"k":[10,50,90]}}}}}}
     run={"location_id":loc["id"],"company_id":loc["company_id"],"crop_season_id":loc["crop_season_id"],"farmer_id":loc["farmer_id"],"field_id":loc["field_id"],"collection":collection,"interval_start":start.isoformat(),"interval_end":interval_end.isoformat(),"status":"running","request_started_at":started.isoformat(),"request_parameters":{"cadence_days":CADENCE,"provider":("ANVORA Cloudflare Worker / Copernicus Sentinel Hub" if use_worker else PROVIDER),"catalog_url":CATALOG_URL}}
     _,created,_=db("seed_satellite_ingestion_runs","POST",run,"return=representation");run_id=created[0]["id"]
     if use_worker:
      result,raw,worker_meta=worker_statistics(polygon,start,interval_end)
     else:
      if not access:raise ValueError("Direct Copernicus credentials are required for "+collection+"; Sentinel-2 is not exposed by the current ANVORA Worker contract")
      _,result,raw=req(url,"POST",payload,{"Authorization":"Bearer "+access})
     digest=hashlib.sha256(raw).hexdigest()
     acquisition_dates=[];product_ids=[];scene_cloud_pct=None;catalog_sha=None
     try:
      if access:acquisition_dates,product_ids,scene_cloud_pct,catalog_sha=catalog_products(access,collection,start,interval_end,polygon)
     except Exception as catalog_error:
      print("WARN catalogue lookup failed for field="+str(loc.get("field_id"))+" collection="+collection+": "+str(catalog_error),file=sys.stderr)
     intervals=result.get("data") or []
     if not intervals:
      if product_ids:
       errors+=1
       audit={"status":"failed","request_completed_at":datetime.now(timezone.utc).isoformat(),"response_sha256":digest,"error_code":"CatalogStatisticsMismatch","error_message":"Catalogue returned "+str(len(product_ids))+" products but the Statistical API returned no interval data."}
       db("seed_satellite_ingestion_runs?id=eq."+run_id,"PATCH",audit,"return=minimal")
       print("ERROR catalogue/statistics mismatch for field="+str(loc.get("field_id"))+" collection="+collection,file=sys.stderr)
      else:
       db("seed_satellite_ingestion_runs?id=eq."+run_id,"PATCH",{"status":"no_observation","request_completed_at":datetime.now(timezone.utc).isoformat(),"response_sha256":digest,"request_parameters":{"cadence_days":CADENCE,"provider":PROVIDER,"catalog_url":CATALOG_URL,"catalog_products_found":0,"catalog_response_sha256":catalog_sha}},"return=minimal")
      continue
     for interval in intervals:
      outputs=interval.get("outputs") or {};default=outputs.get("backscatter") or outputs.get("default") or {};bands=default.get("bands") or {};mask_output=outputs.get("dataMask") or {};mask_bands=mask_output.get("bands") or {}
      names=["B02","B03","B04","B05","B06","B07","B08","B8A","B11","B12","NDVI","NDRE","NDMI","NDWI","EVI","SAVI"] if collection=="sentinel-2-l2a" else ["VV","VH","VV_MINUS_VH","VV_VH_RATIO"]
      stats={}
      for i,name in enumerate(names):
       band=bands.get(str(i),bands.get("B"+str(i),bands.get(name,{})))
       if isinstance(band,dict) and band.get("stats") is not None:stats[name]=band["stats"]
      mask_band=mask_bands.get("B0",mask_bands.get("0",{}));mask_stats=mask_band.get("stats",{}) if isinstance(mask_band,dict) else {};mask=mask_stats.get("mean");valid=round(float(mask)*100,2) if mask is not None else None
      indices={k:stats[k] for k in ("NDVI","NDRE","NDMI","NDWI","EVI","SAVI") if k in stats}
      row={"location_id":loc["id"],"company_id":loc["company_id"],"crop_season_id":loc["crop_season_id"],"farmer_id":loc["farmer_id"],"field_id":loc["field_id"],"field_code":loc.get("field_code"),"village":loc["village"],"district":loc["district"],"state":loc["state"],"crop":loc.get("crop") or "Paddy","hybrid":loc.get("hybrid"),"planting_date":loc.get("planting_date"),"collection":collection,"interval_start":start.isoformat(),"interval_end":interval_end.isoformat(),"acquisition_dates":acquisition_dates,"provider_product_ids":product_ids,"field_boundary_geojson":polygon,"valid_pixel_pct":valid,"cloud_coverage_pct":None,"metrics":{"band_statistics":bands,"channel_statistics":stats,"catalog_scene_cloud_cover_pct":scene_cloud_pct,"catalog_response_sha256":catalog_sha},"indices":indices,"plain_language_interpretation":explain(collection,stats,valid),"provider":("ANVORA Cloudflare Worker / Copernicus Data Space" if use_worker else PROVIDER),"source_payload":{"statistics":result,"catalog_lookup_sha256":catalog_sha,"worker_metadata":worker_meta if use_worker else None},"source_sha256":digest,"ingestion_run_id":run_id}
      db("seed_satellite_observations","POST",row,"resolution=ignore-duplicates,return=minimal");saved+=1
     db("seed_satellite_ingestion_runs?id=eq."+run_id,"PATCH",{"status":"success","request_completed_at":datetime.now(timezone.utc).isoformat(),"response_sha256":digest},"return=minimal")
     print("OK field="+str(loc["field_id"])+" collection="+collection+" "+start.isoformat()+".."+interval_end.isoformat()+" provider="+("cloudflare-worker" if use_worker else "direct-cdse"))
    except Exception as e:
     errors+=1
     try:
      audit={"status":"failed","request_completed_at":datetime.now(timezone.utc).isoformat(),"error_code":type(e).__name__,"error_message":str(e)[:1500]}
      if run_id:db("seed_satellite_ingestion_runs?id=eq."+run_id,"PATCH",audit,"return=minimal")
      else:db("seed_satellite_ingestion_runs","POST",{"company_id":loc["company_id"],"crop_season_id":loc["crop_season_id"],"farmer_id":loc["farmer_id"],"field_id":loc["field_id"],"collection":collection,"interval_start":start.isoformat(),"interval_end":interval_end.isoformat(),"status":"failed","request_started_at":started.isoformat(),"request_completed_at":datetime.now(timezone.utc).isoformat(),"error_code":type(e).__name__,"error_message":str(e)[:1500]},"return=minimal")
     except Exception as audit:print("CRITICAL audit write failed: "+str(audit),file=sys.stderr)
     print("ERROR field="+loc["field_id"]+" collection="+collection+": "+str(e),file=sys.stderr)
    time.sleep(.2)
 print("Satellite extraction finished: rows="+str(saved)+", failed requests="+str(errors))
 return 1 if errors else 0
if __name__=="__main__":raise SystemExit(main())
