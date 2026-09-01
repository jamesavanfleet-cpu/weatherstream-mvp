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


class UsPortsNwsDailyPopTests(unittest.TestCase):
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

    def test_us_ports_prefers_afd_day_values_and_uses_point_fallback(self):
        payload = point_payload([55, 65, 50])
        with patch.object(
            MODULE,
            "_latest_same_day_afd_pop",
            return_value=[60, 40, 70, 30],
        ), patch.object(MODULE, "_fetch_nws_json", return_value=payload):
            region = {"slug": "us-ports", "lat": 25.76, "lon": -80.19}
            self.assertEqual(MODULE.fetch_us_port_daily_pop(region), [60, 70, 50])

    def test_us_ports_uses_point_values_when_afd_row_is_missing(self):
        payload = point_payload([55, 65, 50])
        with patch.object(MODULE, "_latest_same_day_afd_pop", return_value=[]), patch.object(
            MODULE, "_fetch_nws_json", return_value=payload
        ):
            region = {"slug": "us-ports", "lat": 25.76, "lon": -80.19}
            self.assertEqual(MODULE.fetch_us_port_daily_pop(region), [55, 65, 50])

    def test_us_ports_uses_exact_grid_fallback_when_point_forecast_is_unavailable(self):
        point = point_payload([])
        grid = grid_payload([45, 50, 55])

        def fetch(url):
            if url.endswith("/points/25.76,-80.19"):
                return point
            if url.endswith("/forecast"):
                raise RuntimeError("HTTP 404: point forecast unavailable")
            if url.endswith("/gridpoints/MFL/110,50"):
                return grid
            raise AssertionError(f"Unexpected URL: {url}")

        with patch.object(
            MODULE,
            "_latest_same_day_afd_pop",
            return_value=[60, 30, 60, 30],
        ), patch.object(MODULE, "_fetch_nws_json", side_effect=fetch):
            region = {"slug": "us-ports", "lat": 25.76, "lon": -80.19}
            self.assertEqual(MODULE.fetch_us_port_daily_pop(region), [60, 60, 55])

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
            self.assertEqual(MODULE.fetch_region_precip_probability(region), [11, 22, 33])
            legacy_fetch.assert_called_once_with(25.04, -77.35)

    def test_us_ports_lead_replaces_wrong_probability_with_authoritative_value(self):
        region = {
            "slug": "us-ports",
            "required_lead_port": "Miami",
            "rep_port": "Miami, Florida",
        }
        weather_data = {
            "summary": (
                "Current conditions: E 8kt, thunderstorms, 60% rain probability. "
                "3-day outlook: Day 1: E 10kt, thunderstorms, 60% rain probability."
            )
        }
        intel = (
            "Today, Miami has partly cloudy skies with 10% rain probability. "
            "Tomorrow, conditions improve with E 8kt winds."
        )
        repaired = MODULE._enforce_us_ports_today_pop(region, intel, weather_data)
        self.assertIn("60% rain probability", repaired.split(".", 1)[0])
        self.assertNotIn("10% rain probability", repaired.split(".", 1)[0])

    def test_us_ports_lead_falls_back_to_deterministic_sentence_when_pop_missing(self):
        region = {
            "slug": "us-ports",
            "required_lead_port": "Miami",
            "rep_port": "Miami, Florida",
        }
        weather_data = {
            "summary": (
                "Current conditions: E 8kt, thunderstorms, 60% rain probability. "
                "3-day outlook: Day 1: E 10kt, thunderstorms, 60% rain probability."
            )
        }
        intel = "Today, Miami has partly cloudy skies. Tomorrow, E winds continue."
        repaired = MODULE._enforce_us_ports_today_pop(region, intel, weather_data)
        self.assertTrue(repaired.startswith("Today, Miami, Florida reports"))
        self.assertIn("60% rain probability", repaired.split(".", 1)[0])

    def test_pop_guard_does_not_change_non_us_briefings(self):
        region = {"slug": "bahamas-central-caribbean"}
        intel = "Today, Nassau has 10% rain probability."
        self.assertEqual(
            MODULE._enforce_us_ports_today_pop(region, intel, {"summary": ""}),
            intel,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
