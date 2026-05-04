#!/usr/bin/env python3
"""
generate_marine_zones.py
Pulls every NWS marine zone (offshore AMZ/GMZ + coastal AMZ6xx-9xx and
GMZ1xx-8xx) covering the cruise route waters of interest, with full polygon
geometry and the AWIPS bulletin product code that issues forecasts for that
zone, then writes a single FeatureCollection to client/public/marine_zones.json.

Bulk-fetched in one call per category from /zones/offshore?include_geometry=true
and /zones/coastal?include_geometry=true so the result is authoritative and
cannot drift from a hand-maintained ID list.

Output GeoJSON Feature properties:
  id              AWIPS zone ID, e.g. "AMZ045", "GMZ013", "AMZ670"
  name            NWS-provided human-readable zone name
  zoneType        "offshore" or "coastal"
  productCode     AWIPS product code containing forecast text for this zone
                  (e.g. "OFFNT3" for Caribbean offshore, "CWFMFL" for FL coastal)
  forecastOffice  Issuing WFO/center identifier (e.g. "KNHC", "KMFL")
"""

import json
import os
import time
import urllib.request
import urllib.error
import http.client
from concurrent.futures import ThreadPoolExecutor, as_completed

API_BASE = "https://api.weather.gov"

# Geometry compaction settings. NWS publishes polygons at sub-millimeter
# precision (up to 9 decimals) which is wasted bytes for a continent-scale
# map. Rounding to 4 decimals is roughly 11 m precision -- well below pixel
# resolution at our zoom range. Douglas-Peucker simplification then removes
# vertices that are within EPSILON degrees of the line they lie on, which
# typically eliminates 80-95% of vertices on coastline-following zones with
# zero visible difference at the zoom levels used by the map.
COORD_DECIMALS = 4
SIMPLIFY_EPSILON = 0.001  # degrees, ~110 m at the equator


def _perp_dist_sq(p, a, b):
    """Squared perpendicular distance from point p to segment ab."""
    ax, ay = a[0], a[1]
    bx, by = b[0], b[1]
    px, py = p[0], p[1]
    dx = bx - ax
    dy = by - ay
    if dx == 0.0 and dy == 0.0:
        ex = px - ax
        ey = py - ay
        return ex * ex + ey * ey
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    if t < 0.0:
        t = 0.0
    elif t > 1.0:
        t = 1.0
    cx = ax + t * dx
    cy = ay + t * dy
    ex = px - cx
    ey = py - cy
    return ex * ex + ey * ey


def _douglas_peucker(points, eps_sq):
    """Iterative Douglas-Peucker; returns simplified ring keeping endpoints."""
    n = len(points)
    if n < 3:
        return list(points)
    keep = [False] * n
    keep[0] = True
    keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        max_d = 0.0
        max_k = -1
        a = points[i]
        b = points[j]
        for k in range(i + 1, j):
            d = _perp_dist_sq(points[k], a, b)
            if d > max_d:
                max_d = d
                max_k = k
        if max_k != -1 and max_d > eps_sq:
            keep[max_k] = True
            stack.append((i, max_k))
            stack.append((max_k, j))
    return [points[i] for i in range(n) if keep[i]]


def _round_pt(pt):
    return [round(pt[0], COORD_DECIMALS), round(pt[1], COORD_DECIMALS)]


def _process_ring(ring):
    """Round every coordinate, then DP-simplify. Closes the ring if needed."""
    if not ring:
        return ring
    rounded = [_round_pt(p) for p in ring]
    eps_sq = SIMPLIFY_EPSILON * SIMPLIFY_EPSILON
    simplified = _douglas_peucker(rounded, eps_sq)
    # Preserve ring closure: first and last must match for valid GeoJSON
    if simplified and (simplified[0][0] != simplified[-1][0] or simplified[0][1] != simplified[-1][1]):
        simplified.append(simplified[0])
    return simplified


