#!/usr/bin/env python3
"""
Daily intel generator for WeatherStream MVP.
Fetches live weather from Open-Meteo for each region's representative port,
then calls Groq to write a fresh James Van Fleet-style intel briefing.
Outputs intel.json to stdout (captured by GitHub Actions and committed to gh-pages).
"""

import argparse
import json
import os
import subprocess as _subprocess
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

# Sandbox TLS workaround: api.open-meteo.com (188.40.99.226) drops TLS connections
# in this environment. subprocess curl with --retry-all-errors is the only reliable
# transport. All Open-Meteo fetches use this helper instead of urllib.
def _curl_fetch_json(url: str, timeout: int = 60, retries: int = 15, retry_delay: int = 2) -> dict:
    """Fetch a URL via subprocess curl and return parsed JSON.
    Uses --retry-all-errors so intermittent SSL_ERROR_SYSCALL failures are retried.
    """
    result = _subprocess.run(
        ['curl', '-s', '--max-time', str(timeout),
         '--retry', str(retries), '--retry-delay', str(retry_delay),
         '--retry-all-errors', url],
        capture_output=True, text=True
    )
    if not result.stdout.strip():
        raise RuntimeError(f"curl failed rc={result.returncode}: {result.stderr.strip()[:120]}")
    return json.loads(result.stdout)

try:
    import httpx as _httpx
    _USE_HTTPX = True
except ImportError:
    _USE_HTTPX = False

# Prefer the established Groq production path. The existing Manus-scheduled job
# can fall back to its already injected OpenAI-compatible runtime when Groq is
# unavailable, without introducing a new credential or external scheduler.
_USING_BUILTIN_RUNTIME = not os.environ.get("GROQ_API_KEY") and bool(os.environ.get("OPENAI_API_KEY"))
GROQ_API_KEY = os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
GROQ_BASE_URL = (
    os.environ.get("GROQ_BASE_URL")
    or os.environ.get("OPENAI_API_BASE")
    or "https://api.groq.com/openai/v1"
)
GROQ_MODEL = os.environ.get("GROQ_MODEL") or (
    "gpt-5-mini" if _USING_BUILTIN_RUNTIME else "openai/gpt-oss-20b"
)

# Keep serial model requests apart. July 31 showed the provider rejecting back-to-back
# requests with HTTP 429, so the rate limiter applies before every request and retry.
MODEL_REQUEST_MIN_INTERVAL_SECONDS = int(os.environ.get("INTEL_MODEL_REQUEST_INTERVAL_SECONDS", "15"))
_LAST_GROQ_REQUEST_AT = 0.0

REGIONS = [
    {
        "slug": "us-ports",
        "name": "US Ports",
        "rep_port": "Miami, Florida",
        "lat": 25.76,
        "lon": -80.19,
        "ports": ["Miami", "Port Everglades", "Port Canaveral", "Tampa Bay", "Jacksonville", "Galveston", "New Orleans", "Houston", "Bayonne", "Brooklyn", "Manhattan", "Baltimore", "Boston", "Norfolk", "Charleston", "Savannah", "Philadelphia", "Long Beach", "Los Angeles", "San Diego", "San Francisco"],
        "alert_points": [
            {"name": "Miami", "lat": 25.7753, "lon": -80.1698},
            {"name": "Port Everglades", "lat": 26.0833, "lon": -80.1167},
            {"name": "Port Canaveral", "lat": 28.4083, "lon": -80.6167},
            {"name": "Tampa Bay", "lat": 27.9333, "lon": -82.4500},
            {"name": "Jacksonville", "lat": 30.3322, "lon": -81.6557},
            {"name": "Charleston", "lat": 32.7765, "lon": -79.9311},
            {"name": "Savannah", "lat": 32.0835, "lon": -81.0998},
            {"name": "Norfolk", "lat": 36.8468, "lon": -76.2951},
            {"name": "Baltimore", "lat": 39.2904, "lon": -76.6122},
            {"name": "Philadelphia", "lat": 39.9077, "lon": -75.1389},
            {"name": "Manhattan", "lat": 40.7680, "lon": -74.0020},
            {"name": "Brooklyn", "lat": 40.6782, "lon": -74.0060},
            {"name": "Bayonne", "lat": 40.6668, "lon": -74.1143},
            {"name": "Boston", "lat": 42.3601, "lon": -71.0589},
            {"name": "New Orleans", "lat": 29.9511, "lon": -90.0715},
            {"name": "Galveston", "lat": 29.3013, "lon": -94.7977},
            {"name": "Houston", "lat": 29.7355, "lon": -95.0089},
            {"name": "Los Angeles", "lat": 33.7361, "lon": -118.2922},
            {"name": "Long Beach", "lat": 33.7701, "lon": -118.1937},
            {"name": "San Diego", "lat": 32.7157, "lon": -117.1611},
            {"name": "San Francisco", "lat": 37.8044, "lon": -122.4079},
        ],
        "priority_note": "PORT PRIORITY DIRECTIVE (do not quote any of this in your output): open the briefing by addressing conditions at Miami. The lead port priority order for this region is: Miami, then Port Everglades, then Port Canaveral, then Tampa Bay. Other US ports may be referenced only when their conditions are operationally significant for cruise operations, and never as the opening sentence.",
        "required_lead_port": "Miami",
        "nws_states": ["FL", "TX", "LA", "NJ", "NY", "MD", "MA", "VA", "SC", "GA", "CA"],
    },
    {
        "slug": "bahamas-central-caribbean",
        "name": "Bahamas and Central Caribbean",
        "rep_port": "Nassau, Bahamas",
        "lat": 25.04,
        "lon": -77.35,
        "ports": ["Nassau", "Freeport", "Bimini", "Berry Islands", "Key West", "Grand Cayman", "Ocho Rios", "Falmouth", "Puerto Plata", "La Romana", "Santo Domingo", "Samaná"],
    },
    {
        "slug": "eastern-caribbean",
        "name": "Eastern Caribbean",
        "rep_port": "San Juan, Puerto Rico",
        "lat": 18.47,
        "lon": -66.12,
        "ports": ["San Juan", "St. Thomas", "St. Croix", "St. Maarten", "St. Kitts", "Antigua"],
        "nws_states": ["PR", "VI"],
    },
    {
        "slug": "western-caribbean",
        "name": "Western Caribbean",
        "rep_port": "Cozumel, Mexico",
        "lat": 20.51,
        "lon": -86.95,
        "ports": ["Cozumel", "Costa Maya", "Roatan", "Belize City"],
    },
    {
        "slug": "southern-caribbean",
        "name": "Southern Caribbean",
        "rep_port": "Aruba",
        "lat": 12.52,
        "lon": -70.03,
        "ports": ["Aruba", "Curacao", "Bonaire", "Cartagena"],
    },
    {
        "slug": "lesser-antilles",
        "name": "Lesser Antilles",
        "rep_port": "Barbados",
        "lat": 13.10,
        "lon": -59.62,
        "ports": ["Barbados", "St. Lucia", "Martinique", "Dominica", "Antigua", "St. Kitts", "St. Maarten", "St. Vincent", "Grenada"],
    },
    {
        "slug": "eastern-pacific",
        "name": "Eastern Pacific",
        "rep_port": "Cabo San Lucas, Mexico",
        "lat": 22.89,
        "lon": -109.91,
        "ports": ["Cabo San Lucas", "Ensenada", "Huatulco", "Manzanillo", "Mazatlan", "Puerto Vallarta"],
    },
    {
        "slug": "los-angeles",
        "name": "Los Angeles",
        "rep_port": "Los Angeles / San Pedro",
        "lat": 33.73,
        "lon": -118.26,
        "ports": ["Los Angeles / San Pedro", "Long Beach", "Marina del Rey", "Catalina Island"],
    },
    {
        "slug": "ensenada",
        "name": "Ensenada",
        "rep_port": "Ensenada, Mexico",
        "lat": 31.87,
        "lon": -116.60,
        "ports": ["Ensenada", "Punta Banda", "Islas Todos Santos"],
    },
    {
        "slug": "cabo-san-lucas",
        "name": "Cabo San Lucas",
        "rep_port": "Cabo San Lucas, Mexico",
        "lat": 22.89,
        "lon": -109.91,
        "ports": ["Cabo San Lucas", "San Jose del Cabo", "La Paz"],
    },
    {
        "slug": "mazatlan",
        "name": "Mazatlan",
        "rep_port": "Mazatlan, Mexico",
        "lat": 23.22,
        "lon": -106.42,
        "ports": ["Mazatlan", "Topolobampo", "Altata"],
    },
    {
        "slug": "puerto-vallarta",
        "name": "Puerto Vallarta",
        "rep_port": "Puerto Vallarta, Mexico",
        "lat": 20.65,
        "lon": -105.22,
        "ports": ["Puerto Vallarta", "Punta Mita", "Yelapa", "Chacala"],
    },
    {
        "slug": "western-mediterranean",
        "name": "Western Mediterranean",
        "rep_port": "Barcelona, Spain",
        "lat": 41.38,
        "lon": 2.18,
        "ports": ["Barcelona", "Valencia", "Palma de Mallorca", "Ibiza", "Malaga", "Cadiz", "Lisbon", "Gibraltar"],
    },
    {
        "slug": "central-mediterranean",
        "name": "Central Mediterranean",
        "rep_port": "Naples, Italy",
        "lat": 40.85,
        "lon": 14.27,
        "ports": ["Marseille", "Nice", "Monaco", "Genoa", "La Spezia", "Livorno", "Civitavecchia", "Naples", "Sardinia", "Corsica", "Split", "Dubrovnik", "Venice"],
    },
    {
        "slug": "eastern-mediterranean",
        "name": "Eastern Mediterranean",
        "rep_port": "Athens (Piraeus), Greece",
        "lat": 37.94,
        "lon": 23.64,
        "ports": ["Athens/Piraeus", "Santorini", "Mykonos", "Rhodes", "Corfu", "Istanbul", "Izmir", "Cyprus", "Haifa", "Alexandria"],
    },
    {
        "slug": "southeast-alaska",
        "name": "Alaska",
        "rep_port": "Juneau, Alaska",
        "lat": 58.30,
        "lon": -134.42,
        "ports": ["Juneau", "Ketchikan", "Skagway", "Sitka", "Haines", "Icy Strait Point", "Anchorage", "Seattle", "Vancouver", "Victoria"],
        "priority_note": "PORT PRIORITY FOR ALASKA REGION: Juneau, Ketchikan, and Skagway are the three highest-volume Alaska cruise ports and must be named first and addressed prominently. Sitka, Haines, Icy Strait Point, and Anchorage may be mentioned when conditions are operationally significant. Seattle is the primary embarkation port and must be addressed when embarkation-day weather is notable. CRITICAL ALASKA RULE: You are ABSOLUTELY FORBIDDEN from making any climatological, seasonal, or typical-weather statements about Alaska. Do NOT write anything about what Alaska weather is usually like, what the Inside Passage typically experiences, what season offers the best conditions, or any general geographic or climate description. Every single sentence must be based exclusively on the live forecast data provided. Do not mention ice conditions, bergy bits, or glacier navigation unless the live forecast data specifically supports an operational concern.",
        "nws_states": ["AK", "WA"],
    },
]


