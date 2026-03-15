#!/usr/bin/env python3.11
"""
Itinerary Check Orchestrator
==============================
Runs the full Tuesday / Friday pipeline:
  1. verify_itineraries.py  -- fetches CruiseMapper, auto-corrects mismatches
  2. generate_itinerary_report.py -- builds Markdown + PDF report and commits it

Returns a structured result dict so the Manus scheduler can deliver the
report to James directly.

Schedule: Tuesday and Friday at 3:00 PM EDT
"""

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

REPO_DIR   = Path("/home/ubuntu/vanfleet-wx")
REPORTS_DIR = REPO_DIR / "scripts/reports"


def run_step(label: str, cmd: list[str]) -> tuple[bool, str]:
    """Run a subprocess step and return (success, output)."""
    try:
        result = subprocess.run(
            cmd,
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            timeout=600,
        )
        output = (result.stdout + result.stderr).strip()
        if result.returncode != 0:
            return False, f"{label} failed (exit {result.returncode}):\n{output}"
        return True, output
    except subprocess.TimeoutExpired:
        return False, f"{label} timed out after 600 seconds"
    except Exception as e:
        return False, f"{label} error: {e}"


def main() -> dict:
    run_date = datetime.utcnow().strftime("%Y-%m-%d")
    log_lines = [f"[{datetime.utcnow().isoformat()}] Starting itinerary check pipeline"]

    # Step 1: Verify and auto-correct itineraries
    ok, out = run_step(
        "verify_itineraries",
        [sys.executable, "scripts/verify_itineraries.py"],
    )
    log_lines.append(f"\n--- verify_itineraries ---\n{out}")
    if not ok:
        log_lines.append("PIPELINE ABORTED at verify step.")
        return {"success": False, "log": "\n".join(log_lines), "report_md": None, "report_pdf": None}

    # Step 2: Generate the report
    ok, out = run_step(
        "generate_itinerary_report",
        [sys.executable, "scripts/generate_itinerary_report.py"],
    )
    log_lines.append(f"\n--- generate_itinerary_report ---\n{out}")
    if not ok:
        log_lines.append("PIPELINE ABORTED at report step.")
        return {"success": False, "log": "\n".join(log_lines), "report_md": None, "report_pdf": None}

    # Locate the report files
    md_path  = REPORTS_DIR / f"itinerary_report_{run_date}.md"
    pdf_path = REPORTS_DIR / f"itinerary_report_{run_date}.pdf"

    log_lines.append(f"\nPipeline complete. Report date: {run_date}")

    return {
        "success":    True,
        "log":        "\n".join(log_lines),
        "report_md":  str(md_path)  if md_path.exists()  else None,
        "report_pdf": str(pdf_path) if pdf_path.exists() else None,
        "run_date":   run_date,
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["success"] else 1)
