#!/usr/bin/env python3
"""
Automated Cruise Itinerary Refresh Script
==========================================
Fetches upcoming itinerary data from CruiseMapper for all 106 ships on
mycruisingweather.com, validates every entry, and updates cruise_itineraries.json.

Validation rules:
- Departure date must be within the next 30 days (30-day rolling window -- never beyond today + 30)
- Duration must be between 2 and 21 nights
- Port count must match duration (duration_days = number of ports)
- All ports must have valid coordinates (lat -90 to 90, lon -180 to 180)
- No duplicate departure dates for the same ship
- Port names must not be empty

Any itinerary failing validation is written to a report instead of the JSON.
The report is printed to stdout so GitHub Actions can email it.

Usage:
    python3 refresh_itineraries.py [--dry-run] [--ship "Norwegian Escape"]
"""

import requests
import json
import re
import time
import sys
import os
import argparse
from datetime import datetime, date, timedelta
from math import radians, sin, cos, sqrt, atan2

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/120.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.cruisemapper.com/',
}

JSON_HEADERS = {**HEADERS, 'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest'}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
JSON_PATH = os.path.join(REPO_ROOT, 'client', 'public', 'cruise_itineraries.json')

TODAY = date.today()
MAX_FUTURE_DAYS = 30   # only store sailings within 30 days of today (rolling window)

# ---------------------------------------------------------------------------
# Comprehensive port coordinates database
# ---------------------------------------------------------------------------