def fetch_nws_advisories(region: dict) -> list:
    """
    Fetch active heat and cold advisories from the NWS API for the region's states.
    Only returns alerts whose areaDesc matches one of the region's ports.
    """
    states = region.get("nws_states")
    if not states:
        return []

    NWS_HEADERS = {"User-Agent": "mycruisingweather.com/1.0 james@mycruisingweather.com"}
    events = "Excessive%20Heat%20Warning,Heat%20Advisory,Excessive%20Heat%20Watch,Extreme%20Cold%20Warning,Wind%20Chill%20Warning,Wind%20Chill%20Advisory"
    
    advisories = []
    for state in states:
        url = f"https://api.weather.gov/alerts/active?area={state}&event={events}"
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers=NWS_HEADERS)
                with urllib.request.urlopen(req, timeout=15) as r:
                    data = json.loads(r.read())
                
                for feat in data.get("features", []):
                    props = feat.get("properties", {})
                    area = props.get("areaDesc", "")
                    
                    # Check if any of our ports are in this alert's area
                    # (Simple substring match is usually sufficient for NWS county/zone names)
                    affected_ports = []
                    for port in region["ports"]:
                        # NWS often uses "Miami Dade" instead of just "Miami", "San Juan", etc.
                        search_port = port.split(",")[0].split("/")[0].strip()
                        if search_port.lower() in area.lower() or (search_port == "Miami" and "Miami" in area):
                            affected_ports.append(search_port)
                            
                    if affected_ports:
                        event = props.get("event")
                        # Include the max temperature/heat index from the description if present
                        desc = props.get("description", "")
                        temp_context = ""
                        import re
                        # Look for "up to X" or "around X" or "exceed X" in the description
                        m = re.search(r'(?:heat indic(?:es|ex)|temperatures).*?(?:up to|around|exceed|near|of)\s*(\d{2,3})', desc, re.IGNORECASE)
                        if m:
                            temp_context = f" with values near {m.group(1)}F"
                        
                        port_str = ", ".join(affected_ports)
                        advisories.append(f"{event} active for {port_str}{temp_context}.")
                break # Success, move to next state
            except Exception as e:
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
                else:
                    print(f"  NWS alerts fetch failed for {state}: {e}", file=sys.stderr)
                    
    # Deduplicate: for the same port + event type, keep only the entry with the
    # highest numeric value (e.g., if two zones both flag LA, keep the higher heat index).
    import re as _re
    deduped = {}
    for adv in advisories:
        # Key: event type + port name (strip the numeric value for comparison)
        key = _re.sub(r'\s+with values near \d+F', '', adv)
        # Extract numeric value if present
        m = _re.search(r'with values near (\d+)F', adv)
        val = int(m.group(1)) if m else 0
        if key not in deduped or val > deduped[key][1]:
            deduped[key] = (adv, val)
    return [v[0] for v in deduped.values()]


US_PORT_HEAT_EVENTS = {
    "Heat Advisory",
    "Extreme Heat Warning",
    "Extreme Heat Watch",
}


def _fetch_nws_json(url: str) -> dict:
    """Fetch one NWS API response with the required contact header and bounded retries."""
    headers = {"User-Agent": "mycruisingweather.com/1.0 james@mycruisingweather.com"}
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                return json.loads(response.read())
        except Exception:
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
            else:
                raise
    raise RuntimeError("NWS request failed after 3 attempts")


def _extract_heat_value(event: str, description: str) -> tuple:
    """Extract the port-relevant NWS heat-index or temperature hazard value."""
    import re

    normalized = re.sub(r"\s+", " ", description or "").strip()
    sentences = re.split(r"(?<=[.!?])\s+", normalized)
    heat_index_sentences = [
        sentence for sentence in sentences
        if re.search(r"\b(?:heat\s+index|heat\s+indices)\b", sentence, re.IGNORECASE)
    ]
    heat_index_values = [
        int(value)
        for sentence in heat_index_sentences
        for value in re.findall(r"(?<!\d)(\d{2,3})(?!\d)", sentence)
        if 80 <= int(value) <= 140
    ]
    if heat_index_values:
        return max(heat_index_values), "heat index values"

    temperature_sentences = [
        sentence for sentence in sentences
        if re.search(r"\btemperatures?\b", sentence, re.IGNORECASE)
    ]
    coastal_values = []
    temperature_values = []
    for sentence in temperature_sentences:
        ranges = list(re.finditer(r"(?<!\d)(\d{2,3})\s*(?:to|-)\s*(\d{2,3})(?!\d)", sentence))
        for match in ranges:
            low, high = int(match.group(1)), int(match.group(2))
            if 80 <= low <= 140 and 80 <= high <= 140:
                temperature_values.extend((low, high))
        for pattern in (
            r"(?<!\d)(\d{2,3})\s*(?:to|-)\s*(\d{2,3})\s+(?:degrees\s+)?(?:near|along|at)\s+(?:the\s+)?(?:coast|shore)",
            r"(?:near|along|at)\s+(?:the\s+)?(?:coast|shore)\D{0,40}(\d{2,3})\s*(?:to|-)\s*(\d{2,3})(?!\d)",
        ):
            for match in re.finditer(pattern, sentence, re.IGNORECASE):
                low, high = int(match.group(1)), int(match.group(2))
                if 80 <= low <= 140 and 80 <= high <= 140:
                    coastal_values.extend((low, high))
        if not ranges:
            temperature_values.extend(
                int(value)
                for value in re.findall(r"(?<!\d)(\d{2,3})(?!\d)", sentence)
                if 80 <= int(value) <= 140
            )

    values = coastal_values or temperature_values
    if values:
        return max(values), "temperatures"
    raise ValueError(f"No required heat hazard value found in active {event}")


def fetch_us_port_heat_advisories(region: dict) -> list:
    """Fetch active heat alerts at every displayed US port coordinate."""
    alert_groups = {}
    for port in region.get("alert_points", []):
        url = f"https://api.weather.gov/alerts/active?point={port['lat']},{port['lon']}"
        data = _fetch_nws_json(url)
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            event = props.get("event", "")
            if event not in US_PORT_HEAT_EVENTS:
                continue
            value_f, value_label = _extract_heat_value(event, props.get("description", ""))
            alert_id = feature.get("id") or props.get("id") or f"{event}:{value_label}:{value_f}"
            key = (alert_id, event, value_label, value_f)
            group = alert_groups.setdefault(
                key,
                {
                    "event": event,
                    "value_f": value_f,
                    "value_label": value_label,
                    "ports": [],
                },
            )
            if port["name"] not in group["ports"]:
                group["ports"].append(port["name"])

    return list(alert_groups.values())


def render_us_port_heat_advisory_lead(alerts: list) -> str:
    """Render each active NWS heat-alert product once with compact port/value entries."""
    if not alerts:
        return ""

    def natural_join(items: list) -> str:
        if len(items) == 1:
            return items[0]
        if len(items) == 2:
            return f"{items[0]} and {items[1]}"
        return f"{', '.join(items[:-1])}, and {items[-1]}"

    by_event = {}
    for alert in alerts:
        event = alert["event"]
        ports = natural_join(alert["ports"])
        value_f = alert["value_f"]
        value_label = "heat index" if alert["value_label"] == "heat index values" else "temperature"
        by_event.setdefault(event, []).append(
            f"{ports} ({value_label} up to {value_f}°F)"
        )

    event_order = ["Heat Advisory", "Extreme Heat Watch", "Extreme Heat Warning"]
    ordered_events = [event for event in event_order if event in by_event]
    ordered_events.extend(event for event in by_event if event not in ordered_events)
    clauses = [
        f"{event} in effect for {natural_join(by_event[event])}"
        for event in ordered_events
    ]
    return "; ".join(clauses) + "."


def strip_us_port_heat_claims(text: str) -> str:
    """Remove model-authored heat-alert claims before deterministic assembly."""
    import re

    alert_terms = re.compile(
        r"\b(?:Heat Advisory|Extreme Heat Warning|Extreme Heat Watch|heat index|heat indices)\b",
        re.IGNORECASE,
    )
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    clean = [sentence for sentence in sentences if not alert_terms.search(sentence)]
    return " ".join(clean).strip()


def prepend_us_port_advisory_lead(intel: str, advisory_lead: str) -> str:
    """Insert deterministic advisory facts after the required Miami opening sentence."""
    import re

    parts = re.split(r"(?<=[.!?])\s+", intel.strip(), maxsplit=1)
    if not parts or "miami" not in parts[0].lower():
        raise ValueError("US Ports model narrative lost the required Miami opening sentence")
    if not advisory_lead:
        return intel
    body = parts[1] if len(parts) > 1 else ""
    return " ".join(part for part in (parts[0], advisory_lead, body) if part).strip()


def fetch_weather(lat: float, lon: float) -> dict:
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode,precipitation_probability"
        f"&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,wind_speed_10m_max,wind_direction_10m_dominant,"
        f"precipitation_probability_max,weathercode"
        f"&hourly=precipitation_probability"
        f"&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=3"
    )
    # Use subprocess curl which reliably handles the TLS environment
    try:
        return _curl_fetch_json(url, timeout=60, retries=15, retry_delay=2)
    except Exception as e:
        raise RuntimeError(f"Open-Meteo fetch failed: {e}") from e


def fetch_precip_probability(lat: float, lon: float) -> list:
    """
    Fetch standard Probability of Precipitation (PoP) values from Open-Meteo
    using the default best_match model (GFS/ICON blend).
    This is a SEPARATE call from fetch_weather() which uses ecmwf_ifs025 for all
    other parameters. The ECMWF IFS025 precipitation_probability field is an
    ensemble-spread metric, not a standard PoP, and systematically overstates
    rain chances in humid tropical/subtropical climates. The best_match model
    provides standard PoP values consistent with NWS and professional tools.
    Returns a list of daily mean PoP values (one per forecast day, up to 3 days).
    """
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&daily=precipitation_probability_max"
        f"&hourly=precipitation_probability"
        f"&timezone=auto&forecast_days=3"
    )
    try:
        data = _curl_fetch_json(url, timeout=60, retries=15, retry_delay=2)
    except Exception as e:
        print(f"  PoP fetch failed ({e}) -- falling back to empty", file=sys.stderr)
        return []
    # Compute daily mean from hourly values (same logic as _compute_daily_mean_precip_prob)
    hourly_probs = data.get("hourly", {}).get("precipitation_probability", [])
    daily_times = data.get("daily", {}).get("time", [])
    daily_max = data.get("daily", {}).get("precipitation_probability_max", [])
    daily_means = []
    for day_idx in range(len(daily_times)):
        start = day_idx * 24
        end = start + 24
        day_probs = [p for p in hourly_probs[start:end] if p is not None]
        if day_probs:
            daily_means.append(round(sum(day_probs) / len(day_probs)))
        else:
            daily_means.append(daily_max[day_idx] or 0)
    return daily_means


