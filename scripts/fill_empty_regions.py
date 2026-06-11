#!/usr/bin/env python3
"""
fill_empty_regions.py -- Fill only the empty regions in intel.json.
Reads the current intel.json, identifies empty regions, and generates
briefings only for those regions, then writes the updated intel.json.
"""
import json, os, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import generate_intel as gi

INTEL_PATH = Path(__file__).parent.parent / "client" / "public" / "intel.json"

def main():
    if not gi.GROQ_API_KEY:
        print("ERROR: GROQ_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    with open(INTEL_PATH) as f:
        current = json.load(f)

    empty_slugs = [k for k, v in current["regions"].items() if not v]
    if not empty_slugs:
        print("All regions already populated. Nothing to do.", file=sys.stderr)
        return

    print(f"Filling {len(empty_slugs)} empty regions: {empty_slugs}", file=sys.stderr)
    target_regions = [r for r in gi.REGIONS if r["slug"] in empty_slugs]

    for i, region in enumerate(target_regions):
        print(f"Processing {region['name']}...", file=sys.stderr)
        if i > 0 and i % 3 == 0:
            print("  Pausing 5s to avoid rate limit...", file=sys.stderr)
            time.sleep(5)
        try:
            wx = gi.fetch_weather(region["lat"], region["lon"])
            pop_means = gi.fetch_precip_probability(region["lat"], region["lon"])
            weather_data = gi.build_weather_summary(wx, pop_means=pop_means)
            intel = gi.call_groq(region, weather_data)
            if not intel or len(intel.strip()) < 20:
                raise ValueError(f"Short response: {repr(intel)}")
            intel = gi.strip_temperatures(intel.strip())
            intel = gi._normalize_low_rain_phrasing(intel)
            intel = gi._validate_and_repair_lead(region, intel, weather_data)
            intel = gi._validate_and_repair_rule_leaks(region, intel, weather_data)
            current["regions"][region["slug"]] = intel
            print(f"  OK: {intel[:80]}...", file=sys.stderr)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)

    non_empty = sum(1 for v in current["regions"].values() if v)
    total = len(current["regions"])
    INTEL_PATH.write_text(json.dumps(current, indent=2))
    print(f"intel.json updated: {INTEL_PATH.stat().st_size} bytes, {non_empty}/{total} regions populated", file=sys.stderr)

if __name__ == "__main__":
    main()
