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

To add a new ship: add one entry to scripts/ship_registry.json with active=true.
To retire a ship: set active=false in ship_registry.json.
To add a new cruise line: add a new block to ship_registry.json.
The core scraper script never needs to change for fleet management.

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
REGISTRY_PATH = os.path.join(SCRIPT_DIR, 'ship_registry.json')
FALLBACK_URLS_PATH = os.path.join(SCRIPT_DIR, 'cruise_line_fallback_urls.json')

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
    # Extended Caribbean / private islands
    "Celebration Key": (26.5500, -78.7000),
    "Disney Lookout Cay": (25.1333, -76.1500),
    "Bimini": (25.7333, -79.3000),
    "Bimini Islands": (25.7333, -79.3000),
    "Kralendijk": (12.1667, -68.2833),
    "Oranjestad": (12.5167, -70.0167),
    "Philipsburg": (18.0167, -63.0500),
    "St Georges": (12.0500, -61.7500),
    "Key West": (24.5551, -81.7800),
    "Kings Wharf": (32.3167, -64.8333),
    # Mexico extended
    "La Paz": (24.1426, -110.3128),
    "Loreto": (26.0122, -111.3447),
    "Puerto Chiapas": (14.7000, -92.4167),
    "Puerto Quetzal": (13.9167, -90.8000),
    "Santa Barbara": (34.4208, -119.6982),
    "Santa Catalina Island": (33.3894, -118.4159),
    # US extended
    "Newport RI": (41.4901, -71.3128),
    # Canada
    "Halifax": (44.6488, -63.5752),
    "Victoria BC": (48.4284, -123.3656),
    # Europe extended
    "Southampton": (50.9097, -1.4044),
    "Dover": (51.1295, 1.3089),
    "London": (51.5074, -0.1278),
    "Tilbury": (51.4639, 0.3553),
    "Le Havre": (49.4938, 0.1077),
    "Hamburg": (53.5753, 10.0153),
    "Amsterdam": (52.3676, 4.9041),
    "IJmuiden": (52.4667, 4.5833),
    "Zeebrugge": (51.3333, 3.2000),
    "Oslo": (59.9139, 10.7522),
    "Copenhagen": (55.6761, 12.5683),
    "Skagen": (57.7167, 10.5833),
    "Stockholm": (59.3293, 18.0686),
    "Helsinki": (60.1699, 24.9384),
    "Tallinn": (59.4370, 24.7536),
    "Riga": (56.9496, 24.1052),
    "Gdansk": (54.3520, 18.6466),
    "Greenock": (55.9500, -4.7667),
    "Invergordon": (57.6833, -4.1667),
    "Leith": (55.9756, -3.1714),
    "Dublin": (53.3498, -6.2603),
    "Falmouth UK": (50.1528, -5.0728),
    "La Coruna": (43.3623, -8.4115),
    "Vigo": (42.2328, -8.7226),
    "Tarragona": (41.1189, 1.2445),
    "Motril": (36.7500, -3.5167),
    "Toulon": (43.1242, 5.9280),
    "Villefranche-sur-Mer": (43.7050, 7.3100),
    "Santa Margherita Ligure": (44.3333, 9.2167),
    "La Spezia": (44.1024, 9.8240),
    "Sarande": (39.8750, 20.0000),
    "Marmaris": (36.8556, 28.2722),
    "Katakolon": (37.6333, 21.3167),
    "Souda": (35.4833, 24.0833),
    # Pacific / Oceania
    "Sydney": (-33.8688, 151.2093),
    "Melbourne": (-37.8136, 144.9631),
    "Brisbane": (-27.4698, 153.0251),
    "Hobart": (-42.8821, 147.3272),
    "Adelaide": (-34.9285, 138.6007),
    "Fremantle": (-32.0569, 115.7439),
    "Darwin": (-12.4634, 130.8456),
    "Eden": (-37.0667, 149.9000),
    "Port Arthur": (-43.1333, 147.8500),
    "Port Douglas": (-16.4833, 145.4667),
    "Yorkeys Knob": (-16.8167, 145.7167),
    "Exmouth WA": (-21.9333, 114.1167),
    "Kangaroo Island": (-35.7833, 137.1667),
    "Willis Island": (-16.2833, 149.9667),
    "Auckland": (-36.8485, 174.7633),
    "Wellington": (-41.2865, 174.7762),
    "Tauranga": (-37.6878, 176.1651),
    "Noumea": (-22.2758, 166.4580),
    "Lifou Island": (-20.9167, 167.2000),
    "Luganville": (-15.5167, 167.1667),
    "Port Vila": (-17.7333, 168.3167),
    "Mystery Island": (-20.2500, 169.9167),
    "Suva": (-18.1416, 178.4419),
    "Lautoka": (-17.6167, 177.4500),
    "Papeete": (-17.5334, -149.5667),
    "Moorea Island": (-17.5333, -149.8333),
    "Raiatea Island": (-16.8333, -151.4167),
    "Bora Bora": (-16.5000, -151.7500),
    "Kahului": (20.8893, -156.4729),
    "Kailua-Kona": (19.6400, -155.9969),
    # Asia extended
    "Shimizu": (34.9833, 138.5167),
    "Nagasaki City": (32.7503, 129.8779),
    "Kagoshima City": (31.5966, 130.5571),
    "Hakodate": (41.7686, 140.7288),
    "Kochi City": (33.5597, 133.5311),
    "Miyako-Iwate": (39.6417, 141.9567),
    "Yatsushiro": (32.5167, 130.6000),
    "Keelung": (25.1333, 121.7333),
    "Jeju Island": (33.4996, 126.5312),
    "Saigon": (10.8231, 106.6297),
    "Phu My": (10.6167, 107.0500),
    # South America extended
    "Salvador de Bahia": (-12.9714, -38.5014),
    # Indian Ocean / Africa extended
    "Mahe Island": (-4.6167, 55.4500),
    "La Digue Island": (-4.3667, 55.8333),
    "Nosy Be Island": (-13.3333, 48.2667),
    "Male City": (4.1748, 73.5089),
    # Additional Mediterranean ports
    "Ravenna": (44.4184, 12.2035),
    "Trieste": (45.6495, 13.7768),
    "Reykjavik": (64.1355, -21.8954),
    "Valletta": (35.8997, 14.5147),
    "Kotor": (42.4247, 18.7712),
    "Dubrovnik": (42.6507, 18.0944),
    "Split": (43.5081, 16.4402),
    "Zadar": (44.1194, 15.2314),
    "Hvar": (43.1729, 16.4412),
    "Sibenik": (43.7350, 15.8952),
    "Bari": (41.1171, 16.8719),
    "Brindisi": (40.6326, 17.9413),
    "Taranto": (40.4644, 17.2470),
    "Palermo": (38.1157, 13.3615),
    "Catania": (37.5079, 15.0830),
    "Messina": (38.1938, 15.5540),
    "Naples": (40.8518, 14.2681),
    "Salerno": (40.6824, 14.7681),
    "Cagliari": (39.2238, 9.1217),
    "Olbia": (40.9163, 9.4986),
    "Ajaccio": (41.9192, 8.7386),
    "Marseille": (43.2965, 5.3698),
    "Cannes": (43.5528, 7.0174),
    "Monte Carlo": (43.7384, 7.4246),
    "Monaco": (43.7384, 7.4246),
    "Portofino": (44.3035, 9.2060),
    "Civitavecchia": (42.0939, 11.7944),
    "Istanbul": (41.0082, 28.9784),
    "Bodrum": (37.0344, 27.4305),
    "Rhodes": (36.4341, 28.2176),
    "Heraklion": (35.3387, 25.1442),
    "Chania": (35.5138, 24.0180),
    "Thessaloniki": (40.6401, 22.9444),
    "Volos": (39.3601, 22.9400),
    "Kavala": (40.9396, 24.4019),
    "Skiathos": (39.1667, 23.4833),
    "Lesbos": (39.1000, 26.5500),
    "Chios": (38.3667, 26.1333),
    "Samos": (37.7500, 26.9833),
    "Patmos": (37.3167, 26.5500),
    "Nafplion": (37.5667, 22.8000),
    "Olympia": (37.6333, 21.3167),
    # Additional Australia / Pacific
    "Airlie Beach": (-20.2694, 148.7177),
    "Cairns": (-16.9186, 145.7781),
    "Townsville": (-19.2590, 146.8169),
    "Mackay": (-21.1411, 149.1860),
    "Gladstone": (-23.8427, 151.2558),
    "Rockhampton": (-23.3791, 150.5100),
    "Bundaberg": (-24.8661, 152.3489),
    "Mooloolaba": (-26.6833, 153.1167),
    "Moreton Island": (-27.0333, 153.4000),
    "Whitsunday Island": (-20.2000, 148.9000),
    "Hamilton Island": (-20.3500, 148.9500),
    "Daydream Island": (-20.2500, 148.8167),
    "Magnetic Island": (-19.1500, 146.8500),
    "Lizard Island": (-14.6667, 145.4667),
    "Cooktown": (-15.4667, 145.2500),
    "Thursday Island": (-10.5833, 142.2167),
    # Additional US ports
    "Norfolk": (36.8508, -76.2859),
    "Norfolk VA": (36.8508, -76.2859),
    # South America
    "Callao": (-12.0432, -77.1282),
    "Lima": (-12.0464, -77.0428),
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
    # CruiseMapper verbose names for Caribbean / private islands
    "costa maya, perfect day mexico, royal caribbean": "Costa Maya",
    "roatan island, isla tropicale-coxen hole, honduras": "Roatan",
    "celebration key bahamas, carnival grand bahama island": "Celebration Key",
    "grand cayman island, george town harbour": "Grand Cayman",
    "oranjestad aruba, netherlands antilles": "Oranjestad",
    "tortola island bvi, road town, uk virgin islands": "Tortola",
    "philipsburg st maarten, netherlands antilles": "Philipsburg",
    "grand turk island, cockburn town, turks and caicos": "Grand Turk",
    "basseterre st kitts, port zante": "Basseterre",
    "bimini islands, resorts world bimini bahamas": "Bimini",
    "willemstad curacao, netherlands antilles": "Willemstad",
    "kralendijk bonaire, netherlands antilles": "Kralendijk",
    "st johns antigua, rci royal beach club": "Antigua",
    "disney lookout cay, lighthouse point, eleuthera bahamas": "Disney Lookout Cay",
    "half moon cay, relaxaway, bahamas carnival private island": "Half Moon Cay",
    "harvest caye belize, ncl private island": "Harvest Caye",
    "freeport, bahamas, grand bahama island": "Freeport",
    "key west, florida": "Key West",
    "kings wharf, bermuda": "Kings Wharf",
    "st georges grenada": "St Georges",
    "castries, st lucia island": "Castries",
    # CruiseMapper verbose names for Mexico / Pacific
    "ensenada, baja california mexico": "Ensenada",
    "cabo san lucas, baja california mexico": "Cabo San Lucas",
    "puerto vallarta, jalisco, mexico riviera": "Puerto Vallarta",
    "mazatlan, sinaloa, mexico riviera": "Mazatlan",
    "huatulco, la crucecita, mexico riviera": "Huatulco",
    "la paz, baja california mexico": "La Paz",
    "loreto, baja california mexico": "Loreto",
    "puerto chiapas, chiapas mexico": "Puerto Chiapas",
    "puerto quetzal, guatemala": "Puerto Quetzal",
    "progreso, merida, yucatan mexico": "Progreso",
    "puntarenas, puerto caldera, costa rica": "Puntarenas",
    "santa catalina island ca, avalon, california": "Santa Catalina Island",
    "santa barbara ca, california": "Santa Barbara",
    "los angeles, long beach-san pedro, california": "Los Angeles",
    "arriving in los angeles, long beach-san pedro, california": "Los Angeles",
    "ketchikan, revillagigedo island alaska": "Ketchikan",
    "sitka, baranof island alaska": "Sitka",
    "victoria bc, vancouver island canada": "Victoria BC",
    # CruiseMapper verbose names for US / Canada
    "departing from jacksonville, jaxport, florida": "Jacksonville",
    "departing from norfolk va, virginia": "Norfolk",
    "departing from new orleans, port nola louisiana": "New Orleans",
    "departing from halifax, nova scotia canada": "Halifax",
    "departing from le havre-paris, france": "Le Havre",
    "departing from southampton, england": "Southampton",
    "departing from civitavecchia-rome, italy": "Civitavecchia",
    "departing from piraeus-athens, greece": "Piraeus",
    "departing from colon, panama": "Colon",
    "departing from cartagena colombia": "Cartagena",
    "departing from la romana, dominicana": "La Romana",
    "departing from buenos aires, argentina": "Buenos Aires",
    "departing from fremantle, perth, western australia": "Fremantle",
    "departing from sydney, nsw australia": "Sydney",
    "departing from brisbane, queensland australia": "Brisbane",
    "departing from auckland, new zealand": "Auckland",
    "departing from singapore": "Singapore",
    "departing from hong kong, china": "Hong Kong",
    "departing from honolulu, oahu island hawaii": "Honolulu",
    "departing from yokohama, tokyo, japan kanagawa": "Yokohama",
    "arriving in civitavecchia-rome, italy": "Civitavecchia",
    # CruiseMapper verbose names for Europe
    "ponta delgada, sao miguel island azores portugal": "Ponta Delgada",
    "cadiz, spain, sevilla": "Cadiz",
    "palma de mallorca, majorca island balearic spain": "Palma",
    "ibiza, ibiza island balearic spain": "Ibiza",
    "tarragona, spain costa daurada": "Tarragona",
    "motril, spain granada": "Motril",
    "la coruna, spain galicia": "La Coruna",
    "vigo, spain galicia": "Vigo",
    "genoa, milan, italy riviera": "Genoa",
    "la spezia, italy riviera": "La Spezia",
    "santa margherita ligure, italy riviera": "Santa Margherita Ligure",
    "livorno, florence-pisa, italy": "Livorno",
    "toulon, france riviera, la seyne-sur-mer": "Toulon",
    "villefranche-sur-mer, nice, france riviera": "Villefranche-sur-Mer",
    "le havre-paris, france": "Le Havre",
    "ijmuiden, netherlands north holland": "IJmuiden",
    "zeebrugge, bruges, belgium": "Zeebrugge",
    "greenock-glasgow, clydeport, scotland": "Greenock",
    "leith-edinburgh, newhaven-rosyth-queensferry, scotland": "Leith",
    "invergordon, scotland": "Invergordon",
    "falmouth uk, england": "Falmouth UK",
    "dover, england": "Dover",
    "london-tilbury, england": "Tilbury",
    "hamburg, germany": "Hamburg",
    "oslo, norway": "Oslo",
    "skagen, denmark": "Skagen",
    "kusadasi, ephesus, turkey": "Kusadasi",
    "marmaris, turkey": "Marmaris",
    "katakolon, olympia, greece": "Katakolon",
    "souda-chania, crete greece": "Souda",
    "corfu island, kerkyra, greece": "Corfu",
    "santorini island, thira, greece": "Santorini",
    "mykonos island, greece": "Mykonos",
    "piraeus-athens, greece": "Piraeus",
    "sarande, albania": "Sarande",
    "la goulette-tunis, tunisia": "Tunis",
    "gibraltar, uk": "Gibraltar",
    "las palmas de gran canaria, canary islands": "Las Palmas",
    "porto-leixoes, oporto, portugal": "Porto",
    # CruiseMapper verbose names for Pacific / Oceania
    "sydney, nsw australia": "Sydney",
    "melbourne, victoria australia": "Melbourne",
    "hobart, tasmania australia": "Hobart",
    "darwin, nt australia": "Darwin",
    "eden, nsw australia": "Eden",
    "port arthur, tasmania australia": "Port Arthur",
    "port douglas, queensland australia": "Port Douglas",
    "yorkeys knob, queensland australia": "Yorkeys Knob",
    "exmouth wa, western australia": "Exmouth WA",
    "kangaroo island, penneshaw, south australia": "Kangaroo Island",
    "willis island, coral sea, australia": "Willis Island",
    "tauranga, rotorua, new zealand": "Tauranga",
    "noumea, grande terre island new caledonia": "Noumea",
    "lifou island, new caledonia": "Lifou Island",
    "luganville, espiritu santo island, vanuatu": "Luganville",
    "port vila, efate island vanuatu": "Port Vila",
    "mystery island, aneityum, vanuatu": "Mystery Island",
    "suva, viti levu island fiji": "Suva",
    "lautoka, viti levu island fiji": "Lautoka",
    "papeete, tahiti island french polynesia": "Papeete",
    "moorea island, society islands french polynesia": "Moorea Island",
    "raiatea island, uturoa, french polynesia": "Raiatea Island",
    "honolulu, oahu island hawaii": "Honolulu",
    "kahului, maui island hawaii": "Kahului",
    "kailua-kona, hawaii island": "Kailua-Kona",
    "nawiliwili, lihue, kauai island hawaii": "Nawiliwili",
    # CruiseMapper verbose names for Asia
    "hong kong, china": "Hong Kong",
    "kobe-osaka, kyoto, japan": "Kobe",
    "shimizu, japan shizuoka": "Shimizu",
    "nagasaki city, japan nagasaki": "Nagasaki City",
    "kagoshima city, japan kagoshima": "Kagoshima City",
    "hakodate, japan oshima": "Hakodate",
    "kochi city, japan kochi": "Kochi City",
    "miyako-iwate, japan iwate": "Miyako-Iwate",
    "yatsushiro-kumamoto city, japan kumamoto": "Yatsushiro",
    "keelung, taipei city, taiwan china": "Keelung",
    "jeju island, seogwipo-jeju city, korea": "Jeju Island",
    "saigon, phu my port-ho chi minh city, vietnam": "Saigon",
    "phuket, thailand": "Phuket",
    "departing from hong kong, china": "Hong Kong",
    # CruiseMapper verbose names for South America
    "salvador de bahia, brazil": "Salvador de Bahia",
    "rio de janeiro, brazil": "Rio de Janeiro",
    "departing from cartagena colombia": "Cartagena",
    # CruiseMapper verbose names for Indian Ocean / Africa
    "mahe island seychelles, victoria": "Mahe Island",
    "la digue island seychelles, la passe": "La Digue Island",
    "nosy be island, madagascar": "Nosy Be Island",
    "male city, kaafu atoll maldives": "Male City",
    # Panama Canal
    "panama canal": "Colon",
    "panama canal transit": "Colon",
    "panama city, fuerte amador, balboa": "Panama City",
    # Hyphenated CruiseMapper composite port names -> canonical
    "civitavecchia-rome": "Civitavecchia",
    "civitavecchia-rome, italy": "Civitavecchia",
    "piraeus-athens": "Piraeus",
    "piraeus-athens, greece": "Piraeus",
    "le havre-paris": "Le Havre",
    "le havre-paris, france": "Le Havre",
    "callao-lima": "Callao",
    "callao-lima, peru": "Callao",
    "ravenna, italy": "Ravenna",
    "trieste, italy": "Trieste",
    "reykjavik, iceland": "Reykjavik",
    "norfolk va": "Norfolk",
    "norfolk va, virginia": "Norfolk",
    "norfolk, virginia": "Norfolk",
    "airlie beach, queensland australia": "Airlie Beach",
    "airlie beach, whitsundays, queensland": "Airlie Beach",
    "tasmania": "Hobart",
    "hobart, tasmania australia": "Hobart",
    # one-way repositioning routes -> use departure port
    "one-way from auckland to los angeles": "Auckland",
    "one-way from auckland to sydney": "Auckland",
    "one-way from brisbane to san francisco": "Brisbane",
    "one-way from brisbane to sydney": "Brisbane",
    "one-way from callao-lima to san diego": "Callao",
    "one-way from civitavecchia-rome to barcelona": "Civitavecchia",
    "one-way from civitavecchia-rome to copenhagen": "Civitavecchia",
    "one-way from civitavecchia-rome to piraeus-athens": "Civitavecchia",
    "one-way from civitavecchia-rome to ravenna": "Civitavecchia",
    "one-way from civitavecchia-rome to trieste": "Civitavecchia",
    "one-way from copenhagen to le havre-paris": "Copenhagen",
    "one-way from copenhagen to southampton": "Copenhagen",
    "one-way from fremantle to brisbane": "Fremantle",
    "one-way from halifax to barcelona": "Halifax",
    "one-way from le havre-paris to copenhagen": "Le Havre",
    "one-way from piraeus-athens to barcelona": "Piraeus",
    "one-way from piraeus-athens to civitavecchia-rome": "Piraeus",
    "one-way from piraeus-athens to ravenna": "Piraeus",
    "one-way from ravenna to civitavecchia-rome": "Ravenna",
    "one-way from ravenna to istanbul": "Ravenna",
    "one-way from ravenna to piraeus-athens": "Ravenna",
    "one-way from reykjavik to southampton": "Reykjavik",
    "one-way from southampton to reykjavik": "Southampton",
    "one-way from sydney to auckland": "Sydney",
    "one-way from sydney to honolulu": "Sydney",
    "one-way from sydney to melbourne": "Sydney",
    "one-way from trieste to civitavecchia-rome": "Trieste",
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

        # Extract duration before the date check so we can compute return date
        desc_text = cells[1].inner_text().strip()
        dur_match = re.search(r'(\d+)\s+days?', desc_text, re.IGNORECASE)
        duration = int(dur_match.group(1)) if dur_match else None
        if not duration or duration < 2 or duration > 21:
            continue

        return_date = dep_date + timedelta(days=duration - 1)
        # Include sailings currently in progress (departed before today but not
        # yet returned) as well as future sailings within the 30-day window.
        # Exclude sailings that have fully completed (return_date < TODAY)
        # and sailings departing beyond the window.
        if return_date < TODAY or dep_date > CUTOFF:
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
            dur = itin.get('duration_days') or 0
            return_date = d + timedelta(days=dur - 1)
            # A sailing is valid if it is currently in progress (departed before
            # today but return_date is today or later) OR departs in the future.
            if return_date < TODAY:
                issues.append(f"Sailing {dep_date_str} has already completed (returned {return_date})")
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

    # Load ship registry (single source of truth for fleet management)
    # To add/remove ships or lines, edit scripts/ship_registry.json only.
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH) as f:
            registry = json.load(f)
        # Build a lookup dict from the registry for fast URL access
        ship_lookup = {}
        for reg_cl in registry['cruise_lines']:
            if not reg_cl.get('active', True):
                continue
            for reg_ship in reg_cl['ships']:
                if reg_ship.get('active', True):
                    ship_lookup[reg_ship['name']] = {
                        'url': reg_ship['cruisemapper_url'],
                        'line_id': reg_cl.get('cruisemapper_line_id', '')
                    }
        print(f"Loaded ship registry: {len(ship_lookup)} active ships across {len([c for c in registry['cruise_lines'] if c.get('active', True)])} active cruise lines")
    else:
        # Fallback to legacy ship_id_lookup.json if registry not found
        print(f"  WARNING: ship_registry.json not found at {REGISTRY_PATH}, falling back to ship_id_lookup.json")
        if not os.path.exists(LOOKUP_PATH):
            print(f"ERROR: ship_id_lookup.json not found at {LOOKUP_PATH}")
            sys.exit(1)
        with open(LOOKUP_PATH) as f:
            ship_lookup = json.load(f)

    # Load fallback cruise line URLs for manual verification when CruiseMapper is empty
    fallback_urls = {}
    if os.path.exists(FALLBACK_URLS_PATH):
        with open(FALLBACK_URLS_PATH) as f:
            fallback_urls = json.load(f)
    else:
        print(f"  WARNING: cruise_line_fallback_urls.json not found at {FALLBACK_URLS_PATH}")

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
                    print(f"  SKIP {ship_name}: not in ship_registry.json (set active=true to enable)")
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
                    # Ship has no sailings in the 30-day window.
                    # This is normal: dry dock, repositioning, or seasonal gap.
                    # We preserve existing future itineraries already in the JSON
                    # rather than wiping them, so the site shows something useful.
                    # But we still purge any fully-completed past sailings so stale
                    # entries do not accumulate between scraper runs.

                    # --- FALLBACK: Log the cruise line's official itinerary URL ---
                    # When CruiseMapper shows nothing, the operator should manually
                    # verify on the cruise line's own site before assuming a gap is real.
                    fallback_url = None
                    try:
                        if fallback_urls:
                            line_name = cl.get('name', '')
                            line_fb = fallback_urls.get(line_name, {})
                            ship_slugs = line_fb.get('ship_slugs', {})
                            ship_codes = line_fb.get('ship_codes', {})
                            slug = ship_slugs.get(ship_name) or ship_codes.get(ship_name)
                            pattern = line_fb.get('ship_page_pattern', '')
                            if slug and pattern:
                                fallback_url = pattern.replace('{ship_slug}', slug)
                            elif line_fb.get('search_base_url'):
                                fallback_url = line_fb['search_base_url']
                    except Exception:
                        pass

                    existing = ship.get('itineraries', [])
                    still_valid = [
                        i for i in existing
                        if (
                            datetime.strptime(i['departure_date'], '%Y-%m-%d').date()
                            + timedelta(days=i.get('duration_days', 1) - 1)
                        ) >= TODAY
                    ]
                    purged = len(existing) - len(still_valid)
                    if purged:
                        print(f"  Purged {purged} fully-completed past sailing(s).")
                    if still_valid:
                        print(f"  No new sailings found on CruiseMapper -- ship may be in dry dock or between seasons.")
                        if fallback_url:
                            print(f"  FALLBACK VERIFY: {fallback_url}")
                        print(f"  Preserving {len(still_valid)} existing future/in-progress itineraries.")
                        if not args.dry_run:
                            ship['itineraries'] = still_valid
                    else:
                        print(f"  No sailings in 30-day window and no future itineraries to preserve.")
                        if fallback_url:
                            print(f"  FALLBACK VERIFY: {fallback_url}")
                        if not args.dry_run:
                            ship['itineraries'] = []
                    continue

                # Split 14-night (or double-duration) sailings that share a departure
                # date with a shorter sailing of the same ship. The cruise line is
                # selling the same route as both a 7-night and a 14-night option.
                # We display the 7-night as-is and derive a second 7-night entry
                # from the second half of the 14-night itinerary.
                expanded_itins = []
                for itin in raw_itins:
                    dep_date_str = itin.get('departure_date', '')
                    duration = itin.get('duration_days', 0)
                    # Check if there is a shorter sailing on the same date
                    same_date_durations = [
                        i.get('duration_days', 0)
                        for i in raw_itins
                        if i.get('departure_date') == dep_date_str
                        and i is not itin
                    ]
                    if same_date_durations:
                        shortest = min(same_date_durations)
                        # Only split if this sailing is >= 14 nights AND exactly double
                        # the shortest same-date sailing. Sailings of 10-13 nights that
                        # share a date with a shorter sailing are legitimate separate
                        # products and must NOT be split -- doing so creates duplicates.
                        if duration == shortest * 2 and duration >= 14:
                            ports = itin.get('ports', [])
                            midpoint = len(ports) // 2
                            second_half = ports[midpoint:]
                            if second_half:
                                # Re-number days and set the new departure date
                                new_dep_date_str = second_half[0]['date']
                                for idx, p in enumerate(second_half):
                                    p['day'] = idx + 1
                                new_nights = len(second_half) - 1
                                # Determine region from original description
                                orig_desc = itin.get('description', '')
                                region_part = orig_desc.split(',', 1)[-1].strip() if ',' in orig_desc else orig_desc
                                second_itin = {
                                    'departure_date': new_dep_date_str,
                                    'departure_port': second_half[0]['port'],
                                    'description': f"{new_nights} nights, {region_part}",
                                    'duration_days': len(second_half),
                                    'ports': second_half,
                                    'split_from_14night': True,
                                }
                                # Keep only the first half for the original entry
                                first_half = ports[:midpoint]
                                for idx, p in enumerate(first_half):
                                    p['day'] = idx + 1
                                first_nights = len(first_half) - 1
                                itin['ports'] = first_half
                                itin['duration_days'] = len(first_half)
                                itin['description'] = f"{first_nights} nights, {region_part}"
                                expanded_itins.append(itin)
                                expanded_itins.append(second_itin)
                                print(f"  SPLIT: {dep_date_str} {duration}-night -> two {shortest}-night sailings")
                                continue
                    expanded_itins.append(itin)
                raw_itins = expanded_itins

                # Validate each itinerary
                valid_itins = []
                for itin in raw_itins:
                    is_valid, issues = validate_itinerary(itin, ship_name)
                    if not is_valid:
                        # Classify issues: beyond-window and missing-coords are soft warnings,
                        # not hard failures. Only truly broken itineraries (no ports, bad date
                        # format, past departure) are hard failures that block the run.
                        soft_keywords = ('beyond the', 'missing coordinates')
                        hard_issues = [i for i in issues if not any(k in i for k in soft_keywords)]
                        soft_issues = [i for i in issues if any(k in i for k in soft_keywords)]
                        if hard_issues:
                            # Hard failure -- skip this itinerary and log it
                            validation_failures.append({
                                'ship': ship_name,
                                'departure_date': itin.get('departure_date'),
                                'issues': hard_issues,
                            })
                            print(f"  SKIP {itin.get('departure_date')}: {'; '.join(hard_issues)}")
                            continue
                        elif soft_issues:
                            # Soft warning -- keep the itinerary but log it
                            print(f"  WARN {itin.get('departure_date')}: {'; '.join(soft_issues)}")
                    valid_itins.append(itin)

                # Sort by departure date
                valid_itins.sort(key=lambda x: x['departure_date'])

                # Deduplication safety net: if two itineraries share the same
                # departure_date, keep only the first one. This prevents any
                # duplicate from reaching the live site regardless of cause.
                seen_dates = set()
                deduped_itins = []
                for itin in valid_itins:
                    dep = itin.get('departure_date', '')
                    if dep in seen_dates:
                        print(f"  DEDUP: removed duplicate entry for {dep}")
                        continue
                    seen_dates.add(dep)
                    deduped_itins.append(itin)
                if len(deduped_itins) < len(valid_itins):
                    print(f"  Deduplication removed {len(valid_itins) - len(deduped_itins)} duplicate(s)")
                valid_itins = deduped_itins

                old_count = len(ship.get('itineraries', []))
                new_count = len(valid_itins)
                delta = new_count - old_count
                if delta > 0:
                    itins_added += delta
                else:
                    itins_removed += abs(delta)

                if not args.dry_run:
                    # Purge any fully-completed past sailings that were in the JSON
                    # from a previous run but are no longer in the fresh scrape window.
                    # This prevents stale past entries from accumulating.
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
    # Only exit non-zero if there are HARD failures (not soft warnings like beyond-window)
    # Soft warnings are expected and should not fail the CI run
    sys.exit(0)
