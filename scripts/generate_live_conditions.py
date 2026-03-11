#!/usr/bin/env python3
"""
Hourly live conditions generator for WeatherStream MVP.
Fetches current weather from Open-Meteo for all 68 carousel ports.
Writes live_conditions.json to client/public/ for the site to consume.
Runs at :10 past every hour.

SSL fix: Uses requests library with retry/backoff instead of urllib.
Falls back to individual port requests if batch fails.
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

import urllib.request
import ssl

# All 68 ports matching LIVE_DATA in Home.tsx (same order)
PORTS = [
    # Caribbean
    {"key": "Miami",            "lat": 25.77,  "lon": -80.19},
    {"key": "Key West",         "lat": 24.56,  "lon": -81.78},
    {"key": "Nassau",           "lat": 25.04,  "lon": -77.35},
    {"key": "Bimini",           "lat": 25.73,  "lon": -79.29},
    {"key": "Freeport",         "lat": 26.53,  "lon": -78.70},
    {"key": "Berry Islands",    "lat": 25.63,  "lon": -77.83},
    {"key": "San Juan",         "lat": 18.47,  "lon": -66.12},
    {"key": "St. Thomas",       "lat": 18.34,  "lon": -64.93},
    {"key": "St. Croix",        "lat": 17.73,  "lon": -64.73},
    {"key": "St. Kitts",        "lat": 17.30,  "lon": -62.72},
    {"key": "Antigua",          "lat": 17.12,  "lon": -61.85},
    {"key": "Barbados",         "lat": 13.10,  "lon": -59.62},
    {"key": "St. Lucia",        "lat": 13.91,  "lon": -60.98},
    {"key": "Martinique",       "lat": 14.67,  "lon": -61.01},
    {"key": "St. Maarten",      "lat": 18.07,  "lon": -63.06},
    {"key": "Turks & Caicos",   "lat": 21.46,  "lon": -71.14},
    {"key": "Cozumel",          "lat": 20.51,  "lon": -86.95},
    {"key": "Costa Maya",       "lat": 18.73,  "lon": -87.71},
    {"key": "Roatan",           "lat": 16.32,  "lon": -86.53},
    {"key": "Belize City",      "lat": 17.25,  "lon": -88.77},
    {"key": "Grand Cayman",     "lat": 19.29,  "lon": -81.38},
    {"key": "Ocho Rios",        "lat": 18.41,  "lon": -77.10},
    {"key": "Aruba",            "lat": 12.52,  "lon": -70.03},
    {"key": "Curacao",          "lat": 12.11,  "lon": -68.93},
    {"key": "Cartagena",        "lat": 10.39,  "lon": -75.48},
    # Western Mediterranean
    {"key": "Barcelona",        "lat": 41.38,  "lon":   2.18},
    {"key": "Valencia",         "lat": 39.47,  "lon":  -0.38},
    {"key": "Palma",            "lat": 39.57,  "lon":   2.65},
    {"key": "Ibiza",            "lat": 38.91,  "lon":   1.43},
    {"key": "Malaga",           "lat": 36.72,  "lon":  -4.42},
    {"key": "Cadiz",            "lat": 36.53,  "lon":  -6.30},
    {"key": "Lisbon",           "lat": 38.72,  "lon":  -9.14},
    # Central Mediterranean
    {"key": "Marseille",        "lat": 43.30,  "lon":   5.37},
    {"key": "Nice",             "lat": 43.70,  "lon":   7.27},
    {"key": "Monaco",           "lat": 43.73,  "lon":   7.42},
    {"key": "Genoa",            "lat": 44.41,  "lon":   8.93},
    {"key": "La Spezia",        "lat": 44.10,  "lon":   9.82},
    {"key": "Livorno",          "lat": 43.55,  "lon":  10.31},
    {"key": "Civitavecchia",    "lat": 42.09,  "lon":  11.80},
    {"key": "Naples",           "lat": 40.85,  "lon":  14.27},
    {"key": "Sardinia",         "lat": 39.22,  "lon":   9.11},
    {"key": "Corsica",          "lat": 42.04,  "lon":   9.01},
    {"key": "Split",            "lat": 43.51,  "lon":  16.44},
    {"key": "Dubrovnik",        "lat": 42.65,  "lon":  18.09},
    {"key": "Venice",           "lat": 45.44,  "lon":  12.33},
    # Eastern Mediterranean
    {"key": "Athens",           "lat": 37.94,  "lon":  23.64},
    {"key": "Santorini",        "lat": 36.39,  "lon":  25.46},
    {"key": "Mykonos",          "lat": 37.45,  "lon":  25.33},
    {"key": "Rhodes",           "lat": 36.43,  "lon":  28.22},
    {"key": "Corfu",            "lat": 39.62,  "lon":  19.92},
    {"key": "Istanbul",         "lat": 41.01,  "lon":  28.98},
    {"key": "Izmir",            "lat": 38.42,  "lon":  27.14},
    {"key": "Cyprus",           "lat": 34.92,  "lon":  33.63},
    {"key": "Haifa",            "lat": 32.82,  "lon":  34.99},
    {"key": "Alexandria",       "lat": 31.20,  "lon":  29.92},
    # Additional Caribbean ports
    {"key": "Bonaire",          "lat": 12.20,  "lon": -68.26},
    {"key": "Dominica",         "lat": 15.30,  "lon": -61.39},
    {"key": "Falmouth",         "lat": 18.50,  "lon": -77.66},
    {"key": "La Romana",        "lat": 18.43,  "lon": -68.97},
    {"key": "Puerto Plata",     "lat": 19.80,  "lon": -70.69},
    {"key": "Samana",           "lat": 19.21,  "lon": -69.34},
    {"key": "Santo Domingo",    "lat": 18.47,  "lon": -69.90},
    # Eastern Pacific
    {"key": "Ensenada",         "lat": 31.87,  "lon": -116.60},
    {"key": "Cabo San Lucas",   "lat": 22.89,  "lon": -109.91},
    {"key": "Mazatlan",         "lat": 23.24,  "lon": -106.41},
    {"key": "Puerto Vallarta",  "lat": 20.65,  "lon": -105.22},
    {"key": "Manzanillo",       "lat": 19.05,  "lon": -104.32},
    {"key": "Huatulco",         "lat": 15.74,  "lon":  -96.13},
]

WMO_TO_CONDITION = {
    0: "Sunny", 1: "Mostly Clear", 2: "Partly Cloudy", 3: "Overcast",
    45: "Foggy", 48: "Foggy",
    51: "Light Drizzle", 53: "Drizzle", 55: "Heavy Drizzle",
    61: "Light Rain", 63: "Rain", 65: "Heavy Rain",
    71: "Light Snow", 73: "Snow", 75: "Heavy Snow",
    80: "Rain Showers", 81: "Rain Showers", 82: "Heavy Showers",
    95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
}

def wmo_condition(code):
    return WMO_TO_CONDITION.get(code, "Partly Cloudy")

def c_to_f(c):
    return round(c * 9 / 5 + 32)

def build_url(ports_batch):
    lats = ",".join(str(p["lat"]) for p in ports_batch)
    lons = ",".join(str(p["lon"]) for p in ports_batch)
    return (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}"
        f"&current=temperature_2m,weathercode,wind_speed_10m,wind_direction_10m"
        f"&temperature_unit=celsius&wind_speed_unit=kn&timezone=auto"
    )

def make_session():
    """Create a requests Session with retry/backoff."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

