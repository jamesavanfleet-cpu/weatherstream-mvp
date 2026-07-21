#!/usr/bin/env python3
"""Focused structural regression checks for the briefing freshness workflow."""

from pathlib import Path


WORKFLOW = (
    Path(__file__).resolve().parents[1]
    / ".github"
    / "workflows"
    / "briefing-freshness.yml"
)


def require(text: str, needle: str) -> None:
    if needle not in text:
        raise AssertionError(f"Missing required workflow behavior: {needle!r}")


def main() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")

    # Both daylight-saving variants must run after the morning and afternoon cycles.
    for cron in ("15 9 * * *", "15 10 * * *", "0 21 * * *", "0 22 * * *"):
        require(text, f"cron: '{cron}'")

    # The active cron identity, rather than runner start time, selects the cycle.
    require(text, 'ACTIVE_AM_CRON')
    require(text, 'ACTIVE_PM_CRON')
    require(text, 'Inactive seasonal verification cron')

    # Both public artifacts must be fetched cache-free and validated by date.
    require(text, 'intel.json?ts={cache_buster}')
    require(text, 'top_story.json?ts={cache_buster}')
    require(text, "intel.get('generated') != expected_date")
    require(text, "story.get('date') != expected_date")

    # A valid briefing must also contain usable regional and headline content.
    require(text, "len(text.strip()) < 80")
    require(text, "for required_section in ('caribbean', 'mediterranean')")

    # A stale public artifact must fail visibly in GitHub Actions.
    require(text, 'PUBLIC BRIEFING FRESHNESS CHECK FAILED')
    require(text, 'sys.exit(1)')

    print('briefing freshness workflow regression checks passed')


if __name__ == '__main__':
    main()
