#!/usr/bin/env python3
"""
run_intel.py
Wrapper for generate_intel.py that uses OpenAI GPT-4.1-mini when GROQ_API_KEY
is not available. All prompts, regions, and logic are identical to generate_intel.py.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path

# Use Groq if available, otherwise fall back to OpenAI-compatible API
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

if GROQ_API_KEY:
    API_KEY = GROQ_API_KEY
    API_BASE = "https://api.groq.com/openai/v1"
    MODEL = "llama-3.3-70b-versatile"
    print("Using Groq API (llama-3.3-70b-versatile)", file=sys.stderr)
elif OPENAI_API_KEY:
    API_KEY = OPENAI_API_KEY
    API_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.manus.im/api/llm-proxy/v1")
    MODEL = "gpt-4.1-mini"
    print("Using OpenAI-compatible API (gpt-4.1-mini)", file=sys.stderr)
else:
    print("ERROR: Neither GROQ_API_KEY nor OPENAI_API_KEY is set", file=sys.stderr)
    sys.exit(1)

REGIONS = [
    {
        "slug": "eastern-caribbean",
        "name": "Eastern Caribbean",
        "rep_port": "San Juan, Puerto Rico",
        "lat": 18.47,
        "lon": -66.12,
        "ports": ["San Juan", "St. Thomas", "St. Croix", "St. Maarten", "St. Kitts", "Antigua", "Turks & Caicos"],
    },
    {
        "slug": "western-caribbean",
        "name": "Western Caribbean",
        "rep_port": "Cozumel, Mexico",
        "lat": 20.51,
        "lon": -86.95,
        "ports": ["Cozumel", "Costa Maya", "Roatan", "Belize City", "Grand Cayman", "Ocho Rios", "Falmouth"],
    },
    {
        "slug": "bahamas",
        "name": "Bahamas",
        "rep_port": "Nassau, Bahamas",
        "lat": 25.04,
        "lon": -77.35,
        "ports": ["Nassau", "Freeport", "Bimini", "Berry Islands", "Turks & Caicos"],
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
        "slug": "central-caribbean",
        "name": "Central Caribbean",
        "rep_port": "Grand Cayman",
        "lat": 19.29,
        "lon": -81.38,
        "ports": ["Roatan", "Belize City", "Grand Cayman", "Cozumel", "Costa Maya"],
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
]


def fetch_weather(lat: float, lon: float) -> dict:
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode,precipitation_probability"
        f"&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,"
        f"precipitation_probability_max,weathercode"
        f"&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=3"
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < 2:
                wait = 5 * (attempt + 1)
                print(f"  Open-Meteo fetch attempt {attempt+1} failed ({e}) -- retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
            else:
                raise


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


def build_weather_summary(wx: dict) -> str:
    c = wx["current"]
    d = wx["daily"]
    temp_f = c_to_f(c["temperature_2m"])
    wind_kt = ms_to_kt(c["wind_speed_10m"])
    wind_dir = deg_to_compass(c["wind_direction_10m"])
    cond = wmo_to_text(c["weathercode"])
    rain = c.get("precipitation_probability", 0) or 0

    outlook_parts = []
    for i in range(min(3, len(d["time"]))):
        max_f = c_to_f(d["temperature_2m_max"][i])
        w_kt = ms_to_kt(d["wind_speed_10m_max"][i])
        w_dir = deg_to_compass(d["wind_direction_10m_dominant"][i])
        r = d["precipitation_probability_max"][i] or 0
        cond_d = wmo_to_text(d["weathercode"][i])
        outlook_parts.append(f"Day {i+1}: {max_f}F, {w_dir} {w_kt}kt, {cond_d}, {r}% rain")

    return (
        f"Current: {temp_f}F, {wind_dir} {wind_kt}kt, {cond}, {rain}% rain chance. "
        f"3-day outlook: {'; '.join(outlook_parts)}."
    )


def call_llm(region: dict, weather_summary: str) -> str:
    today = date.today().strftime("%B %d, %Y")
    ports_list = ", ".join(region["ports"])
    prompt = (
        f"You are James Van Fleet, former Chief Meteorologist for Royal Caribbean with 30+ years of experience. "
        f"Write a concise, practical daily weather intel briefing for the {region['name']} region "
        f"(ports: {ports_list}) for {today}. "
        f"Base it on this live weather data for {region['rep_port']}: {weather_summary} "
        f"Write 3-4 sentences in a direct, professional mariner's voice. "
        f"Include actionable tips for cruise passengers, yacht captains, or fishing captains. "
        f"Mention specific ports or anchorage conditions where relevant. "
        f"Do not use em dashes. Do not start with 'I'. Do not mention the data source. "
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
        f"Never apply a classification that exceeds what the data supports."
    )

    payload = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 200,
        "temperature": 0.7,
    }).encode()

    req = urllib.request.Request(
        f"{API_BASE}/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
            "User-Agent": "WeatherStream/1.0",
        },
        method="POST",
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
                return result["choices"][0]["message"]["content"].strip()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                wait = 10 * (2 ** attempt)
                print(f"  Rate limit -- waiting {wait}s before retry {attempt+1}/3", file=sys.stderr)
                time.sleep(wait)
                req = urllib.request.Request(
                    f"{API_BASE}/chat/completions",
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {API_KEY}",
                        "User-Agent": "WeatherStream/1.0",
                    },
                    method="POST",
                )
            else:
                raise
        except Exception as e:
            if attempt < 3:
                wait = 5 * (attempt + 1)
                print(f"  LLM call attempt {attempt+1} failed ({e}) -- retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("LLM API failed after 4 attempts")


def main():
    now_utc = datetime.now(timezone.utc)
    output = {
        "generated": date.today().isoformat(),
        "generated_utc": now_utc.strftime("%Y-%m-%dT%H:%M UTC"),
        "regions": {}
    }

    for i, region in enumerate(REGIONS):
        print(f"Processing {region['name']}...", file=sys.stderr)
        if i > 0 and i % 3 == 0:
            print("  Pausing 3s between batches...", file=sys.stderr)
            time.sleep(3)
        try:
            wx = fetch_weather(region["lat"], region["lon"])
            summary = build_weather_summary(wx)
            intel = call_llm(region, summary)
            if not intel or len(intel.strip()) < 20:
                raise ValueError(f"LLM returned suspiciously short response: {repr(intel)}")
            output["regions"][region["slug"]] = intel.strip()
            print(f"  OK: {intel[:80]}...", file=sys.stderr)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            output["regions"].setdefault(region["slug"], "")

    repo = Path(__file__).parent.parent
    target = repo / "client" / "public" / "intel.json"
    target.parent.mkdir(parents=True, exist_ok=True)

    non_empty = sum(1 for v in output["regions"].values() if v)
    total = len(output["regions"])
    if non_empty < total // 2:
        print(f"WARNING: Only {non_empty}/{total} regions have intel -- output may be degraded", file=sys.stderr)

    target.write_text(json.dumps(output, indent=2))
    print(f"intel.json written: {target.stat().st_size} bytes, {non_empty}/{total} regions populated", file=sys.stderr)


if __name__ == "__main__":
    main()