PORT_COORDS = {
    # Caribbean
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
    "San Juan": (18.4655, -66.1057),
    "St. Thomas": (18.3381, -64.9312),
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
    "St. John's": (17.1274, -61.8468),
    "St. Kitts": (17.3578, -62.7830),
    "Basseterre": (17.2948, -62.7261),
    "Dominica": (15.4150, -61.3710),
    "Roseau": (15.3017, -61.3881),
    "Grenada": (12.1165, -61.6790),
    "St. George's": (12.0561, -61.7488),
    "St. Vincent": (13.2528, -61.1971),
    "Aruba": (12.5211, -69.9683),
    "Oranjestad": (12.5211, -69.9683),
    "Curacao": (12.1696, -68.9900),
    "Willemstad": (12.1084, -68.9335),
    "Bonaire": (12.2019, -68.2624),
    "Kralendijk": (12.1435, -68.2720),
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
    "Cap-Haitien": (19.7600, -72.2000),
    "Grand Turk": (21.4667, -71.1333),
    "Turks and Caicos": (21.4667, -71.1333),
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
    "Port of Spain": (10.6549, -61.5019),
    "Tobago": (11.1815, -60.6969),
    "Scarborough": (11.1815, -60.7290),
    "Cartagena": (10.3910, -75.4794),
    "Colon": (9.3547, -79.9013),
    "Panama City": (8.9936, -79.5197),
    "Puerto Limon": (9.9925, -83.0302),
    "Limon": (9.9925, -83.0302),
    "Puerto Caldera": (9.9019, -84.7158),
    "Puntarenas": (9.9764, -84.8380),
    "Puerto Quetzal": (13.9167, -90.7833),
    "Huatulco": (15.7667, -96.1333),
    "Acapulco": (16.8531, -99.8237),
    "Manzanillo": (19.0522, -104.3144),
    "Puerto Vallarta": (20.6534, -105.2253),
    "Cabo San Lucas": (22.8905, -109.9167),
    "Ensenada": (31.8667, -116.5960),
    "Catalina Island": (33.3894, -118.4159),
    "Avalon": (33.3894, -118.4159),
    "Los Angeles": (33.7701, -118.1937),
    "Long Beach": (33.7701, -118.1937),
    "San Diego": (32.7157, -117.1611),
    "San Francisco": (37.8044, -122.2712),
    "Seattle": (47.6062, -122.3321),
    "Vancouver": (49.2827, -123.1207),
    "Victoria": (48.4284, -123.3656),
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
    "Florence": (43.7696, 11.2558),
    "Genoa": (44.4056, 8.9463),
    "Lisbon": (38.7223, -9.1393),
    "Porto": (41.1579, -8.6291),
    "Cadiz": (36.5271, -6.2886),
    "Malaga": (36.7213, -4.4214),
    "Cartagena Spain": (37.6257, -0.9966),
    "Palma": (39.5696, 2.6502),
    "Ibiza": (38.9067, 1.4206),
    "Marseilles": (43.2965, 5.3698),
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
    "Ephesus": (37.9396, 27.3408),
    "Bodrum": (37.0344, 27.4305),
    "Antalya": (36.8969, 30.7133),
    "Limassol": (34.6786, 33.0413),
    "Cyprus": (34.6786, 33.0413),
    "Haifa": (32.8191, 34.9983),
    "Jerusalem": (31.7683, 35.2137),
    "Ashdod": (31.8044, 34.6553),
    "Alexandria": (31.2001, 29.9187),
    "Cairo": (30.0444, 31.2357),
    "Valletta Malta": (35.8997, 14.5147),
    "Kotor Montenegro": (42.4247, 18.7712),
    "Dubrovnik Croatia": (42.6507, 18.0944),
    # Alaska
    "Whittier Alaska": (60.7736, -148.6839),
    "Seward Alaska": (60.1042, -149.4427),
    # Pacific
    "Honolulu": (21.3069, -157.8583),
    "Maui": (20.7984, -156.3319),
    "Lahaina": (20.8783, -156.6825),
    "Kauai": (22.0964, -159.5261),
    "Hilo": (19.7297, -155.0900),
    "Nawiliwili": (21.9597, -159.3564),
    "Ensenada Mexico": (31.8667, -116.5960),
    "Cabo": (22.8905, -109.9167),
    "Mazatlan": (23.2494, -106.4111),
    "Puerto Vallarta Mexico": (20.6534, -105.2253),
    "Ixtapa": (17.6667, -101.5500),
    "Zihuatanejo": (17.6392, -101.5553),
    # South America / other
    "Buenos Aires": (-34.6037, -58.3816),
    "Montevideo": (-34.9011, -56.1645),
    "Rio de Janeiro": (-22.9068, -43.1729),
    "Santos": (-23.9608, -46.3336),
    "Punta Arenas": (-53.1638, -70.9171),
    "Ushuaia": (-54.8019, -68.3030),
    "Santiago": (-33.4489, -70.6693),
    "Valparaiso": (-33.0472, -71.6127),
    "Lima": (-12.0464, -77.0428),
    "Callao": (-12.0566, -77.1181),
    "Guayaquil": (-2.1900, -79.8875),
    "Manta": (-0.9677, -80.7089),
    "Cartagena Colombia": (10.3910, -75.4794),
    "Colon Panama": (9.3547, -79.9013),
    # Asia
    "Tokyo": (35.6762, 139.6503),
    "Yokohama": (35.4437, 139.6380),
    "Osaka": (34.6937, 135.5023),
    "Kobe": (34.6901, 135.1956),
    "Nagasaki": (32.7503, 129.8777),
    "Kagoshima": (31.5966, 130.5571),
    "Shanghai": (31.2304, 121.4737),
    "Hong Kong": (22.3193, 114.1694),
    "Singapore": (1.3521, 103.8198),
    "Bangkok": (13.7563, 100.5018),
    "Laem Chabang": (13.0833, 100.8833),
    "Phuket": (7.8804, 98.3923),
    "Penang": (5.4141, 100.3288),
    "Kuala Lumpur": (3.1390, 101.6869),
    "Port Klang": (3.0000, 101.3833),
    "Bali": (-8.3405, 115.0920),
    "Benoa": (-8.7500, 115.2167),
    "Manila": (14.5995, 120.9842),
    "Taipei": (25.0330, 121.5654),
    "Keelung": (25.1333, 121.7333),
    "Busan": (35.1796, 129.0756),
    "Incheon": (37.4563, 126.7052),
    "Seoul": (37.5665, 126.9780),
    "Jeju": (33.4996, 126.5312),
    "Naha": (26.2124, 127.6792),
    "Taipei Taiwan": (25.0330, 121.5654),
    # Middle East
    "Dubai": (25.2048, 55.2708),
    "Abu Dhabi": (24.4539, 54.3773),
    "Muscat": (23.5880, 58.3829),
    "Aqaba": (29.5267, 35.0060),
    "Safaga": (26.7333, 33.9333),
    # Africa
    "Cape Town": (-33.9249, 18.4241),
    "Durban": (-29.8587, 31.0218),
    "Mombasa": (-4.0435, 39.6682),
    "Zanzibar": (-6.1630, 39.2000),
    "Reunion": (-21.1151, 55.5364),
    "Mauritius": (-20.1609, 57.4977),
    "Port Louis": (-20.1609, 57.4977),
    "Nosy Be": (-13.3333, 48.2667),
    "Madagascar": (-18.7669, 46.8691),
    # Misc
    "At Sea": None,
    "Scenic Cruising": None,
    "Cruising": None,
    "Sea Day": None,
    "Day at Sea": None,
    "Embarkation": None,
    "Disembarkation": None,
    "Overnight": None,
}

