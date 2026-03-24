#!/usr/bin/env python3
"""
Trim cruise_itineraries.json to the 30-day rolling window.

Removes:
  - Itineraries with departure_date strictly in the past (before today)
  - Itineraries with departure_date more than 30 days from today

Keeps:
  - Itineraries where today <= departure_date <= today + 30 days

Ships with zero remaining itineraries are kept in the JSON (empty itineraries list)
so the frontend still knows the ship exists.

Usage:
    python3 scripts/trim_to_30day_window.py [--dry-run]
"""
import json
import sys
import os
from datetime import date, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
JSON_PATH = os.path.join(REPO_ROOT, 'client', 'public', 'cruise_itineraries.json')

TODAY = date.today()
CUTOFF = TODAY + timedelta(days=30)

DRY_RUN = '--dry-run' in sys.argv

print(f"Trim to 30-day rolling window")
print(f"Today:   {TODAY}")
print(f"Cutoff:  {CUTOFF}")
print(f"Mode:    {'DRY RUN (no changes written)' if DRY_RUN else 'LIVE'}")
print()

with open(JSON_PATH) as f:
    data = json.load(f)

total_removed = 0
total_kept = 0
ships_with_zero = 0

for cl in data['cruise_lines']:
    for ship in cl.get('ships', []):
        original = ship.get('itineraries', [])
        kept = []
        for itin in original:
            dep = itin.get('departure_date', '')
            if not dep:
                continue
            d = date.fromisoformat(dep)
            if TODAY <= d <= CUTOFF:
                kept.append(itin)
            else:
                total_removed += 1
        total_kept += len(kept)
        if len(kept) == 0 and len(original) > 0:
            ships_with_zero += 1
        ship['itineraries'] = kept

print(f"Itineraries kept:    {total_kept}")
print(f"Itineraries removed: {total_removed}")
print(f"Ships with 0 itineraries in window: {ships_with_zero}")

if not DRY_RUN:
    with open(JSON_PATH, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f"\nWritten: {JSON_PATH}")
else:
    print("\nDry run complete -- no file written.")
