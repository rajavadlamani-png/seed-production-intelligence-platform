#!/usr/bin/env python3
"""Field-clipped Sentinel-1/2 feature extraction for the SageHarvest VWC POC.
Outputs satellite predictor features only; it does not estimate soil VWC.
Credentials are read from CDSE_CLIENT_ID and CDSE_CLIENT_SECRET environment variables.
"""
import argparse,csv,hashlib,json,math,os,sys
from datetime import date,datetime,timezone
from pathlib import Path
import numpy as np,requests,rasterio
from rasterio.features import geometry_mask
from rasterio.io import MemoryFile
from rasterio.transform import from_origin,rowcol
from shapely.geometry import Point,box,mapping,shape
from shapely.ops import transform as transform_geometry
from pyproj import Transformer

TOKEN_URL="https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
PROCESS_URL="https://sh.dataspace.copernicus.eu/process/v1"
PIXEL_M=20.0
NODATA=-9999.0
S2_SCRIPT=r'''//VERSION=3
function setup(){return {input:[{bands:["B04","B08","B11","SCL","dataMask"],units:["REFLECTANCE","REFLECTANCE","REFLECTANCE","DN","DN"]}],output:{bands:3,sampleType:"FLOAT32"}};}
function evaluatePixel(s){const bad=[0,1,3,8,9,10,11],a=s.B08+s.B04,b=s.B08+s.B11;if(s.dataMask===0||bad.indexOf(s.SCL)>=0||a<=0||b<=0)return [-9999,-9999,0];return [(s.B08-s.B04)/a,(s.B08-s.B11)/b,1];}'''
S1_SCRIPT=r'''//VERSION=3
function setup(){return {input:[{bands:["VV","VH","dataMask"],units:["LINEAR_POWER","LINEAR_POWER","DN"]}],output:{bands:3,sampleType:"FLOAT32"}};}
function evaluatePixel(s){if(s.dataMask===0||s.VV<=0||s.VH<=0)return [-9999,-9999,0];return [s.VV,s.VH,1];}'''

def utc(day,end=False):
    date.fromisoformat(day)
    return day+("T23:59:59.999Z" if end else "T00:00:00.000Z")

def get_token(session):
    cid=os.getenv("CDSE_CLIENT_ID","").strip(); secret=os.getenv("CDSE_CLIENT_SECRET","").strip()
    if not cid or not secret: raise RuntimeError("Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in your local shell. Do not commit credentials.")
    r=session.post(TOKEN_URL,data={"grant_type":"client_credentials","client_id":cid,"client_secret":secret},timeout=45)
    if not r.ok: raise RuntimeError(f"CDSE OAuth failed ({r.status_code}): {r.text[:800]}")
    value=r.json().get("access_token")
    if not value: raise RuntimeError("CDSE OAuth response has no access_token.")
    return value

def read_process_tiff(session,bearer,body,label):
    r=session.post(PROCESS_URL,json=body,headers={"Authorization":"Bearer "+bearer,"Accept":"image/tiff"},timeout=(30,180))
    if not r.ok:
        detail=r.text[:1200]
        if r.status_code in (400,404) and "no data" in detail.lower(): return None
        raise RuntimeError(f"{label} Process API failed ({r.status_code}): {detail}")
    if "tiff" not in r.headers.get("Content-Type","").lower() and r.content[:4] not in (b"II*\\x00",b"MM\\x00*",b"II+\\x00",b"MM\\x00+"):
        raise RuntimeError(f"{label} returned non-TIFF content.")
    try:
        with MemoryFile(r.content) as mem:
            with mem.open() as ds:
                if ds.count!=3: raise RuntimeError(f"{label} returned {ds.count} bands; expected 3.")
                return {"a":ds.read().astype(np.float32),"transform":ds.transform,"crs":ds.crs,"width":ds.width,"height":ds.height}
    except rasterio.errors.RasterioError as e: raise RuntimeError(f"Could not read {label} GeoTIFF: {e}") from e

def utm(geom):
    lon,lat=geom.centroid.x,geom.centroid.y
    zone=max(1,min(60,int(math.floor((lon+180)/6))+1))
    epsg=(32600 if lat>=0 else 32700)+zone
    return epsg,Transformer.from_crs("EPSG:4326",f"EPSG:{epsg}",always_xy=True)