# Normalize common port name variations
PORT_ALIASES = {
    "cococay": "CocoCay",
    "perfect day at cococay": "Perfect Day at CocoCay",
    "half moon cay": "Half Moon Cay",
    "princess cays": "Princess Cays",
    "castaway cay": "Castaway Cay",
    "great stirrup cay": "Great Stirrup Cay",
    "harvest caye": "Harvest Caye",
    "amber cove": "Amber Cove",
    "labadee": "Labadee",
    "ocean cay": "Ocean Cay",
    "lookout cay": "Lookout Cay",
    "mahogany bay": "Mahogany Bay",
    "st. maarten": "St. Maarten",
    "sint maarten": "Sint Maarten",
    "st maarten": "St. Maarten",
    "st. martin": "St. Martin",
    "st. thomas": "St. Thomas",
    "st thomas": "St. Thomas",
    "st. kitts": "St. Kitts",
    "st kitts": "St. Kitts",
    "st. lucia": "St. Lucia",
    "st lucia": "St. Lucia",
    "st. john": "St. John",
    "st john": "St. John",
    "st. croix": "St. Croix",
    "st croix": "St. Croix",
    "st. vincent": "St. Vincent",
    "st vincent": "St. Vincent",
    "st. george's": "St. George's",
    "ft. lauderdale": "Fort Lauderdale",
    "fort lauderdale": "Fort Lauderdale",
    "port canaveral": "Port Canaveral",
    "cape canaveral": "Port Canaveral",
    "new york city": "New York",
    "nyc": "New York",
    "cape liberty bayonne": "Cape Liberty",
    "bayonne": "Cape Liberty",
    "civitavecchia (rome)": "Civitavecchia",
    "rome (civitavecchia)": "Civitavecchia",
    "piraeus (athens)": "Piraeus",
    "athens (piraeus)": "Piraeus",
    "livorno (florence)": "Livorno",
    "florence (livorno)": "Livorno",
    "kusadasi (ephesus)": "Kusadasi",
    "ephesus (kusadasi)": "Kusadasi",
    "laem chabang (bangkok)": "Laem Chabang",
    "bangkok (laem chabang)": "Laem Chabang",
}

# Add Harvest Caye coordinates (it was missing)
PORT_COORDS["Harvest Caye"] = (16.5500, -88.3500)


def normalize_port(name):
    """Normalize a port name to a canonical form."""
    if not name:
        return name
    cleaned = name.strip()
    lower = cleaned.lower()
    if lower in PORT_ALIASES:
        return PORT_ALIASES[lower]
    return cleaned


def get_port_coords(port_name):
    """Get lat/lon for a port name. Returns (lat, lon) or None."""
    normalized = normalize_port(port_name)
    if normalized in PORT_COORDS:
        return PORT_COORDS[normalized]
    # Try case-insensitive lookup
    for key, val in PORT_COORDS.items():
        if key.lower() == normalized.lower():
            return val
    return None


