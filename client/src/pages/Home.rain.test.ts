import { describe, expect, it } from "vitest";

import { briefingRainLabel } from "./Home";

describe("briefingRainLabel", () => {
  it("uses the first NWS-backed rain probability from the briefing", () => {
    expect(
      briefingRainLabel(
        "Today, Miami has 60% rain probability. Tomorrow has 70% rain probability.",
      ),
    ).toBe("60%");
  });

  it("preserves the canonical less-than-ten wording as a compact card label", () => {
    expect(
      briefingRainLabel("Today, Miami has less than 10% rain probability."),
    ).toBe("<10%");
  });

  it("rejects missing or invalid briefing rain values", () => {
    expect(briefingRainLabel(undefined)).toBeNull();
    expect(briefingRainLabel("Today, Miami has overcast skies.")).toBeNull();
    expect(briefingRainLabel("Today, Miami has 101% rain probability.")).toBeNull();
  });
});
