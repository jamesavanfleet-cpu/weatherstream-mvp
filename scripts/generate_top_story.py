#!/usr/bin/env python3
"""
generate_top_story.py
Scans all region ports and produces TWO top story cards:
  1. Caribbean (Eastern Caribbean, Western Caribbean, Bahamas, Southern Caribbean, Lesser Antilles)
  2. Mediterranean (Western Mediterranean, Central Mediterranean, Eastern Mediterranean)
Each story starts directly with the weather content -- no opener phrase.
Outputs: client/public/top_story.json
"""

import asyncio, json, math, os, sys, time, urllib.request, urllib.error
from datetime import date, datetime, timezone
from pathlib import Path

import aiohttp

try:
    import httpx as _httpx
    _USE_HTTPX = True
except ImportError:
    _USE_HTTPX = False

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


def _format_rain_prob(value) -> str:
    """
    Render a precipitation-probability value as a human-readable phrase.
    Bug 2 fix: Any value strictly less than 10% is rendered as the fixed phrase
    'less than 10% rain probability'. Values of 10% or higher render as the
    literal integer percent.
    """
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = 0
    if v < 10:
        return "less than 10% rain probability"
    return f"{v}% rain probability"


def _normalize_low_rain_phrasing(text: str) -> str:
    """
    Post-generation rain-wording filter (Layer B for Bug 2).
    Rewrites any sub-10% rain phrasing in model output to the canonical phrase
    'less than 10% rain probability'. Values of 10% or higher untouched.
    """
    import re
    CANONICAL = "less than 10% rain probability"
    patterns = [
        re.compile(
            r"\b[0-9]\s*%\s*(?:chance\s+of\s+(?:rain|drizzle|showers|precipitation)|rain(?:fall)?(?:\s+chance|\s+probability|\s+chances)?|(?:rain\s+)?probability(?:\s+of\s+rain)?)\b",
            re.IGNORECASE,
        ),
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

# ── Port registry ─────────────────────────────────────────────────────────────
PORTS = [
    # Eastern Caribbean
    {"name": "San Juan",          "region": "Eastern Caribbean",    "group": "caribbean", "lat": 18.47, "lon": -66.12},
    {"name": "St. Thomas",        "region": "Eastern Caribbean",    "group": "caribbean", "lat": 18.34, "lon": -64.93},
    {"name": "St. Maarten",       "region": "Eastern Caribbean",    "group": "caribbean", "lat": 18.07, "lon": -63.07},
    {"name": "Antigua",           "region": "Eastern Caribbean",    "group": "caribbean", "lat": 17.12, "lon": -61.85},
    {"name": "Turks & Caicos",    "region": "Eastern Caribbean",    "group": "caribbean", "lat": 21.46, "lon": -71.14},
    # Western Caribbean
    {"name": "Cozumel",           "region": "Western Caribbean",    "group": "caribbean", "lat": 20.51, "lon": -86.95},
    {"name": "Roatan",            "region": "Western Caribbean",    "group": "caribbean", "lat": 16.32, "lon": -86.53},
    {"name": "Grand Cayman",      "region": "Western Caribbean",    "group": "caribbean", "lat": 19.29, "lon": -81.38},
    {"name": "Ocho Rios",         "region": "Western Caribbean",    "group": "caribbean", "lat": 18.41, "lon": -77.10},
    # Bahamas
    {"name": "Nassau",            "region": "Bahamas",              "group": "caribbean", "lat": 25.04, "lon": -77.35},
    {"name": "Freeport",          "region": "Bahamas",              "group": "caribbean", "lat": 26.53, "lon": -78.70},
    {"name": "Bimini",            "region": "Bahamas",              "group": "caribbean", "lat": 25.73, "lon": -79.30},
    # Southern Caribbean
    {"name": "Aruba",             "region": "Southern Caribbean",   "group": "caribbean", "lat": 12.52, "lon": -70.03},
    {"name": "Curacao",           "region": "Southern Caribbean",   "group": "caribbean", "lat": 12.11, "lon": -68.93},
    {"name": "Cartagena",         "region": "Southern Caribbean",   "group": "caribbean", "lat": 10.39, "lon": -75.48},
    # Lesser Antilles
    {"name": "Barbados",          "region": "Lesser Antilles",      "group": "caribbean", "lat": 13.10, "lon": -59.62},
    {"name": "St. Lucia",         "region": "Lesser Antilles",      "group": "caribbean", "lat": 13.91, "lon": -60.98},
    {"name": "Martinique",        "region": "Lesser Antilles",      "group": "caribbean", "lat": 14.64, "lon": -61.02},
    {"name": "Dominica",          "region": "Lesser Antilles",      "group": "caribbean", "lat": 15.30, "lon": -61.39},
    {"name": "Grenada",           "region": "Lesser Antilles",      "group": "caribbean", "lat": 12.11, "lon": -61.68},
    # Western Mediterranean
    {"name": "Lisbon",            "region": "Western Mediterranean","group": "mediterranean", "lat": 38.71, "lon": -9.14},
    {"name": "Cadiz",             "region": "Western Mediterranean","group": "mediterranean", "lat": 36.53, "lon": -6.30},
    {"name": "Barcelona",         "region": "Western Mediterranean","group": "mediterranean", "lat": 41.38, "lon":  2.18},
    {"name": "Palma de Mallorca", "region": "Western Mediterranean","group": "mediterranean", "lat": 39.57, "lon":  2.65},
    # Central Mediterranean
    {"name": "Marseille",         "region": "Central Mediterranean","group": "mediterranean", "lat": 43.30, "lon":  5.37},
    {"name": "Naples",            "region": "Central Mediterranean","group": "mediterranean", "lat": 40.85, "lon": 14.27},
    {"name": "Venice",            "region": "Central Mediterranean","group": "mediterranean", "lat": 45.44, "lon": 12.33},
    {"name": "Dubrovnik",         "region": "Central Mediterranean","group": "mediterranean", "lat": 42.65, "lon": 18.09},
    # Eastern Mediterranean
    {"name": "Athens (Piraeus)",  "region": "Eastern Mediterranean","group": "mediterranean", "lat": 37.94, "lon": 23.64},
    {"name": "Mykonos",           "region": "Eastern Mediterranean","group": "mediterranean", "lat": 37.45, "lon": 25.33},
    {"name": "Istanbul",          "region": "Eastern Mediterranean","group": "mediterranean", "lat": 41.01, "lon": 28.98},
    {"name": "Haifa",             "region": "Eastern Mediterranean","group": "mediterranean", "lat": 32.82, "lon": 34.99},
    # EPAC (kept for data completeness, not used for top stories)
    {"name": "Los Angeles",       "region": "Eastern Pacific",      "group": "epac", "lat": 33.73, "lon": -118.26},
    {"name": "Ensenada",          "region": "Eastern Pacific",      "group": "epac", "lat": 31.87, "lon": -116.60},
    {"name": "Cabo San Lucas",    "region": "Eastern Pacific",      "group": "epac", "lat": 22.89, "lon": -109.91},
    {"name": "Mazatlan",          "region": "Eastern Pacific",      "group": "epac", "lat": 23.22, "lon": -106.42},
    {"name": "Puerto Vallarta",   "region": "Eastern Pacific",      "group": "epac", "lat": 20.65, "lon": -105.22},
]

NHC_NWS_RULES = (
    "CRITICAL METEOROLOGICAL TERMINOLOGY RULES -- use official NWS/NHC/NOAA thresholds only:\n"
    "TROPICAL CYCLONES (NHC, 1-minute sustained winds): "
    "'Tropical Wave' = trough or cyclonic curvature in trade-wind easterlies, no closed circulation, no wind threshold. "
    "'Tropical Disturbance' = organized convection 100-300 nmi across, persisting 24+ hours, no closed circulation required. "
    "'Tropical Depression' = closed circulation present AND max sustained winds 33 kt (38 mph) or less. "
    "'Tropical Storm' = max sustained winds 34-63 kt (39-73 mph). "
    "'Hurricane' = max sustained winds 64 kt (74 mph) or more. "
    "If conditions do not meet a threshold, use 'tropical wave', 'tropical moisture', 'tropical disturbance', or 'tropical weather system'. "
    "MARINE WIND WARNINGS (NWS, non-tropical): "
    "'Small Craft Advisory' = sustained winds 20-33 kt or seas 7 ft or greater for more than 2 hours. "
    "'Gale Warning' = sustained winds or frequent gusts 34-47 kt (39-54 mph). "
    "'Storm Warning' = sustained winds or frequent gusts 48-63 kt (55-73 mph). "
    "'Hurricane Force Wind Warning' = sustained winds or frequent gusts 64 kt (74 mph) or more, not associated with a tropical cyclone. "
    "SEVERE THUNDERSTORM (NWS): requires winds at least 58 mph (50 kt) OR hail at least 1 inch diameter OR a tornado. "
    "SIGNIFICANT WAVE HEIGHT (NOAA): Mean height of highest one-third of all waves. "
    "GUST (NOAA): Rapid wind fluctuation with variations of 10 kt or more between peaks and lulls. "
    "WATERSPOUT: Rotating column of air over water. Not the same as a tornado. "
    "WIND (NWS): 'Wind Advisory' = sustained 31-39 mph (27-34 kt) for >= 1 hour OR gusts 46-57 mph (40-49 kt). "
    "'High Wind Warning' = sustained >= 40 mph (35 kt) for >= 1 hour OR gusts >= 58 mph (50 kt). "
    "FLOOD: 'Flash Flood Warning' = rapid extreme flow or rapid stream rise from heavy rain, dam/levee failure, or ice jam. "
    "'Flood Warning' = overflow causing damage and/or threat to life. "
    "HEAT (NWS): 'Excessive Heat Warning' = Heat Index >= 105 F for 2 consecutive hours. "
    "FOG: 'Dense Fog Advisory' = visibility <= 1/4 mile for >= 3 hours. "
    "Never apply a classification that exceeds what the data supports.\n\n"
)

# ── Helpers ───────────────────────────────────────────────────────────────────
def ms_to_kt(ms: float) -> float:
    return ms * 1.94384

def deg_to_compass(deg: float) -> str:
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"]
    return dirs[round(deg / 22.5) % 16]

def impact_score(data: dict) -> float:
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

# ── Async fetch ───────────────────────────────────────────────────────────────
async def fetch_port(session: aiohttp.ClientSession, port: dict) -> dict:
    lat, lon = port["lat"], port["lon"]
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&daily=wind_speed_10m_max,wind_direction_10m_dominant,weathercode"
        f"&wind_speed_unit=ms&timezone=auto&forecast_days=7"
    )
    # Separate PoP fetch using default best_match model (no model parameter).
    # The ECMWF IFS025 precipitation_probability field is an ensemble-spread metric,
    # not a standard PoP, and systematically overstates rain chances in humid climates.
    # The best_match model provides standard PoP values consistent with NWS.
    pop_url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&daily=precipitation_probability_max"
        f"&hourly=precipitation_probability"
        f"&timezone=auto&forecast_days=7"
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
            result["daily_dates"]    = d.get("time", [])
    except Exception as e:
        print(f"  Weather fetch failed for {port['name']}: {e}", file=sys.stderr)

    try:
        async with session.get(pop_url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            p = await r.json()
            pd = p.get("daily", {})
            hourly_probs = p.get("hourly", {}).get("precipitation_probability", [])
            num_days = len(pd.get("time", []))
            daily_max = pd.get("precipitation_probability_max", [])
            daily_means = []
            for day_idx in range(num_days):
                start = day_idx * 24
                end = start + 24
                day_probs = [v for v in hourly_probs[start:end] if v is not None]
                if day_probs:
                    daily_means.append(round(sum(day_probs) / len(day_probs)))
                else:
                    daily_means.append(daily_max[day_idx] if day_idx < len(daily_max) else 0)
            result["daily_rain"] = daily_means
    except Exception as e:
        print(f"  PoP fetch failed for {port['name']}: {e}", file=sys.stderr)

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
def write_story(top: dict, runner_up: dict | None, group_label: str) -> tuple[str, str]:
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
        f"Top impact port in the {group_label}: {top['name']} ({top['region']}). "
        f"Max wind forecast: {max_wind_kt} kt. "
        f"Max wave height: {max_wave} ft. "
        f"Max swell period: {max_period} s. "
        f"Dominant swell direction: {swell_dir}. "
        f"Max rain: {_format_rain_prob(max_rain)}."
    )
    if runner_up:
        ru_wind = round(max((ms_to_kt(v) for v in runner_up["daily_wind_max"] if v is not None), default=0))
        context += (
            f" Runner-up: {runner_up['name']} ({runner_up['region']}), "
            f"max wind {ru_wind} kt."
        )

    prompt = (
        "You are James Van Fleet, former Chief Meteorologist of Royal Caribbean with 30+ years of experience. "
        f"Based on the following forecast data for the {group_label}, write:\n"
        "1. A punchy, professional news headline (max 10 words, no em dash, no quotes)\n"
        "2. A brief 2-sentence paragraph summarising the most impactful weather story in this region today. "
        "Write in first person as James. Be specific -- mention port names, wind speeds, wave heights. "
        "IMPORTANT: Start the paragraph DIRECTLY with the weather content. "
        "Do NOT start with phrases like 'As I analyze', 'Looking at', 'Reviewing the data', or any similar opener. "
        "Begin immediately with the location and conditions, for example: 'Marseille is experiencing...' or 'Strong winds are building across...'. "
        "No em dash. No hype. Just clear professional meteorology.\n"
        "RAIN PROBABILITY PHRASING: "
        "The Data block above already shows the correct wording for every value: it uses the exact phrase 'less than 10% rain probability' for any value below 10%, and it uses the literal integer percentage (for example '45% rain probability') for values at 10% or higher. "
        "Carry that exact wording through into the paragraph verbatim. Do not invent any sub-10% literal phrasing such as '0% rain chance', 'zero percent rain', '4% chance of drizzle', or '5% rain probability'. "
        "Do not mention this rule, the 10% threshold, or the phrase 'is not applicable' in your output. Just write naturally using whichever wording the data provides.\n"
        + NHC_NWS_RULES
        + f"Data: {context}\n\n"
        "Respond in JSON: {\"headline\": \"...\", \"paragraph\": \"...\"}"
    )

    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 300,
        "temperature": 0.6,
    }).encode()

    url = f"{GROQ_BASE_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "User-Agent": "WeatherStream/1.0",
    }
    # Retry with exponential backoff to handle 429 rate limit responses
    content = None
    for attempt in range(4):
        try:
            if _USE_HTTPX:
                resp = _httpx.post(url, content=payload, headers=headers, timeout=30)
                if resp.status_code == 429 and attempt < 3:
                    wait = 10 * (2 ** attempt)
                    print(f"  Rate limit -- waiting {wait}s before retry {attempt+1}/3", file=sys.stderr)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                result = resp.json()
            else:
                req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=30) as r:
                    result = json.loads(r.read())
            content = result["choices"][0]["message"]["content"].strip()
            break
        except Exception as e:
            if attempt < 3:
                wait = 5 * (attempt + 1)
                print(f"  API call attempt {attempt+1} failed ({e}) -- retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
            else:
                raise
    if content is None:
        raise RuntimeError("API failed after 4 attempts")

    # Strip markdown code fences if present
    if "```" in content:
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    # Validate JSON and required fields
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Groq returned invalid JSON: {e}\nRaw content: {content[:200]}")

    headline = data.get("headline", "").strip()
    paragraph = data.get("paragraph", "").strip()

    if not headline or len(headline) < 5:
        raise ValueError(f"Groq returned empty or too-short headline: {repr(headline)}")
    if not paragraph or len(paragraph) < 20:
        raise ValueError(f"Groq returned empty or too-short paragraph: {repr(paragraph)}")

    return headline, paragraph

# ── Data-driven fallback (used when Groq API call fails) ─────────────────────
def build_fallback(top: dict, group_label: str) -> tuple[str, str]:
    """Produce a specific, data-driven headline and paragraph without Groq."""
    max_wind_kt = round(max((ms_to_kt(v) for v in top["daily_wind_max"] if v is not None), default=0))
    max_wave    = round(max((v for v in top["daily_wave_max"] if v is not None), default=0), 1)
    max_rain    = round(max((v for v in top["daily_rain"] if v is not None), default=0))
    max_period  = round(max((v for v in top["daily_swell_period"] if v is not None), default=0))
    swell_dirs  = [deg_to_compass(v) for v in top["daily_swell_dir"] if v is not None]
    swell_dir   = swell_dirs[0] if swell_dirs else None

    headline = f"{group_label} Conditions: {top['name']}"

    # Build a sentence about wind and waves
    wind_str = f"winds peaking at {max_wind_kt} kt" if max_wind_kt > 0 else "light winds"
    wave_str = f"seas building to {max_wave} ft" if max_wave > 0 else "calm seas"
    swell_str = f" with {swell_dir} swell at {max_period}s periods" if swell_dir and max_period > 0 else ""
    sentence1 = (
        f"{top['name']} in the {top['region']} is the highest-impact location in the {group_label} "
        f"this period, with {wind_str} and {wave_str}{swell_str}."
    )

    # Build a sentence about rain and overall outlook
    # Bug 2: route all rain wording through _format_rain_prob so values <10% render
    # as 'less than 10% rain probability' instead of '0%' or '4%'.
    rain_phrase = _format_rain_prob(max_rain)
    if max_rain >= 60:
        rain_str = f"{rain_phrase} -- expect disrupted conditions for shore excursions and tender operations."
    elif max_rain >= 30:
        rain_str = f"{rain_phrase} -- isolated showers possible but conditions remain manageable."
    else:
        rain_str = f"{rain_phrase} -- overall conditions are favorable for cruise operations."
    sentence2 = rain_str

    paragraph = f"{sentence1} {sentence2}"
    return headline, paragraph


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    print("Fetching forecast data for all ports...")
    all_ports = await fetch_all()

    # Split by group
    caribbean_ports = [p for p in all_ports if p.get("group") == "caribbean"]
    med_ports       = [p for p in all_ports if p.get("group") == "mediterranean"]

    # Score each group independently
    carib_scored = sorted(caribbean_ports, key=impact_score, reverse=True)
    med_scored   = sorted(med_ports, key=impact_score, reverse=True)

    carib_top      = carib_scored[0]
    carib_runner   = carib_scored[1] if len(carib_scored) > 1 else None
    med_top        = med_scored[0]
    med_runner     = med_scored[1] if len(med_scored) > 1 else None

    print(f"Caribbean top: {carib_top['name']} ({carib_top['region']}) -- score {impact_score(carib_top):.1f}")
    print(f"Mediterranean top: {med_top['name']} ({med_top['region']}) -- score {impact_score(med_top):.1f}")

    # Generate Caribbean story with fallback on failure
    print("Generating Caribbean story with Groq...")
    try:
        carib_headline, carib_paragraph = write_story(carib_top, carib_runner, "Caribbean")
    except Exception as e:
        print(f"  Caribbean story failed: {e} -- using fallback", file=sys.stderr)
        carib_headline, carib_paragraph = build_fallback(carib_top, "Caribbean")

    # Brief pause between Groq calls to avoid rate limiting
    print("Pausing 8 seconds before Mediterranean story call...")
    time.sleep(8)

    # Generate Mediterranean story with fallback on failure
    print("Generating Mediterranean story with Groq...")
    try:
        med_headline, med_paragraph = write_story(med_top, med_runner, "Mediterranean")
    except Exception as e:
        print(f"  Mediterranean story failed: {e} -- using fallback", file=sys.stderr)
        med_headline, med_paragraph = build_fallback(med_top, "Mediterranean")

    # --- Layer B for Bug 2: post-filter both paragraphs to canonicalize sub-10% rain wording ---
    carib_paragraph = _normalize_low_rain_phrasing(carib_paragraph)
    med_paragraph   = _normalize_low_rain_phrasing(med_paragraph)

    print(f"Caribbean headline: {carib_headline}")
    print(f"Med headline: {med_headline}")

    out = {
        "date": date.today().isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "caribbean": {
            "headline": carib_headline,
            "paragraph": carib_paragraph,
            "top_port": carib_top["name"],
            "top_region": carib_top["region"],
        },
        "mediterranean": {
            "headline": med_headline,
            "paragraph": med_paragraph,
            "top_port": med_top["name"],
            "top_region": med_top["region"],
        },
    }

    repo = Path(__file__).parent.parent
    target = repo / "client" / "public" / "top_story.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, indent=2))
    print(f"Written: {target}")
    print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