def _parse_nws_afd_pop_row(product_text: str, aliases: tuple[str, ...]) -> list[int]:
    """Return alternating day/night PoPs from one explicit AFD point-table row."""
    import re

    marker = ".PRELIMINARY POINT TEMPS/POPS"
    marker_index = product_text.upper().find(marker)
    if marker_index < 0:
        return []

    section = product_text[marker_index:].split("&&", 1)[0]
    for line in section.splitlines()[1:]:
        if "/" not in line:
            continue
        for alias in aliases:
            if not re.match(rf"^\s*{re.escape(alias)}\s+", line, re.IGNORECASE):
                continue
            pop_values = [int(value) for value in re.findall(r"\d{1,3}", line.split("/", 1)[1])]
            if pop_values and all(0 <= value <= 100 for value in pop_values):
                return pop_values
    return []


def _align_afd_pop_sequence_to_daytime(pop_values: list[int], issued_local_hour: int) -> list[int]:
    """Remove an afternoon discussion's leading nighttime PoP before day/night slicing."""
    if issued_local_hour >= 12:
        return pop_values[1:]
    return pop_values


def _latest_same_day_afd_pop(office: str, aliases: tuple[str, ...], local_timezone: str) -> list[int]:
    """Fetch the latest same-local-day AFD and return one validated city-row PoP sequence."""
    index = _fetch_nws_json(f"https://api.weather.gov/products/types/AFD/locations/{office}")
    products = index.get("@graph", [])
    if not products:
        return []

    latest = max(products, key=lambda item: item.get("issuanceTime", ""))
    issuance = latest.get("issuanceTime")
    if not issuance:
        return []
    issued_local = datetime.fromisoformat(issuance.replace("Z", "+00:00")).astimezone(
        ZoneInfo(local_timezone)
    )
    if issued_local.date() != datetime.now(ZoneInfo(local_timezone)).date():
        return []

    product_id = latest.get("id") or str(latest.get("@id", "")).rstrip("/").split("/")[-1]
    if not product_id:
        return []
    product = _fetch_nws_json(f"https://api.weather.gov/products/{product_id}")
    pop_values = _parse_nws_afd_pop_row(product.get("productText", ""), aliases)
    return _align_afd_pop_sequence_to_daytime(pop_values, issued_local.hour)


def _nws_daytime_point_pops(forecast_url: str, limit: int = 3) -> list[int]:
    """Return official daytime PoPs from the exact NWS point forecast."""
    forecast = _fetch_nws_json(forecast_url)
    values = []
    for period in forecast.get("properties", {}).get("periods", []):
        if not period.get("isDaytime"):
            continue
        value = period.get("probabilityOfPrecipitation", {}).get("value")
        if value is None:
            continue
        numeric = int(round(float(value)))
        if 0 <= numeric <= 100:
            values.append(numeric)
        if len(values) >= limit:
            break
    return values


def _nws_daytime_grid_pops(
    grid_url: str,
    local_timezone: str,
    limit: int = 3,
) -> list[int]:
    """Return daily maximum daytime PoPs from the exact NWS grid point."""
    grid = _fetch_nws_json(grid_url)
    timezone = ZoneInfo(local_timezone)
    today = datetime.now(timezone).date()
    daily_values: dict = {}

    for interval in (
        grid.get("properties", {})
        .get("probabilityOfPrecipitation", {})
        .get("values", [])
    ):
        valid_time = interval.get("validTime", "")
        value = interval.get("value")
        if not valid_time or value is None:
            continue
        start = datetime.fromisoformat(
            valid_time.split("/", 1)[0].replace("Z", "+00:00")
        ).astimezone(timezone)
        if start.date() < today or not 6 <= start.hour < 18:
            continue
        numeric = int(round(float(value)))
        if not 0 <= numeric <= 100:
            continue
        daily_values[start.date()] = max(daily_values.get(start.date(), 0), numeric)

    return [daily_values[day] for day in sorted(daily_values)[:limit]]


def fetch_us_port_daily_pop(region: dict) -> list[int]:
    """Fetch Miami's official NWS day PoPs for the US Ports regional briefing."""
    point = _fetch_nws_json(
        f"https://api.weather.gov/points/{region['lat']},{region['lon']}"
    )
    properties = point.get("properties", {})
    office = properties.get("gridId")
    forecast_url = properties.get("forecast")
    grid_url = properties.get("forecastGridData")
    local_timezone = properties.get("timeZone") or "America/New_York"
    if not office or not forecast_url:
        raise RuntimeError("NWS point metadata is missing the forecast office or point forecast URL")

    try:
        point_pops = _nws_daytime_point_pops(forecast_url, limit=3)
    except Exception as error:
        if not grid_url:
            raise
        print(
            f"  NWS point forecast unavailable; using exact grid fallback: {error}",
            file=sys.stderr,
        )
        point_pops = _nws_daytime_grid_pops(
            grid_url,
            local_timezone,
            limit=3,
        )
    afd_pops = _latest_same_day_afd_pop(office, ("Miami",), local_timezone)
    afd_daytime = afd_pops[0::2]

    daily_pops = []
    for day_index in range(3):
        if day_index < len(afd_daytime):
            daily_pops.append(afd_daytime[day_index])
        elif day_index < len(point_pops):
            daily_pops.append(point_pops[day_index])

    if len(daily_pops) < 3:
        raise RuntimeError(
            f"NWS US Ports PoP chain returned only {len(daily_pops)}/3 daytime periods"
        )
    print(
        f"  US Ports NWS PoP: office={office}, AFD day values={afd_daytime}, "
        f"point fallback values={point_pops}, selected={daily_pops}",
        file=sys.stderr,
    )
    return daily_pops


def fetch_region_precip_probability(region: dict) -> list:
    """Route only US Ports to NWS while preserving every other region's current source."""
    if region.get("slug") == "us-ports":
        return fetch_us_port_daily_pop(region)
    return fetch_precip_probability(region["lat"], region["lon"])


def ms_to_kt(ms: float) -> int:
    return round(ms * 1.94384)


def c_to_f(c: float) -> int:
    return round(c * 9 / 5 + 32)


def deg_to_compass(deg: float) -> str:
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"]
    return dirs[round(deg / 22.5) % 16]


def wmo_to_text(code: int) -> str:
    if code == 0: return "clear skies"
    if code <= 2: return "partly cloudy"
    if code == 3: return "overcast"
    if code <= 49: return "foggy"
    if code <= 59: return "drizzle"
    if code <= 69: return "rain"
    if code <= 79: return "snow"
    if code <= 82: return "rain showers"
    if code <= 99: return "thunderstorms"
    return "mixed conditions"


def _format_rain_prob(value) -> str:
    """
    Render a precipitation-probability value as a human-readable phrase.
    Bug 2 fix: Any value strictly less than 10% is rendered as the fixed phrase
    'less than 10% rain probability', because tiny single-digit percentages are
    not meaningful to a passenger or operations audience and create credibility
    damage on the rare day when an isolated cell does move through despite a
    low published number. Values of 10% or higher render as the literal
    integer percentage.
    """
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = 0
    if v < 10:
        return "less than 10% rain probability"
    return f"{v}% rain probability"


def _compute_daily_mean_precip_prob(wx: dict) -> list:
    """
    Compute the daily mean of hourly precipitation_probability for each forecast day.
    This gives a representative daily rain chance that aligns with professional forecasts
    (e.g., NWS), instead of the misleading peak-hour max which systematically overstates
    rain chances in convective climates.
    Returns a list of mean probabilities (one per forecast day).
    """
    hourly_probs = wx.get("hourly", {}).get("precipitation_probability", [])
    num_days = len(wx.get("daily", {}).get("time", []))
    daily_means = []
    for day_idx in range(num_days):
        start = day_idx * 24
        end = start + 24
        day_probs = [p for p in hourly_probs[start:end] if p is not None]
        if day_probs:
            daily_means.append(round(sum(day_probs) / len(day_probs)))
        else:
            # Fallback to daily max if hourly data is missing
            daily_means.append(wx["daily"]["precipitation_probability_max"][day_idx] or 0)
    return daily_means


