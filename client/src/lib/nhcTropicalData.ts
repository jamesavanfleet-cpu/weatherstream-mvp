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