def compact_geometry(geom):
    """Round coordinate precision and simplify polygon vertices in place.
    Supports Polygon and MultiPolygon GeoJSON geometries (which are the only
    types NWS returns for marine zones)."""
    if not geom or not isinstance(geom, dict):
        return geom
    gtype = geom.get("type")
    coords = geom.get("coordinates")
    if not coords:
        return geom
    if gtype == "Polygon":
        new_rings = []
        for ring in coords:
            simplified = _process_ring(ring)
            if len(simplified) >= 4:  # min for closed polygon ring
                new_rings.append(simplified)
        if new_rings:
            geom["coordinates"] = new_rings
    elif gtype == "MultiPolygon":
        new_polys = []
        for poly in coords:
            new_rings = []
            for ring in poly:
                simplified = _process_ring(ring)
                if len(simplified) >= 4:
                    new_rings.append(simplified)
            if new_rings:
                new_polys.append(new_rings)
        if new_polys:
            geom["coordinates"] = new_polys
    return geom

HEADERS = {"User-Agent": "MyCruisingWeather/1.0 (mycruisingweather.com; contact@mycruisingweather.com)"}
MAX_RETRIES = 4
RETRY_DELAY = 2

# Coastal Waters Forecast (CWF) product codes by zone-ID prefix.
# Prefix uses first 4 chars (AMZ6 etc.) for coarse routing then refined by tens digit
# from the explicit map below. WFOs verified against NWS marine zone responsibility list.
COASTAL_CWF_BY_TENS = {
    # --- Atlantic coastal (AMZ6xx-9xx) ---
    "AMZ63": ("CWFSJU", "TJSJ"),  # San Juan PR / USVI
    "AMZ65": ("CWFMFL", "KMFL"),  # Miami FL (E coast S FL)
    "AMZ67": ("CWFMFL", "KMFL"),
    "AMZ70": ("CWFMLB", "KMLB"),  # Melbourne FL
    "AMZ71": ("CWFMLB", "KMLB"),
    "AMZ72": ("CWFJAX", "KJAX"),  # Jacksonville FL / SE GA
    "AMZ73": ("CWFCHS", "KCHS"),  # Charleston SC
    "AMZ75": ("CWFILM", "KILM"),  # Wilmington NC
    "AMZ77": ("CWFMHX", "KMHX"),  # Newport / Morehead City NC
    "AMZ81": ("CWFAKQ", "KAKQ"),  # Wakefield VA
    "AMZ82": ("CWFLWX", "KLWX"),  # Baltimore / DC
    "AMZ83": ("CWFPHI", "KPHI"),  # Philadelphia PA / Mt Holly NJ
    "AMZ85": ("CWFOKX", "KOKX"),  # New York NY
    "AMZ87": ("CWFBOX", "KBOX"),  # Boston MA
    "AMZ90": ("CWFGYX", "KGYX"),  # Gray ME
    "AMZ91": ("CWFCAR", "KCAR"),  # Caribou ME
    # --- Gulf coastal (GMZ0xx-8xx) ---
    "GMZ01": ("CWFKEY", "KEYW"),  # Key West FL
    "GMZ03": ("CWFKEY", "KEYW"),
    "GMZ04": ("CWFKEY", "KEYW"),
    "GMZ05": ("CWFTBW", "KTBW"),  # Tampa Bay FL
    "GMZ07": ("CWFTBW", "KTBW"),
    "GMZ10": ("CWFTAE", "KTAE"),  # Tallahassee FL
    "GMZ20": ("CWFLIX", "KLIX"),  # New Orleans LA
    "GMZ30": ("CWFLCH", "KLCH"),  # Lake Charles LA
    "GMZ40": ("CWFHGX", "KHGX"),  # Houston / Galveston TX
    "GMZ60": ("CWFCRP", "KCRP"),  # Corpus Christi TX
    "GMZ80": ("CWFBRO", "KBRO"),  # Brownsville TX
}


def http_get_json(url: str) -> dict:
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, http.client.IncompleteRead, ConnectionResetError, json.JSONDecodeError) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)
    raise RuntimeError(f"All retries exhausted for {url}: {last_err}")


