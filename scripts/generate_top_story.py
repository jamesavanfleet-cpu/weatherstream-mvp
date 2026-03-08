#!/usr/bin/env python3
"""
generate_top_story.py
Scans all region ports for the most impactful forecast condition across
Caribbean, Mediterranean, and EPAC, then uses Groq to write a headline
and brief paragraph for the homepage "NEW" card.
Outputs: client/public/top_story.json
"""

import asyncio, json, math, os, sys, urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

import aiohttp

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODEL = "llama-3.3-70b-versatile"

# ── Port registry (mirrors regions.ts) ──────────────────────────────────────
PORTS = [
    # Eastern Caribbean
    {"name": "San Juan",          "region": "Eastern Caribbean",    "lat": 18.47, "lon": -66.12},
    {"name": "St. Thomas",        "region": "Eastern Caribbean",    "lat": 18.34, "lon": -64.93},
    {"name": "St. Maarten",       "region": "Eastern Caribbean",    "lat": 18.07, "lon": -63.07},
    {"name": "Antigua",           "region": "Eastern Caribbean",    "lat": 17.12, "lon": -61.85},
    {"name": "Turks & Caicos",    "region": "Eastern Caribbean",    "lat": 21.46, "lon": -71.14},
    # Western Caribbean
    {"name": "Cozumel",           "region": "Western Caribbean",    "lat": 20.51, "lon": -86.95},
    {"name": "Roatan",            "region": "Western Caribbean",    "lat": 16.32, "lon": -86.53},
    {"name": "Grand Cayman",      "region": "Western Caribbean",    "lat": 19.29, "lon": -81.38},
    {"name": "Ocho Rios",         "region": "Western Caribbean",    "lat": 18.41, "lon": -77.10},
    # Bahamas
    {"name": "Nassau",            "region": "Bahamas",              "lat": 25.04, "lon": -77.35},
    {"name": "Freeport",          "region": "Bahamas",              "lat": 26.53, "lon": -78.70},
    {"name": "Bimini",            "region": "Bahamas",              "lat": 25.73, "lon": -79.30},
    # Southern Caribbean
    {"name": "Aruba",             "region": "Southern Caribbean",   "lat": 12.52, "lon": -70.03},
    {"name": "Curacao",           "region": "Southern Caribbean",   "lat": 12.11, "lon": -68.93},
    {"name": "Cartagena",         "region": "Southern Caribbean",   "lat": 10.39, "lon": -75.48},
    # Lesser Antilles
    {"name": "Barbados",          "region": "Lesser Antilles",      "lat": 13.10, "lon": -59.62},
    {"name": "St. Lucia",         "region": "Lesser Antilles",      "lat": 13.91, "lon": -60.98},
    {"name": "Martinique",        "region": "Lesser Antilles",      "lat": 14.64, "lon": -61.02},
    {"name": "Dominica",          "region": "Lesser Antilles",      "lat": 15.30, "lon": -61.39},
    {"name": "Grenada",           "region": "Lesser Antilles",      "lat": 12.11, "lon": -61.68},
    # Western Mediterranean
    {"name": "Lisbon",            "region": "Western Mediterranean","lat": 38.71, "lon": -9.14},
    {"name": "Cadiz",             "region": "Western Mediterranean","lat": 36.53, "lon": -6.30},
    {"name": "Barcelona",         "region": "Western Mediterranean","lat": 41.38, "lon":  2.18},
    {"name": "Palma de Mallorca", "region": "Western Mediterranean","lat": 39.57, "lon":  2.65},
    # Central Mediterranean
    {"name": "Marseille",         "region": "Central Mediterranean","lat": 43.30, "lon":  5.37},
    {"name": "Naples",            "region": "Central Mediterranean","lat": 40.85, "lon": 14.27},
    {"name": "Venice",            "region": "Central Mediterranean","lat": 45.44, "lon": 12.33},
    {"name": "Dubrovnik",         "region": "Central Mediterranean","lat": 42.65, "lon": 18.09},
    # Eastern Mediterranean
    {"name": "Athens (Piraeus)",  "region": "Eastern Mediterranean","lat": 37.94, "lon": 23.64},
    {"name": "Mykonos",           "region": "Eastern Mediterranean","lat": 37.45, "lon": 25.33},
    {"name": "Istanbul",          "region": "Eastern Mediterranean","lat": 41.01, "lon": 28.98},
    {"name": "Haifa",             "region": "Eastern Mediterranean","lat": 32.82, "lon": 34.99},
    # EPAC
    {"name": "Los Angeles",       "region": "Eastern Pacific",      "lat": 33.73, "lon": -118.26},
    {"name": "Ensenada",          "region": "Eastern Pacific",      "lat": 31.87, "lon": -116.60},
    {"name": "Cabo San Lucas",    "region": "Eastern Pacific",      "lat": 22.89, "lon": -109.91},
    {"name": "Mazatlan",          "region": "Eastern Pacific",      "lat": 23.22, "lon": -106.42},
    {"name": "Puerto Vallarta",   "region": "Eastern Pacific",      "lat": 20.65, "lon": -105.22},
]

# ── Helpers ──────────────────────────────────────────────────────────────────
def ms_to_kt(ms: float) -> float:
    return ms * 1.94384

def deg_to_compass(deg: float) -> str:
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"]
    return dirs[round(deg / 22.5) % 16]

def impact_score(data: dict) -> float:
    """Return a numeric impact score -- higher = more newsworthy."""
    score = 0.0
    max_wind = max((ms_to_kt(v) for v in data.get("daily_wind_max", []) if v is not None), default=0)
    score += max_wind * 1.5
    max_wave = max((v for v in data.get("daily_wave_max", []) if v is not None), default=0)
    score += max_wave * 4
    max_period = max((v for v in data.get("daily_swell_period", []) if v is not None), default=0)
    score += max_period * 2
    max_rain = max((v for v in data.get("daily_rain", []) if v is not None), default=0)
    score += max_rain * 0.5
    return score

