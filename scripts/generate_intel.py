#!/usr/bin/env python3
"""
Daily intel generator for WeatherStream MVP.
Fetches live weather from Open-Meteo for each region's representative port,
then calls Groq to write a fresh James Van Fleet-style intel briefing.
Outputs intel.json to stdout (captured by GitHub Actions and committed to gh-pages).
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

try:
    import httpx as _httpx
    _USE_HTTPX = True
except ImportError:
    _USE_HTTPX = False

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

REGIONS = [
    {
        "slug": "us-ports",
        "name": "US Ports",
        "rep_port": "Miami, Florida",
        "lat": 25.76,
        "lon": -80.19,
        "ports": ["Miami", "Port Everglades", "Port Canaveral", "Tampa Bay", "Jacksonville", "Galveston", "New Orleans", "Houston", "Bayonne", "Brooklyn", "Manhattan", "Baltimore", "Boston", "Norfolk", "Charleston", "Savannah", "Long Beach", "Los Angeles", "San Diego", "San Francisco"],
        "priority_note": "PORT PRIORITY DIRECTIVE (do not quote any of this in your output): open the briefing by addressing conditions at Miami. The lead port priority order for this region is: Miami, then Port Everglades, then Port Canaveral, then Tampa Bay. Other US ports may be referenced only when their conditions are operationally significant for cruise operations, and never as the opening sentence.",
        "required_lead_port": "Miami",
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
    },
]


def fetch_weather(lat: float, lon: float) -> dict:
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode,precipitation_probability"
        f"&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,"
        f"precipitation_probability_max,weathercode"
        f"&hourly=precipitation_probability"
        f"&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=3"
    )
    # Retry up to 3 times with backoff for transient network errors
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
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                data = json.loads(resp.read())
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
        except Exception as e:
            if attempt < 2:
                wait = 5 * (attempt + 1)
                print(f"  PoP fetch attempt {attempt+1} failed ({e}) -- retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
            else:
                print(f"  PoP fetch failed after 3 attempts ({e}) -- falling back to None", file=sys.stderr)
                return []


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


def build_weather_summary(wx: dict, pop_means: list = None) -> dict:
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
    if c["weathercode"] >= 80:  # rain showers or thunderstorms
        significant.append(f"ACTIVE SIGNIFICANT WEATHER NOW: {cond} with {rain_phrase}")
    if wind_kt >= 20:
        significant.append(f"ELEVATED WINDS NOW: {wind_dir} {wind_kt}kt")
    for i in range(min(3, len(d["time"]))):
        w_kt = ms_to_kt(d["wind_speed_10m_max"][i])
        r = daily_rain_means[i] if i < len(daily_rain_means) else (d["precipitation_probability_max"][i] or 0)
        cond_d = wmo_to_text(d["weathercode"][i])
        day_label = "today" if i == 0 else f"Day {i+1}"
        if d["weathercode"][i] >= 80:
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
        f"Write 4-5 sentences. Start with 'Today'. Use a direct, first-person operational voice as if speaking directly to passengers and crew. "
        f"ABSOLUTE RULES: "
        f"Every sentence must reference a specific data point from the live forecast (wind speed/direction, rain probability, sky condition). "
        f"You are FORBIDDEN from making any general, climatological, or typical-weather statements. "
        f"Do NOT write anything like 'the Bahamas typically sees trade winds' or 'cold fronts can bring NW winds' or any statement about what weather is usually like. "
        f"Only describe what the data says is happening or forecast for the next 3 days. "
        f"Name specific ports when describing impacts. "
        f"This briefing is exclusively for cruise passengers and cruise vessels. Do NOT mention fishing captains, fishing boats, charter captains, charter vessels, yachts, or any non-cruise marine activity. Focus only on: port conditions, embarkation/disembarkation weather, shore excursion impacts, and cruise ship operations. "
        f"Do not use em dashes. Do not mention the data source. "
        f"ABSOLUTE RULE -- TEMPERATURES: You must NEVER include any temperature value of any kind in this briefing. "
        f"This means no current temperatures, no forecast high or low temperatures, no feels-like values, no dew point values, and no heat index values. "
        f"Do not write phrases like 'temperatures in the 70s', 'mild temperatures', 'warm at 80 degrees', '59F', '25C', or any variation. "
        f"The briefing is a forward-looking threat and hazard summary only. Describe wind speed and direction, rain probability, visibility, sea state, and sky conditions. "
        f"Temperatures are displayed separately in the live conditions section of the site and must never appear in this briefing. "
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
        "max_tokens": 400,  # raised from 200 -- prevents mid-sentence truncation
        "temperature": 0.7,
    }).encode()

    url = f"{GROQ_BASE_URL}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "User-Agent": "WeatherStream/1.0",
    }
    # Retry with exponential backoff to handle 429 rate limit responses
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
            return result["choices"][0]["message"]["content"].strip()
        except Exception as e:
            if attempt < 3:
                wait = 5 * (attempt + 1)
                print(f"  API call attempt {attempt+1} failed ({e}) -- retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("API failed after 4 attempts")


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
        r"\b(?:mild|warm|cool|cold|hot|chilly|balmy)\s+(?:air|conditions|weather)\b",  # warm conditions
        r"\bhigh\s+(?:near|around|of)\s+\d",        # high near 85
        r"\blow\s+(?:near|around|of)\s+\d",         # low near 70
    ]
    combined = re.compile("|".join(TEMP_PATTERNS), re.IGNORECASE)

    # Split into sentences, filter out any that contain a temperature pattern
    # Use a sentence splitter that preserves abbreviations like kt, mph, etc.
    sentences = re.split(r"(?<=[.!?])\s+", text)
    clean = []
    stripped_count = 0
    for sentence in sentences:
        if combined.search(sentence):
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
            new_intel = strip_temperatures(new_intel.strip())
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
            new_intel = strip_temperatures(new_intel.strip())
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


def main():
    if not GROQ_API_KEY:
        print("ERROR: GROQ_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    now_utc = datetime.now(timezone.utc)
    output = {
        "generated": date.today().isoformat(),
        "generated_utc": now_utc.strftime("%Y-%m-%dT%H:%M UTC"),
        "regions": {}
    }

    for i, region in enumerate(REGIONS):
        print(f"Processing {region['name']}...", file=sys.stderr)
        # Add inter-region delay after every 3 regions to avoid Groq rate limits
        if i > 0 and i % 3 == 0:
            print("  Pausing 5s to avoid Groq rate limit...", file=sys.stderr)
            time.sleep(5)
        try:
            wx = fetch_weather(region["lat"], region["lon"])
            pop_means = fetch_precip_probability(region["lat"], region["lon"])
            weather_data = build_weather_summary(wx, pop_means=pop_means)
            intel = call_groq(region, weather_data)
            # Validate: must be a non-empty string of at least 20 characters
            if not intel or len(intel.strip()) < 20:
                raise ValueError(f"Groq returned suspiciously short response: {repr(intel)}")
            # --- LAYER 2: Post-generation temperature filter ---
            # Hard mechanical backstop: remove any sentence that contains a temperature
            # value regardless of what the AI produced. This catches any slip-through
            # that the prompt rules did not prevent.
            intel = strip_temperatures(intel.strip())
            # --- LAYER B for Bug 2: rewrite any sub-10% rain phrasing ---
            # Hard mechanical backstop: convert any '0% rain', '4% chance of drizzle',
            # 'zero percent rain probability' etc. to 'less than 10% rain probability'.
            intel = _normalize_low_rain_phrasing(intel)
            # --- LEAD-PORT VALIDATOR (Layer B for required_lead_port regions) ---
            # If the region declares a required_lead_port and the model failed to lead
            # with it, regenerate with a corrective prefix; if still failing, hard-repair.
            intel = _validate_and_repair_lead(region, intel, weather_data)
            # --- RULE-LEAK VALIDATOR (Layer B against prompt-text echo) ---
            # If the model echoed any directive phrase into the output (e.g. "the primary
            # US cruise homeport"), regenerate; after max retries, mechanically strip.
            # Applies to ALL regions automatically.
            intel = _validate_and_repair_rule_leaks(region, intel, weather_data)
            output["regions"][region["slug"]] = intel
            print(f"  OK: {intel[:80]}...", file=sys.stderr)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            # Keep any previously generated value; fall back to empty string
            output["regions"].setdefault(region["slug"], "")

    # Write directly to file (not stdout) to avoid truncation on crash
    repo = Path(__file__).parent.parent
    target = repo / "client" / "public" / "intel.json"
    target.parent.mkdir(parents=True, exist_ok=True)

    # Validate: ensure at least half the regions have non-empty intel
    non_empty = sum(1 for v in output["regions"].values() if v)
    total = len(output["regions"])
    if non_empty < total // 2:
        print(f"WARNING: Only {non_empty}/{total} regions have intel -- output may be degraded", file=sys.stderr)

    target.write_text(json.dumps(output, indent=2))
    print(f"intel.json written: {target.stat().st_size} bytes, {non_empty}/{total} regions populated", file=sys.stderr)


if __name__ == "__main__":
    main()
