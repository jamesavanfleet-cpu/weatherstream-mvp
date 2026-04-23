#!/usr/bin/env python3
"""
generate_nhc_gtwo.py
Fetches the NHC Graphical Tropical Weather Outlook (GTWO) shapefile ZIP,
parses the disturbance area polygons, and outputs a single GeoJSON file:
  client/public/nhc_gtwo.json

Each GeoJSON feature carries both 2-day and 7-day probability attributes so
the frontend can toggle between them without re-fetching.

NHC shapefile source (always current):
  https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip

Attribute fields in gtwo_areas_*.dbf:
  BASIN    -- "Atlantic" or "East Pacific" or "Central Pacific"
  AREA     -- disturbance number within basin (e.g. "1", "2")
  PROB2DAY -- 2-day formation probability string (e.g. "70%", "N/A")
  RISK2DAY -- 2-day risk label: "Low", "Medium", "High"
  PROB7DAY -- 7-day formation probability string
  RISK7DAY -- 7-day risk label

Color mapping follows official NHC probability conventions:
  < 40%   -> yellow  #FFD700
  40-60%  -> orange  #FF8C00
  > 60%   -> red     #FF0000
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

# ── NHC shapefile source URL ──────────────────────────────────────────────────
SHAPEFILE_URL = "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"


def fetch_url(url: str, timeout: int = 20) -> bytes:
    """Fetch a URL. Raises on failure."""
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


def parse_gtwo_shapefile(zip_data: bytes) -> list:
    """
    Parse the GTWO shapefile ZIP and return a list of GeoJSON feature dicts.
    Each feature has geometry (Polygon) and properties with both 2-day and
    7-day probability data.
    """
    zf = zipfile.ZipFile(io.BytesIO(zip_data))
    names = zf.namelist()

    # Find the areas shapefile components
    shp_name = next((n for n in names if n.startswith("gtwo_areas") and n.endswith(".shp")), None)
    dbf_name = next((n for n in names if n.startswith("gtwo_areas") and n.endswith(".dbf")), None)
    shx_name = next((n for n in names if n.startswith("gtwo_areas") and n.endswith(".shx")), None)

    if not shp_name:
        print("  No gtwo_areas shapefile found in ZIP", file=sys.stderr)
        return []

    shp_data = zf.read(shp_name)
    dbf_data = zf.read(dbf_name) if dbf_name else None
    shx_data = zf.read(shx_name) if shx_name else None

    sf = shapefile.Reader(
        shp=io.BytesIO(shp_data),
        dbf=io.BytesIO(dbf_data) if dbf_data else None,
        shx=io.BytesIO(shx_data) if shx_data else None,
    )

    features = []
    for sr in sf.shapeRecords():
        rec = sr.record
        shape = sr.shape

        # Extract attributes (field order: BASIN, AREA, PROB2DAY, RISK2DAY, PROB7DAY, RISK7DAY)
        basin = str(rec["BASIN"]).strip() if "BASIN" in rec else ""
        area = str(rec["AREA"]).strip() if "AREA" in rec else ""
        prob2day = str(rec["PROB2DAY"]).strip() if "PROB2DAY" in rec else ""
        risk2day = str(rec["RISK2DAY"]).strip() if "RISK2DAY" in rec else ""
        prob7day = str(rec["PROB7DAY"]).strip() if "PROB7DAY" in rec else ""
        risk7day = str(rec["RISK7DAY"]).strip() if "RISK7DAY" in rec else ""

        # Build polygon geometry from shapefile points
        # Shapefile type 5 = Polygon; parts define ring boundaries
        if not shape.points:
            continue

        parts = list(shape.parts) + [len(shape.points)]
        rings = []
        for i in range(len(parts) - 1):
            ring_pts = shape.points[parts[i]:parts[i + 1]]
            # Convert to [lon, lat] pairs
            ring = [[pt[0], pt[1]] for pt in ring_pts]
            # Close ring if not already closed
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])
            if len(ring) >= 4:
                rings.append(ring)

        if not rings:
            continue

        geometry = {"type": "Polygon", "coordinates": rings}

        # Determine colors for both 2-day and 7-day views
        color_2day = risk_to_color(risk2day, prob2day)
        color_7day = risk_to_color(risk7day, prob7day)

        # Build a human-readable name
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
    print(f"NHC GTWO fetch started: {generated_at}")
    print(f"  Fetching: {SHAPEFILE_URL}")

    features = []
    try:
        zip_data = fetch_url(SHAPEFILE_URL)
        print(f"  Downloaded {len(zip_data):,} bytes")
        features = parse_gtwo_shapefile(zip_data)
        print(f"  Features parsed: {len(features)}")
    except Exception as e:
        print(f"  ERROR: {e}", file=sys.stderr)
        # Write empty GeoJSON on failure so the frontend does not break

    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "generated_at": generated_at,
            "source": "NOAA National Hurricane Center",
            "source_url": "https://www.nhc.noaa.gov/gtwo.php",
            "note": "Each feature contains both 2-day and 7-day probability attributes.",
        },
        "features": features,
    }

    out_path = os.path.join(OUT_DIR, "nhc_gtwo.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))
    print(f"  Wrote {out_path} ({len(features)} features)")
    print(f"NHC GTWO fetch complete: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")
    return geojson


if __name__ == "__main__":
    main()
