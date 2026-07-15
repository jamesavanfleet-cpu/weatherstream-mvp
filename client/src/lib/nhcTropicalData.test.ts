import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  gtwoFeatureBasin,
  isNhcArtifactStale,
  isValidGtwoData,
  isValidNhcData,
  type GtwoFeature,
} from "./nhcTropicalData";

const polygonFeature = (
  basin: string,
  area: string,
  point: [number, number] | null,
): GtwoFeature => ({
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-80, 20],
      [-79, 20],
      [-79, 21],
      [-80, 20],
    ]],
  },
  properties: {
    name: `Disturbance ${area}`,
    basin,
    area,
    prob_2day: "10%",
    risk_2day: "Low",
    prob_2day_pct: 10,
    color_2day: "#FFFF00",
    prob_7day: "20%",
    risk_7day: "Low",
    prob_7day_pct: 20,
    color_7day: "#FFFF00",
    point,
  },
});

const gtwoPayload = (features: GtwoFeature[]) => ({
  type: "FeatureCollection",
  metadata: {
    generated_at: "2026-07-15T16:20:00Z",
    source: "NOAA National Hurricane Center",
    source_url: "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip",
    source_last_modified: "Wed, 15 Jul 2026 15:50:10 GMT",
    feature_count: features.length,
  },
  features,
});

describe("independent NHC payload validation", () => {
  it("accepts a storm-only payload without embedded GTWO data", () => {
    expect(isValidNhcData({ generated: "2026-07-15T16:20:00Z", storms: [] })).toBe(true);
  });

  it("rejects a standalone GTWO payload whose declared count is wrong", () => {
    const payload = gtwoPayload([polygonFeature("Atlantic", "1", [-75, 28])]);
    payload.metadata.feature_count = 2;
    expect(isValidGtwoData(payload)).toBe(false);
  });

  it("accepts official source provenance and a matching disturbance count", () => {
    const payload = gtwoPayload([
      polygonFeature("Atlantic", "1", [-75, 28]),
      polygonFeature("East Pacific", "2", [-120, 12]),
    ]);
    expect(isValidGtwoData(payload)).toBe(true);
  });
});

describe("GTWO basin classification", () => {
  it("classifies Atlantic, Eastern Pacific, and Central Pacific outlook areas", () => {
    expect(gtwoFeatureBasin(polygonFeature("Atlantic", "1", [-75, 28]))).toBe("al");
    expect(gtwoFeatureBasin(polygonFeature("Pacific", "2", [-125, 12]))).toBe("ep");
    expect(gtwoFeatureBasin(polygonFeature("Pacific", "3", [-155, 10]))).toBe("cp");
  });
});

describe("artifact freshness", () => {
  it("treats artifacts older than eight hours and invalid timestamps as stale", () => {
    const now = Date.parse("2026-07-15T16:00:00Z");
    expect(isNhcArtifactStale("2026-07-15T08:00:01Z", now)).toBe(false);
    expect(isNhcArtifactStale("2026-07-15T07:59:59Z", now)).toBe(true);
    expect(isNhcArtifactStale("not-a-time", now)).toBe(true);
  });
});

describe("Tropical page GTWO source ownership", () => {
  it("fetches the standalone artifact and never reads an embedded GTWO collection", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(pageSource).toContain("/nhc_gtwo.json");
    expect(pageSource).not.toMatch(/nhcData(?:\?|\.)?\.gtwoFeatures/);
    expect(pageSource).not.toMatch(/gtwoFeatures\s*\?\?/);
  });
});
