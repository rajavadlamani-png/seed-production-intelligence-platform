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
TOKEN_URL="https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
STAT_URL="https://sh.dataspace.copernicus.eu/api/v1/statistics"
PROVIDER="Copernicus Data Space / Sentinel Hub"
CADENCE=max(1,int(os.environ.get("SATELLITE_CADENCE_DAYS","5")))
S2="""//VERSION=3
function setup(){return {input:[{bands:["B02","B03","B04","B05","B06","B07","B08","B8A","B11","B12","SCL","dataMask"]}],output:[{id:"default",bands:16,sampleType:"FLOAT32"},{id:"dataMask",bands:1,sampleType:"UINT8"}]};}
function evaluatePixel(s){let mask=s.dataMask*( [3,8,9,10,11].indexOf(s.SCL)===-1?1:0 );let ndvi=(s.B08+s.B04)!==0?(s.B08-s.B04)/(s.B08+s.B04):0;let ndre=(s.B8A+s.B05)!==0?(s.B8A-s.B05)/(s.B8A+s.B05):0;let ndmi=(s.B8A+s.B11)!==0?(s.B8A-s.B11)/(s.B8A+s.B11):0;let ndwi=(s.B03+s.B08)!==0?(s.B03-s.B08)/(s.B03+s.B08):0;let evi=(s.B08+6*s.B04-7.5*s.B02+1)!==0?2.5*(s.B08-s.B04)/(s.B08+6*s.B04-7.5*s.B02+1):0;let savi=(s.B08+s.B04+0.5)!==0?1.5*(s.B08-s.B04)/(s.B08+s.B04+0.5):0;return {default:[s.B02,s.B03,s.B04,s.B05,s.B06,s.B07,s.B08,s.B8A,s.B11,s.B12,ndvi,ndre,ndmi,ndwi,evi,savi],dataMask:[mask]};}"""
S1="""//VERSION=3
function setup(){return {input:[{bands:["VV","VH","dataMask"]}],output:[{id:"default",bands:4,sampleType:"FLOAT32"},{id:"dataMask",bands:1,sampleType:"UINT8"}]};}
function evaluatePixel(s){return {default:[s.VV,s.VH,s.VV-s.VH,(s.VH!==0?s.VV/s.VH:0)],dataMask:[s.dataMask]};}"""
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
 if not all([DB_URL,DB_KEY,CLIENT,SECRET]):print("ERROR: database and CDSE secrets are required.",file=sys.stderr);return 2
 end=date.today()-timedelta(days=1)
 fields="id,company_id,crop_season_id,farmer_id,field_id,field_code,village,district,state,crop,hybrid,latitude,longitude,field_boundary_geojson,crop_start_date,expected_harvest_date,planting_date,active"
 q=urllib.parse.urlencode({"select":fields,"active":"eq.true","order":"id.asc"})
 try:_,locations,_=db("seed_weather_locations?"+q);access=token()
 except Exception as e:print("ERROR setup or field registry: "+str(e),file=sys.stderr);return 2
 errors=0;saved=0
 for loc in locations:
  anchor_text=loc.get("crop_start_date") or loc.get("planting_date")
  if not anchor_text:
   print("SKIP field="+str(loc.get("field_id"))+": crop start / planting date required to anchor five-day intervals",file=sys.stderr)
   continue
  anchor=date.fromisoformat(anchor_text[:10])
  complete_blocks=max(0,((end-anchor).days+1)//CADENCE)
  if complete_blocks<1:continue
  # Retry the most recently completed fixed five-day crop interval until it succeeds.
  start=anchor+timedelta(days=(complete_blocks-1)*CADENCE)
  interval_end=start+timedelta(days=CADENCE-1)
  if loc.get("expected_harvest_date") and start.isoformat()>loc["expected_harvest_date"]:continue
  if loc.get("expected_harvest_date") and interval_end>date.fromisoformat(loc["expected_harvest_date"][:10]):
   interval_end=date.fromisoformat(loc["expected_harvest_date"][:10])
  end=interval_end
  for collection in ("sentinel-2-l2a","sentinel-1-grd"):
   exists_q=urllib.parse.urlencode({"select":"id","company_id":"eq."+loc["company_id"],"crop_season_id":"eq."+loc["crop_season_id"],"field_id":"eq."+loc["field_id"],"collection":"eq."+collection,"interval_start":"eq."+start.isoformat(),"interval_end":"eq."+end.isoformat(),"status":"eq.success","limit":"1"})
   try:
    _,done,_=db("seed_satellite_ingestion_runs?"+exists_q)
    if done:continue
   except Exception as check_error:
    print("WARN cannot check prior successful run: "+str(check_error),file=sys.stderr)
   started=datetime.now(timezone.utc);run_id=None;url=STAT_URL
   try:
    polygon=loc.get("field_boundary_geojson")
    if not polygon:raise ValueError("Verified field polygon missing; field statistics cannot be computed from a centroid alone")
    if isinstance(polygon,str):polygon=json.loads(polygon)
    evalscript=S2 if collection=="sentinel-2-l2a" else S1
    payload={"input":{"bounds":{"geometry":polygon,"properties":{"crs":"http://www.opengis.net/def/crs/EPSG/0/4326"}},"data":[{"type":collection,"dataFilter":{"timeRange":{"from":start.isoformat()+"T00:00:00Z","to":end.isoformat()+"T23:59:59Z"}}}]},"aggregation":{"timeRange":{"from":start.isoformat()+"T00:00:00Z","to":end.isoformat()+"T23:59:59Z"},"aggregationInterval":{"of":"P"+str(CADENCE)+"D"},"resx":10 if collection=="sentinel-2-l2a" else 20,"resy":10 if collection=="sentinel-2-l2a" else 20,"evalscript":evalscript},"calculations":{"default":{"statistics":{"default":{"percentiles":{"k":[10,50,90]}}}}}}
    run={"location_id":loc["id"],"company_id":loc["company_id"],"crop_season_id":loc["crop_season_id"],"farmer_id":loc["farmer_id"],"field_id":loc["field_id"],"collection":collection,"interval_start":start.isoformat(),"interval_end":end.isoformat(),"status":"running","request_started_at":started.isoformat(),"request_parameters":{"cadence_days":CADENCE,"provider":PROVIDER}}
    _,created,_=db("seed_satellite_ingestion_runs","POST",run,"return=representation");run_id=created[0]["id"]
    _,result,raw=req(url,"POST",payload,{"Authorization":"Bearer "+access});digest=hashlib.sha256(raw).hexdigest()
    intervals=result.get("data") or []
    if not intervals:
     db("seed_satellite_ingestion_runs?id=eq."+run_id,"PATCH",{"status":"no_observation","request_completed_at":datetime.now(timezone.utc).isoformat(),"response_sha256":digest},"return=minimal");continue
    for interval in intervals:
     outputs=interval.get("outputs") or {};default=outputs.get("default") or {};bands=default.get("bands") or {};mask_output=outputs.get("dataMask") or {};mask_bands=mask_output.get("bands") or {}
     names=["B02","B03","B04","B05","B06","B07","B08","B8A","B11","B12","NDVI","NDRE","NDMI","NDWI","EVI","SAVI"] if collection=="sentinel-2-l2a" else ["VV","VH","VV_MINUS_VH","VV_VH_RATIO"]
     stats={}
     for i,name in enumerate(names):
      band=bands.get(str(i),bands.get(name,{}))
      if isinstance(band,dict) and band.get("stats") is not None:stats[name]=band["stats"]
     mask_band=mask_bands.get("B0",mask_bands.get("0",{}));mask_stats=mask_band.get("stats",{}) if isinstance(mask_band,dict) else {};mask=mask_stats.get("mean");valid=round(float(mask)*100,2) if mask is not None else None
     indices={k:stats[k] for k in ("NDVI","NDRE","NDMI","NDWI","EVI","SAVI") if k in stats}
     row={"location_id":loc["id"],"company_id":loc["company_id"],"crop_season_id":loc["crop_season_id"],"farmer_id":loc["farmer_id"],"field_id":loc["field_id"],"field_code":loc.get("field_code"),"village":loc["village"],"district":loc["district"],"state":loc["state"],"crop":loc.get("crop") or "Paddy","hybrid":loc.get("hybrid"),"planting_date":loc.get("planting_date"),"collection":collection,"interval_start":start.isoformat(),"interval_end":end.isoformat(),"acquisition_dates":[],"field_boundary_geojson":polygon,"valid_pixel_pct":valid,"metrics":{"band_statistics":bands,"channel_statistics":stats},"indices":indices,"plain_language_interpretation":explain(collection,stats,valid),"provider":PROVIDER,"source_payload":result,"source_sha256":digest,"ingestion_run_id":run_id}
     db("seed_satellite_observations","POST",row,"resolution=ignore-duplicates,return=minimal");saved+=1
    db("seed_satellite_ingestion_runs?id=eq."+run_id,"PATCH",{"status":"success","request_completed_at":datetime.now(timezone.utc).isoformat(),"response_sha256":digest},"return=minimal")
    print("OK field="+loc["field_id"]+" collection="+collection+" "+start.isoformat()+".."+end.isoformat())
   except Exception as e:
    errors+=1
    try:
     audit={"status":"failed","request_completed_at":datetime.now(timezone.utc).isoformat(),"error_code":type(e).__name__,"error_message":str(e)[:1500]}
     if run_id:db("seed_satellite_ingestion_runs?id=eq."+run_id,"PATCH",audit,"return=minimal")
     else:db("seed_satellite_ingestion_runs","POST",{"company_id":loc["company_id"],"crop_season_id":loc["crop_season_id"],"farmer_id":loc["farmer_id"],"field_id":loc["field_id"],"collection":collection,"interval_start":start.isoformat(),"interval_end":end.isoformat(),"status":"failed","request_started_at":started.isoformat(),"request_completed_at":datetime.now(timezone.utc).isoformat(),"error_code":type(e).__name__,"error_message":str(e)[:1500]},"return=minimal")
    except Exception as audit:print("CRITICAL audit write failed: "+str(audit),file=sys.stderr)
    print("ERROR field="+loc["field_id"]+" collection="+collection+": "+str(e),file=sys.stderr)
   time.sleep(.2)
 print("Satellite extraction finished: rows="+str(saved)+", failed requests="+str(errors))
 return 1 if errors else 0
if __name__=="__main__":raise SystemExit(main())