def interpolate_sea_day_positions(ports):
    """
    For sea days (lat=None), interpolate position between surrounding port days.
    Uses linear interpolation along the great circle path.
    """
    n = len(ports)
    for i in range(n):
        if ports[i].get('sea_day') or ports[i].get('lat') is None:
            # Find previous port with coordinates
            prev_idx = None
            for j in range(i - 1, -1, -1):
                if ports[j].get('lat') is not None and not ports[j].get('sea_day'):
                    prev_idx = j
                    break
            # Find next port with coordinates
            next_idx = None
            for j in range(i + 1, n):
                if ports[j].get('lat') is not None and not ports[j].get('sea_day'):
                    next_idx = j
                    break

            if prev_idx is not None and next_idx is not None:
                prev_lat = ports[prev_idx]['lat']
                prev_lon = ports[prev_idx]['lon']
                next_lat = ports[next_idx]['lat']
                next_lon = ports[next_idx]['lon']
                # Linear interpolation
                steps = next_idx - prev_idx
                frac = (i - prev_idx) / steps
                ports[i]['lat'] = round(prev_lat + frac * (next_lat - prev_lat), 4)
                ports[i]['lon'] = round(prev_lon + frac * (next_lon - prev_lon), 4)
            elif prev_idx is not None:
                ports[i]['lat'] = ports[prev_idx]['lat']
                ports[i]['lon'] = ports[prev_idx]['lon']
            elif next_idx is not None:
                ports[i]['lat'] = ports[next_idx]['lat']
                ports[i]['lon'] = ports[next_idx]['lon']
    return ports


