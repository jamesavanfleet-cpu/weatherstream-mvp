"""
generate_maritime_routes_full.py
---------------------------------
Generates maritime_routes.json for all port pairs in ports.ts using the
searoute library (Marnet shipping lane graph).

Routes are stored as [lat, lon] pairs in alphabetical key order.
The frontend maritimeRouting.ts reverses the array when needed.
"""

import json
import re
import sys
from itertools import combinations
from pathlib import Path

import searoute as sr

REPO_ROOT = Path(__file__).parent.parent
PORTS_TS = REPO_ROOT / "client" / "src" / "data" / "ports.ts"
OUT_FILE = REPO_ROOT / "client" / "public" / "maritime_routes.json"

# ---------------------------------------------------------------------------
# Parse ports.ts to extract name, lat, lon
# ---------------------------------------------------------------------------
def parse_ports(ts_path: Path) -> list[dict]:
    text = ts_path.read_text()
    # Strip all single-line comments first so the example in the file header
    # ({ name: "Port Name", lat: XX.XXXX ... }) does not fool the regex.
    text_no_comments = re.sub(r'//[^\n]*', '', text)
    ports = []
    # Match each port object -- non-greedy, stays within one { } block
    for block in re.finditer(
        r'\{\s*name:\s*"([^"]+)"[^}]*?lat:\s*([-\d.]+)[^}]*?lon:\s*([-\d.]+)[^}]*?\}',
        text_no_comments, re.DOTALL
    ):
        name = block.group(1).strip()
        lat = float(block.group(2))
        lon = float(block.group(3))
        # Skip placeholder values
        if abs(lat) > 90 or abs(lon) > 180:
            continue
        ports.append({"name": name, "lat": lat, "lon": lon})
    return ports


# ---------------------------------------------------------------------------
# Priority port groups -- generate ALL pairs within and between these groups
# ---------------------------------------------------------------------------
PRIORITY_GROUPS = {
    "us_east": [
        "Miami", "Port Everglades", "Fort Lauderdale", "Port Canaveral",
        "Jacksonville", "Charleston", "Savannah", "Norfolk", "Baltimore",
        "Manhattan", "New York", "Brooklyn", "Bayonne", "Cape Liberty", "Boston",
    ],
    "bahamas": [
        "Nassau", "Freeport", "Bimini", "North Bimini", "Celebration Key",
        "Berry Islands", "CocoCay", "Great Stirrup Cay", "Ocean Cay",
        "Castaway Cay", "Lookout Cay", "Half Moon Cay", "Princess Cays",
        "Royal Beach Club", "Turks & Caicos", "Grand Turk",
    ],
    "gulf_us": [
        "Galveston", "Houston", "New Orleans", "Mobile", "Tampa", "Tampa Bay",
    ],
    "caribbean_west": [
        "Cozumel", "Cancun", "Playa del Carmen", "Costa Maya", "Mahahual",
        "Belize City", "Roatan", "Honduras", "Puerto Cortes",
        "Grand Cayman", "Falmouth", "Ocho Rios", "Kingston", "Montego Bay",
    ],
    "caribbean_east": [
        "San Juan", "St. Thomas", "St. Croix", "St. Maarten", "St. Kitts",
        "Antigua", "Dominica", "Martinique", "St. Lucia", "Barbados",
        "St. Vincent", "Grenada", "Aruba", "Bonaire", "Curacao",
        "Cartagena", "Colon",
    ],
    "hispaniola": [
        "Puerto Plata", "Samana", "La Romana", "Santo Domingo",
        "Labadee", "Cap-Haitien",
    ],
}

# Cross-group pairs to generate (all combinations within each group + between these groups)
CROSS_GROUPS = [
    ("us_east", "bahamas"),
    ("us_east", "gulf_us"),
    ("us_east", "caribbean_west"),
    ("us_east", "caribbean_east"),
    ("us_east", "hispaniola"),
    ("bahamas", "caribbean_west"),
    ("bahamas", "caribbean_east"),
    ("bahamas", "hispaniola"),
    ("gulf_us", "caribbean_west"),
    ("gulf_us", "caribbean_east"),
    ("gulf_us", "hispaniola"),
    ("caribbean_west", "caribbean_east"),
    ("caribbean_west", "hispaniola"),
    ("caribbean_east", "hispaniola"),
]


def build_pairs(ports_by_name: dict) -> list[tuple]:
    """Build the list of (name_a, name_b) pairs to generate."""
    pairs = set()

    # Within each group
    for group_ports in PRIORITY_GROUPS.values():
        valid = [p for p in group_ports if p in ports_by_name]
        for a, b in combinations(valid, 2):
            key = (min(a, b), max(a, b))
            pairs.add(key)

    # Between groups
    for g1, g2 in CROSS_GROUPS:
        for a in PRIORITY_GROUPS[g1]:
            if a not in ports_by_name:
                continue
            for b in PRIORITY_GROUPS[g2]:
                if b not in ports_by_name:
                    continue
                key = (min(a, b), max(a, b))
                pairs.add(key)

    return sorted(pairs)


def route_to_latlons(geojson_route) -> list[list[float]]:
    """Convert searoute GeoJSON LineString [lon, lat] to [[lat, lon], ...]."""
    coords = geojson_route["geometry"]["coordinates"]
    return [[round(lat, 5), round(lon, 5)] for lon, lat in coords]


def main():
    print(f"Parsing ports from {PORTS_TS}...")
    ports = parse_ports(PORTS_TS)
    ports_by_name = {p["name"]: p for p in ports}
    print(f"  Found {len(ports)} ports")
    print(f"  Has Miami: {'Miami' in ports_by_name}")
    print(f"  Has Nassau: {'Nassau' in ports_by_name}")
    print(f"  Has CocoCay: {'CocoCay' in ports_by_name}")

    # Load existing file to allow incremental generation
    existing: dict = {}
    if OUT_FILE.exists():
        try:
            existing = json.loads(OUT_FILE.read_text())
            print(f"  Loaded {len(existing)} existing pairs from {OUT_FILE.name}")
        except Exception:
            pass

    pairs = build_pairs(ports_by_name)
    print(f"  {len(pairs)} priority pairs to generate")

    results = dict(existing)
    generated = 0
    skipped = 0
    failed = 0

    for i, (name_a, name_b) in enumerate(pairs):
        key = f"{name_a}|{name_b}"
        if key in results:
            skipped += 1
            continue

        port_a = ports_by_name[name_a]
        port_b = ports_by_name[name_b]

        # searoute uses [lon, lat] order
        origin = [port_a["lon"], port_a["lat"]]
        dest = [port_b["lon"], port_b["lat"]]

        try:
            route = sr.searoute(origin, dest, append_orig_dest=True)
            waypoints = route_to_latlons(route)
            if len(waypoints) >= 2:
                results[key] = waypoints
                generated += 1
                if generated % 20 == 0:
                    print(f"  [{i+1}/{len(pairs)}] Generated {generated} pairs so far...")
        except Exception as e:
            failed += 1
            if failed <= 5:
                print(f"  FAILED: {key} -- {e}", file=sys.stderr)

    print(f"\nDone: {generated} new, {skipped} already existed, {failed} failed")
    print(f"Total pairs in output: {len(results)}")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(results, separators=(",", ":")))
    print(f"Written to {OUT_FILE} ({OUT_FILE.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