def build_weather_summary(wx: dict, pop_means: list = None, advisories: list = None, include_apparent_heat: bool = True) -> dict:
    """
    Build a structured weather data dict for the AI prompt.
    IMPORTANT: Temperature values are intentionally excluded from this summary.
    The AI briefing must never mention current or forecast temperatures -- they
    date the briefing and erode credibility. Wind, sky condition, sea state, and
    rain probability are the only parameters passed to the AI.
    pop_means: list of daily mean PoP values from fetch_precip_probability().
    If provided, these are used instead of the ECMWF precipitation_probability
    field (which is an ensemble-spread metric, not a standard PoP).
    Returns a dict with 'summary' (string for prompt) and 'significant'
    (list of alert strings for conditions meeting significance thresholds).
    """
    c = wx["current"]
    d = wx["daily"]
    # Use the separately fetched standard PoP values if available.
    # Fall back to the ECMWF hourly mean only if the separate call failed.
    if pop_means:
        daily_rain_means = pop_means
    else:
        daily_rain_means = _compute_daily_mean_precip_prob(wx)

    # Temperature is fetched but deliberately NOT included in the summary string
    wind_kt = ms_to_kt(c["wind_speed_10m"])
    wind_dir = deg_to_compass(c["wind_direction_10m"])
    cond = wmo_to_text(c["weathercode"])
    # Use the daily mean for today instead of the current-hour snapshot
    rain = daily_rain_means[0] if daily_rain_means else (c.get("precipitation_probability", 0) or 0)
    rain_phrase = _format_rain_prob(rain)

    # 3-day outlook -- wind, sky condition, and rain probability only (no temperatures)
    outlook_parts = []
    for i in range(min(3, len(d["time"]))):
        w_kt = ms_to_kt(d["wind_speed_10m_max"][i])
        w_dir = deg_to_compass(d["wind_direction_10m_dominant"][i])
        r = daily_rain_means[i] if i < len(daily_rain_means) else (d["precipitation_probability_max"][i] or 0)
        cond_d = wmo_to_text(d["weathercode"][i])
        outlook_parts.append(f"Day {i+1}: {w_dir} {w_kt}kt, {cond_d}, {_format_rain_prob(r)}")

    summary = (
        f"Current conditions: {wind_dir} {wind_kt}kt, {cond}, {rain_phrase}. "
        f"3-day outlook: {'; '.join(outlook_parts)}."
    )

    # Significant weather flags -- conditions that MUST lead the briefing
    significant = []
    
    # Add NWS heat/cold advisories
    if advisories:
        for adv in advisories:
            significant.append(f"ACTIVE ADVISORY: {adv}")
            
    # Fallback for international ports without NWS coverage: calculate heat index equivalent
    # Only if we didn't already flag heat from NWS
    has_heat_advisory = any("heat" in a.lower() for a in (advisories or []))
    if include_apparent_heat and not has_heat_advisory and "apparent_temperature_max" in d:
        for i in range(min(3, len(d["time"]))):
            app_temp_c = d["apparent_temperature_max"][i]
            if app_temp_c is not None:
                app_temp_f = c_to_f(app_temp_c)
                day_label = "today" if i == 0 else f"Day {i+1}"
                if app_temp_f >= 105:
                    significant.append(f"EXCESSIVE HEAT {day_label.upper()}: Heat Index reaching {app_temp_f}F")
                elif app_temp_f >= 100:
                    significant.append(f"ELEVATED HEAT {day_label.upper()}: Heat Index reaching {app_temp_f}F")
                    
    if c["weathercode"] >= 80 and rain >= 30:  # rain showers or thunderstorms -- only flag when rain probability >= 30%
        significant.append(f"ACTIVE SIGNIFICANT WEATHER NOW: {cond} with {rain_phrase}")
    if wind_kt >= 20:
        significant.append(f"ELEVATED WINDS NOW: {wind_dir} {wind_kt}kt")
    for i in range(min(3, len(d["time"]))):
        w_kt = ms_to_kt(d["wind_speed_10m_max"][i])
        r = daily_rain_means[i] if i < len(daily_rain_means) else (d["precipitation_probability_max"][i] or 0)
        cond_d = wmo_to_text(d["weathercode"][i])
        day_label = "today" if i == 0 else f"Day {i+1}"
        if d["weathercode"][i] >= 80 and r >= 30:  # only flag thunderstorm/shower conditions when rain probability >= 30%
            significant.append(f"SIGNIFICANT WEATHER {day_label.upper()}: {cond_d}, {_format_rain_prob(r)}")
        elif r >= 40:
            significant.append(f"ELEVATED RAIN CHANCE {day_label.upper()}: {_format_rain_prob(r)}, {cond_d}")
        if w_kt >= 20:
            significant.append(f"ELEVATED WINDS {day_label.upper()}: {w_kt}kt")

    return {"summary": summary, "significant": significant}


