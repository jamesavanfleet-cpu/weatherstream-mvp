#!/usr/bin/env python3
"""Regression checks for the delayed-delivery handling in forecast-refresh.yml."""

from pathlib import Path


WORKFLOW_PATH = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "forecast-refresh.yml"


def schedule_branch(text: str) -> str:
    start = text.index('          if [ "$EVENT_NAME" = "schedule" ]; then')
    end = text.index('          else\n            echo "cycle=manual"', start)
    return text[start:end]


def main() -> None:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    branch = schedule_branch(workflow)

    # The active schedule expression must be the eligibility signal. GitHub can
    # deliver an otherwise valid scheduled run outside a nominal clock window.
    for cron_variable, cycle in (("ACTIVE_AM_CRON", "am"), ("ACTIVE_PM_CRON", "pm")):
        expected = (
            f'if [ "$SCHEDULE_EXPR" = "${cron_variable}" ]; then\n'
            f'              echo "cycle={cycle}" >> "$GITHUB_OUTPUT"\n'
            '              echo "should_run=true" >> "$GITHUB_OUTPUT"'
        )
        if expected not in branch:
            raise AssertionError(f"Active {cycle.upper()} scheduled runs must proceed regardless of late delivery")

    if '"$AM_WINDOW"' in branch or '"$PM_WINDOW"' in branch:
        raise AssertionError("Scheduled runs must not be rejected by a wall-clock window")

    inactive_guard = (
        "Inactive seasonal cron '${SCHEDULE_EXPR}' for current timezone ${ET_TZ} -- skipping."
    )
    if inactive_guard not in branch:
        raise AssertionError("Inactive seasonal schedules must remain blocked")

    manual_branch = workflow[workflow.index('          else\n            echo "cycle=manual"'):]
    if 'if [ "$AM_WINDOW" -eq 1 ] || [ "$PM_WINDOW" -eq 1 ]; then' not in manual_branch:
        raise AssertionError("Manual runs must retain the existing explicit timing guard")

    if 'Validate generated intel freshness' not in workflow:
        raise AssertionError("Generated briefing freshness validation must remain in the workflow")

    print("forecast-refresh delayed-delivery regression checks passed")


if __name__ == "__main__":
    main()
