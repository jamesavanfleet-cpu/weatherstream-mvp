#!/usr/bin/env python3
"""
generate_nhc_data.py
Fetches NHC active storm data (all 3 basins: Atlantic, E. Pacific, C. Pacific),
forecast track waypoints, uncertainty cone polygon, and GTWO disturbance areas.
Writes client/public/nhc_data.json for the frontend to consume.

This script runs server-side (GitHub Actions) -- no CORS issues.
Runs 4x/day aligned to NHC advisory issuance times.

Output JSON schema:
  {
    "generated": "<ISO timestamp>",
    "storms": [
      {
        "id": "al012026",
        "name": "BERYL",
        "classification": "HU",
        "basin": "al",              // "al" | "ep" | "cp"
        "intensity": "75",          // max wind kt (string from NHC)
        "pressure": "960",          // min pressure mb (string from NHC)
        "latitude": "18.5N",
        "longitude": "75.2W",
        "latitudeNumeric": 18.5,
        "longitudeNumeric": -75.2,
        "movementDir": 295,
        "movementSpeed": 12,
        "lastUpdate": "...",
        "publicAdvisory": { "advNum": "...", "issuance": "...", ... },
        "forecastTrack": { "zipFile": "...", "kmzFile": "..." },
        "trackPoints": [            // shapefile-derived forecast waypoints
          {
            "TAU": 0,               // forecast hour (0 = current position)
            "DATELBL": "8:00 AM Thu",
            "FLDATELBL": "2026-06-04 5:00 AM Thu PDT",
            "MAXWIND": 75,          // kt
            "MSLP": 960,            // mb (null if 9999)
            "TCDIR": 295,           // movement direction (null if 9999)
            "TCSPD": 12,            // movement speed kt (null if 9999)
            "STORMTYPE": "HU",
            "TCDVLP": "Hurricane",
            "lon": -75.2,
            "lat": 18.5
          }, ...
        ],
        "coneCoords": [[lon, lat], ...]  // GeoJSON-order cone polygon
      }, ...
    ],
    "gtwoFeatures": [               // GeoJSON features (same schema as nhc_gtwo.json)
      {
        "type": "Feature",
        "geometry": { "type": "Polygon", "coordinates": [...] },
        "properties": {
          "name": "Disturbance 1 (Atlantic)",
          "basin": "Atlantic",
          "area": "1",
          "prob_2day": "70%",
          "risk_2day": "High",
          "prob_2day_pct": 70,
          "color_2day": "#FF0000",
          "prob_7day": "80%",
          "risk_7day": "High",
          "prob_7day_pct": 80,
          "color_7day": "#FF0000"
        }
      }, ...
    ]
  }
"""

import urllib.request
import urllib.error
import zipfile
import io
import json
import os
import sys
import re
import shapefile
from datetime import datetime, timezone

# ── Output paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(REPO_ROOT, "client", "public")
os.makedirs(OUT_DIR, exist_ok=True)

# ── NHC API URLs ──────────────────────────────────────────────────────────────
CURRENT_STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"
GTWO_SHAPEFILE_URL = "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"


