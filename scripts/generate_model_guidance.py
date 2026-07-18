#!/usr/bin/env python3
"""Generate validated public NHC A-deck model guidance for active storms.

The artifact intentionally contains only a conservative allowlist of publicly
reviewed ATCF aids. It preserves both the track coordinates and each aid's
available intensity value, but it is never an official NHC forecast.
"""

from __future__ import annotations

import gzip
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Callable

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(REPO_ROOT, "client", "public")
OUTPUT_PATH = os.path.join(OUT_DIR, "nhc_model_guidance.json")

CURRENT_STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"
AID_PUBLIC_URL_TEMPLATE = "https://ftp.nhc.noaa.gov/atcf/aid_public/a{storm_id}.dat.gz"

# This curated list intentionally excludes NHC official forecast aids and all
# restricted identifiers identified in NHC's model-summary information.
PUBLIC_AID_LABELS: dict[str, str] = {
    "AVNO": "GFS",
    "AVNI": "GFS",
    "GFSO": "GFS",
    "GFSI": "GFS",
    "AEMN": "GEFS mean",
    "AEMI": "GEFS mean",
    "CMC": "Canadian",
    "CMCI": "Canadian",
    "CMC2": "Canadian",
    "CEMN": "Canadian",
    "CEMI": "Canadian",
    "NVGM": "NAVGEM",
    "NVGI": "NAVGEM",
    "HFSA": "HAFS-A",
    "HFAI": "HAFS-A",
    "HFSB": "HAFS-B",
    "HFBI": "HAFS-B",
    "HWRF": "HWRF",
    "HWFI": "HWRF",
    "CTCX": "COAMPS-TC",
    "CTCI": "COAMPS-TC",
    "HMON": "HMON",
    "HMNI": "HMON",
    "TVCN": "Variable consensus",
    "HCCA": "Corrected consensus",
    "GAIO": "AI-GFS",
    "GAII": "AI-GFS",
    "EGMN": "AI-GEFS mean",
    "EGMI": "AI-GEFS mean",
    "GDMN": "DeepMind ensemble mean",
    "GDMI": "DeepMind ensemble mean",
    "GENC": "GenCast ensemble mean",
    "GENI": "GenCast ensemble mean",
    "GRPH": "GraphCast",
    "GRPI": "GraphCast",
    "TABS": "GFS trajectories",
    "TABM": "GFS trajectories",
    "TABD": "GFS trajectories",
    "CLP5": "Track-climatology aids",
    "TCLP": "Track-climatology aids",
}

ACTIVE_BASINS = {"al", "ep", "cp"}
MIN_POINTS_PER_AID = 2
MIN_AIDS_PER_CYCLE = 2
MAX_FORECAST_HOUR = 168