def grid(geom):
    x0,y0,x1,y1=geom.bounds
    left=math.floor(x0/PIXEL_M)*PIXEL_M; bottom=math.floor(y0/PIXEL_M)*PIXEL_M
    right=math.ceil(x1/PIXEL_M)*PIXEL_M; top=math.ceil(y1/PIXEL_M)*PIXEL_M
    w=max(1,int(round((right-left)/PIXEL_M))); h=max(1,int(round((top-bottom)/PIXEL_M)))
    if w*h>500000: raise RuntimeError(f"Field raster has {w*h:,} cells; limit is 500,000 per field/window.")
    return (left,bottom,right,top),w,h,from_origin(left,top,PIXEL_M,PIXEL_M)

def process_body(geom,epsg,bounds,w,h,start,end,sensor):
    left,bottom,right,top=bounds
    common={"timeRange":{"from":utc(start),"to":utc(end,True)}}
    if sensor=="s2":
        data={"type":"sentinel-2-l2a","dataFilter":{**common,"maxCloudCoverage":40,"mosaickingOrder":"leastCC"}}
        script=S2_SCRIPT
    else:
        data={"type":"sentinel-1-grd","dataFilter":{**common,"mosaickingOrder":"mostRecent","acquisitionMode":"IW","polarization":"DV"},
              "processing":{"orthorectify":True,"backCoeff":"GAMMA0_TERRAIN","demInstance":"COPERNICUS_30"}}
        script=S1_SCRIPT
    return {"input":{"bounds":{"bbox":[left,bottom,right,top],"geometry":mapping(geom),
                "properties":{"crs":f"http://www.opengis.net/def/crs/EPSG/0/{epsg}"}},
             "data":[data]},
            "output":{"width":w,"height":h,"responses":[{"identifier":"default","format":{"type":"image/tiff"}}]},
            "evalscript":script}

def read_fields(path):
    obj=json.loads(path.read_text(encoding="utf-8-sig"))
    if obj.get("type")!="FeatureCollection": raise ValueError("Fields input must be a GeoJSON FeatureCollection.")
    result=[]; seen=set()
    for i,f in enumerate(obj.get("features",[]),1):
        props=f.get("properties") or {}; field=str(props.get("field_no") or props.get("fieldNo") or "").strip()
        if not field: raise ValueError(f"GeoJSON feature {i}: properties.field_no is required.")
        if field in seen: raise ValueError(f"Duplicate field_no {field}; export one polygon per field.")
        seen.add(field); g=shape(f.get("geometry") or {})
        if g.geom_type not in ("Polygon","MultiPolygon") or g.is_empty: raise ValueError(f"{field}: geometry must be Polygon or MultiPolygon.")
        if not g.is_valid: g=g.buffer(0)
        if g.is_empty or g.area<=0: raise ValueError(f"{field}: invalid/zero-area polygon.")
        result.append((field,g))
    if not result: raise ValueError("No field polygons found.")
    return result

def read_points(path):
    result={}
    if not path: return result
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f); required={"field_no","date","sample_point_id","latitude","longitude","validation_split"}
        missing=required-set(reader.fieldnames or [])
        if missing: raise ValueError("Ground CSV missing columns: "+", ".join(sorted(missing)))
        for n,r in enumerate(reader,2):
            field=(r.get("field_no") or "").strip(); day=(r.get("date") or "").strip()
            pid=(r.get("sample_point_id") or "").strip(); lat=(r.get("latitude") or "").strip(); lon=(r.get("longitude") or "").strip()
            if not all((field,day,pid,lat,lon)): continue
            date.fromisoformat(day); lat=float(lat); lon=float(lon)
            if not -90<=lat<=90 or not -180<=lon<=180: raise ValueError(f"Ground CSV row {n}: invalid coordinates.")
            split=(r.get("validation_split") or "").strip().lower()
            if split not in ("train","validation","test"): raise ValueError(f"Ground CSV row {n}: invalid validation_split.")
            bucket=result.setdefault((field,day),{}); old=bucket.get(pid); point={"lat":lat,"lon":lon,"split":split}
            if old and old!=point: raise ValueError(f"Ground CSV row {n}: inconsistent repeated sample point {field}/{day}/{pid}.")
            bucket[pid]=point
    return result