# Offshore zone -> (productCode, issuingOffice) mapping verified by direct
# inspection of every NHC and OPC offshore waters forecast bulletin from
# forecast.weather.gov on 2026-05-04. Only zone IDs that actually appear in a
# real bulletin are mapped; everything else returns None so the front end can
# clearly show "no NWS forecast text published for this zone".
OFFSHORE_ZONE_TO_PRODUCT = {
    # NHC Caribbean Sea + Tropical N Atlantic W of 55W -- OFFNT3 (FZNT23 KNHC)
    **{f"AMZ{n:03d}": ("OFFNT3", "KNHC") for n in [1] + list(range(40, 63))},
    # NHC High Seas Forecast Atlantic AT2 -- HSFAT2 (FZNT02 KNHC)
    # Covers AMZ063-AMZ099: Bahamas + Atlantic open ocean east of Florida 22-31N, 55-77W.
    # NWS does NOT issue zone-segmented text bulletins for these polygons; the only
    # NWS forecast text covering this water is the broadcast HSF AT2, which describes
    # weather features by lat/lon corners within the entire 7N-31N west of 35W area.
    **{f"AMZ{n:03d}": ("HSFAT2", "KNHC") for n in range(63, 100)},
    # NHC Gulf of America (Gulf of Mexico) -- OFFNT4 (FZNT24 KNHC)
    **{f"GMZ{n:03d}": ("OFFNT4", "KNHC") for n in [1, 40, 41, 45, 46, 47, 48, 49, 50, 56, 57, 58]},
    # OPC NW Atlantic 250-500 NM -- OFFNT1 (FZNT21 KWBC)
    **{f"ANZ{n:03d}": ("OFFNT1", "KWBC") for n in [800, 805, 810, 815, 898, 900]},
    # OPC West Central N Atlantic shelf/slope 60-250 NM -- OFFNT2 (FZNT22 KWBC)
    **{f"ANZ{n:03d}": ("OFFNT2", "KWBC") for n in [820, 825, 828, 830, 833, 835, 899, 905, 910, 915, 920, 925, 930, 935]},
}


def offshore_product_for(zone_id: str):
    """Resolve (productCode, office) for an offshore zone using the verified
    zone-to-bulletin table above."""
    return OFFSHORE_ZONE_TO_PRODUCT.get(zone_id)


def coastal_product_for(zone_id: str, wfo: str):
    """Coastal Waters Forecast product code is CWF + WFO 3-letter code.
    The WFO comes from the NWS API response itself (cwa field), so this is
    always correct as long as NWS reports the responsible office."""
    if not wfo:
        return None
    product_code = f"CWF{wfo}"
    # Convention: NWS office identifiers in API responses are 3-letter codes
    # (e.g. "TBW", "MFL"); for the issuing identifier in AWIPS bulletins, NWS
    # uses the K-prefixed version (KTBW, KMFL) for CONUS offices.
    office = f"K{wfo}" if len(wfo) == 3 and not wfo.startswith("K") and not wfo.startswith("T") and not wfo.startswith("P") else wfo
    # San Juan PR uses TJSJ
    if wfo == "SJU":
        office = "TJSJ"
    return (product_code, office)


def in_coverage(zone_id: str) -> bool:
    """Coverage rule: any AMZ/GMZ zone with a verified offshore product OR any
    coastal AMZ6xx-9xx / GMZ1xx-8xx zone (CWF text), plus the OPC ANZ offshore
    zones that cover Mid-Atlantic / NW Atlantic shipping routes."""
    if not zone_id or len(zone_id) < 6:
        return False
    prefix = zone_id[:3]
    if prefix not in ("AMZ", "GMZ", "ANZ"):
        return False
    try:
        n = int(zone_id[3:])
    except ValueError:
        return False
    if prefix == "AMZ":
        # Offshore covered by OFFSHORE_ZONE_TO_PRODUCT, plus all coastal
        return zone_id in OFFSHORE_ZONE_TO_PRODUCT or (600 <= n <= 999)
    if prefix == "GMZ":
        return zone_id in OFFSHORE_ZONE_TO_PRODUCT or (100 <= n <= 999)
    if prefix == "ANZ":
        return zone_id in OFFSHORE_ZONE_TO_PRODUCT
    return False