def fetch_url(url: str, timeout: int = 30) -> bytes:
    """Fetch an official NHC resource with non-caching, descriptive headers."""
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "MyCruisingWeather/1.0 (mycruisingweather.com; public model guidance)",
            "Accept": "*/*",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def write_json_atomic(path: str, payload: dict[str, Any]) -> None:
    """Atomically replace an artifact only after serialization has succeeded."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary_path = f"{path}.tmp"
    try:
        with open(temporary_path, "w", encoding="utf-8") as destination:
            json.dump(payload, destination, separators=(",", ":"), ensure_ascii=False)
            destination.flush()
            os.fsync(destination.fileno())
        os.replace(temporary_path, path)
    finally:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)


def normalize_storm_id(raw_storm_id: object) -> str | None:
    """Return a normalized NHC basin-number-year identifier or None."""
    candidate = str(raw_storm_id or "").strip().lower()
    match = re.fullmatch(r"(al|ep|cp)(\d{2})(\d{4})", candidate)
    return candidate if match else None


def parse_coordinate(value: object, axis: str) -> float | None:
    """Parse an ATCF tenths-of-degree coordinate into a signed decimal degree."""
    raw = str(value or "").strip().upper()
    match = re.fullmatch(r"([+-]?\d+(?:\.\d+)?)([NSEW])", raw)
    if not match:
        return None

    numeric_text, hemisphere = match.groups()
    try:
        magnitude = float(numeric_text)
    except ValueError:
        return None

    # ATCF compact coordinates such as 171N and 1219W use tenths of a degree.
    if "." not in numeric_text:
        magnitude /= 10

    if magnitude < 0:
        return None
    if axis == "lat":
        if hemisphere not in {"N", "S"} or magnitude > 90:
            return None
    elif axis == "lon":
        if hemisphere not in {"E", "W"} or magnitude > 180:
            return None
    else:
        raise ValueError(f"Unsupported coordinate axis: {axis}")

    return -magnitude if hemisphere in {"S", "W"} else magnitude


def parse_optional_int(value: object, lower: int, upper: int) -> int | None:
    """Parse a bounded integer, treating ATCF missing-value sentinels as absent."""
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    if parsed < lower or parsed > upper:
        return None
    return parsed


def center_track_rank(fields: list[str]) -> int:
    """Rank a center-track row ahead of an auxiliary wind-radii row."""
    radii_code = fields[11].strip() if len(fields) > 11 else ""
    return 0 if radii_code in {"", "0", "-999", "-9999"} else 1


def parse_atcf_line(line: str) -> dict[str, Any] | None:
    """Parse one ATCF A-deck line if it is a permitted, valid position record."""
    fields = [field.strip() for field in line.split(",")]
    if len(fields) < 10:
        return None

    basin = fields[0].lower()
    cycle = fields[2]
    aid = fields[4].upper()
    tau = parse_optional_int(fields[5], 0, MAX_FORECAST_HOUR)
    latitude = parse_coordinate(fields[6], "lat")
    longitude = parse_coordinate(fields[7], "lon")

    if (
        basin not in ACTIVE_BASINS
        or not re.fullmatch(r"\d{10}", cycle)
        or aid not in PUBLIC_AID_LABELS
        or tau is None
        or latitude is None
        or longitude is None
    ):
        return None

    return {
        "basin": basin,
        "cycle": cycle,
        "aid": aid,
        "label": PUBLIC_AID_LABELS[aid],
        "forecastHour": tau,
        "lat": latitude,
        "lon": longitude,
        "windKt": parse_optional_int(fields[8], 1, 250),
        "pressureMb": parse_optional_int(fields[9], 800, 1100),
        "centerTrackRank": center_track_rank(fields),
    }


def parse_adeck(text: str) -> dict[str, dict[str, dict[int, dict[str, Any]]]]:
    """Parse A-deck rows by cycle, aid, and forecast hour with radii deduplication."""
    by_cycle: dict[str, dict[str, dict[int, dict[str, Any]]]] = defaultdict(lambda: defaultdict(dict))
    for line in text.splitlines():
        parsed = parse_atcf_line(line)
        if parsed is None:
            continue
        cycle = parsed["cycle"]
        aid = parsed["aid"]
        forecast_hour = parsed["forecastHour"]
        existing = by_cycle[cycle][aid].get(forecast_hour)
        if existing is None or parsed["centerTrackRank"] < existing["centerTrackRank"]:
            by_cycle[cycle][aid][forecast_hour] = parsed
    return by_cycle


def model_points(records: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    """Return sorted public track and intensity points without internal parser keys."""
    points: list[dict[str, Any]] = []
    for forecast_hour in sorted(records):
        record = records[forecast_hour]
        points.append(
            {
                "forecastHour": record["forecastHour"],
                "lat": record["lat"],
                "lon": record["lon"],
                "windKt": record["windKt"],
                "pressureMb": record["pressureMb"],
            }
        )
    return points


def complete_models_for_cycle(
    cycle_models: dict[str, dict[int, dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Return distinct permitted aids that have enough valid track positions."""
    models: list[dict[str, Any]] = []
    for aid in sorted(cycle_models):
        points = model_points(cycle_models[aid])
        if len(points) < MIN_POINTS_PER_AID:
            continue
        models.append({"id": aid, "label": PUBLIC_AID_LABELS[aid], "points": points})
    return models


