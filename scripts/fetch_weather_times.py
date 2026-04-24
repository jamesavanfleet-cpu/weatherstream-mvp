"""
fetch_weather_times.py
----------------------
Fetches real available timestamps from NOAA WMS GetCapabilities endpoints
and writes them to client/public/radar_times.json and
client/public/satellite_times.json.

Run by GitHub Actions on a schedule so the browser always has valid
timestamps to pass to WMS GetMap requests.  The NOAA WMS server only
returns real imagery when the TIME parameter exactly matches a timestamp
it has cached -- client-computed round-number intervals return transparent
images.

Radar endpoint:   https://opengeo.ncep.noaa.gov/geoserver/conus/ows
                  https://opengeo.ncep.noaa.gov/geoserver/carib/ows
Satellite endpoint: https://nowcoast.noaa.gov/geoserver/observations/satellite/ows
"""

import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
OUT_DIR = REPO_ROOT / "client" / "public"

WMS_NS = "http://www.opengis.net/wms"

RADAR_CONUS_URL = (
    "https://opengeo.ncep.noaa.gov/geoserver/conus/ows"
    "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"
)
RADAR_CARIB_URL = (
    "https://opengeo.ncep.noaa.gov/geoserver/carib/ows"
    "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"
)
SATELLITE_URL = (
    "https://nowcoast.noaa.gov/geoserver/observations/satellite/ows"
    "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"
)

HEADERS = {
    "User-Agent": "mycruisingweather-timestamp-refresh/1.0 (+https://mycruisingweather.com)",
    "Accept": "application/xml,text/xml,*/*",
}

TIMEOUT = 90  # seconds -- GetCapabilities XML can be large


def fetch_xml(url: str) -> ET.Element:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = resp.read()
    return ET.fromstring(data)


def get_time_dimension(root: ET.Element, layer_name: str) -> list[str]:
    """Return the list of available timestamps for the named WMS layer."""
    for layer in root.iter(f"{{{WMS_NS}}}Layer"):
        name_el = layer.find(f"{{{WMS_NS}}}Name")
        if name_el is None or name_el.text != layer_name:
            continue
        for dim in layer.iter(f"{{{WMS_NS}}}Dimension"):
            if dim.get("name") == "time" and dim.text:
                return [t.strip() for t in dim.text.strip().split(",") if t.strip()]
    return []


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Radar timestamps ──────────────────────────────────────────────────────
    print("Fetching CONUS radar GetCapabilities...")
    conus_root = fetch_xml(RADAR_CONUS_URL)
    conus_times = get_time_dimension(conus_root, "conus_cref_qcd")
    print(f"  conus_cref_qcd: {len(conus_times)} timestamps, latest={conus_times[-1] if conus_times else 'none'}")

    print("Fetching Caribbean radar GetCapabilities...")
    carib_root = fetch_xml(RADAR_CARIB_URL)
    carib_times = get_time_dimension(carib_root, "carib_cref_qcd")
    print(f"  carib_cref_qcd: {len(carib_times)} timestamps, latest={carib_times[-1] if carib_times else 'none'}")

    if not conus_times:
        print("ERROR: no CONUS radar timestamps found", file=sys.stderr)
        sys.exit(1)

    # Use the last 20 CONUS timestamps for the animation.
    # The browser uses conus_cref_qcd timestamps for both CONUS and Caribbean
    # layers in a single combined WMS request; CONUS is the primary reference.
    radar_json = {
        "generated_at": conus_times[-1],
        "conus": conus_times[-20:],
        "carib": carib_times[-20:] if carib_times else conus_times[-20:],
    }
    radar_out = OUT_DIR / "radar_times.json"
    radar_out.write_text(json.dumps(radar_json, indent=2))
    print(f"Wrote {radar_out}: {radar_out.stat().st_size} bytes")

    # ── Satellite timestamps ──────────────────────────────────────────────────
    print("Fetching satellite GetCapabilities...")
    sat_root = fetch_xml(SATELLITE_URL)

    goes_times = get_time_dimension(sat_root, "goes_longwave_imagery")
    print(f"  goes_longwave_imagery: {len(goes_times)} timestamps, latest={goes_times[-1] if goes_times else 'none'}")

    global_times = get_time_dimension(sat_root, "global_longwave_imagery_mosaic")
    print(f"  global_longwave_imagery_mosaic: {len(global_times)} timestamps, latest={global_times[-1] if global_times else 'none'}")

    if not goes_times and not global_times:
        print("ERROR: no satellite timestamps found", file=sys.stderr)
        sys.exit(1)

    # Keep the last 24 GOES frames (5-min cadence) and last 6 global frames (60-min cadence).
    satellite_json = {
        "generated_at": goes_times[-1] if goes_times else (global_times[-1] if global_times else ""),
        "goes": goes_times[-24:],
        "global": global_times[-6:],
    }
    sat_out = OUT_DIR / "satellite_times.json"
    sat_out.write_text(json.dumps(satellite_json, indent=2))
    print(f"Wrote {sat_out}: {sat_out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