def fetch_category_index(category: str):
    """Bulk list zone IDs and names; geometry comes from per-zone fetches."""
    url = f"{API_BASE}/zones?type={category}&limit=500"
    print(f"Listing {category} zones from {url}", flush=True)
    data = http_get_json(url)
    feats = data.get("features", [])
    out = []
    for f in feats:
        props = f.get("properties") or {}
        zid = props.get("id") or ""
        if not zid:
            continue
        out.append({"id": zid, "name": props.get("name", zid)})
    return out


def fetch_zone_detail(category: str, zone_id: str):
    """Fetch full per-zone record with geometry and issuing WFO.
    Returns (geometry, wfo_code) or (None, None) on failure."""
    url = f"{API_BASE}/zones/{category}/{zone_id}"
    try:
        data = http_get_json(url)
        geom = data.get("geometry")
        props = data.get("properties") or {}
        cwa_list = props.get("cwa") or []
        wfo = cwa_list[0] if cwa_list else ""
        return geom, wfo
    except Exception as e:
        print(f"  WARN detail {zone_id}: {e}", flush=True)
        return None, None


def main():
    all_features = []
    skipped = []

    for category in ("offshore", "coastal"):
        index = fetch_category_index(category)
        in_cov = [z for z in index if in_coverage(z["id"])]
        print(f"  {category}: {len(index)} total, {len(in_cov)} in coverage; fetching geometries...", flush=True)
        # Parallel per-zone fetches: geometry + WFO
        results = {}
        with ThreadPoolExecutor(max_workers=10) as ex:
            futures = {ex.submit(fetch_zone_detail, category, z["id"]): z for z in in_cov}
            done = 0
            for fut in as_completed(futures):
                z = futures[fut]
                geom, wfo = fut.result()
                results[z["id"]] = (geom, wfo)
                done += 1
                if done % 25 == 0 or done == len(in_cov):
                    print(f"    {category} progress: {done}/{len(in_cov)}", flush=True)
        for z in in_cov:
            zone_id = z["id"]
            geom, wfo = results.get(zone_id, (None, ""))
            if not geom:
                skipped.append(f"{zone_id}(no-geometry)")
                continue
            if category == "offshore":
                pc = offshore_product_for(zone_id)
            else:
                pc = coastal_product_for(zone_id, wfo)
            product_code = pc[0] if pc else ""
            office = pc[1] if pc else ""
            geom = compact_geometry(geom)
            all_features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "id": zone_id,
                    "name": z["name"],
                    "zoneType": category,
                    "productCode": product_code,
                    "forecastOffice": office,
                },
            })

    geojson = {
        "type": "FeatureCollection",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "zone_count": len(all_features),
        "features": all_features,
    }

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.normpath(os.path.join(script_dir, "..", "client", "public", "marine_zones.json"))
    with open(out_path, "w") as fh:
        json.dump(geojson, fh, separators=(",", ":"))

    offshore_count = sum(1 for ft in all_features if ft["properties"]["zoneType"] == "offshore")
    coastal_count = sum(1 for ft in all_features if ft["properties"]["zoneType"] == "coastal")
    mapped = sum(1 for ft in all_features if ft["properties"]["productCode"])
    print("", flush=True)
    print(f"Wrote {len(all_features)} zones to {out_path}", flush=True)
    print(f"  offshore: {offshore_count}", flush=True)
    print(f"  coastal:  {coastal_count}", flush=True)
    print(f"  with productCode mapped: {mapped}", flush=True)
    if skipped:
        print(f"Skipped ({len(skipped)}): {', '.join(skipped[:20])}{'...' if len(skipped) > 20 else ''}", flush=True)
    print("Done.", flush=True)


if __name__ == "__main__":
    main()