def select_latest_complete_cycle(
    parsed_adeck: dict[str, dict[str, dict[int, dict[str, Any]]]],
) -> tuple[str, list[dict[str, Any]]] | None:
    """Select the newest cycle that has at least two independently usable aids."""
    for cycle in sorted(parsed_adeck, reverse=True):
        models = complete_models_for_cycle(parsed_adeck[cycle])
        if len(models) >= MIN_AIDS_PER_CYCLE:
            return cycle, models
    return None


def storm_guidance_from_adeck(storm: dict[str, Any], adeck_text: str) -> dict[str, Any]:
    """Produce one active-storm guidance record from a validated public A-deck."""
    storm_id = normalize_storm_id(storm.get("id"))
    if storm_id is None:
        raise ValueError("Active storm is missing a valid NHC identifier")

    selected = select_latest_complete_cycle(parse_adeck(adeck_text))
    source_url = AID_PUBLIC_URL_TEMPLATE.format(storm_id=storm_id)
    result: dict[str, Any] = {
        "id": storm_id,
        "name": str(storm.get("name") or storm_id).strip(),
        "basin": storm_id[:2],
        "sourceUrl": source_url,
        "models": [],
    }
    if selected is None:
        result["noDataReason"] = "No complete public guidance cycle is available for this active storm."
        return result

    source_cycle, models = selected
    result["sourceCycle"] = source_cycle
    result["models"] = models
    return result