def extract(session,bearer,field,geom_wgs,day,window,start,end,default_split,points):
    epsg,project=utm(geom_wgs); geom=transform_geometry(project.transform,geom_wgs)
    bounds,w,h,affine=grid(geom)
    s2=read_process_tiff(session,bearer,process_body(geom,epsg,bounds,w,h,start,end,"s2"),"Sentinel-2")
    s1=read_process_tiff(session,bearer,process_body(geom,epsg,bounds,w,h,start,end,"s1"),"Sentinel-1")
    for name,r in (("Sentinel-2",s2),("Sentinel-1",s1)):
        if r and (r["width"]!=w or r["height"]!=h): raise RuntimeError(f"{name} grid dimensions differ for {field}.")
        if r and r["crs"] and r["crs"].to_epsg()!=epsg: raise RuntimeError(f"{name} CRS differs from requested EPSG:{epsg}.")
        if r and not np.allclose(tuple(r["transform"]),tuple(affine),atol=1e-7): raise RuntimeError(f"{name} grid transform differs for {field}.")
    inside=geometry_mask([mapping(geom)],out_shape=(h,w),transform=affine,invert=True,all_touched=True)
    a2=s2["a"] if s2 else np.full((3,h,w),NODATA,dtype=np.float32)
    a1=s1["a"] if s1 else np.full((3,h,w),NODATA,dtype=np.float32)
    v2=(a2[2]>.5)&np.isfinite(a2[0])&np.isfinite(a2[1])&(a2[0]!=NODATA)&(a2[1]!=NODATA)
    v1=(a1[2]>.5)&np.isfinite(a1[0])&np.isfinite(a1[1])&(a1[0]>0)&(a1[1]>0)
    valid=inside&v2&v1
    sample=points.get((field,day),{}); splits={p["split"] for p in sample.values()}
    all_splits={p["split"] for (f,d),items in points.items() if f==field for p in items.values()}
    if len(all_splits)>1: raise ValueError(f"{field}: ground samples across dates have mixed validation splits.")
    field_split=next(iter(all_splits)) if all_splits else default_split
    if splits and next(iter(splits))!=field_split: raise ValueError(f"{field}/{day}: sample split differs from the field-level split.")
    split=field_split
    cell_points={}; unmatched=[]
    for pid,p in sample.items():
        x,y=project.transform(p["lon"],p["lat"])
        if not geom.covers(Point(x,y)): unmatched.append(pid+" (outside field)"); continue
        rr,cc=rowcol(affine,x,y)
        if not (0<=rr<h and 0<=cc<w and inside[rr,cc] and valid[rr,cc]):
            unmatched.append(pid+" (no valid S1/S2 cell)"); continue
        if (rr,cc) in cell_points: raise ValueError(f"Sample points {cell_points[(rr,cc)]} and {pid} fall in the same 20 m cell of {field}.")
        cell_points[(rr,cc)]=pid
    rows=[]
    for rr in range(h):
        for cc in range(w):
            if not inside[rr,cc]: continue
            x0,y0=rasterio.transform.xy(affine,rr,cc,offset="ul"); x1,y1=rasterio.transform.xy(affine,rr,cc,offset="lr")
            area=box(x0,y1,x1,y0).intersection(geom).area
            if area<=0: continue
            ok=bool(valid[rr,cc])
            rows.append({"field_no":field,"date":day,"observation_window_id":window,
                "cell_id":f"R{rr:05d}C{cc:05d}","pixel_area_m2":f"{area:.4f}",
                "ndvi":f"{a2[0,rr,cc]:.7f}" if ok else "","ndmi":f"{a2[1,rr,cc]:.7f}" if ok else "",
                "vv":f"{a1[0,rr,cc]:.9f}" if ok else "","vh":f"{a1[1,rr,cc]:.9f}" if ok else "",
                "sample_point_id":cell_points.get((rr,cc),"") if ok else "","validation_split":split})
    total=sum(float(r["pixel_area_m2"]) for r in rows); valid_area=sum(float(r["pixel_area_m2"]) for r in rows if r["ndvi"]!="")
    meta={"field_no":field,"date":day,"observation_window_id":window,"window_start":start,"window_end":end,
        "utm_epsg":epsg,"pixel_size_m":PIXEL_M,"mapped_cells":len(rows),"valid_cells":int(valid.sum()),
        "total_mapped_area_m2":round(total,3),"valid_area_m2":round(valid_area,3),
        "valid_area_pct":round(100*valid_area/total,2) if total else 0,
        "sentinel2_available":s2 is not None,"sentinel1_available":s1 is not None,
        "matched_ground_points":len(cell_points),"unmatched_ground_points":unmatched,
        "s2_cloud_filter_max_tile_pct":40,"s2_scl_classes_excluded":[0,1,3,8,9,10,11],
        "s1_backscatter":"GAMMA0_TERRAIN","s1_vv_vh_units":"LINEAR_POWER (unitless)"}
    return rows,meta

