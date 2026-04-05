#!/usr/bin/env python3
"""
generate_maritime_routes.py
----------------------------
Pre-computes realistic maritime routes between every pair of ports in
client/src/data/ports.ts using the searoute library (Marnet graph).

Output: client/public/maritime_routes.json

Key format: "Port A|Port B" where Port A comes first alphabetically.
Value: array of [lat, lon] waypoints in Leaflet order.

Run automatically by GitHub Actions when ports.ts changes.
Can also be run manually: python3 scripts/generate_maritime_routes.py
"""

import re
import json
import sys
import time
import os

try:
    import searoute as sr
except ImportError:
    print("ERROR: searoute not installed. Run: pip install searoute")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Paths (relative to repo root)
# ---------------------------------------------------------------------------
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTS_FILE = os.path.join(REPO_ROOT, "client", "src", "data", "ports.ts")
OUTPUT_FILE = os.path.join(REPO_ROOT, "client", "public", "maritime_routes.json")

# ---------------------------------------------------------------------------
# Parse ports from ports.ts
# ---------------------------------------------------------------------------
def parse_ports(path):
    with open(path, "r") as f:
        content = f.read()
    pattern = r'name:\s*"([^"]+)",\s*lat:\s*([-\d.]+),\s*lon:\s*([-\d.]+)'
    matches = re.findall(pattern, content)
    ports = []
    for name, lat, lon in matches:
        ports.append({"name": name, "lat": float(lat), "lon": float(lon)})
    return ports

# ---------------------------------------------------------------------------
# Compute routes
# ---------------------------------------------------------------------------
def compute_routes(ports):
    routes = {}
    total = len(ports) * (len(ports) - 1) // 2
    count = 0
    errors = 0
    start = time.time()

    for i, p1 in enumerate(ports):
        for j, p2 in enumerate(ports):
            if j <= i:
                continue

            count += 1
            # Alphabetical key so lookup is order-independent
            if p1["name"] < p2["name"]:
                key = f"{p1['name']}|{p2['name']}"
                origin = [p1["lon"], p1["lat"]]
                dest   = [p2["lon"], p2["lat"]]
            else:
                key = f"{p2['name']}|{p1['name']}"
                origin = [p2["lon"], p2["lat"]]
                dest   = [p1["lon"], p1["lat"]]

            try:
                result = sr.searoute(origin, dest, append_orig_dest=True)
                coords = result["geometry"]["coordinates"]
                # Convert from [lon, lat] (GeoJSON) to [lat, lon] (Leaflet)
                waypoints = [[round(c[1], 5), round(c[0], 5)] for c in coords]
                routes[key] = waypoints
            except Exception as e:
                errors += 1
                # Leave key absent -- frontend will fall back to gate routing

            # Progress report every 100 pairs
            if count % 100 == 0:
                elapsed = time.time() - start
                rate = count / elapsed
                remaining = (total - count) / rate if rate > 0 else 0
                print(f"  {count}/{total} pairs computed "
                      f"({errors} errors) "
                      f"-- ETA {remaining/60:.1f} min",
                      flush=True)

    elapsed = time.time() - start
    print(f"\nDone: {len(routes)} routes, {errors} errors in {elapsed/60:.1f} min")
    return routes

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"Parsing ports from {PORTS_FILE} ...")
    ports = parse_ports(PORTS_FILE)
    print(f"Found {len(ports)} ports -> {len(ports)*(len(ports)-1)//2} unique pairs")

    # Load existing routes if present (allows incremental updates)
    existing = {}
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r") as f:
            existing = json.load(f)
        print(f"Loaded {len(existing)} existing routes from {OUTPUT_FILE}")

    # Find pairs not yet computed
    missing_pairs = []
    for i, p1 in enumerate(ports):
        for j, p2 in enumerate(ports):
            if j <= i:
                continue
            if p1["name"] < p2["name"]:
                key = f"{p1['name']}|{p2['name']}"
            else:
                key = f"{p2['name']}|{p1['name']}"
            if key not in existing:
                missing_pairs.append((p1, p2))

    if not missing_pairs:
        print("All routes already computed. Nothing to do.")
        return

    print(f"Computing {len(missing_pairs)} missing routes ...")

    # Compute only missing pairs
    new_routes = {}
    errors = 0
    start = time.time()
    total = len(missing_pairs)

    for count, (p1, p2) in enumerate(missing_pairs, 1):
        if p1["name"] < p2["name"]:
            key = f"{p1['name']}|{p2['name']}"
            origin = [p1["lon"], p1["lat"]]
            dest   = [p2["lon"], p2["lat"]]
        else:
            key = f"{p2['name']}|{p1['name']}"
            origin = [p2["lon"], p2["lat"]]
            dest   = [p1["lon"], p1["lat"]]

        try:
            result = sr.searoute(origin, dest, append_orig_dest=True)
            coords = result["geometry"]["coordinates"]
            waypoints = [[round(c[1], 5), round(c[0], 5)] for c in coords]
            new_routes[key] = waypoints
        except Exception:
            errors += 1

        if count % 100 == 0:
            elapsed = time.time() - start
            rate = count / elapsed
            remaining = (total - count) / rate if rate > 0 else 0
            print(f"  {count}/{total} "
                  f"({errors} errors) "
                  f"-- ETA {remaining/60:.1f} min",
                  flush=True)

    # Merge with existing
    merged = {**existing, **new_routes}

    # Write output
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(merged, f, separators=(",", ":"))

    size_kb = os.path.getsize(OUTPUT_FILE) / 1024
    elapsed = time.time() - start
    print(f"\nWrote {len(merged)} routes to {OUTPUT_FILE} "
          f"({size_kb:.0f} KB) in {elapsed/60:.1f} min")
    print(f"Errors (pairs skipped, will use fallback): {errors}")

if __name__ == "__main__":
    main()
