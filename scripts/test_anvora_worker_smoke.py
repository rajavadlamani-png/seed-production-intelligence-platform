#!/usr/bin/env python3
"""Safe smoke test for the existing ANVORA Sentinel-1 Worker; no database writes."""
import datetime as dt
import json
import os
import urllib.error
import urllib.request

WORKER_URL = os.environ.get(
    "COPERNICUS_EO_WORKER_URL",
    "https://anvora-eo-connector.raja-vadlamani.workers.dev/api/sentinel1",
)
EVALSCRIPT = """//VERSION=3
function setup(){return {input:[{bands:["VV","VH","dataMask"]}],output:[{id:"backscatter",bands:4,sampleType:"FLOAT32"},{id:"dataMask",bands:1,sampleType:"UINT8"}]};}
function evaluatePixel(s){return {backscatter:[s.VV,s.VH,s.VV-s.VH,(s.VH!==0?s.VV/s.VH:0)],dataMask:[s.dataMask]};}"""


def main():
    # Synthetic ~100 m polygon near Hyderabad. This is not a registered farmer field.
    polygon = {
        "type": "Polygon",
        "coordinates": [[
            [78.4500, 17.4000], [78.4510, 17.4000],
            [78.4510, 17.4010], [78.4500, 17.4010],
            [78.4500, 17.4000],
        ]],
    }
    end = dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=1)
    start = end - dt.timedelta(days=20)
    provider_request = {
        "input": {
            "bounds": {
                "bbox": [78.4500, 17.4000, 78.4510, 17.4010],
                "geometry": polygon,
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{
                "type": "sentinel-1-grd",
                "dataFilter": {},
                "processing": {"orthorectify": True, "backCoeff": "GAMMA0_TERRAIN"},
            }],
        },
        "aggregation": {
            "timeRange": {
                "from": start.isoformat() + "T00:00:00Z",
                "to": end.isoformat() + "T23:59:59Z",
            },
            "aggregationInterval": {"of": "P5D"},
            "resx": 20,
            "resy": 20,
            "evalscript": EVALSCRIPT,
        },
        "calculations": {
            "default": {"statistics": {"default": {"percentiles": {"k": [10, 50, 90]}}}}
        },
    }
    envelope = {
        "operation": "sentinel1-statistics",
        "request": provider_request,
        **provider_request,
        "providerEndpoint": "https://sh.dataspace.copernicus.eu/statistics/v1",
        "acquisition": {
            "plotId": None,
            "acquisitionId": None,
            "acquisitionDateTime": None,
            "requestedBbox": [78.4500, 17.4000, 78.4510, 17.4010],
        },
        "requestedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "clientVersion": "SeedProductionSatelliteAudit/1.0-smoke-test",
    }
    req = urllib.request.Request(
        WORKER_URL,
        data=json.dumps(envelope, separators=(",", ":")).encode(),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "SeedProductionSatelliteAudit/1.0-smoke-test",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=75) as response:
            http_status = response.status
            raw = response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"WORKER_SMOKE_FAIL http_status={exc.code} body_preview={body[:700]}")
        return 1
    except Exception as exc:
        print(f"WORKER_SMOKE_FAIL request_error={type(exc).__name__}: {exc}")
        return 1

    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        print(f"WORKER_SMOKE_FAIL http_status={http_status} non_json_body={raw[:500]!r}")
        return 1
    if not isinstance(data, dict):
        print(f"WORKER_SMOKE_FAIL http_status={http_status} response_type={type(data).__name__}")
        return 1

    status = str(data.get("status", "")).upper()
    candidates = [data.get("statistics"), data.get("result"), data.get("data")]
    result = next((x for x in candidates if isinstance(x, dict) and isinstance(x.get("data"), list)), None)
    if result is None:
        result = next(({"data": x} for x in candidates if isinstance(x, list)), None)
    interval_rows = result["data"] if result else []
    intervals = len(interval_rows)
    top_keys = sorted(data.keys())
    first = interval_rows[0] if interval_rows and isinstance(interval_rows[0], dict) else {}
    outputs = first.get("outputs") or {}
    output_shapes = {}
    for output_name, output_value in outputs.items():
        bands = output_value.get("bands") if isinstance(output_value, dict) else None
        output_shapes[output_name] = sorted(bands.keys()) if isinstance(bands, dict) else type(output_value).__name__
    print(
        "WORKER_SMOKE_RESULT "
        f"http_status={http_status} worker_status={status or 'missing'} "
        f"upstream_http_status={data.get('upstreamHttpStatus')} top_level_keys={top_keys} "
        f"interval_count={intervals} first_interval_keys={sorted(first.keys())} "
        f"output_band_shapes={output_shapes} body_bytes={len(raw)} "
        f"date_range={start.isoformat()}..{end.isoformat()}"
    )
    if not (200 <= http_status < 300 and status in ("OK", "SUCCESS") and intervals > 0):
        print("WORKER_SMOKE_FAIL: Worker did not return a successful, non-empty statistics interval array.")
        return 1
    print("WORKER_SMOKE_PASS: live Sentinel-1 statistics returned for the synthetic test polygon.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