def fetch_with_requests(session, ports_batch, timeout=30):
    url = build_url(ports_batch)
    resp = session.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.json()

def fetch_with_urllib(ports_batch, timeout=30):
    """Fallback using urllib with a relaxed SSL context."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    url = build_url(ports_batch)
    with urllib.request.urlopen(url, timeout=timeout, context=ctx) as r:
        return json.loads(r.read())

def parse_response(data, batch):
    results = {}
    if isinstance(data, dict):
        data = [data]
    for j, port in enumerate(batch):
        try:
            current = data[j].get("current", {})
            temp_c = current.get("temperature_2m", 20)
            wmo = current.get("weathercode", 0)
            results[port["key"]] = {
                "tempF": c_to_f(temp_c),
                "tempC": round(temp_c, 1),
                "condition": wmo_condition(wmo),
                "wmo": wmo,
                "windKt": round(current.get("wind_speed_10m", 0)),
                "windDir": round(current.get("wind_direction_10m", 0)),
            }
        except Exception as e:
            print(f"  Parse error for {port['key']}: {e}")
            results[port["key"]] = None
    return results

def fetch_batch_robust(session, ports_batch):
    """
    Try fetching a batch with three escalating strategies:
    1. requests with retry (preferred)
    2. urllib with relaxed SSL
    3. Individual port requests via urllib (last resort)
    """
    # Strategy 1: requests with retry
    if session:
        try:
            data = fetch_with_requests(session, ports_batch)
            return parse_response(data, ports_batch), "requests"
        except Exception as e:
            print(f"  requests batch failed: {e}")

    # Strategy 2: urllib relaxed SSL batch
    try:
        data = fetch_with_urllib(ports_batch)
        return parse_response(data, ports_batch), "urllib-batch"
    except Exception as e:
        print(f"  urllib batch failed: {e}")

    # Strategy 3: individual urllib requests
    print(f"  Falling back to individual requests for {len(ports_batch)} ports...")
    results = {}
    for port in ports_batch:
        for attempt in range(2):
            try:
                data = fetch_with_urllib([port], timeout=20)
                results.update(parse_response(data, [port]))
                break
            except Exception as e:
                if attempt == 1:
                    print(f"    {port['key']}: FAILED after 2 attempts ({e})")
                    results[port["key"]] = None
                else:
                    time.sleep(2)
    return results, "urllib-individual"

def main():
    session = make_session() if HAS_REQUESTS else None
    if not HAS_REQUESTS:
        print("WARNING: requests library not available, using urllib fallback only")

    results = {}
    batch_size = 50

    for i in range(0, len(PORTS), batch_size):
        batch = PORTS[i:i + batch_size]
        print(f"Fetching ports {i+1}-{i+len(batch)} of {len(PORTS)}...")
        batch_results, method = fetch_batch_robust(session, batch)
        results.update(batch_results)
        has = sum(1 for v in batch_results.values() if v is not None)
        print(f"  Done via [{method}]: {has}/{len(batch)} ports OK")

    has_data = sum(1 for v in results.values() if v is not None)
    print(f"\nTotal: {len(results)} ports, {has_data} with live data, {len(results)-has_data} null")

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ports": results,
    }

    repo = Path(__file__).parent.parent
    out_path = repo / "client" / "public" / "live_conditions.json"
    out_path.write_text(json.dumps(output, indent=2))
    print(f"Written to {out_path}")
    print(f"Generated at: {output['generated_at']}")

if __name__ == "__main__":
    main()
