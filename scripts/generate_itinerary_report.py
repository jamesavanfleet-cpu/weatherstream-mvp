#!/usr/bin/env python3.11
"""
Weekly Itinerary Change Report Generator
==========================================
Reads the itinerary_change_log.json written by verify_itineraries.py and
produces a clean Markdown + PDF report covering the past 7 days of changes.

The report is saved to:
  scripts/reports/itinerary_report_YYYY-MM-DD.md
  scripts/reports/itinerary_report_YYYY-MM-DD.pdf

And committed to the main branch so it is always accessible.

Schedule: Tuesday and Friday at 3:00 PM EDT
"""

import json
import subprocess
import os
from datetime import datetime, timedelta
from pathlib import Path

REPO_DIR = Path("/home/ubuntu/vanfleet-wx")
CHANGE_LOG_PATH = REPO_DIR / "scripts/itinerary_change_log.json"
REPORTS_DIR = REPO_DIR / "scripts/reports"

# Cruise line groupings for the report
CRUISE_LINE_MAP = {
    "Icon of the Seas":      "Royal Caribbean",
    "Oasis of the Seas":     "Royal Caribbean",
    "Symphony of the Seas":  "Royal Caribbean",
    "Allure of the Seas":    "Royal Caribbean",
    "Harmony of the Seas":   "Royal Caribbean",
    "Mariner of the Seas":   "Royal Caribbean",
    "Navigator of the Seas": "Royal Caribbean",
    "Wonder of the Seas":    "Royal Caribbean",
    "Adventure of the Seas": "Royal Caribbean",
    "Freedom of the Seas":   "Royal Caribbean",
    "Mardi Gras":            "Carnival",
    "Carnival Vista":        "Carnival",
    "Carnival Breeze":       "Carnival",
    "Carnival Freedom":      "Carnival",
    "Celebrity Beyond":      "Celebrity Cruises",
    "Celebrity Apex":        "Celebrity Cruises",
    "Disney Wish":           "Disney Cruise Line",
    "Norwegian Encore":      "Norwegian Cruise Line",
    "Norwegian Getaway":     "Norwegian Cruise Line",
    "Caribbean Princess":    "Princess Cruises",
    "MSC Seascape":          "MSC Cruises",
    "Scarlet Lady":          "Virgin Voyages",
}


def load_change_log() -> dict:
    if not CHANGE_LOG_PATH.exists():
        return {"runs": []}
    return json.loads(CHANGE_LOG_PATH.read_text())


