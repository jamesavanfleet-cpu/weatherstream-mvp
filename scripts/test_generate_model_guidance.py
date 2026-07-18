#!/usr/bin/env python3
"""Focused regression tests for the official NHC public A-deck model parser."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_model_guidance as guidance  # noqa: E402


ADECK_FIXTURE = """
EP, 05, 2026071712, 03, HFSA, 0, 171N, 1219W, 55, 994, XX, 34, NEQ, 0, 0, 0, 0,
EP, 05, 2026071712, 03, HFSA, 0, 171N, 1219W, 55, 994, XX, 0, , 0, 0, 0, 0,
EP, 05, 2026071712, 03, HFSA, 12, 179N, 1229W, 60, 990, XX, 0, , 0, 0, 0, 0,
EP, 05, 2026071712, 03, AVNO, 0, 170N, 1220W, 54, 995, XX, 0, , 0, 0, 0, 0,
EP, 05, 2026071712, 03, AVNO, 12, 178N, 1230W, 58, 991, XX, 0, , 0, 0, 0, 0,
EP, 05, 2026071712, 03, OFCL, 0, 170N, 1220W, 55, 994, XX, 0, , 0, 0, 0, 0,
EP, 05, 2026071712, 03, EMX, 12, 178N, 1230W, 58, 991, XX, 0, , 0, 0, 0, 0,
EP, 05, 2026071718, 03, AVNO, 0, 172N, 1218W, 56, 993, XX, 0, , 0, 0, 0, 0,
EP, 05, 2026071718, 03, AVNO, 12, 180N, 1228W, 60, 989, XX, 0, , 0, 0, 0, 0,
""".strip()


class ModelGuidanceParserTests(unittest.TestCase):
    def test_parses_atcf_compact_coordinates_with_correct_hemispheres(self) -> None:
        self.assertEqual(guidance.parse_coordinate("171N", "lat"), 17.1)
        self.assertEqual(guidance.parse_coordinate("1219W", "lon"), -121.9)
        self.assertEqual(guidance.parse_coordinate("171S", "lat"), -17.1)
        self.assertIsNone(guidance.parse_coordinate("999N", "lat"))
        self.assertIsNone(guidance.parse_coordinate("1219N", "lon"))

    def test_rejects_restricted_and_official_forecast_aids(self) -> None:
        parsed = guidance.parse_adeck(ADECK_FIXTURE)
        models = parsed["2026071712"]
        self.assertIn("HFSA", models)
        self.assertIn("AVNO", models)
        self.assertNotIn("OFCL", models)
        self.assertNotIn("EMX", models)

    def test_prefers_the_center_track_over_duplicate_wind_radii_rows(self) -> None:
        parsed = guidance.parse_adeck(ADECK_FIXTURE)
        hfs_a_now = parsed["2026071712"]["HFSA"][0]
        self.assertEqual(hfs_a_now["centerTrackRank"], 0)
        self.assertEqual(hfs_a_now["lat"], 17.1)
        self.assertEqual(hfs_a_now["windKt"], 55)
        self.assertEqual(len(parsed["2026071712"]["HFSA"]), 2)

    def test_selects_latest_complete_cycle_without_mixing_cycles(self) -> None:
        selected = guidance.select_latest_complete_cycle(guidance.parse_adeck(ADECK_FIXTURE))
        self.assertIsNotNone(selected)
        cycle, models = selected or ("", [])
        self.assertEqual(cycle, "2026071712")
        self.assertEqual({model["id"] for model in models}, {"AVNO", "HFSA"})
        self.assertEqual(models[0]["points"][0]["windKt"], 54)
        self.assertEqual(models[1]["points"][1]["pressureMb"], 990)

    def test_builds_and_validates_track_and_intensity_artifact(self) -> None:
        payload = guidance.build_payload(
            {"activeStorms": [{"id": "ep052026", "name": "Elida"}]},
            lambda storm_id: ADECK_FIXTURE if storm_id == "ep052026" else "",
            generated_at="2026-07-17T23:31:00Z",
        )
        guidance.validate_payload(payload)

        self.assertEqual(payload["storms"][0]["sourceCycle"], "2026071712")
        self.assertEqual(payload["storms"][0]["models"][0]["points"][0]["forecastHour"], 0)
        self.assertEqual(payload["storms"][0]["models"][0]["points"][0]["windKt"], 54)
        self.assertEqual(payload["storms"][0]["sourceUrl"], "https://ftp.nhc.noaa.gov/atcf/aid_public/aep052026.dat.gz")

    def test_aborts_instead_of_emitting_partial_guidance_when_an_active_adeck_fails(self) -> None:
        current_storms = {
            "activeStorms": [
                {"id": "ep052026", "name": "Elida"},
                {"id": "al012026", "name": "Alpha"},
            ]
        }

        def fetcher(storm_id: str) -> str:
            if storm_id == "ep052026":
                return ADECK_FIXTURE
            raise OSError("official endpoint unavailable")

        with self.assertRaisesRegex(RuntimeError, "al012026"):
            guidance.build_payload(current_storms, fetcher, generated_at="2026-07-17T23:31:00Z")


if __name__ == "__main__":
    unittest.main(verbosity=2)
