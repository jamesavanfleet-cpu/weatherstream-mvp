#!/usr/bin/env python3
"""Focused regression tests for the US Ports NWS daily PoP routing."""

import importlib.util
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo


MODULE_PATH = Path(__file__).with_name("generate_intel.py")
SPEC = importlib.util.spec_from_file_location("generate_intel", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


AFD_TEXT = """.PRELIMINARY POINT TEMPS/POPS...
Miami            91  81  91  80 /  60  40  70  30
Fort Lauderdale  91  80  90  80 /  60  40  60  30
&&
"""


def point_payload(daytime_values):
    periods = []
    for value in daytime_values:
        periods.extend(
            [
                {"isDaytime": True, "probabilityOfPrecipitation": {"value": value}},
                {"isDaytime": False, "probabilityOfPrecipitation": {"value": 20}},
            ]
        )
    return {
        "properties": {
            "gridId": "MFL",
            "forecast": "https://api.weather.gov/gridpoints/MFL/110,50/forecast",
            "forecastGridData": "https://api.weather.gov/gridpoints/MFL/110,50",
            "timeZone": "America/New_York",
            "periods": periods,
        }
    }


def grid_payload(daytime_values):
    timezone = ZoneInfo("America/New_York")
    today = datetime.now(timezone).date()
    values = []
    for day_index, value in enumerate(daytime_values):
        start = datetime.combine(
            today + timedelta(days=day_index),
            datetime.min.time(),
            timezone,
        ).replace(hour=12)
        values.append({"validTime": f"{start.isoformat()}/PT1H", "value": value})
    return {"properties": {"probabilityOfPrecipitation": {"values": values}}}


class FloridaCruisePortAfdTests(unittest.TestCase):
    def test_parse_explicit_city_rows_only(self):
        self.assertEqual(
            MODULE._parse_nws_afd_pop_row(AFD_TEXT, ("Miami",)),
            [60, 40, 70, 30],
        )
        self.assertEqual(
            MODULE._parse_nws_afd_pop_row(AFD_TEXT, ("Fort Lauderdale",)),
            [60, 40, 60, 30],
        )
        self.assertEqual(MODULE._parse_nws_afd_pop_row(AFD_TEXT, ("Bayonne",)), [])

    def test_afternoon_afd_sequence_skips_leading_nighttime_pop(self):
        self.assertEqual(
            MODULE._align_afd_pop_sequence_to_daytime([30, 60, 20, 70], 13),
            [60, 20, 70],
        )
        self.assertEqual(
            MODULE._align_afd_pop_sequence_to_daytime([60, 30, 70, 30], 7),
            [60, 30, 70, 30],
        )

    def test_all_six_florida_ports_require_same_day_afd_rows(self):
        rows = {
            "Miami": [40, 40, 50, 30],
            "Fort Lauderdale": [40, 40, 60, 30],
            "MLB": [40, 20, 50, 10],
            "TPA": [60, 30, 60, 30],
            "Key West": [30, 30, 30, 30],
            "JAX": [40, 30, 50, 10],
        }

        def latest(office, aliases, timezone):
            del office, timezone
            return rows[aliases[0]]

        with patch.object(MODULE, "_latest_same_day_afd_pop", side_effect=latest):
            values = MODULE.fetch_florida_cruise_port_afd_pops()

        self.assertEqual(values["Miami"], [40, 50])
        self.assertEqual(values["Port Everglades"], [40, 60])
        self.assertEqual(values["Port Canaveral"], [40, 50])
        self.assertEqual(values["Tampa Bay"], [60, 60])
        self.assertEqual(values["Key West"], [30, 30])
        self.assertEqual(values["Jacksonville"], [40, 50])

    def test_missing_one_florida_afd_row_blocks_publication(self):
        def latest(office, aliases, timezone):
            del office, timezone
            return [] if aliases[0] == "JAX" else [40, 30, 50, 10]

        with patch.object(MODULE, "_latest_same_day_afd_pop", side_effect=latest):
            with self.assertRaisesRegex(RuntimeError, "Jacksonville"):
                MODULE.fetch_florida_cruise_port_afd_pops()

    def test_us_ports_uses_miami_afd_values_before_any_point_fallback(self):
        florida_values = {
            "Miami": [40, 50, 60],
            "Port Everglades": [40, 60],
            "Port Canaveral": [40, 50],
            "Tampa Bay": [60, 60],
            "Key West": [30, 30],
            "Jacksonville": [40, 50],
        }
        with patch.object(MODULE, "_fetch_nws_json") as fetch:
            region = {"slug": "us-ports", "lat": 25.76, "lon": -80.19}
            self.assertEqual(MODULE.fetch_us_port_daily_pop(region, florida_values), [40, 50, 60])
            fetch.assert_not_called()

    def test_us_ports_rejects_missing_miami_afd_value(self):
        region = {"slug": "us-ports", "lat": 25.76, "lon": -80.19}
        with self.assertRaisesRegex(RuntimeError, "Miami NWS forecast-discussion"):
            MODULE.fetch_us_port_daily_pop(region, {})

    def test_us_ports_point_fallback_only_completes_missing_later_afd_days(self):
        point = point_payload([])
        forecast = point_payload([41, 51, 61])
        florida_values = {
            "Miami": [40, 50],
            "Port Everglades": [40, 60],
            "Port Canaveral": [40, 50],
            "Tampa Bay": [60, 60],
            "Key West": [30, 30],
            "Jacksonville": [40, 50],
        }

        def fetch(url):
            if url.endswith("/points/25.76,-80.19"):
                return point
            if url.endswith("/forecast"):
                return forecast
            raise AssertionError(f"Unexpected URL: {url}")

        with patch.object(MODULE, "_fetch_nws_json", side_effect=fetch):
            region = {"slug": "us-ports", "lat": 25.76, "lon": -80.19}
            self.assertEqual(MODULE.fetch_us_port_daily_pop(region, florida_values), [40, 50, 61])

    def test_non_us_region_keeps_existing_open_meteo_path(self):
        with patch.object(
            MODULE,
            "fetch_precip_probability",
            return_value=[11, 22, 33],
        ) as legacy_fetch:
            region = {
                "slug": "bahamas-central-caribbean",
                "lat": 25.04,
                "lon": -77.35,
            }
            self.assertEqual(MODULE.fetch_region_precip_probability(region), ([11, 22, 33], {}))
            legacy_fetch.assert_called_once_with(25.04, -77.35)

    def test_us_ports_lead_replaces_model_rain_values_with_all_six_afd_values(self):
        weather_data = {
            "florida_afd_pops": {
                "Miami": [40, 50],
                "Port Everglades": [40, 60],
                "Port Canaveral": [40, 50],
                "Tampa Bay": [60, 60],
                "Key West": [30, 30],
                "Jacksonville": [40, 50],
            }
        }
        model_text = (
            "Today, Miami has partly cloudy skies with 10% rain probability. "
            "Tomorrow, conditions improve with E 8kt winds."
        )
        repaired = MODULE._enforce_us_ports_today_pop(
            {"slug": "us-ports"}, model_text, weather_data
        )
        first_sentence = repaired.split(".", 1)[0]
        self.assertIn("Miami, Port Everglades, Port Canaveral, and Jacksonville have 40% rain probability", first_sentence)
        self.assertIn("Tampa Bay has 60% rain probability", first_sentence)
        self.assertIn("Key West has 30% rain probability", first_sentence)
        self.assertNotIn("10% rain probability", first_sentence)

    def test_missing_florida_dataset_blocks_us_ports_briefing(self):
        with self.assertRaisesRegex(ValueError, "six-port Florida AFD dataset"):
            MODULE._enforce_us_ports_today_pop(
                {"slug": "us-ports"},
                "Today, Miami has 40% rain probability.",
                {"summary": "Current conditions: E 8kt, 40% rain probability."},
            )

    def test_pop_guard_does_not_change_non_us_briefings(self):
        region = {"slug": "bahamas-central-caribbean"}
        intel = "Today, Nassau has 10% rain probability."
        self.assertEqual(
            MODULE._enforce_us_ports_today_pop(region, intel, {"florida_afd_pops": {}}),
            intel,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
