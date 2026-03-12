#!/usr/bin/env python3.11
"""
Automated Itinerary Verification Script
========================================
Twice-weekly check: fetches current + next 2 sailings for every ship from
CruiseMapper.com and compares against cruise_itineraries.json.

Rules:
- Only dates listed on CruiseMapper are port call days.
- Any date between departure and first port, between ports, or between last
  port and arrival that is NOT listed = "At Sea" day.
- If our stored itinerary does not match CruiseMapper, delete ours and
  replace it with the CruiseMapper data.
- Never fill in blanks or invent ports.

Usage:
    python3.11 verify_itineraries.py [--dry-run] [--ship "Ship Name"]
"""

import json
import re
import time
import logging
import argparse
import subprocess
import os
from datetime import datetime, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_DIR = Path("/home/ubuntu/vanfleet-wx")
JSON_PATH = REPO_DIR / "client/public/cruise_itineraries.json"
CHANGE_LOG_PATH = REPO_DIR / "scripts/itinerary_change_log.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# CruiseMapper ship page URLs -- keyed by ship name as it appears in our JSON
SHIP_URLS = {
    # Royal Caribbean
    "Icon of the Seas":      "https://www.cruisemapper.com/ships/Icon-Of-The-Seas-2110",
    "Oasis of the Seas":     "https://www.cruisemapper.com/ships/Oasis-Of-The-Seas-690",
    "Symphony of the Seas":  "https://www.cruisemapper.com/ships/Symphony-Of-The-Seas-1730",
    "Allure of the Seas":    "https://www.cruisemapper.com/ships/Allure-Of-The-Seas-662",
    "Harmony of the Seas":   "https://www.cruisemapper.com/ships/Harmony-Of-The-Seas-1067",
    "Mariner of the Seas":   "https://www.cruisemapper.com/ships/Mariner-Of-The-Seas-609",
    "Navigator of the Seas": "https://www.cruisemapper.com/ships/Navigator-Of-The-Seas-704",
    "Wonder of the Seas":    "https://www.cruisemapper.com/ships/Wonder-Of-The-Seas-2165",
    "Adventure of the Seas": "https://www.cruisemapper.com/ships/Adventure-Of-The-Seas-533",
    "Freedom of the Seas":   "https://www.cruisemapper.com/ships/Freedom-Of-The-Seas-654",
    # Carnival
    "Mardi Gras":            "https://www.cruisemapper.com/ships/Carnival-Mardi-Gras-2105",
    "Carnival Vista":        "https://www.cruisemapper.com/ships/Carnival-Vista-1039",
    "Carnival Breeze":       "https://www.cruisemapper.com/ships/Carnival-Breeze-703",
    "Carnival Freedom":      "https://www.cruisemapper.com/ships/Carnival-Freedom-580",
    # Celebrity
    "Celebrity Beyond":      "https://www.cruisemapper.com/ships/Celebrity-Beyond-1690",
    "Celebrity Apex":        "https://www.cruisemapper.com/ships/Celebrity-Apex-1587",
    # Disney
    "Disney Wish":           "https://www.cruisemapper.com/ships/Disney-Wish-2127",
    # Norwegian
    "Norwegian Encore":      "https://www.cruisemapper.com/ships/Norwegian-Encore-1518",
    "Norwegian Getaway":     "https://www.cruisemapper.com/ships/Norwegian-Getaway-793",
    # Princess
    "Caribbean Princess":    "https://www.cruisemapper.com/ships/Caribbean-Princess-558",
    # MSC
    "MSC Seascape":          "https://www.cruisemapper.com/ships/MSC-Seascape-2144",
    # Virgin Voyages
    "Scarlet Lady":          "https://www.cruisemapper.com/ships/Scarlet-Lady-1976",
}

# How many upcoming sailings to pull per ship (current + next 2 = 3 total)
SAILINGS_TO_CHECK = 3