def call_groq(region: dict, weather_data: dict, retry_prefix: str = "") -> str:
    today = date.today().strftime("%B %d, %Y")
    ports_list = ", ".join(region["ports"])
    weather_summary = weather_data["summary"]
    significant = weather_data["significant"]

    # Build the significant weather lead block if any flags were raised
    if significant:
        sig_block = (
            f"PRIORITY ALERT -- THE FOLLOWING SIGNIFICANT WEATHER CONDITIONS ARE ACTIVE OR FORECAST. "
            f"YOU MUST LEAD THE BRIEFING WITH THESE CONDITIONS AND NAME THE SPECIFIC PORTS MOST AFFECTED: "
            + " | ".join(significant) + " "
        )
    else:
        sig_block = ""

    extreme_terms = (
        "hurricane warning",
        "major hurricane",
        "tornado warning",
        "tornado outbreak",
        "extreme wind warning",
    )
    extreme_severe_weather = any(
        term in item.lower()
        for item in significant
        for term in extreme_terms
    )
    if extreme_severe_weather:
        brevity_rule = (
            "EXTREME SEVERE WEATHER EXCEPTION: the live data contains a hurricane, tornado, "
            "or equivalent extreme threat, so use no more than two short paragraphs, six concise "
            "sentences, and 220 words. "
        )
    elif region["slug"] == "us-ports":
        brevity_rule = (
            "NORMAL DAILY BREVITY REQUIREMENT: write one compact paragraph with exactly two concise "
            "narrative sentences and no more than 85 words. A deterministic alert summary will be "
            "inserted separately, so do not repeat or paraphrase any heat alert. Combine the 24-48 hour "
            "and beyond-48-hour outlook in the second sentence. "
        )
    else:
        brevity_rule = (
            "NORMAL DAILY BREVITY REQUIREMENT: write one compact paragraph with exactly three concise "
            "sentences and no more than 110 words. Name each official heat-alert product only once; if an "
            "official advisory, watch, or warning must be referenced again, call it 'the alert'. Never call "
            "elevated heat an alert unless the live data explicitly names an official alert product. Do not "
            "repeat the same hazard or operational impact. "
        )

    # LEAD-PORT HEADER: For regions that declare a required_lead_port, prepend a hard
    # rule as the very first content of the prompt. Models weigh the opening tokens of
    # a prompt heaviest, so this placement materially improves instruction-following on
    # weaker instruction-following models (e.g., llama-3.3-70b-versatile) compared with
    # placing the same rule deeper in the prompt body.
    required_lead = region.get("required_lead_port")
    if required_lead:
        lead_header = (
            f"ABSOLUTE LEAD-PORT DIRECTIVE (do not quote any of this in your output): "
            f"begin the briefing by addressing conditions at {required_lead}. "
            f"You may not begin with any other port. If you cannot honor this directive the "
            f"output will be rejected and regenerated. "
        )
    else:
        lead_header = ""

    prompt = (
        f"{retry_prefix}"
        f"{lead_header}"
        f"You are a professional Chief Meteorologist with 30+ years of cruise industry experience. "
        f"Write a daily weather intel briefing for cruise passengers and crew in the {region['name']} region "
        f"(ports: {ports_list}) for {today}. "
        f"{region.get('priority_note', '') + ' ' if region.get('priority_note') else ''}"
        f"{('LEAD SENTENCE DIRECTIVE (do not quote any of this in your output): open with conditions at Miami. Do not open with Charleston, Savannah, Baltimore, Boston, Norfolk, Brooklyn, Bayonne, Manhattan, Houston, Galveston, New Orleans, Jacksonville, Long Beach, Los Angeles, San Diego, or San Francisco. ') if region['slug'] == 'us-ports' else ''}"
        f"{sig_block}"
        f"Base every sentence on this live forecast data for {region['rep_port']}: {weather_summary} "
        f"STRUCTURE REQUIREMENT: The briefing must address three time periods in order -- "
        f"(1) what is happening today and its impact on port operations and shore excursions, "
        f"(2) what to expect in the next 24-48 hours and which specific ports will be affected, "
        f"(3) any developing trends or changes beyond 48 hours that cruise passengers should know about. "
        f"{brevity_rule}Start with 'Today'. Output only the finished prose paragraph with no title, heading, date line, markdown, bullets, labels, or introductory text. Use a direct, professional third-person operational voice -- write as a meteorologist describing conditions objectively. NEVER use first-person pronouns: do not write 'I', 'I am', 'I will', 'I have', 'I am monitoring', 'I am tracking', 'I am issuing', 'I am advising', 'I am flagging', or any other first-person construction. "
        f"ABSOLUTE RULES: "
        f"Every sentence must reference a specific data point from the live forecast (wind speed/direction, rain probability, sky condition). "
        f"You are FORBIDDEN from making any general, climatological, or typical-weather statements. "
        f"Do NOT write anything like 'the Bahamas typically sees trade winds' or 'cold fronts can bring NW winds' or any statement about what weather is usually like. "
        f"Only describe what the data says is happening or forecast for the next 3 days. "
        f"Name specific ports when describing impacts. "
        f"This briefing is exclusively for cruise passengers and cruise vessels. Do NOT mention fishing captains, fishing boats, charter captains, charter vessels, yachts, or any non-cruise marine activity. Focus only on: port conditions, embarkation/disembarkation weather, shore excursion impacts, and cruise ship operations. "
        f"Do not use em dashes. Do not mention the data source. "
        f"ABSOLUTE RULE -- TEMPERATURES: You must NEVER include general temperature values (e.g., 'highs in the 80s', 'warm at 80 degrees', 'mild temperatures'). "
        f"EXCEPTION: If and ONLY IF the data block above explicitly flags a Heat Advisory, Excessive Heat Warning, Wind Chill Advisory, Freeze Warning, or Extreme Cold Warning, you MUST include the specific peak heat index or wind chill or extreme temperature value in the SAME sentence as the advisory mention. For example: 'A Heat Advisory is in effect with heat index values reaching 108 degrees, posing a serious risk to passengers during outdoor shore excursions.' Do NOT put the advisory label in one sentence and the temperature value in a separate sentence -- they must appear together. "
        f"If there is no heat or cold alert flagged in the data block, you must NOT mention temperatures at all. "
        f"NWS ATTRIBUTION RULE: Do NOT attribute any advisories or warnings to the National Weather Service or NWS. State the threat authoritatively as your own forecast (e.g., 'I am tracking dangerous heat indices today...'). "
        f"CRITICAL METEOROLOGICAL TERMINOLOGY RULES -- use official NWS/NHC/NOAA thresholds only: "
        f"TROPICAL CYCLONES (NHC, 1-minute sustained winds): "
        f"'Tropical Wave' = trough or cyclonic curvature in trade-wind easterlies, no closed circulation, no wind threshold. "
        f"'Tropical Disturbance' = organized convection 100-300 nmi across, persisting 24+ hours, no closed circulation required. "
        f"'Tropical Depression' = closed circulation present AND max sustained winds 33 kt (38 mph) or less. "
        f"'Tropical Storm' = max sustained winds 34-63 kt (39-73 mph). "
        f"'Hurricane' = max sustained winds 64 kt (74 mph) or more. "
        f"If conditions do not meet a threshold, use 'tropical wave', 'tropical moisture', 'tropical disturbance', or 'tropical weather system'. "
        f"MARINE WIND WARNINGS (NWS, non-tropical): "
        f"'Small Craft Advisory' = sustained winds 20-33 kt (Southern/Gulf region) or seas 7 ft or greater for more than 2 hours. "
        f"'Gale Warning' = sustained winds or frequent gusts 34-47 kt (39-54 mph). "
        f"'Storm Warning' = sustained winds or frequent gusts 48-63 kt (55-73 mph). "
        f"'Hurricane Force Wind Warning' = sustained winds or frequent gusts 64 kt (74 mph) or more, not associated with a tropical cyclone. "
        f"SEVERE THUNDERSTORM (NWS): 'Severe Thunderstorm' requires winds of at least 58 mph (50 kt) OR hail at least 1 inch in diameter OR a tornado. "
        f"'Approaching Severe' = winds 40 mph (35 kt) or greater OR hail 0.5 inch or greater. "
        f"'Severe Thunderstorm Warning' = thunderstorms with wind gusts >= 58 mph (50 kt) and/or hail >= 1 inch and/or a tornado. "
        f"'Tornado Warning' = likelihood of a tornado based on radar or actual sighting; usually accompanied by Severe Thunderstorm Warning conditions. "
        f"HURRICANE WARNING (NWS): Sustained winds >= 74 mph (>= 64 kt) (no gust criteria) associated with a hurricane expected within 36 hours. "
        f"'Extreme Wind Warning' = sustained winds 111+ mph (Category 3+ hurricane equivalent); used for eyewall approach of a major landfalling hurricane. "
        f"WINTER WEATHER (NWS): 'Blizzard Warning' = sustained winds or frequent gusts >= 35 mph AND blowing snow reducing visibility below 1/4 mile for >= 3 hours as the predominant condition. "
        f"'Ice Storm Warning' = 1/2 inch or greater accretion of freezing rain. "
        f"'Winter Weather Advisory' = multiple winter hazards below warning criteria, OR snow/sleet 3 inches in 12 hours, OR blowing snow reducing visibility to <= 1/4 mile with winds < 35 mph, OR any freezing rain accretion on roads. "
        f"SIGNIFICANT WAVE HEIGHT (NOAA): The mean height of the highest one-third of all waves. A range (e.g., 2-4 ft) indicates forecast uncertainty, not that all waves are in that range. "
        f"GUST (NOAA): A rapid wind fluctuation with variations of 10 kt or more between peaks and lulls. "
        f"WATERSPOUT: A rotating column of air over water, most common over tropical or subtropical waters. Not the same as a tornado. "
        f"WIND (NWS): 'Wind Advisory' = sustained 31-39 mph (27-34 kt) for >= 1 hour OR gusts 46-57 mph (40-49 kt). "
        f"'High Wind Warning' = sustained >= 40 mph (>= 35 kt) for >= 1 hour OR gusts >= 58 mph (>= 50 kt). "
        f"WIND CHILL (NWS): 'Wind Chill Advisory' = index -15 to -24 F for >= 3 hours (sustained wind only). "
        f"'Wind Chill Warning' = index <= -25 F for >= 3 hours (sustained wind only). "
        f"SPECIAL MARINE WARNING: Brief/sudden sustained winds or frequent gusts >= 34 kt, usually with thunderstorms, AND/OR hail >= 3/4 inch; also issued for waterspouts. "
        f"STORM SURGE WARNING: Life-threatening inundation from rising water moving inland, generally within 36 hours, associated with a tropical, subtropical, or post-tropical cyclone. "
        f"TROPICAL STORM WARNING: Sustained winds 39-73 mph (34-63 kt), no gust criteria, expected within 36 hours. "
        f"FLOOD (NWS): 'Flood Advisory' = low-lying area inundation, nuisance only, no threat to life. "
        f"'Flash Flood Warning' = rapid extreme flow into normally dry area or rapid stream rise within short timeframe from heavy rain; also dam/levee failure or ice jam. "
        f"'Flood Warning' = expected overflow causing damage and/or threat to life. "
        f"'Coastal Flood Advisory' = minor coastal flooding, brief road closures (non-tropical). "
        f"'Coastal Flood Warning' = widespread serious coastal flooding threatening life or property (non-tropical). "
        f"HEAT (NWS): 'Excessive Heat Warning' = Heat Index >= 105 F for 2 consecutive hours. "
        f"'Heat Advisory' = Heat Index 95-99 F for 2 consecutive days OR 100-104 F for 1 day. "
        f"'Heat Wave' = 3 or more days of >= 90 F temperatures (non-criteria advisory). "
        f"FOG/FROST/FREEZE (NWS): 'Dense Fog Advisory' = widespread visibility <= 1/4 mile for >= 3 hours. "
        f"'Freezing Fog Advisory' = very light ice accumulation from fog at or below freezing. "
        f"'Frost Advisory' = forecast minimum shelter temperature 33-36 F during growing season under clear light winds. "
        f"'Freeze Warning' = minimum shelter temperature < 32 F during growing season. "
        f"HIGH SURF ADVISORY: High surf posing danger to life (rip currents or breaking seas); generally 7+ foot incoming seas at buoys. "
        f"RED FLAG WARNING: Winds >= 25 mph AND relative humidity <= 30% AND rainfall < 0.25 inches in previous 5 days (or dry lightning, dry frontal passage, dry thunderstorms, Keetch-Byram Drought Index >= 300 in summer). "
        f"Never apply a classification that exceeds what the data supports. "
        f"RAIN IMPACT LANGUAGE THRESHOLDS -- follow these exactly and never deviate: "
        f"If rain probability is below 30%, do NOT use any impact language for rain. Do not say rain 'may affect', 'could affect', 'may impact', 'could impact', or 'might affect' any port or operation. You may state the rain percentage as context, but it must not be framed as a threat or operational concern. "
        f"If rain probability is 30% to 59%, use cautious conditional language only: 'may affect' or 'could affect'. Example: 'a 45% rain chance may affect shore excursions in Nassau'. "
        f"If rain probability is 60% or higher, use confident expectation language: 'expected to affect' or 'is expected to impact'. Example: 'a 70% rain chance is expected to affect port operations in San Juan'. "
        f"Apply these thresholds to every day and every rain probability value mentioned in the briefing without exception. "
        f"RAIN PROBABILITY PHRASING: "
        f"The data block above already shows the correct wording for every value: it uses the exact phrase 'less than 10% rain probability' for any value below 10%, and it uses the literal integer percentage (for example '45% rain probability') for values at 10% or higher. "
        f"Carry that exact wording through into your sentences verbatim. Do not invent any sub-10% literal phrasing such as '0% rain chance', 'zero percent rain', '4% chance of drizzle', or '5% rain probability'. "
        f"Do not mention this rule, the 10% threshold, or the phrase 'is not applicable' in your output. Just write naturally using whichever wording the data block provides for each value."
    )

    # System message: holds all rules, directives, terminology, and constraints.
    # User message: holds only the live forecast data the model is to summarize.
    # This structural separation prevents the model from echoing rule text into its
    # output, which is the root cause of phrases like "Miami, the primary US cruise
    # homeport" leaking from the prompt into the published briefing.
    system_message = (
        "You are a professional Chief Meteorologist with 30+ years of cruise industry "
        "experience writing daily weather intel briefings for cruise passengers and crew. "
        "OUTPUT INTEGRITY DIRECTIVE: never quote, paraphrase, restate, or reference any "
        "of the directives, rules, labels, or instructions you are given. Treat all "
        "directive text as private guidance only. Your output must read as a natural, "
        "data-driven meteorologist briefing with no meta-commentary, no rule labels, "
        "no port-importance descriptors (do not call any port 'the primary cruise homeport', "
        "'the cruise capital', 'the highest-volume homeport', or any similar descriptor), "
        "and no acknowledgement of the directives themselves. "
        + prompt
    )
    user_message = (
        f"Live forecast data for {region['rep_port']}: {weather_summary}"
    )
    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
        "max_completion_tokens": 4000,  # raised from 400 -- reasoning models (gpt-5-mini) use ~2600 reasoning tokens before producing output; must be 4000+ to get any visible content; max_completion_tokens required (not max_tokens) for GPT reasoning model proxy compatibility
        "temperature": 0.7,
    }).encode()

    url = f"{GROQ_BASE_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "User-Agent": "WeatherStream/1.0",
    }
    # Pace every request and retry. The provider returned repeated 429 errors when
    # regional calls were launched back-to-back on July 31.
    global _LAST_GROQ_REQUEST_AT
    for attempt in range(4):
        elapsed = time.monotonic() - _LAST_GROQ_REQUEST_AT
        wait_for_slot = MODEL_REQUEST_MIN_INTERVAL_SECONDS - elapsed
        if wait_for_slot > 0:
            print(f"  Waiting {wait_for_slot:.1f}s for the model request slot...", file=sys.stderr)
            time.sleep(wait_for_slot)
        _LAST_GROQ_REQUEST_AT = time.monotonic()
        try:
            if _USE_HTTPX:
                resp = _httpx.post(url, content=payload, headers=headers, timeout=120)
                if resp.status_code == 429 and attempt < 3:
                    wait = 10 * (2 ** attempt)
                    print(f"  Rate limit -- waiting {wait}s before retry {attempt+1}/3", file=sys.stderr)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                result = resp.json()
            else:
                req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=120) as r:
                    result = json.loads(r.read())
            return result["choices"][0]["message"]["content"].strip()
        except Exception as e:
            if attempt < 3:
                wait = 5 * (attempt + 1)
                print(f"  API call attempt {attempt+1} failed ({e}) -- retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("API failed after 4 attempts")


def _clean_model_formatting(text: str) -> str:
    """Remove model-added headings and markdown while preserving briefing prose."""
    import re

    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or re.match(r"^#{1,6}\s+", stripped):
            continue
        lines.append(stripped)
    cleaned = " ".join(lines)
    cleaned = re.sub(r"\*{1,2}([^*]+?)\*{1,2}", r"\1", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def strip_temperatures(text: str) -> str:
    """
    Post-generation temperature filter (Layer 2 backstop).
    Scans the AI-generated briefing text for any temperature value and removes
    the entire sentence containing it. Logs a warning to stderr if anything is
    stripped so the removal is visible in the GitHub Actions run log.

    Patterns detected (case-insensitive):
      - Numeric + degree symbol + F or C  (e.g. 59F, 59°F, 25C, 25°C)
      - Numeric + space + degrees + F or C  (e.g. 59 degrees F)
      - Numeric + space + degrees  (e.g. 59 degrees)
      - Descriptive temperature phrases  (e.g. "temperatures in the 70s",
        "mild temperatures", "warm temperatures", "cool temperatures",
        "temperature of", "temperature near", "temperature around")
    """
    import re
    # Patterns that indicate a temperature value or description is present.
    # These are intentionally broad -- any sentence matching ANY pattern is removed.
    TEMP_PATTERNS = [
        r"\b\d+\s*\u00b0?\s*[FCfc]\b",              # 59F, 59°F, 25C, 25°C
        r"\b\d+\s+degrees?\s+[FCfc]\b",             # 59 degrees F
        r"\b\d+\s+degrees?\b",                       # 59 degrees
        r"\btemperatures?\b",                        # any use of the word temperature/temperatures
        r"\bin\s+the\s+\d+0s?\b",                   # in the 70s, in the 80s
        r"\b(?:upper|lower|mid(?:dle)?)\s+\d+0s?\b",  # upper 80s, lower 90s, mid 70s
        r"\b(?:mild|warm|cool|cold|hot|chilly|balmy)\s+(?:air|conditions|weather)\b",  # warm conditions
        r"\bhigh\s+(?:near|around|of)\s+\d",        # high near 85
        r"\blow\s+(?:near|around|of)\s+\d",         # low near 70
    ]
    combined = re.compile("|".join(TEMP_PATTERNS), re.IGNORECASE)
    
    # Exception patterns: if a sentence contains an active advisory keyword or
    # is describing the intensity of an advisory hazard (heat index value, wind chill
    # value, dangerously hot/cold language), we allow temperatures in that sentence.
    EXCEPTION_PATTERNS = [
        r"\b(?:heat|cold)\s+(?:advisory|warning|watch|index)\b",
        r"\bwind\s+chill\b",
        r"\bexcessive\s+heat\b",
        r"\bextreme\s+cold\b",
        r"\bheat\s+index\s+(?:values?\s+)?(?:reaching|of|near|around|up\s+to)\b",
        r"\bheat\s+indic(?:es|ex)\b",
        r"\belevated\s+heat\b",
        r"\bindex\s+values?\s+(?:reaching|of|near|around|up\s+to)\b",
        r"\bfreeze\s+(?:warning|watch|advisory)\b",
        r"\bdangerously\s+(?:hot|cold|warm)\b",
        r"\blife-threatening\s+heat\b",
        r"\bfeel(?:s)?\s+like\b",
        r"\bapparent\s+temperature\b"
    ]
    exceptions = re.compile("|".join(EXCEPTION_PATTERNS), re.IGNORECASE)

    # Split into sentences, filter out any that contain a temperature pattern
    # Use a sentence splitter that preserves abbreviations like kt, mph, etc.
    sentences = re.split(r"(?<=[.!?])\s+", text)
    clean = []
    stripped_count = 0
    for sentence in sentences:
        if combined.search(sentence) and not exceptions.search(sentence):
            stripped_count += 1
            print(
                f"  [TEMP FILTER] Removed sentence containing temperature: {sentence[:120]}",
                file=sys.stderr
            )
        else:
            clean.append(sentence)

    if stripped_count:
        print(
            f"  [TEMP FILTER] WARNING: {stripped_count} sentence(s) stripped from briefing. "
            f"Review the Groq prompt if this happens frequently.",
            file=sys.stderr
        )

    result = " ".join(clean).strip()
    # If the filter removed everything (edge case), return a safe fallback
    if not result:
        print(
            "  [TEMP FILTER] ERROR: All sentences were stripped -- returning safe fallback.",
            file=sys.stderr
        )
        return "No briefing available at this time."
    return result


def _normalize_low_rain_phrasing(text: str) -> str:
    """
    Post-generation rain-wording filter (Layer B for Bug 2).

    Scans the AI-generated briefing for any sub-10% rain phrasing the model may
    have produced despite the prompt rule (numeric forms like '4% rain chance',
    '0% chance of rain', or spelled-out forms like 'zero percent rain') and
    rewrites them to the canonical phrase 'less than 10% rain probability'.
    Values of 10% or higher are left untouched.

    Logs a warning to stderr each time a substitution is made so the rewrite is
    visible in the GitHub Actions run log.
    """
    import re

    CANONICAL = "less than 10% rain probability"

    # Each pattern matches a sub-10% rain phrasing in any of the wordings the
    # model has historically produced. The shared replacement is CANONICAL.
    NUMERIC_WORDS = {
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4,
        "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    }

    patterns = [
        # Digit forms followed by an explicit rain phrase (handles 0%-9%)
        re.compile(
            r"\b[0-9]\s*%\s*(?:chance\s+of\s+(?:rain|drizzle|showers|precipitation)|rain(?:fall)?(?:\s+chance|\s+probability|\s+chances)?|(?:rain\s+)?probability(?:\s+of\s+rain)?)\b",
            re.IGNORECASE,
        ),
        # Spelled-out single-digit forms (e.g. "zero percent rain probability",
        # "three percent chance of rain")
        re.compile(
            r"\b(?:zero|one|two|three|four|five|six|seven|eight|nine)\s+percent\s+(?:chance\s+of\s+(?:rain|drizzle|showers|precipitation)|rain(?:fall)?(?:\s+chance|\s+probability|\s+chances)?|(?:rain\s+)?probability(?:\s+of\s+rain)?)\b",
            re.IGNORECASE,
        ),
    ]

    rewritten = text
    swap_count = 0
    for pat in patterns:
        new_rewritten, n = pat.subn(CANONICAL, rewritten)
        if n:
            swap_count += n
            rewritten = new_rewritten

    if swap_count:
        print(
            f"  [RAIN WORDING FILTER] Replaced {swap_count} sub-10% rain phrase(s) with '{CANONICAL}'.",
            file=sys.stderr,
        )

    return rewritten


# Phrases known to come from the prompt's directive text. If any of these appear in
# the model's output it means the model echoed a rule into the published briefing.
# Each entry is a (regex_pattern, replacement) pair. Replacements are minimal,
# preserving sentence flow while removing the leaked descriptor. The detector also
# triggers a regeneration retry first; only if all retries still leak is the
# mechanical strip applied as a final guarantee.
_RULE_LEAK_PATTERNS = [
    # Most common leaks observed in production briefings.
    # Each pattern absorbs surrounding commas and adjacent whitespace so that the
    # mechanical strip leaves natural sentence flow without orphaned punctuation.
    (r"\s*,\s*the primary US cruise homeport\s*,?\s*", " "),
    (r"\s+the primary US cruise homeport\s*", " "),
    (r"\s*,\s*the cruise capital of the world\s*,?\s*", " "),
    (r"\s+the cruise capital of the world\s*", " "),
    (r"\s*,\s*the highest[- ]volume cruise homeport(?:\s+in\s+the\s+United\s+States)?\s*,?\s*", " "),
    (r"\s+the highest[- ]volume cruise homeport(?:\s+in\s+the\s+United\s+States)?\s*", " "),
    (r"\s*,\s*the lead US cruise homeport\s*,?\s*", " "),
    (r"\s+(?:remains\s+|is\s+)?the lead US cruise homeport\s*", " "),
    (r"\s*,\s*the lead port for this (?:region|briefing)\s*,?\s*", " "),
    (r"the four primary US cruise homeports[, ]?\s*(?:including\s+)?", ""),
    (r"\s+as the lead port\b", ""),
    (r"\s+as the primary cruise homeport\b", ""),
]


def _detect_rule_leaks(text: str) -> list:
    """Return a list of leaked rule phrases found in text. Empty list if clean."""
    import re as _re
    found = []
    for pat, _ in _RULE_LEAK_PATTERNS:
        m = _re.search(pat, text, _re.IGNORECASE)
        if m:
            found.append(m.group(0).strip().strip(",").strip())
    return found


def _mechanical_strip_rule_leaks(text: str) -> str:
    """Mechanically remove every known rule-leak phrase from text and tidy spacing."""
    import re as _re
    out = text
    for pat, repl in _RULE_LEAK_PATTERNS:
        out = _re.sub(pat, repl, out, flags=_re.IGNORECASE)
    # Collapse any double commas, double spaces, or stray ' ,' artifacts left behind
    out = _re.sub(r"\s*,\s*,\s*", ", ", out)
    out = _re.sub(r"\s+,", ",", out)
    out = _re.sub(r"\s{2,}", " ", out)
    return out.strip()


def _validate_and_repair_rule_leaks(region: dict, intel: str, weather_data: dict, max_retries: int = 2) -> str:
    """
    Rule-leak validator and repair backstop.

    Scans the model's briefing for any phrase that originated in the prompt's
    directive text. If detected, regenerates with a corrective prefix telling the
    model exactly which phrase it leaked. After max_retries, mechanically strips
    the leaked phrases so production never ships a briefing containing rule text.
    Applies to ALL regions, not just regions with required_lead_port.
    """
    leaks = _detect_rule_leaks(intel)
    if not leaks:
        return intel
    print(
        f"  [RULE-LEAK VALIDATOR] Detected leaked rule phrase(s): {leaks}",
        file=sys.stderr,
    )
    for attempt in range(max_retries):
        leaked_phrases = "; ".join(f'"{p}"' for p in leaks)
        retry_prefix = (
            f"REGENERATION REQUIRED. Your previous attempt contained the following "
            f"phrase(s) that came directly from the directives, not from the data: "
            f"{leaked_phrases}. "
            f"Rewrite the briefing without quoting, paraphrasing, or referencing any "
            f"directive text. Use only natural meteorologist voice describing what the "
            f"data shows. Do not call any port 'the primary cruise homeport', "
            f"'the cruise capital', 'the lead port', or any similar descriptor. "
        )
        try:
            new_intel = call_groq(region, weather_data, retry_prefix=retry_prefix)
            new_intel = _clean_model_formatting(new_intel)
            new_intel = strip_temperatures(new_intel)
            new_intel = _normalize_low_rain_phrasing(new_intel)
        except Exception as e:
            print(f"  [RULE-LEAK VALIDATOR] Retry {attempt+1} call_groq failed: {e}", file=sys.stderr)
            continue
        new_leaks = _detect_rule_leaks(new_intel)
        if not new_leaks:
            print(
                f"  [RULE-LEAK VALIDATOR] Retry {attempt+1} produced clean output.",
                file=sys.stderr,
            )
            return new_intel
        intel = new_intel
        leaks = new_leaks
        print(
            f"  [RULE-LEAK VALIDATOR] Retry {attempt+1} still leaking: {leaks}",
            file=sys.stderr,
        )

    # Final guarantee: mechanically strip leaked phrases. Production ships clean.
    repaired = _mechanical_strip_rule_leaks(intel)
    print(
        f"  [RULE-LEAK VALIDATOR] All retries exhausted -- mechanically stripped leaked phrases.",
        file=sys.stderr,
    )
    return repaired


def _validate_and_repair_lead(region: dict, intel: str, weather_data: dict, max_retries: int = 2) -> str:
    """
    Lead-port validator and repair backstop (Layer B for the Miami-lead bug).

    For any region that declares a 'required_lead_port', verify the first sentence of
    the model's briefing names that port. If it does not, regenerate up to max_retries
    times with a corrective prefix telling the model exactly which port it wrongly led
    with. If all retries still fail, perform an in-place hard repair: replace the
    misnamed port in the first sentence with the required port. This guarantees that
    production never ships a non-compliant lead even if the model never complies.

    Returns the (possibly repaired) intel string. Never raises.
    """
    import re as _re
    required_lead = region.get("required_lead_port")
    if not required_lead:
        return intel

    def _first_sentence(t: str) -> str:
        parts = _re.split(r"(?<=[.!?])\s+", t.strip(), maxsplit=1)
        return parts[0] if parts else t

    def _lead_ok(t: str) -> bool:
        return required_lead.lower() in _first_sentence(t).lower()

    if _lead_ok(intel):
        return intel

    bad_first = _first_sentence(intel)
    print(
        f"  [LEAD VALIDATOR] First sentence does not name '{required_lead}': {bad_first[:120]}",
        file=sys.stderr,
    )

    for attempt in range(max_retries):
        retry_prefix = (
            f"REGENERATION REQUIRED. Your previous attempt opened with: \"{bad_first}\". "
            f"That is not acceptable because the lead port for this region is {required_lead}. "
            f"Begin the new briefing with a sentence that explicitly names {required_lead} as the lead port. "
        )
        try:
            new_intel = call_groq(region, weather_data, retry_prefix=retry_prefix)
            new_intel = _clean_model_formatting(new_intel)
            new_intel = strip_temperatures(new_intel)
            new_intel = _normalize_low_rain_phrasing(new_intel)
        except Exception as e:
            print(f"  [LEAD VALIDATOR] Retry {attempt+1} call_groq failed: {e}", file=sys.stderr)
            continue
        if _lead_ok(new_intel):
            print(f"  [LEAD VALIDATOR] Retry {attempt+1} succeeded with '{required_lead}' lead.", file=sys.stderr)
            return new_intel
        intel = new_intel
        bad_first = _first_sentence(intel)
        print(
            f"  [LEAD VALIDATOR] Retry {attempt+1} still wrong: {bad_first[:120]}",
            file=sys.stderr,
        )

    # Hard mechanical repair: rewrite the first sentence to anchor on required_lead.
    # Remove the leading 'Today' phrase if present (matching the prompt's 'Start with Today'
    # rule), then prepend a clean Today-anchored Miami lead, then keep the remaining body.
    parts = _re.split(r"(?<=[.!?])\s+", intel.strip(), maxsplit=1)
    body = parts[1] if len(parts) > 1 else ""
    repaired = (
        f"Today in {required_lead}, conditions across the region are detailed below. "
        + body
    ).strip()
    print(
        f"  [LEAD VALIDATOR] All retries exhausted -- hard-repaired lead to '{required_lead}'.",
        file=sys.stderr,
    )
    return repaired


def _briefing_limits(region: dict, weather_data: dict) -> tuple:
    """Return the ordinary or extreme-weather sentence and word limits."""
    extreme_terms = (
        "hurricane warning",
        "major hurricane",
        "tornado warning",
        "tornado outbreak",
        "extreme wind warning",
    )
    extreme_severe_weather = any(
        term in item.lower()
        for item in weather_data.get("significant", [])
        for term in extreme_terms
    )
    if extreme_severe_weather:
        return 6, 220
    if region["slug"] == "us-ports":
        return 2, 85
    return 3, 110


def _briefing_sentence_parts(text: str, maxsplit: int = 0) -> list:
    """Split briefing prose without treating U.S. or St. as sentence endings."""
    import re as _re

    return [
        part for part in _re.split(
            r"(?<!U\.S\.)(?<!St\.)(?<=[.!?])\s+",
            text.strip(),
            maxsplit=maxsplit,
        )
        if part
    ]


def _deduplicate_heat_product_labels(text: str) -> str:
    """Keep each heat-alert product name once while preserving the full prose."""
    import re as _re

    for product in (
        "Excessive Heat Warning",
        "Extreme Heat Warning",
        "Extreme Heat Watch",
        "Heat Advisory",
    ):
        pattern = _re.compile(
            rf"\b(?:(?:a|an|the)\s+)?{_re.escape(product)}\b",
            _re.IGNORECASE,
        )
        matches = list(pattern.finditer(text))
        for match in reversed(matches[1:]):
            preceding = text[:match.start()].rstrip()
            replacement = "The alert" if not preceding or preceding.endswith((".", "!", "?")) else "the alert"
            text = text[:match.start()] + replacement + text[match.end():]
    return text


def _briefing_size(text: str) -> tuple:
    """Count prose sentences and words for the concise-output validator."""
    import re as _re

    sentences = _briefing_sentence_parts(text)
    words = _re.findall(r"\b\w+(?:['’]\w+)?\b", text)
    return len(sentences), len(words)


def _briefing_format_ok(text: str) -> bool:
    """Require one plain prose paragraph that opens with Today."""
    import re as _re

    stripped = text.strip()
    return bool(
        stripped.startswith("Today")
        and "\n" not in stripped
        and not _re.search(r"(?:^|\s)#{1,6}\s", stripped)
    )


def _today_fallback_sentence(region: dict, weather_data: dict) -> str:
    """Build a factual Today sentence from the same current conditions supplied to the model."""
    summary = weather_data.get("summary", "")
    current = summary.split("3-day outlook:", 1)[0]
    current = current.replace("Current conditions:", "", 1).strip().rstrip(".")
    if not current:
        return f"Today, conditions at {region['rep_port']} are available in the live regional forecast."
    return f"Today, {region['rep_port']} reports {current}."


def _build_rate_limit_fallback(region: dict, weather_data: dict) -> str:
    """Return a concise, data-backed regional forecast when the model is unavailable."""
    summary = weather_data.get("summary", "").strip()
    current_block, _, outlook_block = summary.partition("3-day outlook:")
    current = current_block.replace("Current conditions:", "", 1).strip().rstrip(".")
    outlooks = [part.strip().rstrip(".") for part in outlook_block.split(";") if part.strip()]
    day_one = outlooks[0] if outlooks else current
    day_two = outlooks[1] if len(outlooks) > 1 else day_one
    day_three = outlooks[2] if len(outlooks) > 2 else day_two
    lead_port = region.get("required_lead_port") or region["rep_port"]

    if region["slug"] == "us-ports":
        return (
            f"Today, {lead_port} reports {current}. "
            f"Over the next 48 hours, {day_two}; beyond 48 hours, {day_three}."
        )
    return (
        f"Today, {lead_port} reports {current}. "
        f"Over the next 24 to 48 hours, {day_two}. "
        f"Beyond 48 hours, {day_three}."
    )


def _enforce_us_ports_today_pop(region: dict, intel: str, weather_data: dict) -> str:
    """Guarantee that the Miami lead carries the exact NWS daytime PoP phrase."""
    import re

    if region.get("slug") != "us-ports":
        return intel

    current_summary = weather_data.get("summary", "").split("3-day outlook:", 1)[0]
    expected_match = re.search(
        r"(?:less than \d{1,3}|\d{1,3})% rain probability",
        current_summary,
        re.IGNORECASE,
    )
    if not expected_match:
        raise ValueError("US Ports weather summary is missing the authoritative NWS PoP phrase")
    expected_phrase = expected_match.group(0)

    parts = _briefing_sentence_parts(intel, maxsplit=1)
    first_sentence = parts[0] if parts else ""
    if expected_phrase.lower() in first_sentence.lower():
        return intel

    rain_pattern = re.compile(
        r"(?:less than \d{1,3}|\d{1,3})%\s+(?:rain probability|chance of rain|rain chance)",
        re.IGNORECASE,
    )
    if rain_pattern.search(first_sentence):
        repaired_first = rain_pattern.sub(expected_phrase, first_sentence, count=1)
    else:
        repaired_first = _today_fallback_sentence(region, weather_data)

    body = parts[1] if len(parts) > 1 else ""
    repaired = " ".join(part for part in (repaired_first, body) if part).strip()
    print(
        f"  [US PORTS POP GUARD] Repaired Miami lead to authoritative phrase: {expected_phrase}",
        file=sys.stderr,
    )
    return repaired


def _validate_and_repair_brevity(region: dict, intel: str, weather_data: dict, max_retries: int = 2) -> str:
    """Regenerate output that is overlong or not a plain Today-led paragraph."""
    import re as _re

    intel = _clean_model_formatting(intel)
    max_sentences, max_words = _briefing_limits(region, weather_data)
    sentence_count, word_count = _briefing_size(intel)
    if sentence_count <= max_sentences and word_count <= max_words and _briefing_format_ok(intel):
        return intel

    print(
        f"  [BREVITY VALIDATOR] {sentence_count} sentences/{word_count} words exceeds "
        f"{max_sentences} sentences/{max_words} words or fails the plain Today-led format.",
        file=sys.stderr,
    )
    for attempt in range(max_retries):
        retry_prefix = (
            f"REGENERATION REQUIRED. The previous briefing was too long. Write no more than "
            f"{max_sentences} concise sentences and {max_words} words, in one paragraph unless the "
            f"live data explicitly contains an extreme severe-weather exception. Remove repetition "
            f"and preserve the three forecast time periods. Start with Today and output only plain prose, "
            f"with no heading, title, date line, markdown, bullets, or labels. "
        )
        try:
            new_intel = call_groq(region, weather_data, retry_prefix=retry_prefix)
            new_intel = _clean_model_formatting(new_intel)
            new_intel = strip_temperatures(new_intel)
            new_intel = _normalize_low_rain_phrasing(new_intel)
        except Exception as e:
            print(f"  [BREVITY VALIDATOR] Retry {attempt+1} call_groq failed: {e}", file=sys.stderr)
            continue

        required_lead = region.get("required_lead_port")
        first_sentence = _briefing_sentence_parts(new_intel, maxsplit=1)[0]
        if required_lead and required_lead.lower() not in first_sentence.lower():
            print(f"  [BREVITY VALIDATOR] Retry {attempt+1} lost required lead port.", file=sys.stderr)
            continue
        if _detect_rule_leaks(new_intel):
            print(f"  [BREVITY VALIDATOR] Retry {attempt+1} leaked directive text.", file=sys.stderr)
            continue
        if not _briefing_format_ok(new_intel):
            print(f"  [BREVITY VALIDATOR] Retry {attempt+1} failed the plain Today-led format.", file=sys.stderr)
            intel = new_intel
            continue

        sentence_count, word_count = _briefing_size(new_intel)
        if sentence_count <= max_sentences and word_count <= max_words:
            print(f"  [BREVITY VALIDATOR] Retry {attempt+1} produced concise output.", file=sys.stderr)
            return new_intel
        intel = new_intel
        print(
            f"  [BREVITY VALIDATOR] Retry {attempt+1} still has "
            f"{sentence_count} sentences/{word_count} words.",
            file=sys.stderr,
        )

    sentences = _briefing_sentence_parts(_clean_model_formatting(intel))
    if not sentences or not sentences[0].startswith("Today"):
        sentences = [_today_fallback_sentence(region, weather_data)] + sentences
    repaired_sentences = sentences[:max_sentences]
    while len(repaired_sentences) > 1 and _briefing_size(" ".join(repaired_sentences))[1] > max_words:
        repaired_sentences.pop()
    repaired = " ".join(repaired_sentences).strip()
    print(
        f"  [BREVITY VALIDATOR] Retries exhausted; applied the plain Today-led sentence and word cap.",
        file=sys.stderr,
    )
    return repaired


_CLIMATE_OR_STATIC_PATTERNS = (
    r"\btypically\b",
    r"\busually\b",
    r"\byear[- ]round\b",
    r"\bseasonal(?:ly)?\b",
    r"\bclimat(?:e|ological)\b",
    r"\bon average\b",
    r"\bhistorically\b",
    r"\bthe most spectacular\b",
    r"\bweather-sensitive cruising route\b",
    r"\bplan for rain regardless of forecast\b",
    r"\bbest conditions\b",
    r"\bfrequent low pressure systems\b",
    r"\bexact forecast\b",
)


def _forecast_only_violations(text: str) -> list[str]:
    """Return deterministic reasons a briefing cannot be published as a live forecast."""
    import re

    normalized = _clean_model_formatting(text)
    lower = normalized.lower()
    violations: list[str] = []
    if len(normalized) < 80:
        violations.append("briefing is shorter than the minimum forecast length")
    if not _briefing_format_ok(normalized):
        violations.append("briefing is not a plain Today-led forecast paragraph")
    if normalized == "No briefing available at this time.":
        violations.append("briefing is an unavailable placeholder")
    for pattern in _CLIMATE_OR_STATIC_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            violations.append(f"contains prohibited climate/static language matching {pattern!r}")
            break
    # Each published sentence must carry a quantitative or official live forecast signal.
    # Current temperatures are deliberately excluded by the product contract. This rejects
    # otherwise plausible climate or route prose that happens to contain one weather detail.
    forecast_marker = re.compile(
        r"(?:\b\d{1,3}\s*kt\b|\b(?:less than )?\d{1,3}%\s+rain probability\b|"
        r"\b(?:heat|wind chill|freeze|gale|storm|small craft)\s+(?:advisory|warning|watch)\b)",
        re.IGNORECASE,
    )
    sentences_without_live_signal = [
        sentence
        for sentence in _briefing_sentence_parts(normalized)
        if not forecast_marker.search(sentence)
    ]
    if sentences_without_live_signal:
        violations.append(
            "one or more sentences lack a quantitative or official forecast signal: "
            + " | ".join(sentences_without_live_signal)
        )
    return violations


def _validate_and_repair_forecast_only(region: dict, intel: str, weather_data: dict, max_retries: int = 2) -> str:
    """Regenerate any climate, route-description, placeholder, or non-forecast prose."""
    violations = _forecast_only_violations(intel)
    if not violations:
        return intel

    for attempt in range(max_retries):
        print(f"  [FORECAST-ONLY VALIDATOR] Rejected output: {'; '.join(violations)}", file=sys.stderr)
        retry_prefix = (
            "REGENERATION REQUIRED. The previous output was rejected because it contained "
            "non-forecast, climate, route-description, placeholder, or insufficiently data-grounded text. "
            "Write a new briefing using only the supplied live forecast data. Every sentence must describe "
            "current or next-three-day conditions and an appropriate cruise operational impact. "
            "Do not make any statement about typical, seasonal, historical, geographic, or route conditions. "
        )
        try:
            candidate = call_groq(region, weather_data, retry_prefix=retry_prefix)
            candidate = _clean_model_formatting(candidate)
            candidate = strip_temperatures(candidate)
            candidate = _normalize_low_rain_phrasing(candidate)
            candidate = _validate_and_repair_lead(region, candidate, weather_data)
            candidate = _validate_and_repair_rule_leaks(region, candidate, weather_data)
            candidate = _validate_and_repair_brevity(region, candidate, weather_data)
            candidate = _deduplicate_heat_product_labels(candidate)
        except Exception as exc:
            print(f"  [FORECAST-ONLY VALIDATOR] Retry {attempt + 1} failed: {exc}", file=sys.stderr)
            continue
        violations = _forecast_only_violations(candidate)
        if not violations:
            print(f"  [FORECAST-ONLY VALIDATOR] Retry {attempt + 1} passed.", file=sys.stderr)
            return candidate
        intel = candidate

    fallback = _normalize_low_rain_phrasing(_build_rate_limit_fallback(region, weather_data))
    fallback = _deduplicate_heat_product_labels(fallback)
    fallback_violations = _forecast_only_violations(fallback)
    if not fallback_violations:
        print(
            "  FORECAST_ONLY_DETERMINISTIC_FALLBACK: Model repair retries exhausted; "
            "publishing the validated live-data forecast.",
            file=sys.stderr,
        )
        return fallback

    raise ValueError(
        "Forecast-only validation failed after deterministic fallback: "
        + "; ".join(fallback_violations)
    )


def _generate_region_forecast(region: dict) -> str:
    """Generate one fully validated regional forecast with a factual rate-limit fallback."""
    wx = fetch_weather(region["lat"], region["lon"])
    pop_means = fetch_region_precip_probability(region)
    advisory_lead = ""
    if region["slug"] == "us-ports":
        us_port_alerts = fetch_us_port_heat_advisories(region)
        advisory_lead = render_us_port_heat_advisory_lead(us_port_alerts)
        advisories = [
            advisory for advisory in fetch_nws_advisories(region)
            if "heat" not in advisory.lower()
        ]
    else:
        advisories = fetch_nws_advisories(region)

    weather_data = build_weather_summary(
        wx,
        pop_means=pop_means,
        advisories=advisories,
        include_apparent_heat=region["slug"] != "us-ports",
    )
    try:
        intel = call_groq(region, weather_data)
        intel = _clean_model_formatting(intel)
        if not intel or len(intel.strip()) < 20:
            raise ValueError(f"Model returned suspiciously short response: {intel!r}")
        intel = strip_temperatures(intel.strip())
    except Exception as exc:
        print(
            f"  MODEL FALLBACK: {region['slug']} using deterministic live-data forecast after provider failure: {exc}",
            file=sys.stderr,
        )
        intel = _build_rate_limit_fallback(region, weather_data)
    intel = _normalize_low_rain_phrasing(intel)
    intel = _validate_and_repair_lead(region, intel, weather_data)
    intel = _validate_and_repair_rule_leaks(region, intel, weather_data)
    intel = _validate_and_repair_brevity(region, intel, weather_data)
    intel = _enforce_us_ports_today_pop(region, intel, weather_data)
    intel = _deduplicate_heat_product_labels(intel)
    if region["slug"] == "us-ports":
        intel = strip_us_port_heat_claims(intel)
        intel = prepend_us_port_advisory_lead(intel, advisory_lead)
    return _validate_and_repair_forecast_only(region, intel, weather_data)


def _batch_regions(batch: str) -> list[dict]:
    midpoint = len(REGIONS) // 2
    if batch == "first":
        return REGIONS[:midpoint]
    if batch == "second":
        return REGIONS[midpoint:]
    if batch == "all":
        return REGIONS
    raise ValueError(f"Unknown generation batch: {batch}")


def _generate_batch(regions: list[dict]) -> tuple[dict[str, str], list[str]]:
    values: dict[str, str] = {}
    failures: list[str] = []
    for region in regions:
        print(f"Processing {region['name']}...", file=sys.stderr)
        try:
            intel = _generate_region_forecast(region)
            values[region["slug"]] = intel
            print(f"  OK: {intel[:80]}...", file=sys.stderr)
        except Exception as exc:
            failures.append(f"{region['slug']}: {exc}")
            print(f"  ERROR: {region['slug']}: {exc}", file=sys.stderr)
    return values, failures


def _validate_complete_regions(values: dict[str, str], expected_regions: list[dict]) -> None:
    expected_slugs = {region["slug"] for region in expected_regions}
    present_slugs = set(values)
    missing = sorted(expected_slugs - present_slugs)
    unexpected = sorted(present_slugs - expected_slugs)
    invalid = {
        slug: _forecast_only_violations(text)
        for slug, text in values.items()
        if _forecast_only_violations(text)
    }
    problems: list[str] = []
    if missing:
        problems.append("missing regions: " + ", ".join(missing))
    if unexpected:
        problems.append("unexpected regions: " + ", ".join(unexpected))
    if invalid:
        problems.append(
            "invalid regional forecasts: " + "; ".join(
                f"{slug} ({', '.join(reasons)})" for slug, reasons in sorted(invalid.items())
            )
        )
    if problems:
        raise RuntimeError("Publication gate rejected intel artifact: " + " | ".join(problems))


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate forecast-only regional briefing data")
    parser.add_argument(
        "--batch",
        choices=("all", "first", "second"),
        default="all",
        help="Generate all regions, or one deterministic half for isolated testing.",
    )
    parser.add_argument(
        "--stagger-seconds",
        type=int,
        default=int(os.environ.get("INTEL_BATCH_STAGGER_SECONDS", "300")),
        help="Delay between the two production batches. Defaults to five minutes.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional output path. Defaults to client/public/intel.json.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None):
    args = _parse_args(argv)
    if args.stagger_seconds < 0:
        raise ValueError("--stagger-seconds must be zero or greater")
    if not GROQ_API_KEY:
        print("ERROR: GROQ_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    now_utc = datetime.now(timezone.utc)
    now_eastern = datetime.now(ZoneInfo("America/New_York"))
    output = {
        "generated": now_eastern.date().isoformat(),
        "generated_utc": now_utc.strftime("%Y-%m-%dT%H:%M UTC"),
        "regions": {},
    }

    if args.batch == "all":
        first_regions = _batch_regions("first")
        second_regions = _batch_regions("second")
        first_batch_started_at = time.monotonic()
        first_values, first_failures = _generate_batch(first_regions)
        if first_failures:
            raise RuntimeError("First generation batch failed: " + " | ".join(first_failures))
        _validate_complete_regions(first_values, first_regions)
        remaining_stagger = max(0.0, args.stagger_seconds - (time.monotonic() - first_batch_started_at))
        if remaining_stagger:
            print(
                f"First batch passed. Waiting {remaining_stagger:.1f}s so the second regional pull starts "
                f"{args.stagger_seconds}s after the first batch trigger.",
                file=sys.stderr,
            )
            time.sleep(remaining_stagger)
        else:
            print(
                "First batch exceeded the requested stagger window; starting the second regional pull now.",
                file=sys.stderr,
            )
        second_values, second_failures = _generate_batch(second_regions)
        if second_failures:
            raise RuntimeError("Second generation batch failed: " + " | ".join(second_failures))
        _validate_complete_regions(second_values, second_regions)
        output["regions"] = {**first_values, **second_values}
        _validate_complete_regions(output["regions"], REGIONS)
    else:
        selected_regions = _batch_regions(args.batch)
        values, failures = _generate_batch(selected_regions)
        if failures:
            raise RuntimeError(f"{args.batch.title()} generation batch failed: " + " | ".join(failures))
        _validate_complete_regions(values, selected_regions)
        output["regions"] = values

    target = args.output or (Path(__file__).parent.parent / "client" / "public" / "intel.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary_target = target.with_name(f".{target.name}.tmp")
    try:
        temporary_target.write_text(json.dumps(output, indent=2), encoding="utf-8")
        os.replace(temporary_target, target)
    finally:
        if temporary_target.exists():
            temporary_target.unlink()
    print(
        f"intel.json written: {target.stat().st_size} bytes, "
        f"{len(output['regions'])}/{len(_batch_regions(args.batch)) if args.batch != 'all' else len(REGIONS)} regions populated",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
