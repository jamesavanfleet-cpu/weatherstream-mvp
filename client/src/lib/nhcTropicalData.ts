export interface GtwoProperties {
  name: string;
  basin: string;
  area: string;
  prob_2day: string;
  risk_2day: string;
  prob_2day_pct: number | null;
  color_2day: string;
  prob_7day: string;
  risk_7day: string;
  prob_7day_pct: number | null;
  color_7day: string;
  point?: [number, number] | null;
}

export interface GtwoFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: GtwoProperties;
}

export interface GtwoData {
  type: "FeatureCollection";
  metadata: {
    generated_at: string;
    source: string;
    source_url: string;
    product_url?: string;
    source_last_modified?: string | null;
    source_etag?: string | null;
    feature_count?: number;
    note?: string;
  };
  features: GtwoFeature[];
}

export interface NhcTrackPoint {
  TAU: number;
  DATELBL: string;
  FLDATELBL: string;
  MAXWIND: number;
  MSLP: number | null;
  TCDIR: number | null;
  TCSPD: number | null;
  STORMTYPE: string;
  TCDVLP: string;
  lon: number;
  lat: number;
  [key: string]: unknown;
}

export interface NhcStormData {
  id: string;
  name: string;
  basin: string;
  classification: string;
  intensity: string | number | null;
  pressure: string | number | null;
  latitude: string | null;
  longitude: string | null;
  latitudeNumeric: number | null;
  longitudeNumeric: number | null;
  movementDir: number | null;
  movementSpeed: number | null;
  lastUpdate: string | null;
  publicAdvisory: Record<string, unknown> | null;
  forecastTrack: Record<string, unknown> | null;
  trackPoints: NhcTrackPoint[];
  coneCoords: [number, number][];
}

export interface NhcData {
  generated: string;
  storms: NhcStormData[];
}

export type BasinTab = "al" | "ep" | "cp";

function isValidGtwoFeature(value: unknown): value is GtwoFeature {
  if (!value || typeof value !== "object") return false;
  const feature = value as Partial<GtwoFeature>;
  const point = feature.properties?.point;

  return (
    feature.type === "Feature" &&
    Boolean(feature.geometry) &&
    Boolean(feature.properties) &&
    typeof feature.properties?.basin === "string" &&
    typeof feature.properties?.area === "string" &&
    (
      point == null ||
      (
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(Number.isFinite)
      )
    )
  );
}

export function isValidNhcData(value: unknown): value is NhcData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NhcData>;
  if (
    typeof candidate.generated !== "string" ||
    !Number.isFinite(Date.parse(candidate.generated)) ||
    !Array.isArray(candidate.storms)
  ) {
    return false;
  }

  return candidate.storms.every(storm =>
    Boolean(storm) &&
    typeof storm.id === "string" &&
    ["al", "ep", "cp"].includes(storm.basin) &&
    Array.isArray(storm.trackPoints) &&
    Array.isArray(storm.coneCoords)
  );
}

export function isValidGtwoData(value: unknown): value is GtwoData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GtwoData>;

  return (
    candidate.type === "FeatureCollection" &&
    Boolean(candidate.metadata) &&
    typeof candidate.metadata?.generated_at === "string" &&
    Number.isFinite(Date.parse(candidate.metadata.generated_at)) &&
    typeof candidate.metadata?.source === "string" &&
    typeof candidate.metadata?.source_url === "string" &&
    Array.isArray(candidate.features) &&
    candidate.features.every(isValidGtwoFeature) &&
    (candidate.metadata?.feature_count === undefined ||
      (Number.isInteger(candidate.metadata.feature_count) &&
        candidate.metadata.feature_count === candidate.features.length))
  );
}

export function gtwoFeatureBasin(feature: GtwoFeature): BasinTab | null {
  const basinLabel = (feature.properties.basin || "").toLowerCase();

  if (basinLabel.includes("atl")) return "al";
  if (basinLabel.includes("central")) return "cp";
  if (basinLabel.includes("east")) return "ep";
  if (!basinLabel.includes("pac")) return null;

  const officialPointLon = feature.properties.point?.[0];
  if (Number.isFinite(officialPointLon)) {
    return (officialPointLon as number) <= -140 ? "cp" : "ep";
  }

  let polygonLongitudes: number[] = [];
  if (feature.geometry.type === "Polygon") {
    polygonLongitudes = feature.geometry.coordinates
      .flatMap(ring => ring.map(([lon]) => lon))
      .filter(Number.isFinite);
  } else if (feature.geometry.type === "MultiPolygon") {
    polygonLongitudes = feature.geometry.coordinates
      .flatMap(polygon => polygon.flatMap(ring => ring.map(([lon]) => lon)))
      .filter(Number.isFinite);
  }

  if (polygonLongitudes.length === 0) return null;
  const representativeLon = (
    Math.min(...polygonLongitudes) + Math.max(...polygonLongitudes)
  ) / 2;
  return representativeLon <= -140 ? "cp" : "ep";
}

