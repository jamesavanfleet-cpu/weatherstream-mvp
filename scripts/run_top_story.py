#!/usr/bin/env python3
"""
run_top_story.py -- legacy entry point for daily top story generation.

This file used to contain its own duplicate of the top story generation logic.
That stale logic lacked the recent safeguards added to scripts/
generate_top_story.py (sub-10% rain wording filter, softened prompt rule
to keep the model from echoing the rain rule literally), and any external
scheduler that called it -- for example scripts/daily_deploy.sh -- wrote
out-of-date top_story.json on top of the corrected file produced by the
official GitHub Actions forecast-refresh workflow.

To eliminate that regression class permanently, this file is now a thin
wrapper around scripts/generate_top_story.py. Every code path now executes
the single canonical generator.

Do not add generation logic to this file. Add it to generate_top_story.py.
"""
import asyncio
import sys
from pathlib import Path

# Allow this wrapper to be invoked from any working directory.
_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

import generate_top_story  # noqa: E402

if __name__ == "__main__":
    # generate_top_story.main may be either a coroutine or a regular function.
    # Detect at runtime so this wrapper continues to work if the canonical
    # generator's entry point signature changes in the future.
    main_fn = generate_top_story.main
    if asyncio.iscoroutinefunction(main_fn):
        asyncio.run(main_fn())
    else:
        main_fn()
