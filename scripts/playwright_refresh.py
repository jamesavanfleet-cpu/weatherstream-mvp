#!/usr/bin/env python3
"""
playwright_refresh.py -- Playwright-based cruise itinerary refresh script.

This script uses a real Chromium browser (via Playwright) to navigate CruiseMapper
ship pages exactly as a human would:
  1. Open each ship's CruiseMapper page
  2. Find all sailings in the 30-day rolling window
  3. Click each sailing row to reveal the port-by-port itinerary table
  4. Extract real port names, dates, and times from the expanded table
  5. Validate and write to cruise_itineraries.json
  6. Push updated JSON to gh-pages (when run in GitHub Actions)

To add a new ship: add one entry to scripts/ship_id_lookup.json.
No other changes needed.

Usage:
  python3 playwright_refresh.py              # full refresh, all ships
  python3 playwright_refresh.py --dry-run    # report only, no file write
  python3 playwright_refresh.py --ship "Norwegian Escape"  # single ship
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
JSON_PATH = os.path.join(REPO_ROOT, 'client', 'public', 'cruise_itineraries.json')
LOOKUP_PATH = os.path.join(SCRIPT_DIR, 'ship_id_lookup.json')

TODAY = date.today()
MAX_FUTURE_DAYS = 30   # rolling window: today + 30 days
CUTOFF = TODAY + timedelta(days=MAX_FUTURE_DAYS)

# Polite delay between ships (seconds) -- avoids hammering CruiseMapper
DELAY_BETWEEN_SHIPS = 2.0
# Delay after clicking a row to wait for the expand table to appear
DELAY_AFTER_CLICK = 2.0

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# ---------------------------------------------------------------------------
# Port coordinate database (lat, lon)
# ---------------------------------------------------------------------------

PORT_COORDS = {
    # US departure ports
    "New Orleans": (29.9511, -90.0715),
    "Miami": (25.7617, -80.1918),
    "Port Canaveral": (28.4158, -80.5998),
    "Fort Lauderdale": (26.1224, -80.1373),
    "Tampa": (27.9506, -82.4572),
    "Galveston": (29.3013, -94.7977),
    "Jacksonville": (30.3322, -81.6557),
    "Mobile": (30.6954, -88.0399),
    "Baltimore": (39.2904, -76.6122),
    "New York": (40.7128, -74.0060),
    "Cape Liberty": (40.6443, -74.0774),
    "Boston": (42.3601, -71.0589),
    "Norfolk": (36.8508, -76.2859),
    "Charleston": (32.7765, -79.9311),
    "Los Angeles": (33.7701, -118.1937),
    "Long Beach": (33.7701, -118.1937),
    "San Diego": (32.7157, -117.1611),
    "San Francisco": (37.8044, -122.2712),
    "Seattle": (47.6062, -122.3321),
    "Vancouver": (49.2827, -123.1207),
    # Caribbean ports
    "San Juan": (18.4655, -66.1057),
    "St. Thomas": (18.3381, -64.9312),
    "St Thomas": (18.3381, -64.9312),
    "St. Maarten": (18.0425, -63.0548),
    "Sint Maarten": (18.0425, -63.0548),
    "St. Martin": (18.0731, -63.0822),
    "Barbados": (13.1939, -59.5432),
    "Bridgetown": (13.1008, -59.6145),
    "Martinique": (14.6415, -61.0242),
    "Fort-de-France": (14.6037, -61.0750),
    "St. Lucia": (13.9094, -60.9789),
    "Castries": (14.0101, -60.9875),
    "Antigua": (17.1274, -61.8468),
    "St. Kitts": (17.3578, -62.7830),
    "Basseterre": (17.2948, -62.7261),
    "Dominica": (15.4150, -61.3710),
    "Roseau": (15.3017, -61.3881),
    "Grenada": (12.1165, -61.6790),
    "Aruba": (12.5211, -69.9683),
    "Curacao": (12.1696, -68.9900),
    "Willemstad": (12.1084, -68.9335),
    "Bonaire": (12.2019, -68.2624),
    "Cozumel": (20.5069, -86.9575),
    "Costa Maya": (18.7200, -87.7100),
    "Roatan": (16.3167, -86.5333),
    "Harvest Caye": (16.5500, -88.3500),
    "Belize City": (17.2510, -88.7590),
    "Belize": (17.2510, -88.7590),
    "Mahogany Bay": (16.3197, -86.5263),
    "Puerto Morelos": (20.8676, -86.8760),
    "Progreso": (21.2833, -89.6667),
    "Grand Cayman": (19.3133, -81.2546),
    "George Town": (19.2869, -81.3674),
    "Jamaica": (17.9712, -76.7936),
    "Falmouth": (18.4940, -77.6580),
    "Falmouth Jamaica": (18.4940, -77.6580),
    "Ocho Rios": (18.4072, -77.1037),
    "Montego Bay": (18.4762, -77.8939),
    "Nassau": (25.0480, -77.3554),
    "Freeport": (26.5285, -78.6959),
    "Half Moon Cay": (24.8833, -76.2167),
    "Princess Cays": (23.2667, -75.3167),
    "Eleuthera": (25.1333, -76.1500),
    "Great Stirrup Cay": (25.8167, -77.7167),
    "Perfect Day at CocoCay": (25.8167, -77.7167),
    "CocoCay": (25.8167, -77.7167),
    "Coco Cay": (25.8167, -77.7167),
    "Ocean Cay": (25.4000, -79.0833),
    "Ocean Cay MSC Marine Reserve": (25.4000, -79.0833),
    "Castaway Cay": (26.0000, -77.5500),
    "Lookout Cay": (26.0000, -77.5500),
    "Amber Cove": (19.8383, -70.7050),
    "Puerto Plata": (19.7930, -70.6890),
    "La Romana": (18.4274, -68.9728),
    "Punta Cana": (18.5601, -68.3725),
    "Samana": (19.2057, -69.3364),
    "Labadee": (19.7667, -72.2333),
    "Grand Turk": (21.4667, -71.1333),
    "Tortola": (18.4167, -64.6167),
    "Road Town": (18.4167, -64.6167),
    "St. Croix": (17.7291, -64.7897),
    "Frederiksted": (17.7130, -64.8830),
    "Christiansted": (17.7463, -64.7003),
    "St. John": (18.3333, -64.7333),
    "Virgin Gorda": (18.4833, -64.4333),
    "Guadeloupe": (16.2650, -61.5510),
    "Pointe-a-Pitre": (16.2415, -61.5336),
    "Trinidad": (10.6918, -61.2225),
    "Cartagena": (10.3910, -75.4794),
    "Colon": (9.3547, -79.9013),
    "Panama City": (8.9936, -79.5197),
    "Puerto Limon": (9.9925, -83.0302),
    "Limon": (9.9925, -83.0302),
    "Puerto Caldera": (9.9019, -84.7158),
    "Puntarenas": (9.9764, -84.8380),
    "Huatulco": (15.7667, -96.1333),
    "Acapulco": (16.8531, -99.8237),
    "Manzanillo": (19.0522, -104.3144),
    "Puerto Vallarta": (20.6534, -105.2253),
    "Cabo San Lucas": (22.8905, -109.9167),
    "Ensenada": (31.8667, -116.5960),
    "Catalina Island": (33.3894, -118.4159),
    "Avalon": (33.3894, -118.4159),
    "Mazatlan": (23.2494, -106.4111),
    "Ixtapa": (17.6667, -101.5500),
    "Zihuatanejo": (17.6392, -101.5553),
    # Alaska
    "Juneau": (58.3005, -134.4197),
    "Skagway": (59.4583, -135.3139),
    "Ketchikan": (55.3422, -131.6461),
    "Sitka": (57.0531, -135.3300),
    "Haines": (59.2358, -135.4453),
    "Icy Strait Point": (58.1333, -135.4500),
    "Hubbard Glacier": (60.0000, -139.5000),
    "Glacier Bay": (58.5000, -136.0000),
    "College Fjord": (61.0000, -148.0000),
    "Whittier": (60.7736, -148.6839),
    "Seward": (60.1042, -149.4427),
    "Anchorage": (61.2181, -149.9003),
    "Victoria": (48.4284, -123.3656),
    # Bermuda
    "Bermuda": (32.3078, -64.7505),
    "Hamilton": (32.2942, -64.7839),
    "King's Wharf": (32.3167, -64.8333),
    # Mediterranean
    "Barcelona": (41.3851, 2.1734),
    "Rome": (41.8719, 12.5674),
    "Civitavecchia": (42.0939, 11.7944),
    "Naples": (40.8518, 14.2681),
    "Palermo": (38.1157, 13.3615),
    "Messina": (38.1938, 15.5540),
    "Catania": (37.5079, 15.0830),
    "Valletta": (35.8997, 14.5147),
    "Malta": (35.8997, 14.5147),
    "Athens": (37.9838, 23.7275),
    "Piraeus": (37.9477, 23.6464),
    "Santorini": (36.3932, 25.4615),
    "Mykonos": (37.4467, 25.3289),
    "Rhodes": (36.4341, 28.2176),
    "Crete": (35.2401, 24.8093),
    "Heraklion": (35.3387, 25.1442),
    "Corfu": (39.6243, 19.9217),
    "Dubrovnik": (42.6507, 18.0944),
    "Split": (43.5081, 16.4402),
    "Venice": (45.4408, 12.3155),
    "Kotor": (42.4247, 18.7712),
    "Marseille": (43.2965, 5.3698),
    "Nice": (43.7102, 7.2620),
    "Cannes": (43.5528, 7.0174),
    "Monaco": (43.7384, 7.4246),
    "Livorno": (43.5485, 10.3106),
    "Genoa": (44.4056, 8.9463),
    "Lisbon": (38.7223, -9.1393),
    "Porto": (41.1579, -8.6291),
    "Cadiz": (36.5271, -6.2886),
    "Malaga": (36.7213, -4.4214),
    "Palma": (39.5696, 2.6502),
    "Ibiza": (38.9067, 1.4206),
    "Gibraltar": (36.1408, -5.3536),
    "Casablanca": (33.5731, -7.5898),
    "Tangier": (35.7595, -5.8340),
    "Madeira": (32.6669, -16.9241),
    "Funchal": (32.6669, -16.9241),
    "Azores": (37.7412, -25.6756),
    "Ponta Delgada": (37.7412, -25.6756),
    "Canary Islands": (28.2916, -16.6291),
    "Las Palmas": (28.1235, -15.4363),
    "Tenerife": (28.2916, -16.6291),
    "Santa Cruz": (28.4636, -16.2518),
    "Istanbul": (41.0082, 28.9784),
    "Kusadasi": (37.8560, 27.2630),
    "Bodrum": (37.0344, 27.4305),
    "Antalya": (36.8969, 30.7133),
    "Limassol": (34.6786, 33.0413),
    "Haifa": (32.8191, 34.9983),
    "Ashdod": (31.8044, 34.6553),
    "Alexandria": (31.2001, 29.9187),
    # Hawaii
    "Honolulu": (21.3069, -157.8583),
    "Maui": (20.7984, -156.3319),
    "Lahaina": (20.8783, -156.6825),
    "Kauai": (22.0964, -159.5261),
    "Hilo": (19.7297, -155.0900),
    "Nawiliwili": (21.9597, -159.3564),
    # South America
    "Buenos Aires": (-34.6037, -58.3816),
    "Montevideo": (-34.9011, -56.1645),
    "Rio de Janeiro": (-22.9068, -43.1729),
    "Santos": (-23.9608, -46.3336),
    "Punta Arenas": (-53.1638, -70.9171),
    "Ushuaia": (-54.8019, -68.3030),
    "Valparaiso": (-33.0472, -71.6127),
    "Callao": (-12.0566, -77.1181),
    # Asia
    "Tokyo": (35.6762, 139.6503),
    "Yokohama": (35.4437, 139.6380),
    "Osaka": (34.6937, 135.5023),
    "Kobe": (34.6901, 135.1956),
    "Shanghai": (31.2304, 121.4737),
    "Hong Kong": (22.3193, 114.1694),
    "Singapore": (1.3521, 103.8198),
    "Bangkok": (13.7563, 100.5018),
    "Laem Chabang": (13.0833, 100.8833),
    "Phuket": (7.8804, 98.3923),
    "Penang": (5.4141, 100.3288),
    "Bali": (-8.3405, 115.0920),
    "Benoa": (-8.7500, 115.2167),
    "Manila": (14.5995, 120.9842),
    "Busan": (35.1796, 129.0756),
    "Jeju": (33.4996, 126.5312),
    # Middle East
    "Dubai": (25.2048, 55.2708),
    "Abu Dhabi": (24.4539, 54.3773),
    "Muscat": (23.5880, 58.3829),
    # Africa
    "Cape Town": (-33.9249, 18.4241),
    "Durban": (-29.8587, 31.0218),
    "Mombasa": (-4.0435, 39.6682),
    "Zanzibar": (-6.1630, 39.2000),
    "Mauritius": (-20.1609, 57.4977),
    # Sea day markers (no coordinates)
    "At Sea": None,
    "Sea Day": None,
    "Scenic Cruising": None,
    "Cruising": None,
    "Day at Sea": None,
}

# Common port name aliases from CruiseMapper text -> canonical name
PORT_ALIASES = {
    "port canaveral, orlando, florida": "Port Canaveral",
    "port canaveral": "Port Canaveral",
    "fort lauderdale": "Fort Lauderdale",
    "miami, florida": "Miami",
    "new york (manhattan)": "New York",
    "cape liberty (bayonne, nj)": "Cape Liberty",
    "nassau, bahamas": "Nassau",
    "nassau, bahamas, new providence island": "Nassau",
    "cococay, bahamas, royal caribbean": "CocoCay",
    "coco cay, bahamas, royal caribbean": "CocoCay",
    "perfect day at cococay": "Perfect Day at CocoCay",
    "falmouth jamaica": "Falmouth",
    "falmouth, jamaica": "Falmouth",
    "ocho rios, jamaica": "Ocho Rios",
    "montego bay, jamaica": "Montego Bay",
    "grand cayman, cayman islands": "Grand Cayman",
    "cozumel, mexico": "Cozumel",
    "costa maya, mexico": "Costa Maya",
    "roatan, honduras": "Roatan",
    "mahogany bay, roatan": "Mahogany Bay",
    "harvest caye, belize": "Harvest Caye",
    "belize city, belize": "Belize City",
    "san juan, puerto rico": "San Juan",
    "st thomas island usvi, charlotte amalie, us virgin": "St. Thomas",
    "st thomas island usvi": "St. Thomas",
    "st croix island usvi, frederiksted-christiansted": "St. Croix",
    "st croix island usvi": "St. Croix",
    "st. maarten / st. martin": "St. Maarten",
    "philipsburg, st. maarten": "St. Maarten",
    "marigot, st. martin": "St. Martin",
    "basseterre, st. kitts": "St. Kitts",
    "castries, st. lucia": "Castries",
    "bridgetown, barbados": "Bridgetown",
    "fort-de-france, martinique": "Fort-de-France",
    "roseau, dominica": "Roseau",
    "st. george's, grenada": "St. George's",
    "road town, tortola, bvi": "Road Town",
    "labadee, haiti": "Labadee",
    "amber cove, dominicana": "Amber Cove",
    "puerto plata-amber cove, dominicana": "Amber Cove",
    "puerto plata, dominican republic": "Puerto Plata",
    "grand turk, turks and caicos": "Grand Turk",
    "half moon cay, bahamas": "Half Moon Cay",
    "princess cays, bahamas": "Princess Cays",
    "castaway cay, bahamas": "Castaway Cay",
    "great stirrup cay, bahamas": "Great Stirrup Cay",
    "ocean cay msc marine reserve": "Ocean Cay MSC Marine Reserve",
    "ocean cay": "Ocean Cay",
    "civitavecchia (rome), italy": "Civitavecchia",
    "civitavecchia, italy": "Civitavecchia",
    "piraeus (athens), greece": "Piraeus",
    "piraeus, greece": "Piraeus",
    "valletta, malta": "Valletta",
    "dubrovnik, croatia": "Dubrovnik",
    "kotor, montenegro": "Kotor",
    "split, croatia": "Split",
    "venice, italy": "Venice",
    "barcelona, spain": "Barcelona",
    "naples, italy": "Naples",
    "palermo, sicily": "Palermo",
    "messina, sicily": "Messina",
    "catania, sicily": "Catania",
    "genoa, italy": "Genoa",
    "livorno (florence/pisa), italy": "Livorno",
    "livorno, italy": "Livorno",
    "nice (villefranche), france": "Nice",
    "marseille, france": "Marseille",
    "cannes, france": "Cannes",
    "monaco, monte carlo": "Monaco",
    "lisbon, portugal": "Lisbon",
    "cadiz (seville), spain": "Cadiz",
    "malaga, spain": "Malaga",
    "palma de mallorca, spain": "Palma",
    "funchal, madeira": "Funchal",
    "ponta delgada, azores": "Ponta Delgada",
    "las palmas, gran canaria": "Las Palmas",
    "santa cruz de tenerife": "Santa Cruz",
    "istanbul, turkey": "Istanbul",
    "kusadasi (ephesus), turkey": "Kusadasi",
    "bodrum, turkey": "Bodrum",
    "limassol, cyprus": "Limassol",
    "haifa, israel": "Haifa",
    "ashdod (jerusalem), israel": "Ashdod",
    "alexandria, egypt": "Alexandria",
    "juneau, alaska": "Juneau",
    "skagway, alaska": "Skagway",
    "ketchikan, alaska": "Ketchikan",
    "sitka, alaska": "Sitka",
    "haines, alaska": "Haines",
    "icy strait point, alaska": "Icy Strait Point",
    "whittier, alaska": "Whittier",
    "seward, alaska": "Seward",
    "victoria, bc": "Victoria",
    "vancouver, bc": "Vancouver",
    "seattle, washington": "Seattle",
    "los angeles (san pedro), california": "Los Angeles",
    "los angeles, california": "Los Angeles",
    "long beach, california": "Long Beach",
    "san diego, california": "San Diego",
    "san francisco, california": "San Francisco",
    "ensenada, mexico": "Ensenada",
    "cabo san lucas, mexico": "Cabo San Lucas",
    "puerto vallarta, mexico": "Puerto Vallarta",
    "mazatlan, mexico": "Mazatlan",
    "manzanillo, mexico": "Manzanillo",
    "huatulco, mexico": "Huatulco",
    "acapulco, mexico": "Acapulco",
    "ixtapa/zihuatanejo, mexico": "Zihuatanejo",
    "honolulu, hawaii": "Honolulu",
    "lahaina, maui, hawaii": "Lahaina",
    "hilo, hawaii": "Hilo",
    "nawiliwili, kauai, hawaii": "Nawiliwili",
    "hamilton, bermuda": "Hamilton",
    "king's wharf, bermuda": "King's Wharf",
    "new orleans, louisiana": "New Orleans",
    "galveston, texas": "Galveston",
    "tampa, florida": "Tampa",
    "mobile, alabama": "Mobile",
    "jacksonville, florida": "Jacksonville",
    "charleston, south carolina": "Charleston",
    "norfolk, virginia": "Norfolk",
    "baltimore, maryland": "Baltimore",
    "boston, massachusetts": "Boston",
    "cape liberty (bayonne), new jersey": "Cape Liberty",
    "arriving in nassau": "Nassau",
    "arriving in port canaveral, orlando, florida": "Port Canaveral",
    "departing from port canaveral, orlando, florida": "Port Canaveral",
    "departing from nassau, bahamas, new providence island": "Nassau",
    "departing from miami, florida": "Miami",
    "departing from new orleans, louisiana": "New Orleans",
    "departing from galveston, texas": "Galveston",
    "departing from fort lauderdale": "Fort Lauderdale",
    "departing from san juan, puerto rico": "San Juan",
    "departing from tampa, florida": "Tampa",
    "departing from seattle, washington": "Seattle",
    "departing from vancouver, bc": "Vancouver",
    "departing from los angeles": "Los Angeles",
    "departing from new york": "New York",
    "departing from cape liberty": "Cape Liberty",
    "departing from baltimore, maryland": "Baltimore",
    "departing from boston, massachusetts": "Boston",
}

SEA_DAY_KEYWORDS = {
    'at sea', 'sea day', 'day at sea', 'scenic cruising', 'cruising',
    'glacier bay', 'hubbard glacier', 'college fjord', 'scenic',
    'transit', 'canal transit', 'panama canal transit',
}


def normalize_port(raw: str) -> str:
    """Normalize a raw CruiseMapper port string to a canonical port name."""
    if not raw:
        return raw
    cleaned = raw.strip()
    # Remove hotel/transport suffixes
    cleaned = re.sub(r'\s*\n.*', '', cleaned, flags=re.DOTALL)
    cleaned = re.sub(r'\s+hotel.*$', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+transfer.*$', '', cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()
    lower = cleaned.lower()
    # Check alias table first
    if lower in PORT_ALIASES:
        return PORT_ALIASES[lower]
    # Check for partial alias matches
    for alias, canonical in PORT_ALIASES.items():
        if lower.startswith(alias) or alias in lower:
            return canonical
    # Check if it is already a known port name
    if cleaned in PORT_COORDS:
        return cleaned
    # Return cleaned version
    return cleaned


def get_coords(port_name: str):
    """Return (lat, lon) for a port name, or None if unknown."""
    if not port_name:
        return None
    if port_name in PORT_COORDS:
        return PORT_COORDS[port_name]
    # Try case-insensitive match
    lower = port_name.lower()
    for key, coords in PORT_COORDS.items():
        if key.lower() == lower:
            return coords
    return None


def is_sea_day(port_name: str) -> bool:
    """Return True if the port name indicates a sea day."""
    if not port_name:
        return False
    lower = port_name.lower()
    return any(kw in lower for kw in SEA_DAY_KEYWORDS)


def interpolate_sea_day_positions(ports: list) -> list:
    """
    Fill in lat/lon for sea days by interpolating between known port coordinates.
    """
    n = len(ports)
    for i, p in enumerate(ports):
        if p.get('sea_day') and p.get('lat') is None:
            # Find nearest known coords before and after
            prev_coords = next(
                ((ports[j]['lat'], ports[j]['lon']) for j in range(i - 1, -1, -1)
                 if ports[j].get('lat') is not None), None)
            next_coords = next(
                ((ports[j]['lat'], ports[j]['lon']) for j in range(i + 1, n)
                 if ports[j].get('lat') is not None), None)
            if prev_coords and next_coords:
                # Simple midpoint
                p['lat'] = round((prev_coords[0] + next_coords[0]) / 2, 4)
                p['lon'] = round((prev_coords[1] + next_coords[1]) / 2, 4)
            elif prev_coords:
                p['lat'], p['lon'] = prev_coords
            elif next_coords:
                p['lat'], p['lon'] = next_coords
    return ports


def parse_expand_table(rows, dep_date: date, duration: int) -> list:
    """
    Parse the cruiseExpand table rows into a port list.
    Each row has two cells: 'Date / Time' and 'Port'.
    Returns a list of port dicts matching the JSON schema.
    """
    ports = []
    seen_dates = set()

    for row in rows:
        cells = row.query_selector_all('td')
        if len(cells) < 2:
            continue
        date_time_text = cells[0].inner_text().strip()
        port_text = cells[1].inner_text().strip()

        if not date_time_text or not port_text:
            continue
        if date_time_text.lower() in ('date / time', 'date/time', 'date', 'time'):
            continue

        # Parse the date from the cell (format: "28 Mar 16:00" or "28 Mar 10:00 - 18:00")
        date_match = re.match(r'(\d{1,2})\s+(\w{3})', date_time_text)
        if not date_match:
            continue

        day_num = int(date_match.group(1))
        month_str = date_match.group(2)
        try:
            # Infer year from departure date context
            year = dep_date.year
            port_date = datetime.strptime(f"{day_num} {month_str} {year}", "%d %b %Y").date()
            # Handle year rollover (e.g., sailing departs Dec 28, arrives Jan 3)
            if port_date < dep_date - timedelta(days=1):
                port_date = datetime.strptime(f"{day_num} {month_str} {year + 1}", "%d %b %Y").date()
        except ValueError:
            continue

        # Deduplicate by date (overnight stays show same date twice)
        if port_date in seen_dates:
            continue
        seen_dates.add(port_date)

        # Normalize port name
        canonical = normalize_port(port_text)
        sea = is_sea_day(canonical)
        coords = get_coords(canonical) if not sea else None

        day_number = len(ports) + 1
        ports.append({
            'day': day_number,
            'date': port_date.strftime('%Y-%m-%d'),
            'port': canonical,
            'sea_day': sea,
            'lat': coords[0] if coords else None,
            'lon': coords[1] if coords else None,
        })

    # Interpolate sea day positions
    ports = interpolate_sea_day_positions(ports)
    return ports


def fetch_ship_itineraries(ship_name: str, cm_url: str, page) -> tuple:
    """
    Use the Playwright page to navigate to a CruiseMapper ship page,
    find all sailings in the 30-day window, click each row to reveal
    the port-by-port itinerary, and return a list of itinerary dicts.

    Returns (itineraries_list, error_string_or_None)
    """
    try:
        page.goto(cm_url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2000)
    except PlaywrightTimeout:
        return None, f"Timeout loading {cm_url}"
    except Exception as e:
        return None, str(e)

    # Get all schedule rows (Table 3 = shipTableCruise, rows have data-row attribute)
    schedule_rows = page.query_selector_all("tr[data-row]")
    if not schedule_rows:
        return [], None

    # Filter to sailings in the 30-day window
    target_sailings = []
    for row in schedule_rows:
        cells = row.query_selector_all("td")
        if len(cells) < 3:
            continue
        date_text = cells[0].inner_text().strip()
        try:
            dep_date = datetime.strptime(date_text, "%Y %b %d").date()
        except ValueError:
            continue

        if dep_date < TODAY or dep_date > CUTOFF:
            continue

        # Extract duration from description
        desc_text = cells[1].inner_text().strip()
        dur_match = re.search(r'(\d+)\s+days?', desc_text, re.IGNORECASE)
        duration = int(dur_match.group(1)) if dur_match else None
        if not duration or duration < 2 or duration > 21:
            continue

        dep_port_text = cells[2].inner_text().strip() if len(cells) > 2 else ""
        dep_port = normalize_port(dep_port_text)

        # Determine region from description
        region = 'Caribbean'
        desc_lower = desc_text.lower()
        if 'alaska' in desc_lower:
            region = 'Alaska'
        elif 'mediterranean' in desc_lower:
            region = 'Mediterranean'
        elif 'transatlantic' in desc_lower or 'trans atlantic' in desc_lower:
            region = 'Transatlantic'
        elif 'transpacific' in desc_lower or 'trans pacific' in desc_lower:
            region = 'Transpacific'
        elif 'pacific' in desc_lower:
            region = 'Eastern Pacific'
        elif 'bermuda' in desc_lower:
            region = 'Bermuda'
        elif 'bahamas' in desc_lower:
            region = 'Bahamas'
        elif 'panama' in desc_lower:
            region = 'Panama Canal'
        elif 'new england' in desc_lower or 'canada' in desc_lower:
            region = 'New England/Canada'
        elif 'hawaii' in desc_lower:
            region = 'Hawaii'
        elif 'europe' in desc_lower or 'northern europe' in desc_lower:
            region = 'Northern Europe'

        nights = duration - 1
        description = f"{nights} nights, {region}"

        target_sailings.append({
            'row': row,
            'dep_date': dep_date,
            'duration': duration,
            'description': description,
            'dep_port': dep_port,
            'data_row': row.get_attribute('data-row'),
        })

    if not target_sailings:
        return [], None

    itineraries = []

    for sailing in target_sailings:
        row = sailing['row']
        dep_date = sailing['dep_date']
        duration = sailing['duration']
        dep_port = sailing['dep_port']
        description = sailing['description']

        # Click the row to reveal the cruiseExpand table
        try:
            row.click()
            page.wait_for_timeout(int(DELAY_AFTER_CLICK * 1000))
        except Exception:
            # If click fails, build a minimal entry with departure port only
            ports = _build_minimal_ports(dep_date, duration, dep_port)
            itineraries.append({
                'departure_date': dep_date.strftime('%Y-%m-%d'),
                'departure_port': dep_port,
                'description': description,
                'duration_days': duration,
                'ports': ports,
            })
            continue

        # Find the cruiseExpand table that appeared
        expand_tables = page.query_selector_all("table.cruiseExpand")
        ports = []
        if expand_tables:
            # Use the last expand table (most recently clicked)
            expand_table = expand_tables[-1]
            expand_rows = expand_table.query_selector_all("tr")
            ports = parse_expand_table(expand_rows, dep_date, duration)

        # If we did not get enough ports from the expand table, build minimal
        if len(ports) < 2:
            ports = _build_minimal_ports(dep_date, duration, dep_port)

        itineraries.append({
            'departure_date': dep_date.strftime('%Y-%m-%d'),
            'departure_port': dep_port,
            'description': description,
            'duration_days': duration,
            'ports': ports,
        })

    return itineraries, None


def _build_minimal_ports(dep_date: date, duration: int, dep_port: str) -> list:
    """Build a minimal port list with departure and return port only."""
    coords = get_coords(dep_port)
    ports = []
    for day in range(1, duration + 1):
        d = dep_date + timedelta(days=day - 1)
        if day == 1 or day == duration:
            ports.append({
                'day': day,
                'date': d.strftime('%Y-%m-%d'),
                'port': dep_port,
                'sea_day': False,
                'lat': coords[0] if coords else None,
                'lon': coords[1] if coords else None,
            })
        else:
            ports.append({
                'day': day,
                'date': d.strftime('%Y-%m-%d'),
                'port': 'At Sea',
                'sea_day': True,
                'lat': None,
                'lon': None,
            })
    return interpolate_sea_day_positions(ports)


def validate_itinerary(itin: dict, ship_name: str) -> tuple:
    """
    Validate an itinerary dict. Returns (is_valid, list_of_issues).
    """
    issues = []
    dep_date_str = itin.get('departure_date')
    duration = itin.get('duration_days')
    ports = itin.get('ports', [])

    if not dep_date_str:
        issues.append("Missing departure_date")
    else:
        try:
            d = datetime.strptime(dep_date_str, '%Y-%m-%d').date()
            if d < TODAY - timedelta(days=1):
                issues.append(f"Departure {dep_date_str} is in the past")
            if d > CUTOFF:
                issues.append(f"Departure {dep_date_str} is beyond the {MAX_FUTURE_DAYS}-day window")
        except ValueError:
            issues.append(f"Invalid date format: {dep_date_str}")

    if not duration:
        issues.append("Missing duration_days")
    elif duration < 2 or duration > 21:
        issues.append(f"Unusual duration: {duration}")

    if not ports:
        issues.append("No ports data")
    else:
        for p in ports:
            if not p.get('port'):
                issues.append(f"Day {p.get('day')}: empty port name")
            if not p.get('sea_day'):
                if p.get('lat') is None or p.get('lon') is None:
                    issues.append(f"Day {p.get('day')} ({p.get('port')}): missing coordinates")

    return len(issues) == 0, issues


def main():
    parser = argparse.ArgumentParser(description='Playwright-based cruise itinerary refresh')
    parser.add_argument('--dry-run', action='store_true', help='Do not write to JSON')
    parser.add_argument('--ship', type=str, help='Only process this ship name')
    args = parser.parse_args()

    print(f"=== Playwright Itinerary Refresh -- {TODAY} (window: {TODAY} to {CUTOFF}) ===\n")

    # Load JSON
    if not os.path.exists(JSON_PATH):
        print(f"ERROR: JSON not found at {JSON_PATH}")
        sys.exit(1)
    with open(JSON_PATH) as f:
        data = json.load(f)

    # Load ship lookup
    if not os.path.exists(LOOKUP_PATH):
        print(f"ERROR: ship_id_lookup.json not found at {LOOKUP_PATH}")
        sys.exit(1)
    with open(LOOKUP_PATH) as f:
        ship_lookup = json.load(f)

    validation_failures = []
    ships_updated = 0
    itins_added = 0
    itins_removed = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)
        page.set_viewport_size({"width": 1280, "height": 900})

        for cl in data['cruise_lines']:
            for ship in cl['ships']:
                ship_name = ship['name']

                if args.ship and args.ship.lower() not in ship_name.lower():
                    continue

                if ship_name not in ship_lookup:
                    print(f"  SKIP {ship_name}: not in ship_id_lookup.json")
                    continue

                cm_url = ship_lookup[ship_name]['url']
                print(f"Processing: {ship_name}")
                print(f"  URL: {cm_url}")

                raw_itins, error = fetch_ship_itineraries(ship_name, cm_url, page)

                if error:
                    print(f"  ERROR: {error}")
                    validation_failures.append({'ship': ship_name, 'issue': error})
                    continue

                if not raw_itins:
                    print(f"  No sailings in 30-day window")
                    if not args.dry_run:
                        ship['itineraries'] = []
                    continue

                # Validate each itinerary
                valid_itins = []
                for itin in raw_itins:
                    is_valid, issues = validate_itinerary(itin, ship_name)
                    if not is_valid:
                        # Accept if only missing coords (sea days are ok without coords)
                        minor_only = all('missing coordinates' in i for i in issues)
                        if not minor_only:
                            validation_failures.append({
                                'ship': ship_name,
                                'departure_date': itin.get('departure_date'),
                                'issues': issues,
                            })
                            print(f"  FAIL {itin.get('departure_date')}: {'; '.join(issues)}")
                            continue
                    valid_itins.append(itin)

                # Sort by departure date
                valid_itins.sort(key=lambda x: x['departure_date'])

                old_count = len(ship.get('itineraries', []))
                new_count = len(valid_itins)
                delta = new_count - old_count
                if delta > 0:
                    itins_added += delta
                else:
                    itins_removed += abs(delta)

                if not args.dry_run:
                    ship['itineraries'] = valid_itins

                ships_updated += 1
                print(f"  {old_count} -> {new_count} itineraries ({new_count} sailings, "
                      f"{sum(len(i['ports']) for i in valid_itins)} port-days)")

                time.sleep(DELAY_BETWEEN_SHIPS)

        browser.close()

    # Write updated JSON
    if not args.dry_run:
        with open(JSON_PATH, 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        print(f"\nJSON written: {JSON_PATH}")

    # Summary
    print(f"\n=== SUMMARY ===")
    print(f"Ships processed: {ships_updated}")
    print(f"Itineraries added: {itins_added}")
    print(f"Itineraries removed: {itins_removed}")
    print(f"Validation failures: {len(validation_failures)}")

    if validation_failures:
        print(f"\n=== VALIDATION FAILURES ===")
        for vf in validation_failures:
            print(f"\nShip: {vf['ship']}")
            if 'departure_date' in vf:
                print(f"  Date: {vf['departure_date']}")
            if 'issues' in vf:
                for issue in vf['issues']:
                    print(f"  Issue: {issue}")
            if 'issue' in vf:
                print(f"  Error: {vf['issue']}")

    # Write report for GitHub Actions output
    report_path = '/tmp/refresh_report.txt'
    with open(report_path, 'w') as f:
        f.write(f"Refresh run: {TODAY}\n")
        f.write(f"Window: {TODAY} to {CUTOFF}\n")
        f.write(f"Ships processed: {ships_updated}\n")
        f.write(f"Itineraries added: {itins_added}\n")
        f.write(f"Itineraries removed: {itins_removed}\n")
        f.write(f"Validation failures: {len(validation_failures)}\n")
        if validation_failures:
            f.write("\nFAILURES:\n")
            for vf in validation_failures:
                f.write(f"  {vf['ship']}: {vf.get('departure_date', '')} {vf.get('issues', vf.get('issue', ''))}\n")

    # Set GitHub Actions outputs
    print(f"\n::set-output name=itins_added::{itins_added}")
    print(f"::set-output name=itins_removed::{itins_removed}")
    print(f"::set-output name=validation_failures::{len(validation_failures)}")

    return len(validation_failures)


if __name__ == '__main__':
    failures = main()
    sys.exit(0 if failures == 0 else 1)