def get_recent_runs(log_data: dict, days: int = 7) -> list[dict]:
    """Return all runs from the past N days."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    return [r for r in log_data.get("runs", []) if r.get("run_timestamp", "") >= cutoff]


def format_port_list(port_str: str) -> str:
    """Format a comma-separated port list into a readable sequence."""
    ports = [p.strip() for p in port_str.split(",") if p.strip()]
    return " > ".join(ports) if ports else port_str


def generate_report_markdown(recent_runs: list[dict], report_date: str) -> str:
    """Build the full Markdown report from recent run data."""

    now_str = datetime.utcnow().strftime("%B %d, %Y at %I:%M %p UTC")
    week_start = (datetime.utcnow() - timedelta(days=7)).strftime("%B %d")
    week_end = datetime.utcnow().strftime("%B %d, %Y")

    # Aggregate all changes across all runs
    all_fixed = []
    all_added = []
    all_errors = []
    total_sailings_checked = 0

    for run in recent_runs:
        total_sailings_checked += run.get("sailings_checked", 0)
        all_errors.extend(run.get("errors", []))
        for change in run.get("changes", []):
            if change["type"] == "FIXED":
                all_fixed.append({**change, "run_timestamp": run["run_timestamp"]})
            elif change["type"] == "ADDED":
                all_added.append({**change, "run_timestamp": run["run_timestamp"]})

    # Group by cruise line
    def group_by_line(items):
        grouped = {}
        for item in items:
            line = CRUISE_LINE_MAP.get(item.get("ship", ""), "Other")
            grouped.setdefault(line, []).append(item)
        return grouped

    fixed_by_line = group_by_line(all_fixed)
    added_by_line = group_by_line(all_added)

    lines = []

    # Header
    lines.append("# Itinerary Change Report")
    lines.append(f"**My Cruising Weather -- www.mycruisingweather.com**")
    lines.append(f"")
    lines.append(f"**Report Period:** {week_start} -- {week_end}")
    lines.append(f"**Generated:** {now_str}")
    lines.append(f"**Source:** CruiseMapper.com (automated verification)")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Executive summary
    lines.append("## Summary")
    lines.append("")
    lines.append(
        f"This report covers **{len(recent_runs)} verification run(s)** conducted between "
        f"{week_start} and {week_end}. A total of **{total_sailings_checked} ship sailings** "
        f"were checked against CruiseMapper.com."
    )
    lines.append("")

    total_changes = len(all_fixed) + len(all_added)
    if total_changes == 0:
        lines.append(
            "**No itinerary changes were detected this period.** All stored itineraries "
            "matched CruiseMapper exactly. The site is displaying accurate data for all ships."
        )
    else:
        lines.append(
            f"**{total_changes} itinerary change(s) were detected and automatically corrected** "
            f"before the data reached the live site:"
        )
        lines.append("")
        lines.append(f"| Category | Count |")
        lines.append(f"|---|---|")
        lines.append(f"| Itineraries corrected (wrong ports or dates) | {len(all_fixed)} |")
        lines.append(f"| New sailings added from CruiseMapper | {len(all_added)} |")
        lines.append(f"| Errors (CruiseMapper fetch failures) | {len(all_errors)} |")

    lines.append("")
    lines.append("---")
    lines.append("")

    # Corrections section
    if all_fixed:
        lines.append("## Itinerary Corrections")
        lines.append("")
        lines.append(
            "The following itineraries were found to be incorrect and were replaced with "
            "the verified CruiseMapper data. Each entry shows the old port sequence and "
            "the corrected sequence."
        )
        lines.append("")

        for cruise_line in sorted(fixed_by_line.keys()):
            items = fixed_by_line[cruise_line]
            lines.append(f"### {cruise_line}")
            lines.append("")
            for item in sorted(items, key=lambda x: (x.get("ship", ""), x.get("departure_date", ""))):
                run_ts = item.get("run_timestamp", "")[:10]
                lines.append(
                    f"**{item['ship']}** -- Departure {item['departure_date']} "
                    f"_(detected {run_ts})_"
                )
                lines.append("")
                lines.append(f"- **Was:** {format_port_list(item.get('was', ''))}")
                lines.append(f"- **Corrected to:** {format_port_list(item.get('now', ''))}")
                lines.append("")

    # New sailings section
    if all_added:
        lines.append("## New Sailings Added")
        lines.append("")
        lines.append(
            "The following sailings were found on CruiseMapper but were not yet in our "
            "database. They have been added automatically."
        )
        lines.append("")

        for cruise_line in sorted(added_by_line.keys()):
            items = added_by_line[cruise_line]
            lines.append(f"### {cruise_line}")
            lines.append("")
            lines.append("| Ship | Departure Date | Description |")
            lines.append("|---|---|---|")
            for item in sorted(items, key=lambda x: (x.get("ship", ""), x.get("departure_date", ""))):
                lines.append(
                    f"| {item['ship']} | {item['departure_date']} | {item.get('description', '')} |"
                )
            lines.append("")

    # Errors section
    if all_errors:
        lines.append("## Fetch Errors")
        lines.append("")
        lines.append(
            "The following ships encountered errors when fetching data from CruiseMapper. "
            "Their stored itineraries were not modified. These will be retried on the next run."
        )
        lines.append("")
        for err in all_errors:
            lines.append(f"- {err}")
        lines.append("")

    # No changes confirmation
    if total_changes == 0 and not all_errors:
        lines.append("## Verification Status")
        lines.append("")
        lines.append(
            "All 22 ships and their upcoming sailings were verified against CruiseMapper.com "
            "with no discrepancies found. The site is displaying accurate, real-world itinerary "
            "data for every ship."
        )
        lines.append("")

    # Footer
    lines.append("---")
    lines.append("")
    lines.append(
        "_This report is generated automatically by the My Cruising Weather itinerary "
        "verification system. Verification runs every Monday and Thursday at 6:00 AM EDT. "
        "Reports are generated every Tuesday and Friday at 3:00 PM EDT. "
        "Source of truth: [CruiseMapper.com](https://www.cruisemapper.com)._"
    )

    return "\n".join(lines)


def save_and_commit_report(md_content: str, report_date: str) -> Path:
    """Save the Markdown and PDF reports, then commit to main."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    md_path = REPORTS_DIR / f"itinerary_report_{report_date}.md"
    pdf_path = REPORTS_DIR / f"itinerary_report_{report_date}.pdf"

    # Write Markdown
    md_path.write_text(md_content, encoding="utf-8")
    print(f"Markdown report saved: {md_path}")

    # Convert to PDF
    try:
        result = subprocess.run(
            ["manus-md-to-pdf", str(md_path), str(pdf_path)],
            capture_output=True, timeout=60
        )
        if result.returncode == 0:
            print(f"PDF report saved: {pdf_path}")
        else:
            print(f"PDF conversion warning: {result.stderr.decode()}")
    except Exception as e:
        print(f"PDF conversion failed: {e}")

    # Commit both files to main
    try:
        subprocess.run(
            ["git", "add",
             str(md_path.relative_to(REPO_DIR)),
             str(pdf_path.relative_to(REPO_DIR)) if pdf_path.exists() else str(md_path.relative_to(REPO_DIR))],
            cwd=REPO_DIR, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "commit", "-m", f"Report: weekly itinerary change report {report_date}"],
            cwd=REPO_DIR, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=REPO_DIR, check=True, capture_output=True
        )
        print("Report committed and pushed to main.")
    except subprocess.CalledProcessError as e:
        print(f"Git commit failed: {e.stderr.decode() if e.stderr else str(e)}")

    return pdf_path if pdf_path.exists() else md_path


def main():
    report_date = datetime.utcnow().strftime("%Y-%m-%d")
    print(f"Generating itinerary change report for {report_date} ...")

    log_data = load_change_log()
    recent_runs = get_recent_runs(log_data, days=7)

    print(f"Found {len(recent_runs)} verification run(s) in the past 7 days.")

    md_content = generate_report_markdown(recent_runs, report_date)
    report_path = save_and_commit_report(md_content, report_date)

    print(f"\nReport complete: {report_path}")
    print(
        f"View in repo: https://github.com/jamesavanfleet-cpu/weatherstream-mvp/blob/main/"
        f"scripts/reports/itinerary_report_{report_date}.md"
    )


if __name__ == "__main__":
    main()