# Minimum days from today to consider a sailing "relevant"
# (sailings that departed more than 2 days ago are skipped)
LOOKBACK_DAYS = 2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Port name normalization
# ---------------------------------------------------------------------------

# Canonical port name mappings -- key is a substring to match (case-insensitive)
# Order matters: more specific matches should come first
PORT_NORMALIZATIONS = [
    # Sea day
    ("at sea", "At Sea"),
    # Royal Caribbean private destinations
    ("coco cay", "Perfect Day at CocoCay"),
    ("cococay", "Perfect Day at CocoCay"),
    ("perfect day", "Perfect Day at CocoCay"),
    # Disney private destinations
    ("lookout cay", "Disney Lookout Cay"),
    ("lighthouse point", "Disney Lookout Cay"),  # Disney renamed this
    ("castaway cay", "Castaway Cay"),
    # Carnival private destinations
    ("half moon cay", "Half Moon Cay"),
    ("celebration key", "Celebration Key"),
    ("princess cays", "Princess Cays"),
    ("amber cove", "Puerto Plata"),  # Amber Cove is the pier in Puerto Plata, Dominican Republic
    # Norwegian private destinations
    ("great stirrup cay", "Great Stirrup Cay"),
    ("harvest caye", "Harvest Caye"),
    # Caribbean ports
    ("philipsburg", "St. Maarten"),
    ("st maarten", "St. Maarten"),
    ("st. maarten", "St. Maarten"),
    ("charlotte amalie", "St. Thomas"),
    ("st thomas", "St. Thomas"),
    ("st. thomas", "St. Thomas"),
    ("st croix", "St. Croix"),
    ("basseterre", "St. Kitts"),
    ("st kitts", "St. Kitts"),
    ("st. kitts", "St. Kitts"),
    ("tortola", "Tortola"),
    ("san juan", "San Juan"),
    ("puerto plata", "Puerto Plata"),
    ("puerto rico", "San Juan"),
    ("nassau", "Nassau"),
    ("bimini", "Bimini"),
    ("grand turk", "Grand Turk"),
    ("key west", "Key West"),
    ("cozumel", "Cozumel"),
    ("costa maya", "Costa Maya"),
    ("roatan", "Roatan"),
    ("falmouth", "Falmouth, Jamaica"),
    ("aruba", "Aruba"),
    ("curacao", "Curacao"),
    ("cartagena, colombia", "Cartagena, Colombia"),
    ("cartagena colombia", "Cartagena, Colombia"),
    ("colon", "Colon, Panama"),
    ("limon", "Limon, Costa Rica"),
    ("puerto limon", "Limon, Costa Rica"),
    ("grand cayman", "Grand Cayman"),
    ("castries", "Castries, St. Lucia"),
    ("fort-de-france", "Fort-de-France, Martinique"),
    ("st johns", "St. John's, Antigua"),
    ("antigua", "St. John's, Antigua"),
    ("cabo san lucas", "Cabo San Lucas"),
    ("mazatlan", "Mazatlan"),
    ("puerto vallarta", "Puerto Vallarta"),
    ("ensenada", "Ensenada"),
    ("catalina", "Catalina Island"),
    # Spain / Mediterranean
    ("cadiz", "Cadiz, Spain"),
    ("malaga", "Malaga, Spain"),
    ("cartagena spain", "Cartagena, Spain"),
    ("cartagena, spain", "Cartagena, Spain"),
    ("alicante", "Alicante, Spain"),
    ("barcelona", "Barcelona"),
    # Home ports
    ("miami", "Miami"),
    ("port canaveral", "Port Canaveral"),
    ("fort lauderdale", "Fort Lauderdale"),
    ("galveston", "Galveston"),
    ("los angeles", "Los Angeles"),
    ("new york", "New York"),
    ("baltimore", "Baltimore"),
    ("norfolk", "Norfolk"),
    ("new orleans", "New Orleans"),
    ("tampa", "Tampa"),
    ("jacksonville", "Jacksonville"),
]