def active_nhc_storms(current_storms: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract only currently active NHC or CPHC basin systems eligible for guidance."""
    raw_storms = current_storms.get("activeStorms")
    if not isinstance(raw_storms, list):
        raise ValueError("CurrentStorms.json is missing a valid activeStorms list")

    storms: list[dict[str, Any]] = []
    for raw_storm in raw_storms:
        if not isinstance(raw_storm, dict):
            continue
        storm_id = normalize_storm_id(raw_storm.get("id"))
        if storm_id and storm_id[:2] in ACTIVE_BASINS:
            storms.append(raw_storm)
    return storms


def build_payload(
    current_storms: dict[str, Any],
    adeck_fetcher: Callable[[str], str],
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build a complete artifact, failing before publication if an active source fetch fails."""
    active_storms = active_nhc_storms(current_storms)
    generated = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    records: list[dict[str, Any]] = []

    for storm in active_storms:
        storm_id = normalize_storm_id(storm.get("id"))
        if storm_id is None:
            continue
        try:
            adeck_text = adeck_fetcher(storm_id)
        except Exception as error:
            raise RuntimeError(f"Could not retrieve public A-deck for active storm {storm_id}") from error
        if not isinstance(adeck_text, str) or not adeck_text.strip():
            raise RuntimeError(f"Public A-deck for active storm {storm_id} was empty")
        records.append(storm_guidance_from_adeck(storm, adeck_text))

    return {
        "generated": generated,
        "source": "NOAA National Hurricane Center ATCF public A-deck",
        "activeStormSourceUrl": CURRENT_STORMS_URL,
        "disclaimer": "Model guidance is not an official NHC forecast. Consult official NHC forecasts and local NWS products.",
        "storms": records,
    }


def validate_payload(payload: dict[str, Any]) -> None:
    """Validate the model artifact before it can replace the prior published copy."""
    try:
        datetime.fromisoformat(str(payload["generated"]).replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Guidance artifact has an invalid generated timestamp") from error

    storms = payload.get("storms")
    if not isinstance(storms, list):
        raise ValueError("Guidance artifact storms must be a list")

    seen_storms: set[str] = set()
    for storm in storms:
        if not isinstance(storm, dict):
            raise ValueError("Guidance artifact storm must be an object")
        storm_id = normalize_storm_id(storm.get("id"))
        if storm_id is None or storm_id in seen_storms:
            raise ValueError("Guidance artifact has an invalid or duplicate storm id")
        seen_storms.add(storm_id)

        expected_source_url = AID_PUBLIC_URL_TEMPLATE.format(storm_id=storm_id)
        if storm.get("sourceUrl") != expected_source_url:
            raise ValueError("Guidance artifact storm source URL is invalid")

        models = storm.get("models")
        if not isinstance(models, list):
            raise ValueError("Guidance artifact models must be a list")
        if not models and not isinstance(storm.get("noDataReason"), str):
            raise ValueError("Guidance artifact needs a no-data reason when models are absent")
        if models and not re.fullmatch(r"\d{10}", str(storm.get("sourceCycle") or "")):
            raise ValueError("Guidance artifact modeled storm needs a valid source cycle")

        seen_aids: set[str] = set()
        for model in models:
            if not isinstance(model, dict):
                raise ValueError("Guidance model must be an object")
            aid = str(model.get("id") or "").upper()
            if aid not in PUBLIC_AID_LABELS or aid in seen_aids:
                raise ValueError("Guidance artifact has an invalid or duplicate public aid")
            if model.get("label") != PUBLIC_AID_LABELS[aid]:
                raise ValueError("Guidance artifact model label does not match the public aid")
            seen_aids.add(aid)

            points = model.get("points")
            if not isinstance(points, list) or len(points) < MIN_POINTS_PER_AID:
                raise ValueError("Guidance model has too few points")
            prior_hour = -1
            for point in points:
                if not isinstance(point, dict):
                    raise ValueError("Guidance point must be an object")
                hour = point.get("forecastHour")
                latitude = point.get("lat")
                longitude = point.get("lon")
                if not isinstance(hour, int) or hour < 0 or hour > MAX_FORECAST_HOUR or hour <= prior_hour:
                    raise ValueError("Guidance point forecast hours must be strictly increasing")
                if not isinstance(latitude, (int, float)) or not -90 <= latitude <= 90:
                    raise ValueError("Guidance point latitude is invalid")
                if not isinstance(longitude, (int, float)) or not -180 <= longitude <= 180:
                    raise ValueError("Guidance point longitude is invalid")
                wind_kt = point.get("windKt")
                pressure_mb = point.get("pressureMb")
                if wind_kt is not None and (not isinstance(wind_kt, int) or not 1 <= wind_kt <= 250):
                    raise ValueError("Guidance point wind intensity is invalid")
                if pressure_mb is not None and (not isinstance(pressure_mb, int) or not 800 <= pressure_mb <= 1100):
                    raise ValueError("Guidance point pressure is invalid")
                prior_hour = hour


def fetch_adeck_text(storm_id: str) -> str:
    """Fetch and decompress one current NHC public A-deck."""
    url = AID_PUBLIC_URL_TEMPLATE.format(storm_id=storm_id)
    raw = fetch_url(url, timeout=30)
    return gzip.decompress(raw).decode("utf-8", errors="replace")


def main() -> None:
    """Generate and atomically publish only a fully validated official artifact."""
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"NHC model guidance fetch started: {generated_at}")
    raw_current_storms = fetch_url(CURRENT_STORMS_URL, timeout=30)
    current_storms = json.loads(raw_current_storms.decode("utf-8"))
    if not isinstance(current_storms, dict):
        raise ValueError("CurrentStorms.json response is not an object")

    payload = build_payload(current_storms, fetch_adeck_text, generated_at)
    validate_payload(payload)
    write_json_atomic(OUTPUT_PATH, payload)

    output_size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    modeled_storms = sum(1 for storm in payload["storms"] if storm["models"])
    print(
        f"Wrote {OUTPUT_PATH} ({output_size_kb:.1f} KB, "
        f"{modeled_storms}/{len(payload['storms'])} storms with complete public guidance)"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"NHC model guidance generation failed: {error}", file=sys.stderr)
        raise
