#!/usr/bin/env python3
"""Backfill duration_days on current and future itineraries.

Background
----------
CruiseFinder.tsx reads `duration_days` for two things:
  * the label   `(${durationDays} nights)`
  * the filter  `endDate = departure_date + duration_days`, which decides
    whether a sailing still counts as current ("live")
so it must equal the itinerary's night count, i.e. the number of days from the
departure port date to the return port date.

verify_itineraries.py used to write only `duration_nights` (a field no consumer
reads), so every sailing the auto-verifier added arrived on the site with no
duration label and fell back to the 7-night default. The pipeline now writes
`duration_days`; this script backfills the records that were added before the
fix, and aligns `duration_nights` where it disagrees with the route dates.

Scope: only sailings that are still visible on the site, meaning the route has
not finished yet (the last port date is today or later). Completed historical
itineraries are left exactly as they are.

Usage:
    python3 normalize_durations.py            # preview only
    python3 normalize_durations.py --apply    # write changes
"""
import json
import sys
from datetime import date, datetime
from pathlib import Path

JSON_PATH = Path("/home/ubuntu/vanfleet-wx/client/public/cruise_itineraries.json")
TODAY = datetime.utcnow().date()


def span_of(it: dict):
    """Night count implied by the itinerary's own port dates."""
    ports = it.get("ports") or []
    if len(ports) < 2:
        return None
    if ports[0]["date"] != it["departure_date"]:
        return None  # route dates do not line up with the departure date
    return (date.fromisoformat(ports[-1]["date"]) - date.fromisoformat(ports[0]["date"])).days


def main() -> int:
    apply = "--apply" in sys.argv
    data = json.loads(JSON_PATH.read_text())

    in_scope = 0
    added_dd = 0
    aligned_dn = 0
    skipped = 0
    detail = []

    for cl in data["cruise_lines"]:
        for ship in cl["ships"]:
            for it in ship["itineraries"]:
                span = span_of(it)
                if span is None:
                    # Cannot derive a duration from the route dates.
                    if date.fromisoformat(it["departure_date"]) >= TODAY:
                        in_scope += 1
                        skipped += 1
                    continue
                if date.fromisoformat(it["ports"][-1]["date"]) < TODAY:
                    continue  # sailing already completed; leave history alone
                in_scope += 1

                need_dd = it.get("duration_days") is None
                dn = it.get("duration_nights")
                need_dn = dn is not None and dn != span
                if not need_dd and not need_dn:
                    continue

                if need_dd:
                    added_dd += 1
                if need_dn:
                    aligned_dn += 1
                detail.append(
                    f"  {cl['display']:22s} {ship['name']:24s} {it['departure_date']} "
                    f"dd {it.get('duration_days', '--')} -> {span} | "
                    f"dn {dn if dn is not None else '--'} -> {span} | "
                    f"{it.get('description', '')[:42]}"
                )

                if apply:
                    it["duration_days"] = span
                    if dn is not None:
                        it["duration_nights"] = span

    print(f"current/future itineraries in scope: {in_scope}")
    print(f"duration_days added: {added_dd} | duration_nights aligned: {aligned_dn} | unverifiable: {skipped}")
    for line in detail:
        print(line)

    if apply:
        JSON_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        print(f"\nAPPLIED -> {JSON_PATH}")
    else:
        print("\npreview only (pass --apply to write)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
