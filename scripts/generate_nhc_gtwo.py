#!/usr/bin/env python3
"""
Compatibility entry point for the standalone NHC GTWO artifact.

The canonical GTWO parser and writer live in generate_nhc_data.py so every
scheduled publisher uses the same official area polygons, point locations,
and null-point semantics.
"""

from datetime import datetime, timezone

from generate_nhc_data import fetch_gtwo_features, write_gtwo_artifact


def main():
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"NHC GTWO fetch started: {generated_at}")
    features = fetch_gtwo_features()
    out_path = write_gtwo_artifact(features, generated_at)
    print(f"  Wrote {out_path} ({len(features)} disturbances from the canonical GTWO parser)")
    print(f"NHC GTWO fetch complete: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")
    return features


if __name__ == "__main__":
    main()