def self_test():
    from shapely.geometry import Polygon
    p=Polygon([(0,0),(103,0),(103,87),(0,87)])
    _,w,h,t=grid(p); mask=geometry_mask([mapping(p)],out_shape=(h,w),transform=t,invert=True,all_touched=True)
    area=0
    for r,c in zip(*np.where(mask)):
        x0,y0=rasterio.transform.xy(t,r,c,offset="ul"); x1,y1=rasterio.transform.xy(t,r,c,offset="lr")
        area+=box(x0,y1,x1,y0).intersection(p).area
    assert abs(area-p.area)<1e-6
    assert utc("2026-07-01")=="2026-07-01T00:00:00.000Z"
    print("Self-test passed: projected grid, polygon clipping and UTC window formatting.")

def main():
    ap=argparse.ArgumentParser(description="Extract 20 m field-clipped Sentinel-1/2 predictors for the VWC POC.")
    ap.add_argument("--fields",type=Path); ap.add_argument("--ground-csv",type=Path)
    ap.add_argument("--from-date"); ap.add_argument("--to-date"); ap.add_argument("--observation-date")
    ap.add_argument("--window-id"); ap.add_argument("--split",choices=["train","validation","test","operational"],default="operational")
    ap.add_argument("--output",type=Path,default=Path("root-zone-vwc-spatial-pixels.csv")); ap.add_argument("--self-test",action="store_true")
    args=ap.parse_args()
    if args.self_test: self_test(); return 0
    if not all((args.fields,args.from_date,args.to_date,args.window_id)): ap.error("--fields, --from-date, --to-date and --window-id are required.")
    start=date.fromisoformat(args.from_date); end=date.fromisoformat(args.to_date)
    if start>end: ap.error("--from-date must be on or before --to-date.")
    day=args.observation_date or args.to_date; date.fromisoformat(day)
    fields=read_fields(args.fields); points=read_points(args.ground_csv); session=requests.Session(); bearer=get_token(session)
    rows=[]; metadata=[]
    for i,(field,geom) in enumerate(fields,1):
        print(f"[{i}/{len(fields)}] {field}: requesting Sentinel-2 and Sentinel-1…",flush=True)
        cell_rows,meta=extract(session,bearer,field,geom,day,args.window_id,args.from_date,args.to_date,args.split,points)
        rows.extend(cell_rows); metadata.append(meta)
        print(f"  {meta['valid_cells']}/{meta['mapped_cells']} cells valid; {meta['valid_area_pct']}% coverage; {meta['matched_ground_points']} points matched",flush=True)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    headers=["field_no","date","observation_window_id","cell_id","pixel_area_m2","ndvi","ndmi","vv","vh","sample_point_id","validation_split"]
    with args.output.open("w",newline="",encoding="utf-8-sig") as f:
        writer=csv.DictWriter(f,fieldnames=headers); writer.writeheader(); writer.writerows(rows)
    sidecar=args.output.with_suffix(".metadata.json")
    sidecar.write_text(json.dumps({"provider":"Copernicus Data Space Ecosystem / Sentinel Hub Process API",
        "generated_at":datetime.now(timezone.utc).isoformat(),"input_geojson_sha256":hashlib.sha256(args.fields.read_bytes()).hexdigest(),
        "observation_date_key":day,"observation_window_id":args.window_id,"window_start":args.from_date,"window_end":args.to_date,
        "pixel_size_m":PIXEL_M,"features":{"ndvi":"(B08-B04)/(B08+B04)","ndmi":"(B08-B11)/(B08+B11)",
        "vv":"Sentinel-1 VV GAMMA0_TERRAIN linear power","vh":"Sentinel-1 VH GAMMA0_TERRAIN linear power"},
        "s2_mask":"SCL classes 0,1,3,8,9,10,11 excluded; max tile cloud cover 40%.",
        "limitation":"Satellite features only; no 0-30 cm VWC is measured or estimated.","fields":metadata,"csv_rows":len(rows)},indent=2),encoding="utf-8")
    print(f"Wrote {len(rows):,} cells to {args.output} and provenance to {sidecar}")
    return 0

if __name__=="__main__":
    try: raise SystemExit(main())
    except (ValueError,RuntimeError,requests.RequestException) as e:
        print("ERROR: "+str(e),file=sys.stderr); raise SystemExit(2)
