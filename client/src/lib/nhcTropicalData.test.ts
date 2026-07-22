import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  gtwoFeatureBasin,
  isNhcArtifactStale,
  isValidGtwoData,
  isValidNhcData,
  isValidNhcModelGuidanceData,
  nextNhcReleaseWindowRefreshAt,
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

describe("official model-guidance artifact validation", () => {
  const guidancePayload = () => ({
    generated: "2026-07-17T18:10:00Z",
    source: "NOAA National Hurricane Center ATCF public A-deck",
    activeStormSourceUrl: "https://www.nhc.noaa.gov/CurrentStorms.json",
    disclaimer: "Model guidance is not an official NHC forecast.",
    storms: [{
      id: "ep052026",
      name: "Elida",
      basin: "ep",
      sourceCycle: "2026071718",
      sourceUrl: "https://ftp.nhc.noaa.gov/atcf/aid_public/aep052026.dat.gz",
      models: [{
        id: "AVNI",
        label: "GFS",
        points: [
          { forecastHour: 0, lat: 15.2, lon: -108.4, windKt: 55, pressureMb: 996 },
          { forecastHour: 12, lat: 15.8, lon: -109.6, windKt: 60, pressureMb: 990 },
        ],
      }],
    }],
  });

  it("accepts a current official A-deck payload with usable track and intensity points", () => {
    expect(isValidNhcModelGuidanceData(guidancePayload())).toBe(true);
  });

  it("rejects nonofficial sources and non-increasing forecast hours", () => {
    const nonofficial = guidancePayload();
    nonofficial.source = "Copied third-party plot";
    expect(isValidNhcModelGuidanceData(nonofficial)).toBe(false);

    const outOfOrder = guidancePayload();
    outOfOrder.storms[0].models[0].points[1].forecastHour = 0;
    expect(isValidNhcModelGuidanceData(outOfOrder)).toBe(false);
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

describe("NHC release-window client refresh timing", () => {
  it("selects the next :06 or :14 UTC refresh after the four NHC release anchors", () => {
    expect(new Date(nextNhcReleaseWindowRefreshAt(Date.parse("2026-07-22T09:00:00Z"))).toISOString())
      .toBe("2026-07-22T09:06:00.000Z");
    expect(new Date(nextNhcReleaseWindowRefreshAt(Date.parse("2026-07-22T09:06:00Z"))).toISOString())
      .toBe("2026-07-22T09:14:00.000Z");
    expect(new Date(nextNhcReleaseWindowRefreshAt(Date.parse("2026-07-22T09:14:00Z"))).toISOString())
      .toBe("2026-07-22T15:06:00.000Z");
  });

  it("rolls safely across the UTC day boundary without a continuous minute loop", () => {
    expect(new Date(nextNhcReleaseWindowRefreshAt(Date.parse("2026-07-22T21:14:00Z"))).toISOString())
      .toBe("2026-07-23T03:06:00.000Z");
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

  it("defaults the visible outlook to 7-day and keeps its controls and legend explicit", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(pageSource).toContain('useState<OutlookMode>("7day")');
    expect(pageSource).toContain('data-outlook-control="TROPICAL_OUTLOOK_DEFAULT_7DAY_V1"');
    expect(pageSource).toContain('mode === "7day" ? "7-Day" : mode === "2day" ? "2-Day" : "Hide"');
    expect(pageSource).toContain('data-outlook-legend="NHC_GTWO_LEGEND_V1"');
  });

  it("keeps every disturbance-card risk badge synchronized with an explicit outlook period", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(pageSource).toContain('const displayMode = outlookMode === "off" ? "7day" : outlookMode;');
    expect(pageSource).toContain('{periodLabel} {risk || "LOW"}');
  });

  it("keeps plain wheel and trackpad input available for page scrolling while preserving click and pinch map zoom", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(pageSource).toContain('data-map-scroll-mode="MAP_SCROLL_CLICK_OR_PINCH_ZOOM_V1"');
    expect(pageSource).toContain("scrollWheelZoom={false}");
    expect(pageSource).toContain("touchZoom={true}");
    expect(pageSource).toContain("zoomControl={true}");
    expect(pageSource).not.toContain("WheelZoomGate");
    expect(pageSource).not.toContain("mcw_scroll_hint_dismissed");
  });

  it("uses a responsive mobile map height, preserves desktop height, and re-fits after layout", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(pageSource).toContain('data-map-mobile-height="MOBILE_MAP_HEIGHT_RESPONSIVE_V2"');
    expect(pageSource).toContain('height: isMobile ? "clamp(360px, 60dvh, 500px)" : "calc(100dvh - 100px)"');
    expect(pageSource).toContain("new ResizeObserver(scheduleFit)");
    expect(pageSource).toContain("map.fitBounds(bounds, {");
    expect(pageSource).toContain("padding: containerWidth < 768 ? [12, 12] : [20, 20]");
  });

  it("waits for committed payloads and prefers active storms when choosing the first basin", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(pageSource).toContain("const nhcReady = Boolean(nhcData) || Boolean(nhcDataError);");
    expect(pageSource).toContain("const gtwoReady = Boolean(gtwoData) || Boolean(gtwoError);");
    expect(pageSource).toContain("const selectedStormBasin = preferredBasins.find");
    expect(pageSource).toContain("const selectedDisturbanceBasin = preferredBasins.find");
    expect(pageSource).toContain("const selected = selectedStormBasin ?? selectedDisturbanceBasin;");
  });
});


describe("WeatherStream model-guidance interface", () => {
  it("loads only the validated current model artifact and permits a fresh verified invest without an advisory tracker record", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(pageSource).toContain("/nhc_model_guidance.json?ts=${Date.now()}");
    expect(pageSource).toContain("isValidNhcModelGuidanceData(candidate)");
    expect(pageSource).toContain('throw new Error("NHC model guidance is older than 8 hours and was withheld")');
    expect(pageSource).toContain('storm.systemType === "invest" || currentStormIds.has(storm.id)');
    expect(pageSource).toContain('data-model-guidance-no-current-system="WEATHERSTREAM_CURRENT_SYSTEM_GUIDANCE_V2"');
    expect(pageSource).toContain('<ModelGuidancePanel storm={storm} />');
    expect(pageSource).toContain("nextNhcReleaseWindowRefreshAt");
    expect(pageSource).toContain("scheduleReleaseWindowRefresh");
    expect(pageSource).toContain('document.visibilityState === "visible"');
  });

  it("renders official cone geometry plus geographic track and threshold-aware intensity guidance", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const componentSource = readFileSync(new URL("../components/ModelGuidancePanel.tsx", `file://${testDir}`), "utf8");
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(componentSource).toContain('data-model-guidance-track-plot="WEATHERSTREAM_OFFICIAL_ADECK_TRACK_GEOGRAPHY_V3"');
    expect(componentSource).toContain("const TRACK_MAP_INITIAL_HORIZON_HOURS = 96;");
    expect(componentSource).toContain('"SHOW FULL 7-DAY"');
    expect(componentSource).toContain('data-model-guidance-intensity-plot="WEATHERSTREAM_OFFICIAL_ADECK_INTENSITY_THRESHOLDS_V2"');
    expect(componentSource).toContain("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(componentSource).toContain("weight: 1.35");
    expect(componentSource).toContain("INTENSITY_THRESHOLDS");
    expect(componentSource).toContain("Tropical Depression &lt;34 kt");
    expect(componentSource).toContain("INTENSITY GUIDANCE: MAX SUSTAINED WIND");
    expect(componentSource).toContain("INVEST GUIDANCE ONLY: NO OFFICIAL NHC ADVISORY OR FORECAST CONE");
    expect(pageSource).toContain('data-nhc-five-day-cone-card="WEATHERSTREAM_OFFICIAL_NHC_CONE_CARDS_V2"');
    expect(pageSource).toContain("OfficialFiveDayConeMap storm={storm}");
    expect(pageSource).toContain('data-official-nhc-five-day-cone="WEATHERSTREAM_OFFICIAL_NHC_CONE_GEOMETRY_V2"');
    expect(pageSource).not.toContain("storm_graphics/${storm.id.toUpperCase()}");
    expect(pageSource).not.toContain("web.uwm.edu/hurricane-models/models");
    expect(pageSource).not.toContain("_5day_models.png");
  });
});