def normalize_port_name(raw: str) -> str:
    """
    Clean and normalize a raw port name from CruiseMapper into a canonical form.
    """
    # Remove "Departing from" / "Arriving in" prefix text
    raw = re.sub(r"Departing\s*from\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"Arriving\s*in\s*", "", raw, flags=re.IGNORECASE)
    # Remove "hotels" suffix
    raw = re.sub(r"\s*hotels\s*$", "", raw, flags=re.IGNORECASE)
    raw = raw.strip()

    raw_lower = raw.lower()

    for key, canonical in PORT_NORMALIZATIONS:
        if key in raw_lower:
            return canonical

    # Fallback: take city part before first comma, title-case it
    parts = [p.strip() for p in raw.split(",")]
    return parts[0].strip() if parts else raw.strip()


def normalize_for_comparison(port: str) -> str:
    """Normalize port name for comparison purposes (more aggressive)."""
    p = port.lower().strip()
    # Collapse all CocoCay variants
    p = re.sub(r"(perfect day at )?coco\s*cay.*", "cococay", p)
    # Collapse all sea day variants
    p = re.sub(r"at\s+sea.*", "at sea", p)
    # Collapse Disney private destinations
    p = re.sub(r"(disney )?lookout cay", "lookout cay", p)
    p = re.sub(r"lighthouse point", "lookout cay", p)
    # Remove parenthetical qualifiers like "(seville)" in "cadiz (seville), spain"
    p = re.sub(r"\s*\([^)]*\)", "", p)
    # Remove country/state suffixes for comparison
    p = re.sub(r",\s*(spain|colombia|panama|costa rica|jamaica|antigua|martinique|st\. lucia).*", "", p)
    p = re.sub(r"\s+spain$", "", p)  # handle "cartagena spain" without comma
    p = re.sub(r"\s+(island|usvi|bvi).*", "", p)
    # Remove island/territory qualifiers
    p = re.sub(r"\s*(st kitts|basseterre).*", "st kitts", p) if "kitts" in p or "basseterre" in p else p
    return p.strip()


# ---------------------------------------------------------------------------
# CruiseMapper scraping helpers
# ---------------------------------------------------------------------------

def get_ship_sailings(ship_url: str) -> list[dict]:
    """
    Fetch the ship page and return a list of upcoming sailings.
    Each sailing dict has: departure_date, description, departure_port, data_row
    """
    try:
        r = requests.get(ship_url, headers=HEADERS, timeout=20)
        r.raise_for_status()
    except Exception as e:
        log.error(f"Failed to fetch {ship_url}: {e}")
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    cruise_table = soup.find("table", class_="shipTableCruise")
    if not cruise_table:
        log.warning(f"No itinerary table found at {ship_url}")
        return []

    today = datetime.utcnow().date()
    cutoff = today - timedelta(days=LOOKBACK_DAYS)
    sailings = []

    for row in cruise_table.find_all("tr", attrs={"data-row": True}):
        data_row = row.get("data-row")
        cells = row.find_all("td")
        if len(cells) < 3:
            continue

        date_str = cells[0].get_text(strip=True)   # e.g. "2026 Mar 14"
        description = cells[1].get_text(strip=True)
        dep_port = cells[2].get_text(strip=True)

        try:
            dep_date = datetime.strptime(date_str, "%Y %b %d").date()
        except ValueError:
            continue

        if dep_date < cutoff:
            continue

        sailings.append({
            "departure_date": dep_date.strftime("%Y-%m-%d"),
            "description": description,
            "departure_port": dep_port,
            "data_row": data_row,
        })

        if len(sailings) >= SAILINGS_TO_CHECK:
            break

    return sailings


def get_sailing_ports(data_row: str, referer: str) -> list[dict]:
    """
    Call the CruiseMapper AJAX endpoint to get port details for a sailing.
    Returns a list of dicts: {date, port, is_departure, is_arrival}
    Missing dates between entries are sea days.
    """
    url = f"https://www.cruisemapper.com/ships/cruise.json?id={data_row}"
    try:
        r = requests.get(
            url,
            headers={**HEADERS, "X-Requested-With": "XMLHttpRequest", "Referer": referer},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        log.error(f"Failed to fetch cruise.json for row {data_row}: {e}")
        return []

    html = data.get("result", "")
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        return []

    ports = []
    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        date_time_raw = cells[0].get_text(strip=True)
        port_raw = cells[1].get_text(strip=True)

        # Skip header row
        if date_time_raw.lower() in ("date / time", "date/time"):
            continue

        # Parse date from "14 Mar 16:30" or "14 Mar 08:00 - 17:00"
        date_match = re.match(r"(\d{1,2}\s+[A-Za-z]+)", date_time_raw)
        if not date_match:
            continue
        date_part = date_match.group(1)  # e.g. "14 Mar"

        # Determine year from context
        current_year = datetime.utcnow().year
        try:
            parsed = datetime.strptime(f"{date_part} {current_year}", "%d %b %Y").date()
            # If parsed date is more than 6 months in the past, assume next year
            if (datetime.utcnow().date() - parsed).days > 180:
                parsed = datetime.strptime(f"{date_part} {current_year + 1}", "%d %b %Y").date()
        except ValueError:
            continue

        is_departure = "departing" in port_raw.lower()
        is_arrival = "arriving" in port_raw.lower()

        ports.append({
            "date": parsed.strftime("%Y-%m-%d"),
            "port_raw": port_raw,
            "is_departure": is_departure,
            "is_arrival": is_arrival,
        })

    return ports


def build_full_itinerary(departure_date: str, raw_ports: list[dict]) -> list[dict]:
    """
    Given the port call entries from CruiseMapper, build the full day-by-day
    itinerary including sea days for missing dates.

    Returns list of {day: int, date: str, port: str}
    """
    if not raw_ports:
        return []

    dep_date = datetime.strptime(departure_date, "%Y-%m-%d").date()

    # Find departure and arrival entries
    dep_entry = next((p for p in raw_ports if p["is_departure"]), None)
    arr_entry = next((p for p in raw_ports if p["is_arrival"]), None)

    if not dep_entry:
        log.warning(f"No departure entry found for sailing {departure_date}")
        return []

    # Use CruiseMapper departure date (should match our JSON date)
    cm_dep_date = datetime.strptime(dep_entry["date"], "%Y-%m-%d").date()
    if cm_dep_date != dep_date:
        log.warning(
            f"CruiseMapper departure date {cm_dep_date} differs from our date {dep_date}. "
            f"Using CruiseMapper date."
        )
        dep_date = cm_dep_date

    arr_date = datetime.strptime(arr_entry["date"], "%Y-%m-%d").date() if arr_entry else None

    # Build set of port call dates (excluding departure and arrival)
    port_calls = {}
    for p in raw_ports:
        if not p["is_departure"] and not p["is_arrival"]:
            port_calls[p["date"]] = normalize_port_name(p["port_raw"])

    # Get the normalized departure port name
    dep_port_name = normalize_port_name(dep_entry["port_raw"])

    # For the arrival entry, use the ACTUAL arrival port from CruiseMapper
    # (not the departure port -- for transatlantics they differ)
    arr_port_name = normalize_port_name(arr_entry["port_raw"]) if arr_entry else dep_port_name

    # Determine end date
    if arr_date:
        end_date = arr_date
    elif port_calls:
        last_port_date = max(datetime.strptime(d, "%Y-%m-%d").date() for d in port_calls)
        end_date = last_port_date + timedelta(days=1)
    else:
        end_date = dep_date + timedelta(days=7)

    # Build day-by-day list
    result = []
    current = dep_date
    day_num = 1

    while current <= end_date:
        date_str = current.strftime("%Y-%m-%d")

        if current == dep_date:
            result.append({"day": day_num, "date": date_str, "port": dep_port_name})
        elif current == arr_date:
            result.append({"day": day_num, "date": date_str, "port": arr_port_name})
        elif date_str in port_calls:
            result.append({"day": day_num, "date": date_str, "port": port_calls[date_str]})
        else:
            result.append({"day": day_num, "date": date_str, "port": "At Sea"})

        current += timedelta(days=1)
        day_num += 1

    return result


# ---------------------------------------------------------------------------
# Comparison and update logic
# ---------------------------------------------------------------------------

def itineraries_match(our_ports: list[dict], cm_ports: list[dict]) -> bool:
    """
    Compare two port lists. Returns True if they match (same ports in same order).
    Uses normalize_for_comparison for minor name differences.
    """
    if len(our_ports) != len(cm_ports):
        return False

    for our, cm in zip(our_ports, cm_ports):
        if our["date"] != cm["date"]:
            return False
        if normalize_for_comparison(our["port"]) != normalize_for_comparison(cm["port"]):
            return False

    return True


def find_our_itinerary(data: dict, ship_name: str, departure_date: str):
    """
    Find the itinerary in our JSON for a given ship and departure date.
    Returns (cruise_line_obj, ship_obj, itinerary_obj) or (None, None, None).
    """
    for cl in data["cruise_lines"]:
        for ship in cl["ships"]:
            if ship["name"] == ship_name:
                for it in ship["itineraries"]:
                    if it["departure_date"] == departure_date:
                        return cl, ship, it
    return None, None, None


def update_itinerary(data: dict, ship_name: str, departure_date: str, new_ports: list[dict], description: str) -> bool:
    """
    Replace the itinerary for a given ship/date with new_ports from CruiseMapper.
    Returns True if a change was made.
    """
    for cl in data["cruise_lines"]:
        for ship in cl["ships"]:
            if ship["name"] == ship_name:
                for it in ship["itineraries"]:
                    if it["departure_date"] == departure_date:
                        it["ports"] = new_ports
                        if description and len(description) > 5:
                            it["description"] = description
                        return True
    return False


def add_itinerary(data: dict, ship_name: str, departure_date: str, new_ports: list[dict], description: str) -> bool:
    """
    Add a new itinerary for a given ship/date from CruiseMapper.
    Returns True if added.
    """
    for cl in data["cruise_lines"]:
        for ship in cl["ships"]:
            if ship["name"] == ship_name:
                # Check it doesn't already exist
                for it in ship["itineraries"]:
                    if it["departure_date"] == departure_date:
                        return False  # Already exists

                duration = len(new_ports) - 1
                dep_port = new_ports[0]["port"] if new_ports else "Unknown"
                new_it = {
                    "departure_date": departure_date,
                    "description": description,
                    "duration_nights": duration,
                    "departure_port": dep_port,
                    "ports": new_ports,
                }
                ship["itineraries"].append(new_it)
                ship["itineraries"].sort(key=lambda x: x["departure_date"])
                return True
    return False


# ---------------------------------------------------------------------------
# Main verification loop
# ---------------------------------------------------------------------------

def verify_all_ships(dry_run: bool = False, target_ship: str | None = None) -> dict:
    """
    Main function: verify all ships and return a summary dict.
    """
    data = json.loads(JSON_PATH.read_text())
    changes_made = []
    errors = []
    checked = []

    today = datetime.utcnow().date()

    for ship_name, ship_url in SHIP_URLS.items():
        if target_ship and target_ship.lower() not in ship_name.lower():
            continue

        log.info(f"Checking {ship_name} ...")
        time.sleep(1.5)  # Be polite to CruiseMapper

        sailings = get_ship_sailings(ship_url)
        if not sailings:
            log.warning(f"No sailings found for {ship_name}")
            errors.append(f"{ship_name}: no sailings found on CruiseMapper")
            continue

        for sailing in sailings:
            dep_date = sailing["departure_date"]
            data_row = sailing["data_row"]
            description = sailing["description"]

            log.info(f"  Sailing {dep_date}: {description}")
            time.sleep(1.0)

            # Fetch port details from CruiseMapper
            cm_raw_ports = get_sailing_ports(data_row, ship_url)
            if not cm_raw_ports:
                log.warning(f"  No port data for {ship_name} {dep_date}")
                errors.append(f"{ship_name} {dep_date}: no port data from CruiseMapper")
                continue

            # Build full itinerary with sea days filled in
            cm_full_ports = build_full_itinerary(dep_date, cm_raw_ports)
            if not cm_full_ports:
                log.warning(f"  Could not build full itinerary for {ship_name} {dep_date}")
                continue

            checked.append(f"{ship_name} {dep_date}")

            # Find our stored itinerary
            _, _, our_it = find_our_itinerary(data, ship_name, dep_date)

            if our_it is None:
                log.info(f"  No stored itinerary for {ship_name} {dep_date} -- adding from CruiseMapper")
                if not dry_run:
                    add_itinerary(data, ship_name, dep_date, cm_full_ports, description)
                changes_made.append(f"ADDED {ship_name} {dep_date}: {description}")
                continue

            our_ports = our_it.get("ports", [])

            # Compare
            if itineraries_match(our_ports, cm_full_ports):
                log.info(f"  OK -- matches CruiseMapper")
            else:
                log.warning(f"  MISMATCH -- updating from CruiseMapper")
                log.warning(f"    Our ports: {[p['port'] for p in our_ports]}")
                log.warning(f"    CM ports:  {[p['port'] for p in cm_full_ports]}")

                if not dry_run:
                    update_itinerary(data, ship_name, dep_date, cm_full_ports, description)

                changes_made.append(
                    f"FIXED {ship_name} {dep_date}: "
                    f"was [{', '.join(p['port'] for p in our_ports)}] "
                    f"-> now [{', '.join(p['port'] for p in cm_full_ports)}]"
                )

    # Save and deploy if changes were made
    if changes_made and not dry_run:
        log.info(f"Saving {len(changes_made)} changes to {JSON_PATH}")
        JSON_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        commit_and_deploy(changes_made)
    elif not changes_made:
        log.info("All itineraries verified -- no changes needed.")

    result = {
        "timestamp": datetime.utcnow().isoformat(),
        "checked": checked,
        "changes": changes_made,
        "errors": errors,
        "dry_run": dry_run,
    }

    # Append to persistent change log (skip dry runs)
    if not dry_run and (changes_made or errors):
        append_to_change_log(result)

    return result


# ---------------------------------------------------------------------------
# Change log
# ---------------------------------------------------------------------------

def append_to_change_log(result: dict) -> None:
    """
    Append a verification run result to the persistent change log JSON file.
    Keeps the last 90 days of entries.
    """
    try:
        if CHANGE_LOG_PATH.exists():
            log_data = json.loads(CHANGE_LOG_PATH.read_text())
        else:
            log_data = {"runs": []}

        # Build structured change entries
        structured_changes = []
        for c in result["changes"]:
            if c.startswith("ADDED "):
                rest = c[len("ADDED "):]
                # Parse "Ship Name YYYY-MM-DD: description"
                parts = rest.split(": ", 1)
                ship_date = parts[0].rsplit(" ", 1)
                structured_changes.append({
                    "type": "ADDED",
                    "ship": ship_date[0] if len(ship_date) > 1 else parts[0],
                    "departure_date": ship_date[1] if len(ship_date) > 1 else "",
                    "description": parts[1] if len(parts) > 1 else "",
                    "detail": c,
                })
            elif c.startswith("FIXED "):
                rest = c[len("FIXED "):]
                parts = rest.split(": was [", 1)
                ship_date = parts[0].rsplit(" ", 1)
                was_now = parts[1].split("] -> now [") if len(parts) > 1 else ["", ""]
                structured_changes.append({
                    "type": "FIXED",
                    "ship": ship_date[0] if len(ship_date) > 1 else parts[0],
                    "departure_date": ship_date[1] if len(ship_date) > 1 else "",
                    "was": was_now[0].rstrip("]") if was_now else "",
                    "now": was_now[1].rstrip("]") if len(was_now) > 1 else "",
                    "detail": c,
                })

        run_entry = {
            "run_timestamp": result["timestamp"],
            "sailings_checked": len(result["checked"]),
            "changes": structured_changes,
            "errors": result["errors"],
        }

        log_data["runs"].append(run_entry)

        # Prune entries older than 90 days
        cutoff = (datetime.utcnow() - timedelta(days=90)).isoformat()
        log_data["runs"] = [
            r for r in log_data["runs"]
            if r.get("run_timestamp", "") >= cutoff
        ]

        CHANGE_LOG_PATH.write_text(json.dumps(log_data, indent=2, ensure_ascii=False))
        log.info(f"Change log updated: {len(structured_changes)} entries written.")

    except Exception as e:
        log.error(f"Failed to update change log: {e}")


# ---------------------------------------------------------------------------
# Git commit and deploy
# ---------------------------------------------------------------------------

def commit_and_deploy(changes: list[str]) -> None:
    """Commit the updated JSON to main and deploy to gh-pages."""
    log.info("Committing changes to main branch ...")

    summary = f"Auto-verify: fix {len(changes)} itinerary mismatch(es) from CruiseMapper"

    try:
        subprocess.run(
            ["git", "add", "client/public/cruise_itineraries.json"],
            cwd=REPO_DIR, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "commit", "-m", summary],
            cwd=REPO_DIR, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=REPO_DIR, check=True, capture_output=True
        )
        log.info("Committed and pushed to main.")
    except subprocess.CalledProcessError as e:
        log.error(f"Git commit/push failed: {e.stderr.decode()}")
        return

    log.info("Building and deploying to gh-pages ...")
    try:
        env = {**os.environ, "VITE_BASE_PATH": "/"}
        subprocess.run(
            ["pnpm", "run", "build:pages"],
            cwd=REPO_DIR, check=True, capture_output=True, env=env
        )

        deploy_script = """
set -e
cd /tmp
rm -rf gh-pages-deploy-auto
mkdir gh-pages-deploy-auto
cd gh-pages-deploy-auto
git init
git remote add origin https://github.com/jamesavanfleet-cpu/weatherstream-mvp.git
git fetch origin gh-pages
git reset --hard origin/gh-pages
cp -r /home/ubuntu/vanfleet-wx/dist/public/* .
cp /home/ubuntu/vanfleet-wx/client/public/cruise_itineraries.json .
git add -A
git commit -m "Deploy: auto-verify itineraries from CruiseMapper"
git push origin HEAD:gh-pages
"""
        subprocess.run(["bash", "-c", deploy_script], check=True, capture_output=True)
        log.info("Deployed to gh-pages successfully.")
    except subprocess.CalledProcessError as e:
        log.error(f"Build/deploy failed: {e.stderr.decode() if e.stderr else str(e)}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify cruise itineraries against CruiseMapper")
    parser.add_argument("--dry-run", action="store_true", help="Check only, do not modify files")
    parser.add_argument("--ship", type=str, default=None, help="Only check a specific ship name")
    args = parser.parse_args()

    result = verify_all_ships(dry_run=args.dry_run, target_ship=args.ship)

    print("\n" + "=" * 60)
    print(f"VERIFICATION COMPLETE -- {result['timestamp']}")
    print(f"Ships/sailings checked: {len(result['checked'])}")
    print(f"Changes made: {len(result['changes'])}")
    print(f"Errors: {len(result['errors'])}")

    if result["changes"]:
        print("\nCHANGES:")
        for c in result["changes"]:
            print(f"  {c}")

    if result["errors"]:
        print("\nERRORS:")
        for e in result["errors"]:
            print(f"  {e}")

    if result["dry_run"]:
        print("\n[DRY RUN -- no files were modified]")
    print("=" * 60)
