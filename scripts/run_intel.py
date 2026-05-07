#!/usr/bin/env python3
"""
run_intel.py -- legacy entry point for daily intel generation.

This file used to contain its own duplicate of the intel generation logic with
an out-of-date region table (US Ports rep_port = "Charleston, South Carolina"),
no Miami lead validator, no rain wording filter, and no Florida-homeport
priority note. That stale logic was the root cause of the US Ports briefing
periodically reverting to lead with Charleston instead of Miami despite the
official forecast-refresh GitHub Actions workflow producing correct output:
any external scheduler that called this script (for example the legacy
scripts/daily_deploy.sh shell script) wrote bad intel.json over the good one.

To eliminate that class of regression permanently, this file is now a thin
wrapper around scripts/generate_intel.py. Every code path -- the GitHub
Actions forecast-refresh workflow, scripts/daily_deploy.sh, scripts/
full_refresh.sh, manual runs, and any external cron job that invokes
``python3 scripts/run_intel.py`` -- now executes the single canonical
generator with all current safeguards (Miami lead validator, sub-10% rain
wording filter, Florida-homeport priority note, temperature stripper,
significant-weather alert lead, etc.).

Do not add generation logic to this file. Add it to generate_intel.py.
"""
import sys
from pathlib import Path

# Allow this wrapper to be invoked from any working directory.
_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

import generate_intel  # noqa: E402

if __name__ == "__main__":
    generate_intel.main()
