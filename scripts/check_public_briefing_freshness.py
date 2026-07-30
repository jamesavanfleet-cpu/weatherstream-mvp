#!/usr/bin/env python3
"""Verify that the live public morning briefing artifacts are fresh for Eastern time.

The checker intentionally uses only the Python standard library. It is shared by
both independent morning runs: a fresh result exits successfully without a
deployment; a stale or incomplete result exits nonzero so the wrapper can run the
canonical generator and deployment path.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

DEFAULT_BASE_URL = "https://www.mycruisingweather.com"
EASTERN_TIMEZONE = "America/New_York"


def _fetch_json(label: str, url: str, timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "User-Agent": "WeatherStream-Briefing-Freshness/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except Exception as exc:
        raise RuntimeError(f"{label} could not be fetched or parsed: {exc}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"{label} did not contain a JSON object")
    return payload


def _validate(intel: dict[str, Any], story: dict[str, Any], expected_date: str) -> list[str]:
    errors: list[str] = []

    if intel.get("generated") != expected_date:
        errors.append(
            f"intel.json generated={intel.get('generated')!r}; expected {expected_date!r}"
        )

    regions = intel.get("regions")
    if not isinstance(regions, dict) or not regions:
        errors.append("intel.json has no populated regions object")
    else:
        incomplete = [
            name
            for name, text in regions.items()
            if not isinstance(text, str) or len(text.strip()) < 80
        ]
        if incomplete:
            errors.append("intel.json has incomplete regions: " + ", ".join(sorted(incomplete)))

    if story.get("date") != expected_date:
        errors.append(
            f"top_story.json date={story.get('date')!r}; expected {expected_date!r}"
        )

    for required_section in ("caribbean", "mediterranean"):
        section = story.get(required_section)
        if not isinstance(section, dict) or not str(section.get("headline", "")).strip():
            errors.append(f"top_story.json missing {required_section} headline")

    return errors


def _check_once(base_url: str, expected_date: str, timeout: int, attempt: int) -> list[str]:
    cache_buster = f"{int(time.time())}-{attempt}"
    root = base_url.rstrip("/")
    try:
        intel = _fetch_json("intel.json", f"{root}/intel.json?ts={cache_buster}", timeout)
        story = _fetch_json("top_story.json", f"{root}/top_story.json?ts={cache_buster}", timeout)
    except RuntimeError as exc:
        return [str(exc)]

    errors = _validate(intel, story, expected_date)
    if not errors:
        regions = intel.get("regions", {})
        print(
            "Public briefing freshness verified: "
            f"intel={intel.get('generated')}, top_story={story.get('date')}, "
            f"regions={len(regions)}"
        )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify current public briefing artifacts with bounded retries."
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("BRIEFING_FRESHNESS_BASE_URL", DEFAULT_BASE_URL),
        help="Public site origin to verify.",
    )
    parser.add_argument(
        "--expected-date",
        default=os.environ.get("BRIEFING_EXPECTED_DATE"),
        help="Expected YYYY-MM-DD in America/New_York. Defaults to today in Eastern time.",
    )
    parser.add_argument("--timeout", type=int, default=15, help="Per-request timeout in seconds.")
    parser.add_argument("--attempts", type=int, default=1, help="Maximum bounded verification attempts.")
    parser.add_argument(
        "--delay-seconds", type=int, default=10, help="Delay between attempts in seconds."
    )
    args = parser.parse_args()

    if args.timeout < 1 or args.attempts < 1 or args.delay_seconds < 0:
        parser.error("timeout and attempts must be positive; delay-seconds cannot be negative")

    expected_date = args.expected_date or datetime.now(ZoneInfo(EASTERN_TIMEZONE)).date().isoformat()
    errors: list[str] = []
    for attempt in range(1, args.attempts + 1):
        errors = _check_once(args.base_url, expected_date, args.timeout, attempt)
        if not errors:
            return 0
        if attempt < args.attempts:
            print(
                f"Public briefing freshness attempt {attempt}/{args.attempts} failed; "
                f"retrying in {args.delay_seconds}s.",
                file=sys.stderr,
            )
            time.sleep(args.delay_seconds)

    print("PUBLIC BRIEFING FRESHNESS CHECK FAILED", file=sys.stderr)
    for error in errors:
        print(error, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
