#!/usr/bin/env python3
"""Collect yesterday's observed daily weather for every active crop-season field.
Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Use only a dedicated,
protected database; never load synthetic demo farmers as production records.
"""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

DB_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
DB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
LOCAL_TZ = ZoneInfo("Asia/Kolkata")
SOURCE = "Open-Meteo Archive API"
ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive"
DAILY_FIELDS = "precipitation_sum,rain_sum,showers_sum,precipitation_hours,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,et0_fao_evapotranspiration"

def http_json(url, method="GET", payload=None, headers=None):
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    h = {"Accept": "application/json", "User-Agent": "SeedProductionWeatherAudit/1.0"}
    if headers: h.update(headers)
    if data is not None: h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=35) as response:
        body = response.read()
        return response.status, json.loads(body.decode("utf-8")) if body else None, body

def db_request(path, method="GET", payload=None, prefer=None):
    headers = {"apikey": DB_KEY, "Authorization": f"Bearer {DB_KEY}"}
    if prefer: headers["Prefer"] = prefer
    return http_json(f"{DB_URL}/rest/v1/{path}", method, payload, headers)

def record_run(loc, target, started, status, source_url=None, error_code=None, error_message=None, response_hash=None):
    row = {
      "location_id":loc["id"],"company_id":loc["company_id"],"crop_season_id":loc["crop_season_id"],
      "farmer_id":loc["farmer_id"],"field_id":loc["field_id"],"target_date":target,"status":status,
      "source":SOURCE,"source_url":source_url,"requested_latitude":loc.get("latitude"),
      "requested_longitude":loc.get("longitude"),"started_at":started.isoformat(),
      "completed_at":datetime.now(timezone.utc).isoformat(),"error_code":error_code,
      "error_message":(error_message or "")[:1500] or None,"response_sha256":response_hash
    }
    db_request("seed_weather_ingestion_runs","POST",row,"return=minimal")

def main():
    if not DB_URL or not DB_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",file=sys.stderr); return 2
    target = (datetime.now(LOCAL_TZ).date()-timedelta(days=1)).isoformat()
    select = "id,company_id,crop_season_id,farmer_id,field_id,field_code,village,district,state,crop,hybrid,latitude,longitude,boundary_centroid,active,crop_start_date,expected_harvest_date"
    query = urllib.parse.urlencode({"select":select,"active":"eq.true","order":"id.asc"})
    try: _, locations, _ = db_request(f"seed_weather_locations?{query}")
    except Exception as exc:
        print(f"ERROR loading active field locations: {exc}",file=sys.stderr); return 2
    if not isinstance(locations,list):
        print("ERROR: unexpected field-location response.",file=sys.stderr); return 2
    if not locations:
        print("WARNING: no active field locations configured; no weather rows collected."); return 0
    ok, failed = 0, 0
    for loc in locations:
        started = datetime.now(timezone.utc)
        params = urllib.parse.urlencode({"latitude":loc["latitude"],"longitude":loc["longitude"],"start_date":target,"end_date":target,"daily":DAILY_FIELDS,"timezone":"Asia/Kolkata"})
        url = f"{ARCHIVE_ENDPOINT}?{params}"
        digest = None
        try:
            status, result, raw = http_json(url)
            if status != 200: raise RuntimeError(f"Archive API returned HTTP {status}")
            digest = hashlib.sha256(raw).hexdigest()
            daily = result.get("daily") or {}; dates = daily.get("time") or []
            if target not in dates: raise RuntimeError(f"No daily observation returned for {target}")
            i = dates.index(target)
            def val(key):
                values = daily.get(key)
                return values[i] if isinstance(values,list) and i < len(values) else None
            row = {
              "location_id":loc["id"],"company_id":loc["company_id"],"crop_season_id":loc["crop_season_id"],
              "farmer_id":loc["farmer_id"],"field_id":loc["field_id"],"field_code":loc.get("field_code"),
              "village":loc["village"],"district":loc["district"],"state":loc["state"],
              "crop":loc.get("crop") or "Paddy","hybrid":loc.get("hybrid"),"observation_date":target,
              "timezone":"Asia/Kolkata","latitude":result.get("latitude",loc["latitude"]),
              "longitude":result.get("longitude",loc["longitude"]),
              "location_method":"boundary_centroid" if loc.get("boundary_centroid") else "field_gps",
              "precipitation_mm":val("precipitation_sum"),"rain_mm":val("rain_sum"),
              "showers_mm":val("showers_sum"),"precipitation_hours":val("precipitation_hours"),
              "temperature_max_c":val("temperature_2m_max"),"temperature_min_c":val("temperature_2m_min"),
              "wind_speed_max_kmh":val("wind_speed_10m_max"),"wind_gust_max_kmh":val("wind_gusts_10m_max"),
              "reference_et0_mm":val("et0_fao_evapotranspiration"),"source":SOURCE,"source_url":url,
              "source_licence":"CC BY 4.0; attribution required","source_payload":result,
              "response_sha256":digest,"retrieved_at":datetime.now(timezone.utc).isoformat()
            }
            # Append-only: retry never overwrites the first accepted field/date observation.
            db_request("seed_weather_daily","POST",row,"resolution=ignore-duplicates,return=minimal")
            record_run(loc,target,started,"success",url,response_hash=digest); ok += 1
            print(f"OK field={loc['field_id']} village={loc['village']} date={target} rainfall_mm={row['precipitation_mm']}")
        except Exception as exc:
            failed += 1
            try: record_run(loc,target,started,"failed",url,type(exc).__name__,str(exc),digest)
            except Exception as audit_exc:
                print(f"CRITICAL: failure audit could not be persisted for field {loc.get('field_id')}: {audit_exc}",file=sys.stderr)
            print(f"ERROR field={loc.get('field_id')} village={loc.get('village')} date={target}: {exc}",file=sys.stderr)
        time.sleep(0.15)
    print(f"Weather audit complete for {target}: {ok} succeeded, {failed} failed, {len(locations)} active fields.")
    return 1 if failed else 0

if __name__ == "__main__":
    raise SystemExit(main())