def fetch_url(url: str, timeout: int = 30) -> bytes:
    """Fetch a URL with NHC-friendly User-Agent. Raises on failure."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "MyCruisingWeather/1.0 (mycruisingweather.com; weather data fetch)",
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def risk_to_color(risk_label: str, prob_str: str) -> str:
    """
    Map NHC risk label and probability string to official NHC display color.
    Falls back to parsing the percentage if label is missing.
    """
    label = (risk_label or "").strip().lower()
    if label == "high":
        return "#FF0000"
    if label == "medium":
        return "#FF8C00"
    if label == "low":
        return "#FFD700"

    # Fallback: parse percentage from string like "70%" or "40%"
    m = re.search(r"(\d+)", prob_str or "")
    if m:
        pct = int(m.group(1))
        if pct > 60:
            return "#FF0000"
        if pct >= 40:
            return "#FF8C00"
        return "#FFD700"

    return "#FFD700"  # default: low/yellow


def parse_prob_pct(prob_str: str):
    """Parse '70%' -> 70, 'N/A' -> None."""
    if not prob_str:
        return None
    m = re.search(r"(\d+)", prob_str)
    return int(m.group(1)) if m else None


def fetch_track_and_cone(zip_url: str):
    """
    Download the NHC 5-day forecast ZIP and extract:
      - track_points: list of shapefile-derived waypoint dicts (TAU 0..120)
      - cone_coords: list of [lon, lat] pairs for the uncertainty cone polygon

    Returns (track_points, cone_coords). Either may be empty on failure.
    """
    try:
        zip_data = fetch_url(zip_url, timeout=30)
    except Exception as e:
        print(f"    WARNING: Could not download track ZIP {zip_url}: {e}", file=sys.stderr)
        return [], []

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_data))
        names = zf.namelist()
    except Exception as e:
        print(f"    WARNING: Could not open track ZIP: {e}", file=sys.stderr)
        return [], []

    track_points = []
    cone_coords = []

    # ── Track points shapefile (filename contains 'pts') ──
    pts_shp = next((n for n in names if "pts" in n.lower() and n.endswith(".shp")), None)
    if pts_shp:
        base = pts_shp[:-4]  # strip .shp
        try:
            shp_data = zf.read(base + ".shp")
            dbf_data = zf.read(base + ".dbf") if (base + ".dbf") in names else None
            shx_data = zf.read(base + ".shx") if (base + ".shx") in names else None

            sf = shapefile.Reader(
                shp=io.BytesIO(shp_data),
                dbf=io.BytesIO(dbf_data) if dbf_data else None,
                shx=io.BytesIO(shx_data) if shx_data else None,
            )

            for sr in sf.shapeRecords():
                rec = sr.record
                shape = sr.shape
                if not shape.points:
                    continue

                pt = {}
                # Copy all DBF fields
                for field_name in rec.as_dict():
                    pt[field_name] = rec[field_name]

                # Add lon/lat from geometry
                pt["lon"] = shape.points[0][0]
                pt["lat"] = shape.points[0][1]

                # Clean 9999 sentinel values (NHC uses 9999 for missing data)
                for k in ("MSLP", "TCDIR", "TCSPD"):
                    if pt.get(k) == 9999:
                        pt[k] = None

                # Convert bytes to str for JSON serialization
                for k, v in pt.items():
                    if isinstance(v, bytes):
                        pt[k] = v.decode("utf-8", errors="replace").strip()

                track_points.append(pt)

        except Exception as e:
            print(f"    WARNING: Could not parse track points shapefile: {e}", file=sys.stderr)

    # ── Cone polygon shapefile (filename contains 'pgn') ──
    pgn_shp = next((n for n in names if "pgn" in n.lower() and n.endswith(".shp")), None)
    if pgn_shp:
        base = pgn_shp[:-4]
        try:
            shp_data = zf.read(base + ".shp")
            dbf_data = zf.read(base + ".dbf") if (base + ".dbf") in names else None
            shx_data = zf.read(base + ".shx") if (base + ".shx") in names else None

            sf = shapefile.Reader(
                shp=io.BytesIO(shp_data),
                dbf=io.BytesIO(dbf_data) if dbf_data else None,
                shx=io.BytesIO(shx_data) if shx_data else None,
            )

            for sr in sf.shapeRecords():
                shape = sr.shape
                if not shape.points:
                    continue
                # GeoJSON order: [lon, lat]
                cone_coords = [[p[0], p[1]] for p in shape.points]
                break  # only one cone polygon per storm

        except Exception as e:
            print(f"    WARNING: Could not parse cone polygon shapefile: {e}", file=sys.stderr)

    return track_points, cone_coords


def fetch_gtwo_features() -> list:
    """
    Fetch GTWO disturbance areas from NHC shapefile ZIP.
    Returns a list of GeoJSON feature dicts with both 2-day and 7-day attributes.
    Schema matches nhc_gtwo.json (same as generated by generate_nhc_gtwo.py).
    """
    try:
        zip_data = fetch_url(GTWO_SHAPEFILE_URL, timeout=20)
    except Exception as e:
        print(f"  WARNING: Could not download GTWO shapefile: {e}", file=sys.stderr)
        return []

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_data))
        names = zf.namelist()
    except Exception as e:
        print(f"  WARNING: Could not open GTWO ZIP: {e}", file=sys.stderr)
        return []

    shp_name = next((n for n in names if n.startswith("gtwo_areas") and n.endswith(".shp")), None)
    if not shp_name:
        print("  No gtwo_areas shapefile found in ZIP", file=sys.stderr)
        return []

    base = shp_name[:-4]
    try:
        shp_data = zf.read(base + ".shp")
        dbf_data = zf.read(base + ".dbf") if (base + ".dbf") in names else None
        shx_data = zf.read(base + ".shx") if (base + ".shx") in names else None

        sf = shapefile.Reader(
            shp=io.BytesIO(shp_data),
            dbf=io.BytesIO(dbf_data) if dbf_data else None,
            shx=io.BytesIO(shx_data) if shx_data else None,
        )
    except Exception as e:
        print(f"  WARNING: Could not parse GTWO shapefile: {e}", file=sys.stderr)
        return []

    # Build a field name -> index map from the shapefile fields
    field_names = [f[0] for f in sf.fields[1:]]  # skip DeletionFlag
    def get_field(rec, name):
        try:
            idx = field_names.index(name)
            val = rec[idx]
            return str(val).strip() if val is not None else ""
        except (ValueError, IndexError):
            return ""

    features = []
    for sr in sf.shapeRecords():
        rec = sr.record
        shape = sr.shape

        if not shape.points:
            continue

        # Extract attributes using index-based access (pyshp _Record is list-based)
        basin = get_field(rec, "BASIN")
        area = get_field(rec, "AREA")
        prob2day = get_field(rec, "PROB2DAY")
        risk2day = get_field(rec, "RISK2DAY")
        prob7day = get_field(rec, "PROB7DAY")
        risk7day = get_field(rec, "RISK7DAY")

        # Build polygon geometry with proper ring handling
        parts = list(shape.parts) + [len(shape.points)]
        rings = []
        for i in range(len(parts) - 1):
            ring_pts = shape.points[parts[i]:parts[i + 1]]
            ring = [[pt[0], pt[1]] for pt in ring_pts]
            # Close ring if not already closed
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])
            if len(ring) >= 4:
                rings.append(ring)

        if not rings:
            continue

        geometry = {"type": "Polygon", "coordinates": rings}

        color_2day = risk_to_color(risk2day, prob2day)
        color_7day = risk_to_color(risk7day, prob7day)
        name = f"Disturbance {area} ({basin})"

        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "name": name,
                "basin": basin,
                "area": area,
                "prob_2day": prob2day,
                "risk_2day": risk2day,
                "prob_2day_pct": parse_prob_pct(prob2day),
                "color_2day": color_2day,
                "prob_7day": prob7day,
                "risk_7day": risk7day,
                "prob_7day_pct": parse_prob_pct(prob7day),
                "color_7day": color_7day,
            },
        })

    return features


def main():
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"NHC data fetch started: {generated_at}")

    # ── Fetch active storms ──────────────────────────────────────────────────
    print(f"  Fetching: {CURRENT_STORMS_URL}")
    storms_raw = []
    try:
        raw = fetch_url(CURRENT_STORMS_URL, timeout=15)
        data = json.loads(raw.decode("utf-8"))
        storms_raw = data.get("activeStorms", [])
        print(f"  Active storms: {len(storms_raw)}")
    except Exception as e:
        print(f"  WARNING: Could not fetch CurrentStorms.json: {e}", file=sys.stderr)

    # ── Process each storm ───────────────────────────────────────────────────
    storms_out = []
    for storm in storms_raw:
        storm_id = storm.get("id", "")
        storm_name = storm.get("name", "UNNAMED")
        print(f"  Processing {storm_id} ({storm_name})...")

        track_points = []
        cone_coords = []

        forecast_track = storm.get("forecastTrack") or {}
        zip_url = forecast_track.get("zipFile") if isinstance(forecast_track, dict) else None

        if zip_url:
            track_points, cone_coords = fetch_track_and_cone(zip_url)
            print(f"    Track points: {len(track_points)}, Cone coords: {len(cone_coords)}")
        else:
            print(f"    No forecastTrack zipFile for {storm_id}", file=sys.stderr)

        # Determine basin from storm ID prefix (al=Atlantic, ep=E.Pacific, cp=C.Pacific)
        basin = storm_id[:2].lower() if len(storm_id) >= 2 else "al"

        storms_out.append({
            "id": storm_id,
            "name": storm_name,
            "basin": basin,
            "classification": storm.get("classification", "TD"),
            "intensity": storm.get("intensity"),
            "pressure": storm.get("pressure"),
            "latitude": storm.get("latitude"),
            "longitude": storm.get("longitude"),
            "latitudeNumeric": storm.get("latitudeNumeric"),
            "longitudeNumeric": storm.get("longitudeNumeric"),
            "movementDir": storm.get("movementDir"),
            "movementSpeed": storm.get("movementSpeed"),
            "lastUpdate": storm.get("lastUpdate"),
            "publicAdvisory": storm.get("publicAdvisory"),
            "forecastTrack": forecast_track,
            "trackPoints": track_points,
            "coneCoords": cone_coords,
        })

    # ── Fetch GTWO disturbances ──────────────────────────────────────────────
    print(f"  Fetching GTWO: {GTWO_SHAPEFILE_URL}")
    gtwo_features = []
    try:
        gtwo_features = fetch_gtwo_features()
        print(f"  GTWO disturbances: {len(gtwo_features)}")
    except Exception as e:
        print(f"  WARNING: Could not fetch GTWO: {e}", file=sys.stderr)

    # ── Write output ─────────────────────────────────────────────────────────
    output = {
        "generated": generated_at,
        "storms": storms_out,
        "gtwoFeatures": gtwo_features,
    }

    out_path = os.path.join(OUT_DIR, "nhc_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"), default=str)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"  Wrote {out_path} ({size_kb:.1f} KB, {len(storms_out)} storms, {len(gtwo_features)} disturbances)")
    print(f"NHC data fetch complete: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")


if __name__ == "__main__":
    main()