describe("stale-storm regression safeguards", () => {
  it("withholds stale storm artifacts before they can render as active storms", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const pageSource = readFileSync(new URL("../pages/TropicalAdvisories.tsx", `file://${testDir}`), "utf8");

    expect(pageSource).toContain("if (isNhcArtifactStale(candidate.generated))");
    expect(pageSource).toContain('throw new Error("NHC storm data is older than 8 hours and was withheld")');
    expect(pageSource).toContain("const activeNhcData = nhcDataStale ? null : nhcData;");
    expect(pageSource).toContain("activeNhcData && activeNhcData.storms");
    expect(pageSource).toContain("has been withheld to avoid showing an outdated storm");
  });

  it("preserves independently published NHC artifacts during ordinary site deployments", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const deploySource = readFileSync(
      new URL("../../../.github/workflows/deploy.yml", `file://${testDir}`),
      "utf8",
    );

    expect(deploySource).toContain("cp nhc_data.json /tmp/nhc_data-backup.json");
    expect(deploySource).toContain("cp nhc_gtwo.json /tmp/nhc_gtwo-backup.json");
    expect(deploySource).toContain("cp nhc_model_guidance.json /tmp/nhc_model_guidance-backup.json");
    expect(deploySource).toContain("cp nhc_release_status.json /tmp/nhc_release_status-backup.json");
    expect(deploySource).toContain("cp /tmp/nhc_data-backup.json nhc_data.json");
    expect(deploySource).toContain("cp /tmp/nhc_gtwo-backup.json nhc_gtwo.json");
    expect(deploySource).toContain("cp /tmp/nhc_model_guidance-backup.json nhc_model_guidance.json");
    expect(deploySource).toContain("cp /tmp/nhc_release_status-backup.json nhc_release_status.json");
  });

  it("keeps the narrow release-window source gate and short publish retry in the tracker workflow", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const workflowSource = readFileSync(
      new URL("../../../.github/workflows/nhc-tracker.yml", `file://${testDir}`),
      "utf8",
    );

    expect(workflowSource).toContain("target_release:");
    expect(workflowSource).toContain("scripts/check_nhc_release_ready.py");
    expect(workflowSource).toContain("steps.release_gate.outputs.state == 'ready'");
    expect(workflowSource).toContain("steps.release_gate.outputs.state == 'already_published'");
    expect(workflowSource).toContain("nhc_release_status.json");
    expect(workflowSource).toContain("for attempt in 1 2 3; do");
    expect(workflowSource).not.toContain("concurrency:");
  });
});
