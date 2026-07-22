#!/usr/bin/env python3
"""Regression tests for the NHC narrow release-window source gate."""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_nhc_release_ready as gate  # noqa: E402

TARGET = datetime(2026, 7, 22, 9, 0, tzinfo=timezone.utc)
FRESH = "Wed, 22 Jul 2026 09:02:00 GMT"
STALE = "Wed, 22 Jul 2026 08:59:59 GMT"


class ReleaseWindowGateTests(unittest.TestCase):
    def headers(self, modified_by_url: dict[str, str | None]):
        def fetcher(url: str) -> dict[str, str | None]:
            return {"last_modified": modified_by_url.get(url), "etag": '"test-etag"'}

        return fetcher

    def current_storms(self, storm_ids: list[str]):
        return {"activeStorms": [{"id": storm_id} for storm_id in storm_ids]}

    def test_requires_exact_nominal_nhc_release_anchor(self) -> None:
        self.assertEqual(gate.release_anchor_text(gate.parse_release_anchor("2026-07-22T09:00:00Z")), "2026-07-22T09:00:00Z")
        with self.assertRaisesRegex(ValueError, "exactly"):
            gate.parse_release_anchor("2026-07-22T09:04:00Z")
        with self.assertRaisesRegex(ValueError, "exactly"):
            gate.parse_release_anchor("2026-07-22T06:00:00Z")

    def test_selects_prior_day_21z_before_the_first_daily_release(self) -> None:
        now = datetime(2026, 8, 1, 1, 30, tzinfo=timezone.utc)
        self.assertEqual(
            gate.release_anchor_text(gate.latest_release_anchor(now)),
            "2026-07-31T21:00:00Z",
        )

    def test_ready_only_when_all_current_sources_meet_target(self) -> None:
        ep_storm = "ep052026"
        response = gate.evaluate_release(
            TARGET,
            headers_fetcher=self.headers({
                gate.CURRENT_STORMS_URL: FRESH,
                gate.AID_PUBLIC_DIRECTORY_URL: FRESH,
                gate.AID_PUBLIC_URL_TEMPLATE.format(storm_id=ep_storm): FRESH,
            }),
            json_fetcher=lambda _url: self.current_storms([ep_storm]),
            status_fetcher=lambda _url: {},
            checked_at=datetime(2026, 7, 22, 9, 4, tzinfo=timezone.utc),
        )
        self.assertEqual(response["state"], "ready")
        self.assertEqual(response["activeStormIds"], [ep_storm])
        self.assertEqual(response["aDeckLastModified"][ep_storm], FRESH)

    def test_never_runs_when_the_current_storms_metadata_is_pre_release(self) -> None:
        response = gate.evaluate_release(
            TARGET,
            headers_fetcher=self.headers({gate.CURRENT_STORMS_URL: STALE}),
            json_fetcher=lambda _url: self.current_storms([]),
            status_fetcher=lambda _url: {},
        )
        self.assertEqual(response["state"], "not_ready")
        self.assertIn("CurrentStorms.json", response["reason"])

    def test_allows_an_empty_active_storm_list_when_directory_header_is_unavailable(self) -> None:
        response = gate.evaluate_release(
            TARGET,
            headers_fetcher=self.headers({
                gate.CURRENT_STORMS_URL: FRESH,
                gate.AID_PUBLIC_DIRECTORY_URL: None,
            }),
            json_fetcher=lambda _url: self.current_storms([]),
            status_fetcher=lambda _url: {},
        )
        self.assertEqual(response["state"], "ready")
        self.assertIsNone(response["publicAdeckDirectoryLastModified"])

    def test_never_runs_when_any_active_public_adeck_is_pre_release(self) -> None:
        al_storm = "al012026"
        response = gate.evaluate_release(
            TARGET,
            headers_fetcher=self.headers({
                gate.CURRENT_STORMS_URL: FRESH,
                gate.AID_PUBLIC_DIRECTORY_URL: None,
                gate.AID_PUBLIC_URL_TEMPLATE.format(storm_id=al_storm): STALE,
            }),
            json_fetcher=lambda _url: self.current_storms([al_storm]),
            status_fetcher=lambda _url: {},
        )
        self.assertEqual(response["state"], "not_ready")
        self.assertIn(al_storm, response["reason"])

    def test_already_published_short_circuits_external_source_work(self) -> None:
        calls: list[str] = []

        def headers_fetcher(url: str) -> dict[str, str | None]:
            calls.append(url)
            raise AssertionError("already-published state must not touch NHC sources")

        response = gate.evaluate_release(
            TARGET,
            headers_fetcher=headers_fetcher,
            json_fetcher=lambda _url: self.current_storms([]),
            status_fetcher=lambda _url: {"verifiedRelease": "2026-07-22T09:00:00Z"},
        )
        self.assertEqual(response["state"], "already_published")
        self.assertEqual(calls, [])

    def test_ignores_malformed_or_older_status_metadata(self) -> None:
        response = gate.evaluate_release(
            TARGET,
            headers_fetcher=self.headers({
                gate.CURRENT_STORMS_URL: FRESH,
                gate.AID_PUBLIC_DIRECTORY_URL: FRESH,
            }),
            json_fetcher=lambda _url: self.current_storms([]),
            status_fetcher=lambda _url: {"verifiedRelease": "not-a-release"},
        )
        self.assertEqual(response["state"], "ready")


if __name__ == "__main__":
    unittest.main(verbosity=2)
