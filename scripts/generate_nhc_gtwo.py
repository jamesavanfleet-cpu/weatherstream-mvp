#!/usr/bin/env python3
"""Publish the current NHC GTWO artifact with validated public A-deck guidance.

The existing GTWO workflow owns this artifact and runs at each nominal six-hour
NHC cycle. This entry point waits for a complete current public A-deck rather
than publishing a partial or prior-cycle model payload. Its bounded readiness
window covers nearly the full interval before the next existing six-hour run.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Callable

import generate_model_guidance as guidance
from generate_nhc_data import fetch_gtwo_dataset, write_gtwo_artifact

GUIDANCE_POLL_INTERVAL_SECONDS = 5 * 60
# 59 five-minute waits leave more than an hour before the next six-hour run,
# allowing for delayed public A-decks without overlapping the next cycle.
GUIDANCE_POLL_ATTEMPTS = 60


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_current_storms() -> dict:
    raw_current_storms = guidance.fetch_url(guidance.CURRENT_STORMS_URL, timeout=30)
    current_storms = json.loads(raw_current_storms.decode("utf-8"))
    if not isinstance(current_storms, dict):
        raise ValueError("CurrentStorms.json response is not an object")
    return current_storms


def wait_for_current_model_guidance(
    current_storms_fetcher: Callable[[], dict] = fetch_current_storms,
    adeck_fetcher: Callable[[str], str] = guidance.fetch_adeck_text,
    directory_fetcher: Callable[[], str] = guidance.fetch_public_adeck_directory,
    now_fn: Callable[[], str] = utc_timestamp,
    sleep_fn: Callable[[float], None] = time.sleep,
    attempts: int = GUIDANCE_POLL_ATTEMPTS,
) -> dict:
    """Return only a validated current-cycle A-deck payload within one bounded window."""
    if attempts < 1:
        raise ValueError("Guidance readiness polling requires at least one attempt")

    latest_pending: guidance.GuidancePending | None = None
    for attempt in range(1, attempts + 1):
        generated_at = now_fn()
        try:
            payload = guidance.build_payload(
                current_storms_fetcher(),
                adeck_fetcher,
                generated_at,
                directory_fetcher=directory_fetcher,
            )
            guidance.validate_payload(payload)
            return payload
        except guidance.GuidancePending as error:
            latest_pending = error
            if attempt == attempts:
                break
            print(
                f"Current NHC A-deck cycle pending (attempt {attempt}/{attempts}); "
                f"retrying in {GUIDANCE_POLL_INTERVAL_SECONDS // 60} minutes: {error}"
            )
            sleep_fn(GUIDANCE_POLL_INTERVAL_SECONDS)

    raise guidance.GuidancePending(
        "Current NHC A-deck cycle was not complete within the bounded readiness window: "
        f"{latest_pending}"
    )


def main() -> list:
    generated_at = utc_timestamp()
    print(f"NHC GTWO and model-guidance fetch started: {generated_at}")

    try:
        model_guidance = wait_for_current_model_guidance()
    except guidance.GuidancePending as error:
        # A late public A-deck must never block the pre-existing GTWO refresh.
        # The page keeps the last independently validated guidance artifact until
        # a future GTWO run can embed a complete current-cycle replacement.
        print(f"NHC model guidance is pending; preserving the normal GTWO refresh: {error}")
        model_guidance = None

    features, source_metadata = fetch_gtwo_dataset()
    out_path = write_gtwo_artifact(
        features,
        generated_at,
        source_metadata,
        model_guidance=model_guidance,
        model_guidance_validator=guidance.validate_payload if model_guidance is not None else None,
    )

    guidance_system_count = len(model_guidance["storms"]) if model_guidance is not None else 0
    print(
        f"Wrote {out_path} ({len(features)} disturbances; "
        f"{guidance_system_count} validated guidance systems)"
    )
    print(f"NHC GTWO and model-guidance fetch complete: {utc_timestamp()}")
    return features


if __name__ == "__main__":
    main()
