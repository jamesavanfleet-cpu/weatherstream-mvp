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
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(REPO_ROOT, "client", "public")
OUTPUT_PATH = os.path.join(OUT_DIR, "nhc_model_guidance.json")

CURRENT_STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"
AID_PUBLIC_DIRECTORY_URL = "https://ftp.nhc.noaa.gov/atcf/aid_public/"
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
INVEST_BASIN_SUFFIXES = {"al": "L", "ep": "E", "cp": "C"}
INVEST_ID_PATTERN = re.compile(r"(?:al|ep|cp)9\d\d{4}")
PUBLIC_ADECK_INVEST_PATTERN = re.compile(r"a((?:al|ep|cp)9\d\d{4})\.dat\.gz", re.IGNORECASE)
DIRECTORY_TIMESTAMP_PATTERN = re.compile(r"\b(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\b")
MIN_POINTS_PER_AID = 2
MIN_AIDS_PER_CYCLE = 2
MAX_FORECAST_HOUR = 168
MAX_INVEST_CYCLE_AGE = timedelta(hours=18)
MAX_INVEST_DIRECTORY_AGE = timedelta(hours=30)
MODEL_CYCLE_HOURS = (0, 6, 12, 18)


class GuidancePending(RuntimeError):
    """Signal that the current official A-deck cycle is not complete yet."""


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
    system_type = str(storm.get("systemType") or "advisory")
    if system_type not in {"advisory", "invest"}:
        raise ValueError("Guidance system has an invalid type")
    result: dict[str, Any] = {
        "id": storm_id,
        "name": str(storm.get("name") or storm_id).strip(),
        "basin": storm_id[:2],
        "systemType": system_type,
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
    """Extract every currently active NHC or CPHC basin system eligible for guidance."""
    raw_storms = current_storms.get("activeStorms")
    if not isinstance(raw_storms, list):
        raise ValueError("CurrentStorms.json is missing a valid activeStorms list")

    storms: list[dict[str, Any]] = []
    for raw_storm in raw_storms:
        if not isinstance(raw_storm, dict):
            continue
        storm_id = normalize_storm_id(raw_storm.get("id"))
        if storm_id and storm_id[:2] in ACTIVE_BASINS:
            storms.append({**raw_storm, "systemType": "advisory"})
    return storms


def parse_directory_timestamp(raw_timestamp: str) -> datetime | None:
    """Return a UTC timestamp from an Apache-style public directory listing."""
    try:
        return datetime.strptime(raw_timestamp, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def public_invest_ids(directory_html: str, excluded_ids: set[str], generated_at: str) -> list[str]:
    """Return only recently updated official invest A-decks from the public index."""
    try:
        generated = datetime.fromisoformat(generated_at.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        raise ValueError("Invest discovery requires a valid generated timestamp")

    discovered: set[str] = set()
    for line in directory_html.splitlines():
        match = PUBLIC_ADECK_INVEST_PATTERN.search(line)
        timestamp_match = DIRECTORY_TIMESTAMP_PATTERN.search(line)
        if match is None or timestamp_match is None:
            continue
        storm_id = normalize_storm_id(match.group(1))
        modified_at = parse_directory_timestamp(timestamp_match.group(1))
        if storm_id is None or storm_id in excluded_ids or modified_at is None:
            continue
        if not INVEST_ID_PATTERN.fullmatch(storm_id):
            continue
        age = generated - modified_at
        if not timedelta(hours=-1) <= age <= MAX_INVEST_DIRECTORY_AGE:
            continue
        discovered.add(storm_id)
    return sorted(discovered)


def invest_display_name(storm_id: str) -> str:
    """Return an unambiguous public label for an official ATCF invest identifier."""
    normalized = normalize_storm_id(storm_id)
    if normalized is None or not INVEST_ID_PATTERN.fullmatch(normalized):
        raise ValueError("Invest is missing a valid ATCF identifier")
    return f"Invest {normalized[2:4]}{INVEST_BASIN_SUFFIXES[normalized[:2]]}"


def parse_cycle_timestamp(cycle: str) -> datetime | None:
    """Return a UTC datetime for an ATCF model cycle, or None when malformed."""
    if not re.fullmatch(r"\d{10}", cycle):
        return None
    try:
        return datetime.strptime(cycle, "%Y%m%d%H").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def expected_model_cycle(generated_at: str) -> str:
    """Return the current six-hour UTC model cycle expected at generation time."""
    try:
        generated = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("Model-cycle readiness requires a valid generated timestamp") from error
    if generated.tzinfo is None:
        raise ValueError("Model-cycle readiness requires a timezone-aware generated timestamp")

    generated = generated.astimezone(timezone.utc)
    completed_hours = [hour for hour in MODEL_CYCLE_HOURS if hour <= generated.hour]
    if completed_hours:
        cycle_at = generated.replace(
            hour=max(completed_hours), minute=0, second=0, microsecond=0,
        )
    else:
        cycle_at = (generated - timedelta(days=1)).replace(
            hour=MODEL_CYCLE_HOURS[-1], minute=0, second=0, microsecond=0,
        )
    return cycle_at.strftime("%Y%m%d%H")


def is_current_invest_cycle(cycle: str, generated_at: str) -> bool:
    """Require an invest guidance cycle to be fresh at artifact generation time."""
    cycle_at = parse_cycle_timestamp(cycle)
    try:
        generated = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if cycle_at is None or generated.tzinfo is None:
        return False
    age = generated.astimezone(timezone.utc) - cycle_at
    return timedelta(hours=-1) <= age <= MAX_INVEST_CYCLE_AGE


def build_payload(
    current_storms: dict[str, Any],
    adeck_fetcher: Callable[[str], str],
    generated_at: str | None = None,
    directory_fetcher: Callable[[], str] | None = None,
) -> dict[str, Any]:
    """Build the official artifact for all current advisory systems and fresh public invests."""
    active_storms = active_nhc_storms(current_storms)
    generated = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    expected_cycle = expected_model_cycle(generated)
    records: list[dict[str, Any]] = []

    # Advisory, potential tropical cyclone, and post-tropical systems present in
    # CurrentStorms.json remain strict. A source failure must preserve the last
    # verified artifact instead of publishing a partial official-storm view.
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
        record = storm_guidance_from_adeck(storm, adeck_text)
        source_cycle = str(record.get("sourceCycle") or "")
        if not record["models"] or source_cycle != expected_cycle:
            raise GuidancePending(
                "Newest complete public A-deck cycle for active storm "
                f"{storm_id} is {source_cycle or 'unavailable'}; "
                f"awaiting current {expected_cycle}"
            )
        records.append(record)

    # NHC retains historical invest files in the public directory. Each invest
    # therefore requires both a complete allowed-model cycle and a recent cycle
    # timestamp. Directory entries with no fresh, verifiable guidance are omitted.
    if directory_fetcher is not None:
        try:
            directory_html = directory_fetcher()
        except Exception as error:
            raise RuntimeError("Could not retrieve the public A-deck directory") from error
        if not isinstance(directory_html, str) or not directory_html.strip():
            raise RuntimeError("Public A-deck directory was empty")

        active_ids = {record["id"] for record in records}
        for storm_id in public_invest_ids(directory_html, active_ids, generated):
            try:
                adeck_text = adeck_fetcher(storm_id)
            except Exception as error:
                # An invest is eligible only when its own official source is
                # available now. Do not block current advisory guidance because
                # an optional invest record disappeared or is temporarily absent.
                print(f"Skipping unverifiable public invest {storm_id}: {error}", file=sys.stderr)
                continue
            if not isinstance(adeck_text, str) or not adeck_text.strip():
                continue

            invest = storm_guidance_from_adeck(
                {"id": storm_id, "name": invest_display_name(storm_id), "systemType": "invest"},
                adeck_text,
            )
            source_cycle = str(invest.get("sourceCycle") or "")
            if not invest["models"] or not is_current_invest_cycle(source_cycle, generated):
                continue
            records.append(invest)

    return {
        "generated": generated,
        "source": "NOAA National Hurricane Center ATCF public A-deck",
        "activeStormSourceUrl": CURRENT_STORMS_URL,
        "investDiscoverySourceUrl": AID_PUBLIC_DIRECTORY_URL,
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

        system_type = storm.get("systemType")
        if system_type not in {"advisory", "invest"}:
            raise ValueError("Guidance artifact storm has an invalid system type")
        if system_type == "invest" and not INVEST_ID_PATTERN.fullmatch(storm_id):
            raise ValueError("Guidance artifact invest has an invalid ATCF identifier")

        models = storm.get("models")
        if not isinstance(models, list):
            raise ValueError("Guidance artifact models must be a list")
        if not models and not isinstance(storm.get("noDataReason"), str):
            raise ValueError("Guidance artifact needs a no-data reason when models are absent")
        if models and not re.fullmatch(r"\d{10}", str(storm.get("sourceCycle") or "")):
            raise ValueError("Guidance artifact modeled storm needs a valid source cycle")
        if system_type == "invest":
            if not models:
                raise ValueError("Guidance artifact invest needs complete public guidance")
            if not is_current_invest_cycle(str(storm.get("sourceCycle") or ""), str(payload["generated"])):
                raise ValueError("Guidance artifact invest cycle is not current")

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


def fetch_public_adeck_directory() -> str:
    """Fetch the official public A-deck directory used only for invest discovery."""
    return fetch_url(AID_PUBLIC_DIRECTORY_URL, timeout=30).decode("utf-8", errors="replace")


def main() -> None:
    """Generate and atomically publish only a fully validated official artifact."""
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"NHC model guidance fetch started: {generated_at}")
    raw_current_storms = fetch_url(CURRENT_STORMS_URL, timeout=30)
    current_storms = json.loads(raw_current_storms.decode("utf-8"))
    if not isinstance(current_storms, dict):
        raise ValueError("CurrentStorms.json response is not an object")

    payload = build_payload(
        current_storms,
        fetch_adeck_text,
        generated_at,
        directory_fetcher=fetch_public_adeck_directory,
    )
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
    except GuidancePending as error:
        print(f"NHC model guidance pending: {error}", file=sys.stderr)
        sys.exit(75)
    except Exception as error:
        print(f"NHC model guidance generation failed: {error}", file=sys.stderr)
        raise
