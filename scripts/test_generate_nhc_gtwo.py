#!/usr/bin/env python3
"""Focused regression tests for the GTWO-owned model-guidance fallback publisher."""

from __future__ import annotations

import os
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# These unit tests mock fetch_gtwo_dataset and never parse a shapefile. The
# existing parser dependency is optional in this isolated publisher test path.
sys.modules.setdefault("shapefile", types.ModuleType("shapefile"))
import generate_model_guidance as guidance  # noqa: E402
import generate_nhc_gtwo as gtwo  # noqa: E402


VALID_GUIDANCE = {
    "generated": "2026-07-17T18:10:00Z",
    "source": "NOAA National Hurricane Center ATCF public A-deck",
    "activeStormSourceUrl": "https://www.nhc.noaa.gov/CurrentStorms.json",
    "disclaimer": "Model guidance is not an official NHC forecast.",
    "storms": [],
}


class GtwoGuidancePublisherTests(unittest.TestCase):
    def test_wait_retries_until_a_current_validated_payload_is_available(self) -> None:
        sleeps: list[float] = []
        with (
            patch.object(
                guidance,
                "build_payload",
                side_effect=[guidance.GuidancePending("awaiting current cycle"), VALID_GUIDANCE],
            ) as build_payload,
            patch.object(guidance, "validate_payload") as validate_payload,
        ):
            payload = gtwo.wait_for_current_model_guidance(
                current_storms_fetcher=lambda: {"activeStorms": []},
                adeck_fetcher=lambda _: "",
                directory_fetcher=lambda: "",
                now_fn=lambda: "2026-07-17T18:10:00Z",
                sleep_fn=sleeps.append,
                attempts=2,
            )

        self.assertEqual(payload, VALID_GUIDANCE)
        self.assertEqual(build_payload.call_count, 2)
        self.assertEqual(validate_payload.call_count, 1)
        self.assertEqual(sleeps, [gtwo.GUIDANCE_POLL_INTERVAL_SECONDS])

    def test_wait_stops_after_its_bounded_window(self) -> None:
        sleeps: list[float] = []
        with patch.object(
            guidance,
            "build_payload",
            side_effect=guidance.GuidancePending("awaiting current cycle"),
        ) as build_payload:
            with self.assertRaisesRegex(guidance.GuidancePending, "bounded readiness window"):
                gtwo.wait_for_current_model_guidance(
                    current_storms_fetcher=lambda: {"activeStorms": []},
                    adeck_fetcher=lambda _: "",
                    directory_fetcher=lambda: "",
                    now_fn=lambda: "2026-07-17T18:10:00Z",
                    sleep_fn=sleeps.append,
                    attempts=2,
                )

        self.assertEqual(build_payload.call_count, 2)
        self.assertEqual(sleeps, [gtwo.GUIDANCE_POLL_INTERVAL_SECONDS])

    def test_main_keeps_the_existing_gtwo_refresh_when_guidance_is_pending(self) -> None:
        features = []
        provenance = {"source_url": "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"}
        with (
            patch.object(gtwo, "utc_timestamp", side_effect=["2026-07-17T18:10:00Z", "2026-07-17T18:10:01Z"]),
            patch.object(
                gtwo,
                "wait_for_current_model_guidance",
                side_effect=guidance.GuidancePending("awaiting current cycle"),
            ),
            patch.object(gtwo, "fetch_gtwo_dataset", return_value=(features, provenance)),
            patch.object(gtwo, "write_gtwo_artifact", return_value="/tmp/nhc_gtwo.json") as write_artifact,
        ):
            self.assertEqual(gtwo.main(), features)

        self.assertEqual(write_artifact.call_count, 1)
        _, kwargs = write_artifact.call_args
        self.assertIsNone(kwargs["model_guidance"])
        self.assertIsNone(kwargs["model_guidance_validator"])

    def test_main_embeds_only_the_validated_current_payload(self) -> None:
        features = []
        provenance = {"source_url": "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"}
        with (
            patch.object(gtwo, "utc_timestamp", side_effect=["2026-07-17T18:10:00Z", "2026-07-17T18:10:01Z"]),
            patch.object(gtwo, "wait_for_current_model_guidance", return_value=VALID_GUIDANCE),
            patch.object(gtwo, "fetch_gtwo_dataset", return_value=(features, provenance)),
            patch.object(gtwo, "write_gtwo_artifact", return_value="/tmp/nhc_gtwo.json") as write_artifact,
        ):
            self.assertEqual(gtwo.main(), features)

        _, kwargs = write_artifact.call_args
        self.assertEqual(kwargs["model_guidance"], VALID_GUIDANCE)
        self.assertIs(kwargs["model_guidance_validator"], guidance.validate_payload)


if __name__ == "__main__":
    unittest.main(verbosity=2)