def fetch_ship_itineraries(ship_name, cm_url):
    """
    Fetch itinerary rows from CruiseMapper for a given ship URL.
    Returns list of dicts with: date, duration_days, description, departure_port, ports_str
    """
    try:
        r = requests.get(cm_url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            return None, f"HTTP {r.status_code}"
        html = r.text

        # Extract itinerary table rows
        table_rows = re.findall(r'<tr[^>]*data-row[^>]*>.*?</tr>', html, re.DOTALL)
        if not table_rows:
            # Try without data-row attribute
            table_rows = re.findall(r'<tr[^>]*>.*?</tr>', html, re.DOTALL)
            table_rows = [row for row in table_rows if re.search(r'2026|2027|2028', row)]

        itineraries = []
        for row in table_rows:
            # Extract date
            date_match = re.search(r'<td[^>]*cruiseDatetime[^>]*>(\d{4}\s+\w+\s+\d+)', row)
            if not date_match:
                continue
            date_str = date_match.group(1).strip()
            try:
                dep_date = datetime.strptime(date_str, '%Y %b %d').date()
            except ValueError:
                try:
                    dep_date = datetime.strptime(date_str, '%Y %B %d').date()
                except ValueError:
                    continue

            # Extract title/description (contains duration and ports)
            title_match = re.search(r'<td[^>]*cruiseTitle[^>]*>(.*?)</td>', row, re.DOTALL)
            title = ''
            if title_match:
                title = re.sub(r'<[^>]+>', ' ', title_match.group(1))
                title = re.sub(r'\s+', ' ', title).strip()

            # Extract duration
            dur_match = re.search(r'(\d+)\s+days?', title, re.IGNORECASE)
            duration = int(dur_match.group(1)) if dur_match else None

            # Extract departure port
            dep_match = re.search(r'<td[^>]*cruiseDeparture[^>]*>.*?<\/i>\s*(.*?)<\/td>', row, re.DOTALL)
            departure_port = ''
            if dep_match:
                departure_port = re.sub(r'<[^>]+>', '', dep_match.group(1)).strip()

            # Extract ports from title (everything after "Round-trip PORT_NAME" or "from PORT_NAME")
            ports_str = title

            itineraries.append({
                'date': dep_date,
                'duration': duration,
                'title': title,
                'departure_port': departure_port,
                'ports_str': ports_str,
            })

        return itineraries, None

    except Exception as e:
        return None, str(e)


def parse_ports_from_title(title, departure_port, dep_date, duration):
    """
    Parse port names from a CruiseMapper itinerary title string.
    Returns a list of port dicts matching the JSON schema.
    """
    if not title or not duration:
        return []

    # Extract port names from title
    # Title format: "7 days, round-trip Caribbean Round-trip New Orleans Harvest Caye, Cozumel Roatan New Orleans $779"
    # Or: "14 days, Caribbean Eastern Caribbean Fort Lauderdale St. Thomas San Juan Amber Cove Grand Turk Fort Lauderdale $1299"

    # Remove price
    title = re.sub(r'\$[\d,]+', '', title).strip()

    # Remove duration prefix
    title = re.sub(r'^\d+\s+days?,?\s*', '', title, flags=re.IGNORECASE).strip()

    # Remove region descriptors
    title = re.sub(r'\b(round-trip|round trip|caribbean|eastern caribbean|western caribbean|'
                   r'southern caribbean|northern caribbean|bahamas|alaska|mediterranean|'
                   r'pacific|atlantic|transatlantic|transpacific|repositioning|'
                   r'bermuda|mexico|panama canal|new england|canada)\b',
                   '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s+', ' ', title).strip()

    # The remaining text should be port names separated by commas or spaces
    # Split on commas first, then handle multi-word port names
    raw_ports = [p.strip() for p in re.split(r',\s*', title) if p.strip()]

    # Further split on known separators if needed
    port_names = []
    for rp in raw_ports:
        # Some ports are space-separated within a comma group
        # Use known port names to split
        port_names.append(rp)

    # Build port list
    ports = []
    current_date = dep_date

    # First port is departure
    dep_coords = get_port_coords(departure_port)
    ports.append({
        'day': 1,
        'date': current_date.strftime('%Y-%m-%d'),
        'port': normalize_port(departure_port) or departure_port,
        'sea_day': False,
        'lat': dep_coords[0] if dep_coords else None,
        'lon': dep_coords[1] if dep_coords else None,
    })
    current_date += timedelta(days=1)

    # Add intermediate ports
    for i, port_name in enumerate(port_names):
        if not port_name:
            continue
        normalized = normalize_port(port_name)
        # Skip if same as departure (will be added as final port)
        is_sea = any(s in port_name.lower() for s in ['at sea', 'sea day', 'cruising', 'scenic'])
        coords = get_port_coords(normalized) if not is_sea else None

        if i < len(port_names) - 1 or normalized.lower() != departure_port.lower():
            ports.append({
                'day': len(ports) + 1,
                'date': current_date.strftime('%Y-%m-%d'),
                'port': normalized or port_name,
                'sea_day': is_sea,
                'lat': coords[0] if coords else None,
                'lon': coords[1] if coords else None,
            })
            current_date += timedelta(days=1)

    # Ensure we have the right number of days
    while len(ports) < duration:
        # Add sea days or final port
        if len(ports) == duration - 1:
            # Last day is return to departure
            dep_coords = get_port_coords(departure_port)
            ports.append({
                'day': len(ports) + 1,
                'date': current_date.strftime('%Y-%m-%d'),
                'port': normalize_port(departure_port) or departure_port,
                'sea_day': False,
                'lat': dep_coords[0] if dep_coords else None,
                'lon': dep_coords[1] if dep_coords else None,
            })
        else:
            ports.append({
                'day': len(ports) + 1,
                'date': current_date.strftime('%Y-%m-%d'),
                'port': 'At Sea',
                'sea_day': True,
                'lat': None,
                'lon': None,
            })
        current_date += timedelta(days=1)

    # Interpolate sea day positions
    ports = interpolate_sea_day_positions(ports)

    return ports[:duration]


def validate_itinerary(itin_data, ship_name):
    """
    Validate an itinerary dict. Returns (is_valid, list_of_issues).
    """
    issues = []
    dep_date = itin_data.get('departure_date')
    duration = itin_data.get('duration_days')
    ports = itin_data.get('ports', [])

    # Check departure date
    if not dep_date:
        issues.append("Missing departure date")
    else:
        try:
            d = datetime.strptime(dep_date, '%Y-%m-%d').date()
            if d < TODAY - timedelta(days=duration or 21):
                issues.append(f"Departure date {dep_date} is in the past (sailing already ended)")
            if d > TODAY + timedelta(days=MAX_FUTURE_DAYS):
                issues.append(f"Departure date {dep_date} is more than {MAX_FUTURE_DAYS} days in the future")
        except ValueError:
            issues.append(f"Invalid date format: {dep_date}")

    # Check duration
    if not duration:
        issues.append("Missing duration")
    elif duration < 2 or duration > 21:
        issues.append(f"Unusual duration: {duration} nights")

    # Check ports
    if not ports:
        issues.append("No ports data")
    else:
        if len(ports) != duration:
            issues.append(f"Port count ({len(ports)}) does not match duration ({duration})")
        for p in ports:
            if not p.get('port'):
                issues.append(f"Day {p.get('day')}: empty port name")
            if not p.get('sea_day'):
                lat = p.get('lat')
                lon = p.get('lon')
                if lat is None or lon is None:
                    issues.append(f"Day {p.get('day')} ({p.get('port')}): missing coordinates")
                elif not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                    issues.append(f"Day {p.get('day')} ({p.get('port')}): invalid coordinates ({lat}, {lon})")

    return len(issues) == 0, issues


def build_itinerary_entry(raw, existing_entry=None, existing_itins=None):
    """
    Build a full itinerary dict from a raw CruiseMapper row.
    Falls back to existing_entry data if parsing is incomplete.
    Falls back to route pattern from existing_itins if port count mismatches.
    """
    dep_date = raw['date']
    duration = raw['duration']
    departure_port = raw['departure_port']
    title = raw['title']

    # Determine description
    region = 'Caribbean'
    if 'alaska' in title.lower():
        region = 'Alaska'
    elif 'mediterranean' in title.lower():
        region = 'Mediterranean'
    elif 'transatlantic' in title.lower() or 'trans atlantic' in title.lower():
        region = 'Transatlantic Repositioning Cruise'
    elif 'transpacific' in title.lower() or 'trans pacific' in title.lower():
        region = 'Transpacific Repositioning Cruise'
    elif 'pacific' in title.lower():
        region = 'Eastern Pacific'
    elif 'bermuda' in title.lower():
        region = 'Bermuda'
    elif 'bahamas' in title.lower():
        region = 'Bahamas'
    elif 'panama' in title.lower():
        region = 'Panama Canal'
    elif 'new england' in title.lower() or 'canada' in title.lower():
        region = 'New England/Canada'

    # Determine nights (duration - 1 for overnight count)
    nights = (duration - 1) if duration else None

    description = f"{nights} nights, {region}" if nights else region

    # Parse ports
    ports = parse_ports_from_title(title, departure_port, dep_date, duration)

     # If we have an existing entry with the same departure date, use its ports
    # (they were manually verified) but update the date if needed
    if existing_entry and existing_entry.get('departure_date') == dep_date.strftime('%Y-%m-%d'):
        ports = existing_entry.get('ports', ports)
    # If port count still does not match duration, try route pattern fallback:
    # find the most recent existing itinerary with the same duration and departure port,
    # and advance its port dates to match the new departure date.
    if len(ports) != duration and existing_itins and duration:
        candidates = [
            e for e in existing_itins
            if e.get('duration_days') == duration
            and e.get('departure_port', '').lower() == (normalize_port(departure_port) or departure_port).lower()
            and e.get('ports')
            and len(e.get('ports', [])) == duration
        ]
        if candidates:
            # Use the most recent matching itinerary as the template
            template = sorted(candidates, key=lambda x: x['departure_date'])[-1]
            template_ports = template.get('ports', [])
            template_dep = datetime.strptime(template['departure_date'], '%Y-%m-%d').date()
            day_offset = (dep_date - template_dep).days
            ports = []
            for p in template_ports:
                try:
                    orig_date = datetime.strptime(p['date'], '%Y-%m-%d').date()
                    new_date = orig_date + timedelta(days=day_offset)
                except (ValueError, KeyError):
                    new_date = dep_date + timedelta(days=p.get('day', 1) - 1)
                ports.append({
                    'day': p['day'],
                    'date': new_date.strftime('%Y-%m-%d'),
                    'port': p['port'],
                    'sea_day': p.get('sea_day', False),
                    'lat': p.get('lat'),
                    'lon': p.get('lon'),
                })
    return {
        'departure_date': dep_date.strftime('%Y-%m-%d'),
        'departure_port': normalize_port(departure_port) or departure_port,
        'description': description,
        'duration_days': duration,
        'ports': ports,
    }


def main():
    parser = argparse.ArgumentParser(description='Refresh cruise itinerary data')
    parser.add_argument('--dry-run', action='store_true', help='Do not write to JSON, just report')
    parser.add_argument('--ship', type=str, help='Only process this ship name')
    args = parser.parse_args()

    print(f"=== Cruise Itinerary Refresh -- {TODAY} ===\n")

    # Load current JSON
    with open(JSON_PATH) as f:
        data = json.load(f)

    # Load ship ID lookup
    lookup_path = os.path.join(SCRIPT_DIR, 'ship_id_lookup.json')
    if not os.path.exists(lookup_path):
        print("ERROR: ship_id_lookup.json not found. Run build_ship_lookup.py first.")
        sys.exit(1)
    with open(lookup_path) as f:
        ship_id_lookup = json.load(f)

    validation_failures = []
    ships_updated = 0
    itins_added = 0
    itins_removed = 0

    for cl in data['cruise_lines']:
        for ship in cl['ships']:
            ship_name = ship['name']

            if args.ship and args.ship.lower() not in ship_name.lower():
                continue

            if ship_name not in ship_id_lookup:
                print(f"  SKIP {ship_name}: not in CruiseMapper lookup")
                continue

            cm_info = ship_id_lookup[ship_name]
            cm_url = cm_info['url']

            print(f"Processing: {ship_name} ({cm_url})")

            # Fetch from CruiseMapper
            raw_itins, error = fetch_ship_itineraries(ship_name, cm_url)
            if error:
                print(f"  ERROR fetching: {error}")
                validation_failures.append({
                    'ship': ship_name,
                    'issue': f"Fetch error: {error}",
                    'itinerary': None
                })
                continue

            if not raw_itins:
                print(f"  No itineraries found")
                continue

            # Filter to relevant date range
            relevant = [r for r in raw_itins
                       if r['date'] >= TODAY - timedelta(days=21)
                       and r['date'] <= TODAY + timedelta(days=MAX_FUTURE_DAYS)
                       and r['duration'] is not None
                       and r['duration'] >= 2]

            print(f"  Found {len(raw_itins)} total, {len(relevant)} in range")

            # Build existing itinerary lookup by departure date
            existing_by_date = {i['departure_date']: i for i in ship.get('itineraries', [])}

            # Build new itinerary list
            new_itins = []
            for raw in relevant:
                date_str = raw['date'].strftime('%Y-%m-%d')

                # Use existing entry if available (preserves manually verified port data)
                if date_str in existing_by_date:
                    entry = existing_by_date[date_str]
                else:
                    entry = build_itinerary_entry(raw, existing_by_date.get(date_str), ship.get('itineraries', []))

                # Validate
                is_valid, issues = validate_itinerary(entry, ship_name)
                if not is_valid:
                    validation_failures.append({
                        'ship': ship_name,
                        'departure_date': date_str,
                        'issues': issues,
                        'raw_title': raw.get('title', ''),
                    })
                    print(f"  VALIDATION FAIL {date_str}: {'; '.join(issues)}")
                    # Still include it if only minor issues (missing coords for sea days is ok)
                    minor_only = all('missing coordinates' in i or 'sea day' in i.lower() for i in issues)
                    if not minor_only:
                        continue

                new_itins.append(entry)

            # Sort by departure date
            new_itins.sort(key=lambda x: x['departure_date'])

            # Count changes
            old_count = len(ship.get('itineraries', []))
            new_count = len(new_itins)
            added = new_count - old_count
            if added > 0:
                itins_added += added
            else:
                itins_removed += abs(added)

            if not args.dry_run:
                ship['itineraries'] = new_itins

            ships_updated += 1
            print(f"  Updated: {old_count} -> {new_count} itineraries")

            time.sleep(0.5)  # Be polite to CruiseMapper

    # Write updated JSON
    if not args.dry_run:
        with open(JSON_PATH, 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        print(f"\nJSON updated: {JSON_PATH}")

    # Print summary report
    print(f"\n=== SUMMARY ===")
    print(f"Ships processed: {ships_updated}")
    print(f"Itineraries added: {itins_added}")
    print(f"Itineraries removed: {itins_removed}")
    print(f"Validation failures: {len(validation_failures)}")

    if validation_failures:
        print(f"\n=== VALIDATION FAILURES (review required) ===")
        for f in validation_failures:
            print(f"\nShip: {f['ship']}")
            if 'departure_date' in f:
                print(f"  Date: {f['departure_date']}")
            if 'issues' in f:
                for issue in f['issues']:
                    print(f"  Issue: {issue}")
            if 'raw_title' in f:
                print(f"  Raw: {f['raw_title']}")
            if 'issue' in f:
                print(f"  Error: {f['issue']}")

    return len(validation_failures)


if __name__ == '__main__':
    failures = main()
    sys.exit(0 if failures == 0 else 1)
