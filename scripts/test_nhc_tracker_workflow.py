#!/usr/bin/env python3
"""Regression checks for independent NHC track and guidance publication."""

from pathlib import Path


WORKFLOW_PATH = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "nhc-tracker.yml"


def step_block(workflow: str, name: str, next_name: str | None = None) -> str:
    start_marker = f"      - name: {name}\n"
    start = workflow.index(start_marker)
    if next_name is None:
        return workflow[start:]
    end_marker = f"      - name: {next_name}\n"
    end = workflow.index(end_marker, start)
    return workflow[start:end]


def main() -> None:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    primary_generation = step_block(
        workflow,
        "Generate current official NHC storm data",
        "Publish current official NHC storm data to gh-pages",
    )
    primary_publication = step_block(
        workflow,
        "Publish current official NHC storm data to gh-pages",
        "Generate and publish validated NHC model guidance when available",
    )
    guidance_publication = step_block(
        workflow,
        "Generate and publish validated NHC model guidance when available",
    )

    if "python3 scripts/generate_nhc_data.py" not in primary_generation:
        raise AssertionError("Current official NHC storm data must still be generated first")

    for required in (
        "cp client/public/nhc_data.json /tmp/nhc_data.json",
        "cp /tmp/nhc_data.json nhc_data.json",
        "git add nhc_data.json",
        "NHC tracker update:",
    ):
        if required not in primary_publication:
            raise AssertionError(f"Primary storm data must publish independently: missing {required!r}")

    if "nhc_model_guidance.json" in primary_publication:
        raise AssertionError("Primary storm publication must not wait for model guidance")

    for required in (
        "if python3 scripts/generate_model_guidance.py; then",
        'if [ "$status" -eq 75 ]; then',
        "NHC model guidance is pending; preserving the published official storm data.",
        'exit "$status"',
        "git add nhc_model_guidance.json",
        "NHC model guidance update:",
    ):
        if required not in guidance_publication:
            raise AssertionError(f"Guidance fallback contract is incomplete: missing {required!r}")

    if "git add nhc_data.json nhc_model_guidance.json" in workflow:
        raise AssertionError("Legacy coupled artifact publication must be removed")

    print("nhc-tracker independent-publication regression checks passed")


if __name__ == "__main__":
    main()
