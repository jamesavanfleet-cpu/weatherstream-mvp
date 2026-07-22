#!/usr/bin/env python3
"""Validate that NHC's public sources are current for one advisory release.

This script is intentionally lightweight. It uses response metadata and small JSON
responses before the heavier NHC artifact generators run. It never writes public
site data. A valid result is written as JSON for the workflow to inspect.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable

CURRENT_STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"
AID_PUBLIC_DIRECTORY_URL = "https://ftp.nhc.noaa.gov/atcf/aid_public/"
AID_PUBLIC_URL_TEMPLATE = "https://ftp.nhc.noaa.gov/atcf/aid_public/a{storm_id}.dat.gz"
LIVE_STATUS_URL = "https://www.mycruisingweather.com/nhc_release_status.json"
RELEASE_HOURS_UTC = {3, 9, 15, 21}
STORM_ID_PATTERN = re.compile(r"(?:al|ep|cp)\d{6}$", re.IGNORECASE)

HeadersFetcher = Callable[[str], dict[str, str | None]]
JsonFetcher = Callable[[str], Any]
StatusFetcher = Callable[[str], Any]


def parse_release_anchor(value: str) -> datetime:
    """Parse one exact NHC 03Z, 09Z, 15Z, or 21Z release anchor in UTC."""
    normalized = value.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("Release anchor must include a UTC offset or Z suffix")
    anchor = parsed.astimezone(timezone.utc)
    if (
        anchor.hour not in RELEASE_HOURS_UTC
        or anchor.minute != 0
        or anchor.second != 0
        or anchor.microsecond != 0
    ):
        raise ValueError("Release anchor must be exactly 03Z, 09Z, 15Z, or 21Z")
    return anchor


def release_anchor_text(value: datetime) -> str:
    """Format a UTC release anchor consistently for artifacts and comparisons."""
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def latest_release_anchor(now: datetime | None = None) -> datetime:
    """Return the most recent nominal NHC advisory release anchor in UTC."""
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    for hour in sorted(RELEASE_HOURS_UTC, reverse=True):
        candidate = current.replace(hour=hour, minute=0, second=0, microsecond=0)
        if candidate <= current:
            return candidate
    previous_day = current - timedelta(days=1)
    return previous_day.replace(hour=21, minute=0, second=0, microsecond=0)


def parse_http_timestamp(value: str | None) -> datetime | None:
    """Parse an RFC 2822 Last-Modified header into a UTC timestamp."""
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def fetch_headers(url: str, timeout: int = 20) -> dict[str, str | None]:
    """Fetch only official response metadata without downloading a model file."""
    request = urllib.request.Request(
        url,
        method="HEAD",
        headers={
            "User-Agent": "MyCruisingWeather/1.0 (mycruisingweather.com; NHC release check)",
            "Accept": "*/*",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return {
            "last_modified": response.headers.get("Last-Modified"),
            "etag": response.headers.get("ETag"),
        }


def fetch_json(url: str, timeout: int = 20) -> Any:
    """Fetch a small JSON document with no-cache semantics."""
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "MyCruisingWeather/1.0 (mycruisingweather.com; NHC release check)",
            "Accept": "application/json, */*",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def active_storm_ids(current_storms: Any) -> list[str]:
    """Return the supported active NHC basin identifiers from CurrentStorms.json."""
    if not isinstance(current_storms, dict) or not isinstance(current_storms.get("activeStorms"), list):
        raise ValueError("CurrentStorms.json is missing a valid activeStorms list")

    ids: set[str] = set()
    for storm in current_storms["activeStorms"]:
        if not isinstance(storm, dict):
            continue
        storm_id = str(storm.get("id") or "").strip().lower()
        if STORM_ID_PATTERN.fullmatch(storm_id):
            ids.add(storm_id)
    return sorted(ids)


def status_release_at_or_after(status: Any, target: datetime) -> str | None:
    """Return the verified release when a live status file already covers target."""
    if not isinstance(status, dict) or not isinstance(status.get("verifiedRelease"), str):
        return None
    try:
        verified = parse_release_anchor(status["verifiedRelease"])
    except ValueError:
        return None
    return release_anchor_text(verified) if verified >= target else None


def freshness_result(url: str, target: datetime, headers_fetcher: HeadersFetcher) -> tuple[bool, dict[str, str | None]]:
    """Return whether one official source advertises a Last-Modified time at target."""
    headers = headers_fetcher(url)
    last_modified = parse_http_timestamp(headers.get("last_modified"))
    return bool(last_modified and last_modified >= target), headers


def evaluate_release(
    target: datetime,
    headers_fetcher: HeadersFetcher = fetch_headers,
    json_fetcher: JsonFetcher = fetch_json,
    status_fetcher: StatusFetcher = fetch_json,
    status_url: str = LIVE_STATUS_URL,
    checked_at: datetime | None = None,
) -> dict[str, Any]:
    """Assess whether the official sources are complete enough for target publication."""
    checked = (checked_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    target_text = release_anchor_text(target)
    result: dict[str, Any] = {
        "schemaVersion": 1,
        "targetRelease": target_text,
        "checkedAt": checked.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "state": "not_ready",
        "reason": "Official NHC sources have not yet been verified for this release.",
        "currentStormsLastModified": None,
        "publicAdeckDirectoryLastModified": None,
        "activeStormIds": [],
        "aDeckLastModified": {},
    }

    try:
        published_release = status_release_at_or_after(status_fetcher(status_url), target)
    except Exception:
        published_release = None
    if published_release:
        result.update(
            state="already_published",
            reason="The live release-status artifact already covers this NHC release.",
            publishedRelease=published_release,
        )
        return result

    current_ready, current_headers = freshness_result(CURRENT_STORMS_URL, target, headers_fetcher)
    result["currentStormsLastModified"] = current_headers.get("last_modified")
    if not current_ready:
        result["reason"] = "CurrentStorms.json has not reached the requested NHC release time."
        return result

    # The public directory does not consistently advertise Last-Modified. Retain
    # that header as diagnostic evidence only. Actual active A-decks are checked
    # individually below, which is the source the generator consumes.
    _directory_ready, directory_headers = freshness_result(AID_PUBLIC_DIRECTORY_URL, target, headers_fetcher)
    result["publicAdeckDirectoryLastModified"] = directory_headers.get("last_modified")

    current_storms = json_fetcher(CURRENT_STORMS_URL)
    storm_ids = active_storm_ids(current_storms)
    result["activeStormIds"] = storm_ids

    for storm_id in storm_ids:
        source_url = AID_PUBLIC_URL_TEMPLATE.format(storm_id=storm_id)
        adeck_ready, adeck_headers = freshness_result(source_url, target, headers_fetcher)
        result["aDeckLastModified"][storm_id] = adeck_headers.get("last_modified")
        if not adeck_ready:
            result["reason"] = f"Public A-deck {storm_id} has not reached the requested release time."
            return result

    result.update(
        state="ready",
        reason="CurrentStorms.json and every active public A-deck are current for this release; the directory timestamp is recorded as diagnostic evidence only.",
    )
    return result


def write_json(path: str, payload: dict[str, Any]) -> None:
    """Write a check result atomically when a workflow requests an output file."""
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if path == "-":
        print(encoded, end="")
        return

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    try:
        temporary.write_text(encoded, encoding="utf-8")
        temporary.replace(destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def main() -> int:
    """Run the lightweight official-source gate and emit a machine-readable decision."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target-release",
        help="Exact NHC UTC anchor, such as 2026-07-22T09:00:00Z. Defaults to the latest anchor.",
    )
    parser.add_argument("--status-url", default=LIVE_STATUS_URL)
    parser.add_argument("--output", default="-")
    arguments = parser.parse_args()

    try:
        target = parse_release_anchor(arguments.target_release) if arguments.target_release else latest_release_anchor()
        result = evaluate_release(target, status_url=arguments.status_url)
        write_json(arguments.output, result)
        print(f"NHC release gate: {result['state']} for {result['targetRelease']}", file=sys.stderr)
        return 0
    except Exception as error:
        print(f"NHC release gate failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