# ── Async fetch ──────────────────────────────────────────────────────────────
async def fetch_port(session: aiohttp.ClientSession, port: dict) -> dict:
    lat, lon = port["lat"], port["lon"]
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&daily=wind_speed_10m_max,wind_direction_10m_dominant,precipitation_probability_max,weathercode"
        f"&wind_speed_unit=ms&timezone=auto&forecast_days=7"
    )
    marine_url = (
        f"https://marine-api.open-meteo.com/v1/marine"
        f"?latitude={lat}&longitude={lon}"
        f"&daily=wave_height_max,swell_wave_period_max,swell_wave_direction_dominant"
        f"&length_unit=imperial&timezone=auto&forecast_days=7"
    )
    result = {**port, "daily_wind_max": [], "daily_wind_dir": [], "daily_rain": [],
              "daily_wave_max": [], "daily_swell_period": [], "daily_swell_dir": []}
    try:
        async with session.get(weather_url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            w = await r.json()
            d = w.get("daily", {})
            result["daily_wind_max"] = d.get("wind_speed_10m_max", [])
            result["daily_wind_dir"] = d.get("wind_direction_10m_dominant", [])
            result["daily_rain"]     = d.get("precipitation_probability_max", [])
            result["daily_dates"]    = d.get("time", [])
    except Exception as e:
        print(f"  Weather fetch failed for {port['name']}: {e}", file=sys.stderr)

    try:
        async with session.get(marine_url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            m = await r.json()
            md = m.get("daily", {})
            result["daily_wave_max"]     = md.get("wave_height_max", [])
            result["daily_swell_period"] = md.get("swell_wave_period_max", [])
            result["daily_swell_dir"]    = md.get("swell_wave_direction_dominant", [])
    except Exception as e:
        print(f"  Marine fetch failed for {port['name']}: {e}", file=sys.stderr)

    return result

async def fetch_all() -> list[dict]:
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_port(session, p) for p in PORTS]
        return await asyncio.gather(*tasks)

# ── Groq story writer ─────────────────────────────────────────────────────────
def write_story(top: dict, runner_up: dict | None) -> tuple[str, str]:
    if not GROQ_API_KEY:
        print("ERROR: GROQ_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    max_wind_kt = round(max((ms_to_kt(v) for v in top["daily_wind_max"] if v is not None), default=0))
    max_wave    = round(max((v for v in top["daily_wave_max"] if v is not None), default=0), 1)
    max_period  = round(max((v for v in top["daily_swell_period"] if v is not None), default=0))
    max_rain    = round(max((v for v in top["daily_rain"] if v is not None), default=0))
    swell_dirs  = [deg_to_compass(v) for v in top["daily_swell_dir"] if v is not None]
    swell_dir   = swell_dirs[0] if swell_dirs else "unknown"

    context = (
        f"Top impact port: {top['name']} ({top['region']}). "
        f"Max wind forecast: {max_wind_kt} kt. "
        f"Max wave height: {max_wave} ft. "
        f"Max swell period: {max_period} s. "
        f"Dominant swell direction: {swell_dir}. "
        f"Max rain probability: {max_rain}%."
    )
    if runner_up:
        ru_wind = round(max((ms_to_kt(v) for v in runner_up["daily_wind_max"] if v is not None), default=0))
        context += (
            f" Runner-up: {runner_up['name']} ({runner_up['region']}), "
            f"max wind {ru_wind} kt."
        )

    prompt = (
        "You are James Van Fleet, former Chief Meteorologist of Royal Caribbean with 30+ years of experience. "
        "Based on the following forecast data, write:\n"
        "1. A punchy, professional news headline (max 10 words, no em dash, no quotes)\n"
        "2. A brief 2-sentence paragraph summarising the most impactful weather story across all cruise regions today. "
        "Write in first person as James. Be specific -- mention port names, wind speeds, wave heights. "
        "No em dash. No hype. Just clear professional meteorology.\n\n"
        f"Data: {context}\n\n"
        "Respond in JSON: {\"headline\": \"...\", \"paragraph\": \"...\"}"
    )

    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 300,
        "temperature": 0.6,
    }).encode()

    req = urllib.request.Request(
        f"{GROQ_BASE_URL}/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        content = result["choices"][0]["message"]["content"].strip()

    # Extract JSON from the response (Groq may wrap it in markdown code fences)
    if "```" in content:
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    data = json.loads(content)
    return data["headline"], data["paragraph"]

# ── Main ─────────────────────────────────────────────────────────────────────
async def main():
    print("Fetching forecast data for all ports...")
    all_ports = await fetch_all()

    # Score each port
    scored = sorted(all_ports, key=impact_score, reverse=True)
    top      = scored[0]
    runner_up = scored[1] if len(scored) > 1 else None

    print(f"Top impact port: {top['name']} ({top['region']}) -- score {impact_score(top):.1f}")
    if runner_up:
        print(f"Runner-up: {runner_up['name']} ({runner_up['region']}) -- score {impact_score(runner_up):.1f}")

    print("Generating story with Groq...")
    headline, paragraph = write_story(top, runner_up)
    print(f"Headline: {headline}")
    print(f"Paragraph: {paragraph}")

    out = {
        "date": date.today().isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "headline": headline,
        "paragraph": paragraph,
        "top_port": top["name"],
        "top_region": top["region"],
    }

    repo = Path(__file__).parent.parent
    targets = [
        repo / "client" / "public" / "top_story.json",
    ]
    for path in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out, indent=2))
        print(f"Written: {path}")

    print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