export const NHC_ARTIFACT_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function isNhcArtifactStale(
  generatedAt: string,
  nowMs = Date.now(),
  maxAgeMs = NHC_ARTIFACT_MAX_AGE_MS,
): boolean {
  const generatedMs = Date.parse(generatedAt);
  return !Number.isFinite(generatedMs) || nowMs - generatedMs > maxAgeMs;
}

export interface NhcModelGuidancePoint {
  forecastHour: number;
  lat: number;
  lon: number;
  windKt: number | null;
  pressureMb: number | null;
}

export interface NhcModelGuidanceModel {
  id: string;
  label: string;
  points: NhcModelGuidancePoint[];
}

export interface NhcModelGuidanceStorm {
  id: string;
  name: string;
  basin: BasinTab;
  sourceCycle?: string;
  sourceUrl: string;
  models: NhcModelGuidanceModel[];
  noDataReason?: string;
}

export interface NhcModelGuidanceData {
  generated: string;
  source: string;
  activeStormSourceUrl: string;
  disclaimer: string;
  storms: NhcModelGuidanceStorm[];
}

function isValidGuidancePoint(value: unknown): value is NhcModelGuidancePoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<NhcModelGuidancePoint>;
  const optionalIntensityIsValid = (candidate: unknown, minimum: number, maximum: number) =>
    candidate === null || (Number.isInteger(candidate) && (candidate as number) >= minimum && (candidate as number) <= maximum);

  return (
    Number.isInteger(point.forecastHour) && point.forecastHour! >= 0 && point.forecastHour! <= 168 &&
    typeof point.lat === "number" && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
    typeof point.lon === "number" && Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180 &&
    optionalIntensityIsValid(point.windKt, 1, 250) &&
    optionalIntensityIsValid(point.pressureMb, 800, 1100)
  );
}

function isValidGuidanceModel(value: unknown): value is NhcModelGuidanceModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<NhcModelGuidanceModel>;

  return (
    typeof model.id === "string" && /^[A-Z0-9]{3,4}$/.test(model.id) &&
    typeof model.label === "string" && model.label.length > 0 &&
    Array.isArray(model.points) && model.points.length >= 2 &&
    model.points.every(isValidGuidancePoint) &&
    model.points.every((point, index) => index === 0 || point.forecastHour > model.points![index - 1].forecastHour)
  );
}

export function isValidNhcModelGuidanceData(value: unknown): value is NhcModelGuidanceData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NhcModelGuidanceData>;

  return (
    typeof candidate.generated === "string" && Number.isFinite(Date.parse(candidate.generated)) &&
    candidate.source === "NOAA National Hurricane Center ATCF public A-deck" &&
    typeof candidate.activeStormSourceUrl === "string" &&
    typeof candidate.disclaimer === "string" && candidate.disclaimer.length > 0 &&
    Array.isArray(candidate.storms) &&
    candidate.storms.every(storm => {
      const ids = new Set<string>();
      return (
        Boolean(storm) &&
        typeof storm.id === "string" && /^[a-z]{2}\d{6}$/.test(storm.id) &&
        typeof storm.name === "string" && storm.name.length > 0 &&
        ["al", "ep", "cp"].includes(storm.basin) &&
        typeof storm.sourceUrl === "string" && storm.sourceUrl.startsWith("https://ftp.nhc.noaa.gov/atcf/aid_public/a") &&
        Array.isArray(storm.models) &&
        storm.models.every(model => {
          if (!isValidGuidanceModel(model) || ids.has(model.id)) return false;
          ids.add(model.id);
          return true;
        }) &&
        (storm.models.length > 0 || typeof storm.noDataReason === "string") &&
        (storm.models.length === 0 || (/^\d{10}$/.test(storm.sourceCycle ?? "")))
      );
    })
  );
}
