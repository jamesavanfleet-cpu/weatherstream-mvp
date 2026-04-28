#!/usr/bin/env python3
"""
generate_marine_zones.py
Fetches NWS offshore zone geometries for Caribbean, Atlantic, and Gulf of Mexico
cruise route waters and writes them to client/public/marine_zones.json.

Run manually or via GitHub Actions (daily is sufficient -- zone boundaries rarely change).
Output is a GeoJSON FeatureCollection with id and name properties on each feature.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

# Caribbean, Atlantic, and Gulf of Mexico offshore zones covering cruise routes
ZONES = [
    # Caribbean
    "AMZ040", "AMZ041", "AMZ042", "AMZ043", "AMZ044", "AMZ045",
    "AMZ046", "AMZ047", "AMZ048", "AMZ049", "AMZ050", "AMZ052",
    "AMZ053", "AMZ054", "AMZ055", "AMZ056", "AMZ057", "AMZ059",
    "AMZ060", "AMZ061", "AMZ062",
    # Atlantic (cruise ship routes)
    "AMZ063", "AMZ064", "AMZ065", "AMZ066", "AMZ067", "AMZ068",
    "AMZ069", "AMZ070", "AMZ071", "AMZ072", "AMZ073", "AMZ074",
    "AMZ075", "AMZ076", "AMZ077", "AMZ078", "AMZ079",
    "AMZ080", "AMZ081", "AMZ082", "AMZ083", "AMZ084",
    "AMZ085", "AMZ086", "AMZ087", "AMZ088",
    # Gulf of Mexico (Straits of Florida / cruise routes)
    "GMZ047",
]

API_BASE = "https://api.weather.gov/zones/offshore"
HEADERS = {"User-Agent": "MyCruisingWeather/1.0 (mycruisingweather.com; contact@mycruisingweather.com)"}
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds between retries
MAX_WORKERS = 8  # parallel fetches


def fetch_zone(zone_id: str) -> dict | None:
    """Fetch a single zone geometry from NWS API with retries."""
    url = f"{API_BASE}/{zone_id}"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
                geom = data.get("geometry")
                if not geom:
                    print(f"  SKIP {zone_id}: no geometry returned", flush=True)
                    return None
                props = data.get("properties", {})
                return {
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "id": props.get("id", zone_id),
                        "name": props.get("name", zone_id),
                    },
                }
        except urllib.error.HTTPError as e:
            print(f"  WARN {zone_id}: HTTP {e.code} (attempt {attempt}/{MAX_RETRIES})", flush=True)
        except Exception as e:
            print(f"  WARN {zone_id}: {e} (attempt {attempt}/{MAX_RETRIES})", flush=True)
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY)
    print(f"  FAIL {zone_id}: all retries exhausted", flush=True)
    return None


def main():
    print(f"Fetching {len(ZONES)} marine zone geometries from NWS API...", flush=True)

    features = []
    errors = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_zone = {executor.submit(fetch_zone, z): z for z in ZONES}
        for future in as_completed(future_to_zone):
            zone_id = future_to_zone[future]
            try:
                result = future.result()
                if result:
                    features.append(result)
                    print(f"  OK  {zone_id}: {result['properties']['name'][:60]}", flush=True)
                else:
                    errors.append(zone_id)
            except Exception as e:
                print(f"  ERR {zone_id}: {e}", flush=True)
                errors.append(zone_id)

    geojson = {
        "type": "FeatureCollection",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "zone_count": len(features),
        "features": features,
    }

    # Determine output path relative to script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, "..", "client", "public", "marine_zones.json")
    out_path = os.path.normpath(out_path)

    with open(out_path, "w") as f:
        json.dump(geojson, f, separators=(",", ":"))

    print(f"\nWrote {len(features)} zones to {out_path}", flush=True)
    if errors:
        print(f"Failed zones ({len(errors)}): {', '.join(errors)}", flush=True)
        sys.exit(1)

    print("Done.", flush=True)


if __name__ == "__main__":
    main()
