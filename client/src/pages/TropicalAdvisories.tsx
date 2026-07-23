// TropicalAdvisories.tsx
// Full-screen Leaflet map for mycruisingweather.com showing:
//   - NWS marine advisories (watches, warnings, statements) for Atlantic, Caribbean, Gulf waters
//   - NHC tropical advisories (Tropical Storm Watch/Warning, Hurricane Watch/Warning, etc.)
//   - Toggleable overlay layers: Radar, Satellite, Zone Forecasts
//   - Advisory sidebar with live alert count, severity, and expandable alert cards
//
// Implementation notes:
//   1. Uses Leaflet + react-leaflet. Never replace with Google Maps (breaks on static deploy).
//   2. Alert fetch uses zone-based NWS API (?zone=...) -- NOT ?category=Marine (unsupported).
//   3. NHC tropical alerts come through the same api.weather.gov endpoint -- no separate API needed.
//      Events like "Hurricane Warning", "Tropical Storm Watch", "Hurricane Watch" are NWS/NHC products.
//   4. Radar uses RainViewer tile API (free, no key, animated).
//   5. One source of truth for alert data -- sidebar reads from same fetch as map zones.

import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  GeoJSON,
  useMap,
  Popup,
  Pane,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocation } from "wouter";
import { ModelGuidancePanel } from "../components/ModelGuidancePanel";
import {
  gtwoFeatureBasin,
  isNhcArtifactStale,
  isValidGtwoData,
  isValidNhcData,
  isValidNhcModelGuidanceData,
  validatedEmbeddedModelGuidance,
  type BasinTab,
  type GtwoData,
  type GtwoFeature,
  type GtwoProperties,
  type NhcData,
  type NhcModelGuidanceData,
  type NhcStormData,
  type NhcTrackPoint,
} from "../lib/nhcTropicalData";

// Fix Leaflet default marker icon paths broken by bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface NWSAlert {
  id: string;
  event: string;
  headline: string;
  description: string;
  areaDesc: string;
  effective: string;
  expires: string;
  severity: string;
  zones: string[];
  geometry: GeoJSON.Geometry | null;
}

// ── NHC types ────────────────────────────────────────────────────────────────
interface NHCStorm {
  id: string;          // e.g. "al012026"
  name: string;        // e.g. "HURRICANE BERYL"
  basin: string;       // "al" | "ep" | "cp"
  classification: string; // "TD" | "TS" | "HU" | "MH" | "PTC" | "DB"
  lat: number;
  lon: number;
  maxWindMph: number;
  movement: string;
  pressure: number;
  headline: string;
  advisoryTime: string;
  advisoryNumber: string;
}

type OutlookMode = "off" | "2day" | "7day";

// The guidance publisher checks each current public A-deck cycle in bounded
// five-minute increments. An open page refreshes its two guidance artifacts
// every minute so a verified publish becomes visible promptly.
const MODEL_GUIDANCE_REFRESH_MS = 60_000;

// CORS proxy for NHC endpoints that lack Access-Control-Allow-Origin
const ALLORIGINS = (url: string) =>
  `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

// ── Color helpers ─────────────────────────────────────────────────────────────
function alertColor(severity: string): string {
  switch (severity) {
    case "Extreme":  return "#FF0000";
    case "Severe":   return "#FF4500";
    case "Moderate": return "#FF8C00";
    case "Minor":    return "#FFD700";
    default:         return "#00D4FF";
  }
}

function eventColor(event: string): string {
  const e = event.toLowerCase();
  // Official NHC/NWS standard color palette
  if (e.includes("hurricane warning"))       return "#FF0000"; // Red
  if (e.includes("hurricane watch"))         return "#FF69B4"; // Pink
  if (e.includes("tropical storm warning"))  return "#4169E1"; // Blue (official NHC)
  if (e.includes("tropical storm watch"))    return "#FFD700"; // Yellow (official NHC)
  if (e.includes("tropical depression"))     return "#FFD700"; // Yellow
  if (e.includes("storm surge warning"))     return "#00CED1"; // Bright Teal/Green (official NHC)
  if (e.includes("storm surge watch"))       return "#66CDAA"; // Medium Aquamarine
  if (e.includes("extreme wind warning"))    return "#FF8C00"; // Dark Orange
  if (e.includes("warning"))                 return "#FF3C3C"; // Red-orange (NWS marine warning)
  if (e.includes("watch"))                   return "#FF8C00"; // Orange (NWS watch)
  if (e.includes("advisory"))                return "#FFD700"; // Yellow (NWS advisory)
  return "#00D4FF"; // Cyan (statement/other)
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `expires in ${h}h ${m}m`;
  return `expires in ${m}m`;
}

// ── Zone IDs: Atlantic, Caribbean, Gulf of Mexico, and NHC tropical zones ─────
// Covers all waters relevant to Caribbean and Atlantic cruise itineraries.
// NHC tropical alerts (Hurricane Warning, Tropical Storm Watch, etc.) are issued
// against these same zone IDs -- no separate endpoint needed.
const ZONE_IDS = [
  // Atlantic offshore -- Caribbean cruise waters
  "AMZ610","AMZ620","AMZ630","AMZ640","AMZ650","AMZ670",
  "AMZ710","AMZ715","AMZ720","AMZ725","AMZ730","AMZ735",
  "AMZ750","AMZ752","AMZ753","AMZ755","AMZ770","AMZ772",
  "AMZ800","AMZ810","AMZ820","AMZ830",
  // Gulf of Mexico
  "GMZ001","GMZ020","GMZ030","GMZ040","GMZ050","GMZ055",
  "GMZ070","GMZ075","GMZ080","GMZ085","GMZ110","GMZ115",
  "GMZ120","GMZ125","GMZ150","GMZ155","GMZ170","GMZ175",
  "GMZ200","GMZ210","GMZ220","GMZ230","GMZ250","GMZ255",
  "GMZ270","GMZ275","GMZ300","GMZ305","GMZ310","GMZ315",
  "GMZ320","GMZ325","GMZ330","GMZ335","GMZ340","GMZ345",
  "GMZ350","GMZ355","GMZ400","GMZ410","GMZ420","GMZ430",
  "GMZ432","GMZ450","GMZ452","GMZ455","GMZ470","GMZ472",
  "GMZ475","GMZ500","GMZ505","GMZ510","GMZ515","GMZ530",
  "GMZ535","GMZ550","GMZ555","GMZ570","GMZ575","GMZ600",
  "GMZ610","GMZ620","GMZ630","GMZ645","GMZ650","GMZ655",
  "GMZ670","GMZ675","GMZ700","GMZ710","GMZ720","GMZ730",
  "GMZ750","GMZ755","GMZ770","GMZ775","GMZ800","GMZ810",
  "GMZ820","GMZ825","GMZ830","GMZ831","GMZ832","GMZ833",
  "GMZ834","GMZ835",
  // Florida coastal
  "FLZ069","FLZ070","FLZ071","FLZ072","FLZ073","FLZ074",
  "FLZ075","FLZ076","FLZ077","FLZ078","FLZ079","FLZ080",
].join(",");

// ── Map size invalidator -- forces Leaflet to recalculate canvas after layout changes ──
function MapInvalidator({ trigger }: { trigger: boolean }) {
  const map = useMap();
  useEffect(() => {
    // Small delay lets the DOM reflow complete before Leaflet measures
    const t = setTimeout(() => { map.invalidateSize(); }, 80);
    return () => clearTimeout(t);
  }, [trigger, map]);
  return null;
}

// ── Animated satellite layer (NASA GIBS NRT pre-tiled WMTS approach) ──────────
// SATELLITE_GIBS_MARKER
//
// NASA GIBS satellite-frame integrity policy:
// 1. The newest frame stays invisible until every required tile has loaded.
// 2. Older frames preload one at a time in the background.
// 3. Animation starts only after every candidate is either complete or skipped.
// 4. A failed frame is retried once, then skipped instead of exposing a partial grid.
// 5. GIBS Level 6 is the source's native ceiling. Above it Leaflet scales the
//    last valid level rather than requesting unsupported imagery tiles.
interface SatelliteLayerProps {
  enabled: boolean;
  isPlaying: boolean;
  frameIdx: number;
  onFrameChange: (idx: number, total: number, timestamp: string) => void;
}

type SatelliteFrameState = "pending" | "ready" | "bad";

type SatelliteSource = {
  layer: string;
  intervalMin: number;
  maxFrames: number;
  bounds?: L.LatLngBoundsExpression;
};

const SATELLITE_OPACITY = 0.76;
const GIBS_MAX_NATIVE_ZOOM = 6;
const MAX_FRAME_RETRIES = 1;
const FRAME_TIMEOUT_MS = 15_000;

function SatelliteLayer({ enabled, isPlaying, frameIdx, onFrameChange }: SatelliteLayerProps) {
  const map = useMap();
  const tileLayersRef = useRef<L.TileLayer[]>([]);
  const idxRef = useRef(0);
  const visibleFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timestampsRef = useRef<string[]>([]);
  const enabledRef = useRef(enabled);
  const isPlayingRef = useRef(isPlaying);
  const onFrameChangeRef = useRef(onFrameChange);
  const moveListenerRef = useRef<(() => void) | null>(null);
  const currentLayerRef = useRef<string>("");
  const generationRef = useRef(0);
  const queueRef = useRef<number[]>([]);
  const frameStateRef = useRef<SatelliteFrameState[]>([]);
  const frameErrorRef = useRef<boolean[]>([]);
  const frameAttemptRef = useRef<number[]>([]);
  const frameTimeoutRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playbackEligibleRef = useRef(false);

  onFrameChangeRef.current = onFrameChange;

  const GOES_EAST_BOUNDS: L.LatLngBoundsExpression = [[12.0, -179.5], [50.6, -52.0]];
  const GOES_WEST_BOUNDS: L.LatLngBoundsExpression = [[10.0, -179.5], [60.0, -100.0]];

  const gibsUrl = (layer: string, time: string) =>
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + layer + "/default/" + time + "/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png";

  const getActiveSource = (bounds: L.LatLngBounds): SatelliteSource => {
    const center = bounds.getCenter();
    if (center.lng >= -179.5 && center.lng <= -100.0 && center.lat >= 10.0 && center.lat <= 60.0) {
      return {
        layer: "GOES-West_ABI_Band13_Clean_Infrared",
        intervalMin: 10,
        maxFrames: 12,
        bounds: GOES_WEST_BOUNDS,
      };
    }
    if (center.lng >= -179.5 && center.lng <= -52.0 && center.lat >= 12.0 && center.lat <= 50.6) {
      return {
        layer: "GOES-East_ABI_Band13_Clean_Infrared",
        intervalMin: 10,
        maxFrames: 12,
        bounds: GOES_EAST_BOUNDS,
      };
    }
    return {
      layer: "Himawari_AHI_Band13_Clean_Infrared",
      intervalMin: 10,
      maxFrames: 12,
    };
  };

  const buildTimestamps = (count: number, intervalMin: number): string[] => {
    const now = new Date();
    const intervalMs = intervalMin * 60 * 1000;
    const latest = new Date(Math.floor(now.getTime() / intervalMs) * intervalMs - 2 * intervalMs);
    const stamps: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const t = new Date(latest.getTime() - i * intervalMs);
      const yyyy = t.getUTCFullYear();
      const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(t.getUTCDate()).padStart(2, "0");
      const hh = String(t.getUTCHours()).padStart(2, "0");
      const min = String(t.getUTCMinutes()).padStart(2, "0");
      stamps.push(yyyy + "-" + mm + "-" + dd + "T" + hh + ":" + min + ":00Z");
    }
    return stamps;
  };

  const stopPlayback = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearSatelliteTimers = useCallback(() => {
    frameTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
    frameTimeoutRef.current.clear();
    retryTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
    retryTimeoutRef.current = [];
  }, []);

  const readyIndices = useCallback(() =>
    frameStateRef.current.map((state, index) => state === "ready" ? index : -1).filter(index => index >= 0), []);

  const showFrame = useCallback((requestedIndex: number) => {
    const layers = tileLayersRef.current;
    const ready = readyIndices();
    if (layers.length === 0 || ready.length === 0) {
      layers.forEach(layer => layer.setOpacity(0));
      return;
    }

    const clamped = Math.max(0, Math.min(requestedIndex, layers.length - 1));
    const target = ready.includes(clamped)
      ? clamped
      : (ready.find(index => index >= clamped) ?? ready[0]);

    layers.forEach((layer, index) => layer.setOpacity(index === target ? SATELLITE_OPACITY : 0));
    visibleFrameRef.current = target;
    idxRef.current = target;
    onFrameChangeRef.current(ready.indexOf(target), ready.length, timestampsRef.current[target] ?? "");
  }, [readyIndices]);

  const startPlayback = useCallback(() => {
    stopPlayback();
    if (!enabledRef.current || !isPlayingRef.current || !playbackEligibleRef.current || readyIndices().length < 2) return;
    timerRef.current = setInterval(() => {
      const layers = tileLayersRef.current;
      if (layers.length > 0) showFrame((idxRef.current + 1) % layers.length);
    }, 900);
  }, [readyIndices, showFrame, stopPlayback]);

  const removeTileLayers = useCallback(() => {
    tileLayersRef.current.forEach(layer => {
      try { map.removeLayer(layer); } catch { /* Map may already be disposed. */ }
    });
    tileLayersRef.current = [];
    queueRef.current = [];
    frameStateRef.current = [];
    visibleFrameRef.current = null;
    playbackEligibleRef.current = false;
  }, [map]);

  const teardown = useCallback(() => {
    generationRef.current += 1;
    stopPlayback();
    clearSatelliteTimers();
    removeTileLayers();
    if (moveListenerRef.current) {
      map.off("moveend", moveListenerRef.current);
      map.off("zoomend", moveListenerRef.current);
      moveListenerRef.current = null;
    }
  }, [clearSatelliteTimers, map, removeTileLayers, stopPlayback]);

  const loadFrames = useCallback((source: SatelliteSource, timestamps: string[]) => {
    generationRef.current += 1;
    const generation = generationRef.current;
    stopPlayback();
    clearSatelliteTimers();
    removeTileLayers();
    if (timestamps.length === 0) return;

    timestampsRef.current = timestamps;
    frameStateRef.current = timestamps.map(() => "pending" as SatelliteFrameState);
    frameErrorRef.current = timestamps.map(() => false);
    frameAttemptRef.current = timestamps.map(() => 0);
    playbackEligibleRef.current = false;
    visibleFrameRef.current = null;

    const layers = timestamps.map(time => L.tileLayer(gibsUrl(source.layer, time), {
      opacity: 0,
      attribution: "NASA GIBS",
      tileSize: 256,
      maxNativeZoom: GIBS_MAX_NATIVE_ZOOM,
      maxZoom: 19,
      bounds: source.bounds,
      updateWhenIdle: true,
      keepBuffer: 1,
    }));

    tileLayersRef.current = layers;
    queueRef.current = layers.map((_, index) => index).reverse();

    let loadNextFrame = () => undefined;

    const armFrameTimeout = (index: number) => {
      const previous = frameTimeoutRef.current.get(index);
      if (previous) clearTimeout(previous);
      const timeout = setTimeout(() => {
        if (generation !== generationRef.current || frameStateRef.current[index] !== "pending") return;
        settleFrame(index, "bad");
      }, FRAME_TIMEOUT_MS);
      frameTimeoutRef.current.set(index, timeout);
    };

    const settleFrame = (index: number, state: SatelliteFrameState) => {
      if (generation !== generationRef.current || frameStateRef.current[index] !== "pending") return;
      frameStateRef.current[index] = state;
      const timeout = frameTimeoutRef.current.get(index);
      if (timeout) clearTimeout(timeout);
      frameTimeoutRef.current.delete(index);

      const newestReady = readyIndices().at(-1);
      if (visibleFrameRef.current === null && newestReady !== undefined) showFrame(newestReady);

      loadNextFrame();
      const allSettled = frameStateRef.current.every(frameState => frameState !== "pending");
      if (allSettled) {
        playbackEligibleRef.current = true;
        if (visibleFrameRef.current === null && newestReady !== undefined) showFrame(newestReady);
        startPlayback();
      }
    };

    layers.forEach((tileLayer, index) => {
      tileLayer.on("tileerror", () => {
        if (generation === generationRef.current && frameStateRef.current[index] === "pending") {
          frameErrorRef.current[index] = true;
        }
      });

      tileLayer.on("load", () => {
        if (generation !== generationRef.current || frameStateRef.current[index] !== "pending") return;
        if (!frameErrorRef.current[index]) {
          settleFrame(index, "ready");
          return;
        }
        if (frameAttemptRef.current[index] < MAX_FRAME_RETRIES) {
          frameAttemptRef.current[index] += 1;
          frameErrorRef.current[index] = false;
          const retry = setTimeout(() => {
            if (generation !== generationRef.current || frameStateRef.current[index] !== "pending") return;
            armFrameTimeout(index);
            tileLayer.redraw();
          }, 1250 * frameAttemptRef.current[index]);
          retryTimeoutRef.current.push(retry);
          return;
        }
        settleFrame(index, "bad");
      });
    });

    loadNextFrame = () => {
      if (generation !== generationRef.current) return;
      const nextIndex = queueRef.current.shift();
      if (nextIndex === undefined) return;
      const nextLayer = layers[nextIndex];
      armFrameTimeout(nextIndex);
      nextLayer.addTo(map);
    };

    loadNextFrame();
  }, [clearSatelliteTimers, map, readyIndices, removeTileLayers, showFrame, startPlayback, stopPlayback]);

  useEffect(() => {
    if (!enabled) {
      teardown();
      enabledRef.current = false;
      return;
    }

    enabledRef.current = true;
    const initialize = () => {
      const source = getActiveSource(map.getBounds());
      if (source.layer !== currentLayerRef.current || tileLayersRef.current.length === 0) {
        currentLayerRef.current = source.layer;
        loadFrames(source, buildTimestamps(source.maxFrames, source.intervalMin));
      }
    };

    initialize();
    if (moveListenerRef.current) {
      map.off("moveend", moveListenerRef.current);
      map.off("zoomend", moveListenerRef.current);
    }
    const onMove = () => { if (enabledRef.current) initialize(); };
    moveListenerRef.current = onMove;
    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    return () => teardown();
  }, [enabled, loadFrames, map, teardown]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!enabled) return;
    if (isPlaying) startPlayback();
    else stopPlayback();
  }, [enabled, isPlaying, startPlayback, stopPlayback]);

  useEffect(() => {
    if (!enabled || readyIndices().length === 0) return;
    showFrame(frameIdx);
  }, [enabled, frameIdx, readyIndices, showFrame]);

  return null;
}

function SatelliteGeographyReference({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <Pane name="satelliteGeographyReferencePane" style={{ zIndex: 350, pointerEvents: "none" }}>
      <TileLayer
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        attribution=""
        maxZoom={19}
        opacity={0.96}
      />
    </Pane>
  );
}

// ── Alert zone GeoJSON overlay ────────────────────────────────────────────────
function AlertZonesLayer({
  alerts,
  highlightedId,
  onAlertClick,
}: {
  alerts: NWSAlert[];
  highlightedId: string | null;
  onAlertClick: (id: string) => void;
}) {
  return (
    <>
      {alerts
        .filter(a => a.geometry)
        .map(alert => {
          const color = eventColor(alert.event);
          const hl = highlightedId === alert.id;
          return (
            <GeoJSON
              key={alert.id + (hl ? "-hl" : "")}
              data={alert.geometry as GeoJSON.GeoJsonObject}
              style={() => ({
                color,
                weight: hl ? 3 : 1.5,
                fillColor: color,
                fillOpacity: hl ? 0.35 : 0.15,
                opacity: 0.9,
              })}
              eventHandlers={{ click: () => onAlertClick(alert.id) }}
            >
              <Popup>
                <div style={{ fontFamily: "monospace", fontSize: 12, maxWidth: 240 }}>
                  <div style={{ fontWeight: 700, color, marginBottom: 4 }}>
                    {alert.event.toUpperCase()}
                  </div>
                  <div style={{ marginBottom: 4 }}>{alert.headline || alert.event}</div>
                  <div style={{ color: "#666", fontSize: 11 }}>
                    {alert.areaDesc.slice(0, 120)}
                  </div>
                </div>
              </Popup>
            </GeoJSON>
          );
        })}
    </>
  );
}

// ── Layer toggle button ───────────────────────────────────────────────────────
function LayerBtn({
  label,
  active,
  color = "#00D4FF",
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  const rgb = color === "#FF8C00" ? "255,140,0"
    : color === "#39FF14" ? "57,255,20"
    : color === "#FF3C3C" ? "255,60,60"
    : "0,212,255";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        minHeight: 36,
        padding: "6px 8px",
        border: `1px solid ${active ? color : "#1A2D42"}`,
        background: active ? `rgba(${rgb},0.12)` : "rgba(13,21,32,0.85)",
        color: active ? color : "#7B9BB5",
        cursor: "pointer",
        fontSize: "0.78rem",
        letterSpacing: "0.06em",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        whiteSpace: "nowrap",
        transition: "all 0.15s",
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: active ? color : "#1A2D42",
        flexShrink: 0,
        boxShadow: active ? `0 0 5px ${color}` : "none",
      }} />
      {label}
      <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>{active ? "ON" : "OFF"}</span>
    </button>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────
function AlertCard({
  alert,
  highlighted,
  onHighlight,
}: {
  alert: NWSAlert;
  highlighted: boolean;
  onHighlight: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = eventColor(alert.event);
  return (
    <div
      style={{
        border: `1px solid ${highlighted ? color : "#1A2D42"}`,
        background: highlighted ? "rgba(0,0,0,0.55)" : "rgba(13,21,32,0.8)",
        marginBottom: 6,
        boxShadow: highlighted ? `0 0 12px ${color}40` : "none",
        transition: "all 0.2s",
      }}
    >
      <button
        style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 10, padding: 10, background: "none", border: "none", textAlign: "left", cursor: "pointer" }}
        onClick={() => { setExpanded(e => !e); onHighlight(); }}
      >
        <div style={{ width: 3, background: color, alignSelf: "stretch", minHeight: 40, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: "1.05rem", fontWeight: 700, color, letterSpacing: "0.08em", fontFamily: "inherit" }}>
              {alert.event.toUpperCase()}
            </span>
            <span style={{ fontSize: "0.85rem", color, border: `1px solid ${color}`, padding: "0 5px", opacity: 0.8 }}>
              {alert.severity.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: "1rem", color: "#E8F4FF", lineHeight: 1.4, marginBottom: 3 }}>
            {alert.headline || alert.event}
          </div>
          <div style={{ fontSize: "0.9rem", color: "#7B9BB5" }}>
            {alert.areaDesc.slice(0, 80)}{alert.areaDesc.length > 80 ? "..." : ""}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: "0.85rem", color: "#7B9BB5" }}>{timeAgo(alert.effective)}</span>
            <span style={{ fontSize: "0.85rem", color: new Date(alert.expires).getTime() - Date.now() < 3_600_000 ? "#FF8C00" : "#7B9BB5" }}>
              {timeUntil(alert.expires)}
            </span>
          </div>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ flexShrink: 0, marginTop: 4, transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          <path d="M2 4l4 4 4-4" stroke="#7B9BB5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && (
        <div style={{ padding: "0 10px 10px 23px", borderTop: "1px solid #1A2D42" }}>
          <p style={{ fontSize: "0.95rem", color: "#B0C8E0", lineHeight: 1.6, marginTop: 8, whiteSpace: "pre-wrap" }}>
            {alert.description.slice(0, 600)}{alert.description.length > 600 ? "..." : ""}
          </p>
          {alert.zones.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
              {alert.zones.slice(0, 8).map(z => (
                <span key={z} style={{ fontSize: "0.85rem", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.3)", background: "rgba(0,212,255,0.05)", padding: "2px 8px" }}>
                  {z}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── NHC storm classification helpers ────────────────────────────────────────
function stormSymbol(cls: string): string {
  // Returns a single character matching NHC track point convention
  switch (cls.toUpperCase()) {
    case "TD": case "DB": case "LO": return "D";
    case "TS": return "S";
    case "HU": return "H";
    case "MH": return "M";
    case "PTC": case "EX": case "SD": case "SS": return "P";
    default: return "X";
  }
}

function stormSymbolColor(cls: string): string {
  switch (cls.toUpperCase()) {
    case "TD": case "DB": case "LO": return "#FFD700";  // Yellow -- Depression
    case "TS":                        return "#4169E1";  // Blue -- Tropical Storm
    case "HU":                        return "#FF0000";  // Red -- Hurricane
    case "MH":                        return "#8B0000";  // Dark Red -- Major Hurricane
    case "PTC": case "EX":            return "#7B9BB5";  // Gray -- Post-tropical
    default:                          return "#00D4FF";
  }
}

// ── NHC storm fetch ───────────────────────────────────────────────────────────
async function fetchNHCStorms(): Promise<NHCStorm[]> {
  try {
    const res = await fetch(
      ALLORIGINS("https://www.nhc.noaa.gov/CurrentStorms.json"),
      { headers: { "User-Agent": "MyCruisingWeather/1.0" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const active: NHCStorm[] = [];
    for (const s of (data.activeStorms ?? [])) {
      // Each storm has id, name, classification, lat, lon, maxWindMph, movement, pressure
      active.push({
        id: s.id ?? "",
        name: s.name ?? "UNNAMED",
        basin: (s.id ?? "").slice(0, 2).toLowerCase(),
        classification: s.classification ?? "TD",
        lat: parseFloat(s.latitudeNumeric ?? s.lat ?? 0),
        lon: parseFloat(s.longitudeNumeric ?? s.lon ?? 0),
        maxWindMph: parseInt(s.maxWindMph ?? s.maxWindSpeed ?? 0, 10),
        movement: s.movementDesc ?? s.movement ?? "",
        pressure: parseInt(s.minPressureMb ?? s.pressure ?? 0, 10),
        headline: s.headline ?? s.name ?? "",
        advisoryTime: s.advisoryDate ?? s.advisoryTime ?? "",
        advisoryNumber: s.advisoryNumber ?? "",
      });
    }
    return active;
  } catch {
    return [];
  }
}

// ── NHC GTWO disturbance ellipse layer ───────────────────────────────────────
function GtwoLayer({
  features,
  mode,
}: {
  features: GtwoFeature[];
  mode: OutlookMode;
}) {
  if (mode === "off" || features.length === 0) return null;

  // The polygon is the NHC formation area. Its marker must use only the
  // separately issued official NHC point, never a computed polygon centroid.
  // A null point is intentional and means the area is rendered without a marker.
  const officialPointFeatures: GeoJSON.Feature<GeoJSON.Point, GtwoProperties>[] = features.flatMap(feature => {
    const point = feature.properties.point;
    if (
      !Array.isArray(point) || point.length !== 2 ||
      !Number.isFinite(point[0]) || !Number.isFinite(point[1])
    ) return [];

    return [{
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: point },
      properties: feature.properties,
    }];
  });

  return (
    <>
      {features.map((feature, idx) => {
        const p = feature.properties;
        const color = mode === "2day" ? p.color_2day : p.color_7day;
        const prob = mode === "2day" ? p.prob_2day : p.prob_7day;
        const risk = mode === "2day" ? p.risk_2day : p.risk_7day;
        const probPct = mode === "2day" ? p.prob_2day_pct : p.prob_7day_pct;

        const tooltipHtml = `<div style="font-family:monospace;font-size:13px;line-height:1.6;padding:6px 10px;background:#0D1520;border:1px solid ${color};color:#E8F4FF;min-width:200px;max-width:280px">
  <div style="font-weight:700;color:${color};font-size:14px;margin-bottom:4px">${p.name}</div>
  <div style="margin-bottom:2px">Basin: ${p.basin}</div>
  <div style="margin-bottom:2px">${mode === "2day" ? "2-Day" : "7-Day"} Formation Chance: <span style="color:${color};font-weight:700">${prob || "N/A"}</span></div>
  ${risk ? `<div style="margin-bottom:2px">Risk Level: <span style="color:${color};font-weight:700">${risk}</span></div>` : ""}
  ${probPct !== null && probPct !== undefined ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #1A2D42;font-size:11px;color:#7B9BB5">${probPct > 60 ? "High" : probPct >= 40 ? "Medium" : "Low"} probability of tropical cyclone formation</div>` : ""}
</div>`;

        return (
          <GeoJSON
            key={`gtwo-${idx}-${mode}`}
            data={feature as unknown as GeoJSON.GeoJsonObject}
            style={() => ({
              color,
              weight: 2,
              fillColor: color,
              fillOpacity: 0.25,
              opacity: 0.85,
            })}
            onEachFeature={(_feat, layer) => {
              layer.bindTooltip(tooltipHtml, {
                sticky: true,
                opacity: 1,
                direction: "top",
              });
            }}
          />
        );
      })}

      {/* Official NHC disturbance points. Areas with point: null intentionally have no marker. */}
      {officialPointFeatures.length > 0 && (
        <GeoJSON
          key={`gtwo-official-points-${mode}-${officialPointFeatures.length}`}
          data={{ type: "FeatureCollection", features: officialPointFeatures } as GeoJSON.GeoJsonObject}
          pointToLayer={(feature, latlng) => {
            const p = feature.properties as GtwoProperties;
            const color = mode === "2day" ? p.color_2day : p.color_7day;
            const icon = L.divIcon({
              className: "",
              iconSize: [28, 28],
              iconAnchor: [14, 14],
              html: `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M6 6L22 22M22 6L6 22" stroke="#000" stroke-width="7" stroke-linecap="round"/>
  <path d="M6 6L22 22M22 6L6 22" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
</svg>`,
            });
            return L.marker(latlng, { icon, zIndexOffset: 550 });
          }}
          onEachFeature={(feature, layer) => {
            const p = feature.properties as GtwoProperties;
            const color = mode === "2day" ? p.color_2day : p.color_7day;
            const prob = mode === "2day" ? p.prob_2day : p.prob_7day;
            const risk = mode === "2day" ? p.risk_2day : p.risk_7day;
            layer.bindTooltip(
              `<div style="font-family:monospace;font-size:13px;line-height:1.6;padding:6px 10px;background:#0D1520;border:1px solid ${color};color:#E8F4FF;min-width:200px;max-width:280px">
  <div style="font-weight:700;color:${color};font-size:14px;margin-bottom:4px">${p.name}</div>
  <div style="margin-bottom:2px">Official NHC disturbance location</div>
  <div style="margin-bottom:2px">${mode === "2day" ? "2-Day" : "7-Day"} Formation Chance: <span style="color:${color};font-weight:700">${prob || "N/A"}</span></div>
  ${risk ? `<div>Risk Level: <span style="color:${color};font-weight:700">${risk}</span></div>` : ""}
</div>`,
              { opacity: 1, direction: "top", offset: [0, -16] }
            );
          }}
        />
      )}
    </>
  );
}

// ── Storm track markers on the Leaflet map ────────────────────────────────────
function StormMarkersLayer({ storms }: { storms: NHCStorm[] }) {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    // Remove old markers
    markersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* ignore */ } });
    markersRef.current = [];

    storms.forEach(storm => {
      if (!storm.lat || !storm.lon) return;
      const sym = stormSymbol(storm.classification);
      const col = stormSymbolColor(storm.classification);
      // Build an SVG div icon matching NHC track point style
      const svgIcon = L.divIcon({
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        html: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="13" fill="${col}" fill-opacity="0.85" stroke="#000" stroke-width="1.5"/>
  <text x="16" y="21" text-anchor="middle" font-family="monospace" font-size="13" font-weight="700" fill="#000">${sym}</text>
</svg>`,
      });
      const marker = L.marker([storm.lat, storm.lon], { icon: svgIcon, zIndexOffset: 500 });
      const windKt = Math.round(storm.maxWindMph * 0.868976);
      marker.bindTooltip(
        `<div style="font-family:monospace;font-size:13px;line-height:1.5;padding:4px 8px;background:#0D1520;border:1px solid ${col};color:#E8F4FF;min-width:180px">
  <div style="font-weight:700;color:${col};font-size:14px;margin-bottom:4px">${storm.name}</div>
  <div>${storm.classification} &bull; Advisory #${storm.advisoryNumber}</div>
  <div>Max winds: ${storm.maxWindMph} mph (${windKt} kt)</div>
  ${storm.pressure ? `<div>Pressure: ${storm.pressure} mb</div>` : ""}
  ${storm.movement ? `<div>Movement: ${storm.movement}</div>` : ""}
  ${storm.advisoryTime ? `<div style="color:#7B9BB5;font-size:11px;margin-top:4px">${storm.advisoryTime}</div>` : ""}
</div>`,
        { permanent: false, direction: "top", offset: [0, -18], opacity: 1 }
      );
      marker.addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* ignore */ } });
    };
  }, [storms, map]);

  return null;
}

// ── NHC forecast track cone polygon layer ────────────────────────────────────
function TrackConeLayer({ storm }: { storm: NhcStormData }) {
  if (!storm.coneCoords || storm.coneCoords.length < 3) return null;

  const geojson: GeoJSON.GeoJsonObject = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [storm.coneCoords],
    },
    properties: {},
  } as GeoJSON.GeoJsonObject;

  return (
    <GeoJSON
      key={`cone-${storm.id}`}
      data={geojson}
      style={() => ({
        color: "rgba(120,0,30,0.85)",
        weight: 2,
        fillColor: "rgba(120,0,30,0.12)",
        fillOpacity: 1,
        opacity: 0.85,
      })}
    />
  );
}

// ── NHC forecast track waypoint markers ──────────────────────────────────────
function TrackWaypointsLayer({ storm }: { storm: NhcStormData }) {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    markersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* ignore */ } });
    markersRef.current = [];

    if (!storm.trackPoints || storm.trackPoints.length === 0) return;

    storm.trackPoints.forEach((pt, idx) => {
      if (!pt.lat || !pt.lon) return;

      const col = stormSymbolColor(pt.STORMTYPE || storm.classification);
      const isCurrentPos = pt.TAU === 0;
      const radius = isCurrentPos ? 14 : 10;

      const svgIcon = L.divIcon({
        className: "",
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
        html: `<svg width="${radius * 2}" height="${radius * 2}" viewBox="0 0 ${radius * 2} ${radius * 2}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${radius}" cy="${radius}" r="${radius - 2}" fill="${col}" fill-opacity="${isCurrentPos ? 0.9 : 0.75}" stroke="#000" stroke-width="1.5"/>
  ${isCurrentPos ? `<text x="${radius}" y="${radius + 4}" text-anchor="middle" font-family="monospace" font-size="${radius - 1}" font-weight="700" fill="#000">${stormSymbol(pt.STORMTYPE || storm.classification)}</text>` : `<text x="${radius}" y="${radius + 3}" text-anchor="middle" font-family="monospace" font-size="8" font-weight="600" fill="#000">${pt.TAU}h</text>`}
</svg>`,
      });

      const marker = L.marker([pt.lat, pt.lon], { icon: svgIcon, zIndexOffset: isCurrentPos ? 600 : 400 + idx });

      // Build tooltip content
      const windMph = Math.round((pt.MAXWIND || 0) * 1.15078);
      const dirStr = pt.TCDIR != null ? `${pt.TCDIR}\u00b0` : "N/A";
      const spdStr = pt.TCSPD != null ? `${pt.TCSPD} kt` : "N/A";
      const pressStr = pt.MSLP != null ? `${pt.MSLP} mb` : "N/A";

      const tooltipHtml = `<div style="font-family:monospace;font-size:12px;line-height:1.6;padding:6px 10px;background:#0D1520;border:1px solid ${col};color:#E8F4FF;min-width:200px">
  <div style="font-weight:700;color:${col};font-size:13px;margin-bottom:4px">${storm.name} &bull; ${pt.TCDVLP || pt.STORMTYPE}</div>
  <div style="margin-bottom:2px">${isCurrentPos ? "Current Position" : `+${pt.TAU}h Forecast`}</div>
  <div style="margin-bottom:2px">${pt.DATELBL || pt.FLDATELBL || ""}</div>
  <div style="margin-bottom:2px">Max winds: ${pt.MAXWIND} kt (${windMph} mph)</div>
  <div style="margin-bottom:2px">Pressure: ${pressStr}</div>
  <div style="margin-bottom:2px">Movement: ${dirStr} at ${spdStr}</div>
</div>`;

      marker.bindTooltip(tooltipHtml, {
        permanent: false,
        direction: "top",
        offset: [0, -(radius + 4)],
        opacity: 1,
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* ignore */ } });
    };
  }, [storm, map]);

  return null;
}

// ── Compact official five-day cone map for the lower graphics section ───────────
function ConeMapFitBounds({ storm }: { storm: NhcStormData }) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];

    storm.coneCoords.forEach(([lon, lat]) => {
      if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
    });
    storm.trackPoints.forEach(point => {
      if (Number.isFinite(point.lat) && Number.isFinite(point.lon)) points.push([point.lat, point.lon]);
    });

    if (points.length === 0) return;

    try {
      map.fitBounds(L.latLngBounds(points).pad(0.1), {
        animate: false,
        maxZoom: 7,
        padding: [10, 10],
      });
    } catch {
      // Keep the initial basin framing if an upstream official geometry is incomplete.
    }
  }, [map, storm]);

  return null;
}

function OfficialFiveDayConeMap({ storm }: { storm: NhcStormData }) {
  const initialLat = storm.latitudeNumeric ?? storm.trackPoints[0]?.lat ?? 20;
  const initialLon = storm.longitudeNumeric ?? storm.trackPoints[0]?.lon ?? -70;

  return (
    <div
      data-official-nhc-five-day-cone="WEATHERSTREAM_OFFICIAL_NHC_CONE_GEOMETRY_V2"
      style={{ height: 340, border: "1px solid #19374D", overflow: "hidden", background: "#08111A" }}
    >
      <MapContainer
        center={[initialLat, initialLon]}
        zoom={5}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <ConeMapFitBounds storm={storm} />
        <TrackConeLayer storm={storm} />
        <TrackWaypointsLayer storm={storm} />
      </MapContainer>
    </div>
  );
}

// ── Map auto-fit to basin storms/disturbances ─────────────────────────────────
function MapFitBounds({
  storms,
  disturbances,
  basin,
}: {
  storms: NhcStormData[];
  disturbances: GtwoFeature[];
  basin: BasinTab;
}) {
  const map = useMap();

  useEffect(() => {
    const basinStorms = storms.filter(s => s.basin === basin);
    const basinDist = disturbances.filter(f => gtwoFeatureBasin(f) === basin);
    const points: [number, number][] = [];

    basinStorms.forEach(s => {
      if (Number.isFinite(s.latitudeNumeric) && Number.isFinite(s.longitudeNumeric)) {
        points.push([s.latitudeNumeric, s.longitudeNumeric]);
      }
      s.trackPoints.forEach(pt => {
        if (Number.isFinite(pt.lat) && Number.isFinite(pt.lon)) points.push([pt.lat, pt.lon]);
      });
    });

    basinDist.forEach(f => {
      const geom = f.geometry as GeoJSON.Polygon;
      if (geom.type === "Polygon" && geom.coordinates[0]) {
        geom.coordinates[0].forEach(([lon, lat]) => {
          if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
        });
      }
    });

    if (points.length === 0) return;

    const lats = points.map(p => p[0]);
    const lons = points.map(p => p[1]);
    const bounds: L.LatLngBoundsExpression = [
      [Math.min(...lats) - 3, Math.min(...lons) - 5],
      [Math.max(...lats) + 3, Math.max(...lons) + 5],
    ];
    let animationFrame: number | undefined;
    let delayedFit: number | undefined;

    const applyFit = () => {
      try {
        const container = map.getContainer();
        const containerWidth = container.offsetWidth;
        if (containerWidth <= 0 || container.offsetHeight <= 0) return;

        // The mobile map is measured after its first Leaflet render. Re-fitting
        // after that measurement prevents the default, globe-scale starting view.
        map.invalidateSize({ pan: false });
        map.fitBounds(bounds, {
          animate: false,
          maxZoom: containerWidth < 768 ? 5 : 6,
          padding: containerWidth < 768 ? [12, 12] : [20, 20],
        });
      } catch {
        // Preserve the initial map view if an upstream geometry is incomplete.
      }
    };

    const scheduleFit = () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(applyFit);
    };

    scheduleFit();
    delayedFit = window.setTimeout(scheduleFit, 180);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleFit);
    resizeObserver?.observe(map.getContainer());

    return () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      if (delayedFit !== undefined) window.clearTimeout(delayedFit);
      resizeObserver?.disconnect();
    };
  }, [storms, disturbances, basin, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TropicalAdvisories() {
  const [, navigate] = useLocation();

  // Layer toggles
  const [showAlerts, setShowAlerts] = useState(true);
  const [showSatellite, setShowSatellite] = useState(false);
  const [showZoneForecasts, setShowZoneForecasts] = useState(false);
  const [basemap, setBasemap] = useState<"street" | "satellite">("street");

  // Playback control state (satellite animation)
  const [pbPlaying, setPbPlaying] = useState(true);          // play/pause
  // Single state object for frame info -- ensures exactly one re-render per frame advance,
  // eliminating the blurry/doubled clock caused by three separate setState calls.
  const [pbState, setPbState] = useState({ frameIdx: 0, total: 0, timestamp: "" });
  const [pbRequestIdx, setPbRequestIdx] = useState(0);       // external step request (changes trigger layer)

  // Playback bar is shown when satellite is active
  const pbActive = showSatellite;

  // Callback for layers to report frame changes back to the control bar.
  // Single setState call guarantees exactly one re-render per frame advance.
  const handleFrameChange = useCallback((idx: number, total: number, ts: string) => {
    setPbState({ frameIdx: idx, total, timestamp: ts });
  }, []);

  // Step forward/back handlers
  const pbStepForward = useCallback(() => {
    setPbRequestIdx(prev => prev + 1);
    setPbState(prev => (prev.total > 0 ? { ...prev, frameIdx: (prev.frameIdx + 1) % prev.total } : prev));
  }, []);

  const pbStepBack = useCallback(() => {
    setPbRequestIdx(prev => prev - 1);
    setPbState(prev => (prev.total > 0 ? { ...prev, frameIdx: (prev.frameIdx - 1 + prev.total) % prev.total } : prev));
  }, []);

  // NHC tropical outlook toggle: off | 2day | 7day
  const [outlookMode, setOutlookMode] = useState<OutlookMode>("7day");

  // NHC active storms (legacy -- still used for graphics section NHC image URLs)
  const [nhcStorms, setNhcStorms] = useState<NHCStorm[]>([]);

  // NHC storm tracks and cones from /nhc_data.json.
  const [nhcData, setNhcData] = useState<NhcData | null>(null);
  const [nhcDataError, setNhcDataError] = useState<string | null>(null);

  // Validated public NHC ATCF A-deck model guidance. This stays separate from
  // the official forecast artifact and includes current advisory systems plus
  // fresh, complete public invest cycles that pass independent validation.
  const [modelGuidance, setModelGuidance] = useState<NhcModelGuidanceData | null>(null);
  const [modelGuidanceError, setModelGuidanceError] = useState<string | null>(null);

  // Basin tab selection waits for both validated payloads to commit state.
  // This prevents fetch timing from opening the phone on an unrelated basin.
  const [activeBasin, setActiveBasin] = useState<BasinTab>("al");
  const didAutoSelectNhcBasin = useRef(false);
  const [nhcInitialLoadSettled, setNhcInitialLoadSettled] = useState(false);
  const [gtwoInitialLoadSettled, setGtwoInitialLoadSettled] = useState(false);

  // Authoritative NHC GTWO payload. Disturbances are consumed only from
  // /nhc_gtwo.json so a stale embedded copy cannot override the current outlook.
  const [gtwoData, setGtwoData] = useState<GtwoData | null>(null);
  const [gtwoError, setGtwoError] = useState<string | null>(null);

  // Marine zone boundaries GeoJSON (pre-baked, served from gh-pages)
  const [marineZones, setMarineZones] = useState<GeoJSON.FeatureCollection | null>(null);

  // Marine forecasts (NOAA Offshore Waters and Coastal Waters bulletins, parsed),
  // keyed by zone ID. Loaded together with marine_zones.json when Zone Forecasts is
  // first toggled on. See scripts/generate_marine_forecasts.py for the source.
  type MarineForecastPeriod = { label: string; text: string };
  type MarineForecastZone = {
    productCode: string;
    name: string;
    issuedAt: string;
    periods: MarineForecastPeriod[];
    raw: string;
  };
  type MarineForecastsFile = {
    generated: string;
    products: Record<string, { issuedAt: string; office: string; synopsis: string; zoneCount: number }>;
    zones: Record<string, MarineForecastZone>;
  };
  const [marineForecasts, setMarineForecasts] = useState<MarineForecastsFile | null>(null);

  // REFRESH button visual feedback
  const [refreshing, setRefreshing] = useState(false);

  // Lightbox state for graphics section
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Advisory data
  const [alerts, setAlerts] = useState<NWSAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Fetch live NWS + NHC alerts using zone-based query
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(
        `https://api.weather.gov/alerts/active?zone=${ZONE_IDS}&status=actual`,
        { headers: { "User-Agent": "MyCruisingWeather/1.0 (mycruisingweather.com)" } }
      );
      if (!res.ok) throw new Error(`NWS API ${res.status}`);
      const data = await res.json();
      const parsed: NWSAlert[] = ((data.features ?? []) as Record<string, unknown>[])
        .map((f) => {
          const p = f.properties as Record<string, unknown>;
          const zoneUrls = (p.affectedZones as string[]) ?? [];
          return {
            id: (f.id as string) ?? String(Math.random()),
            event: (p.event as string) ?? "Advisory",
            headline: (p.headline as string) ?? "",
            description: (p.description as string) ?? "",
            areaDesc: (p.areaDesc as string) ?? "",
            effective: (p.effective as string) ?? (p.onset as string) ?? new Date().toISOString(),
            expires: (p.expires as string) ?? (p.ends as string) ?? new Date().toISOString(),
            severity: (p.severity as string) ?? "Unknown",
            zones: zoneUrls.map((u: string) => u.split("/").pop() ?? u),
            geometry: (f.geometry as GeoJSON.Geometry | null) ?? null,
          };
        })
        .filter(a => new Date(a.expires).getTime() > Date.now());
      const order = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];
      parsed.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
      setAlerts(parsed);
      setLastUpdated(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }));
      setAlertsError(null);
    } catch (e) {
      setAlertsError(e instanceof Error ? e.message : "Failed to fetch alerts");
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 300_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Fetch NHC active storms on mount and every 30 minutes
  useEffect(() => {
    fetchNHCStorms().then(setNhcStorms);
    const interval = setInterval(() => {
      fetchNHCStorms().then(setNhcStorms);
    }, 1_800_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch the canonical NHC payload on mount, every 10 minutes, and whenever
  // the page regains focus. Cache-busting plus no-store prevents a six-hour-old
  // browser response from masking a newly published NHC advisory. Malformed,
  // stale, or older responses never replace the last known good payload in this session.
  useEffect(() => {
    const loadNhcData = async () => {
      try {
        const res = await fetch(`/nhc_data.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`NHC storm data request failed (${res.status})`);
        const candidate: unknown = await res.json();
        if (!isValidNhcData(candidate)) throw new Error("NHC storm data failed validation");
        if (isNhcArtifactStale(candidate.generated)) {
          throw new Error("NHC storm data is older than 8 hours and was withheld");
        }

        setNhcData(current => {
          const currentGenerated = current ? Date.parse(current.generated) : 0;
          const candidateGenerated = Date.parse(candidate.generated);
          return candidateGenerated >= currentGenerated ? candidate : current;
        });

        setNhcDataError(null);
      } catch (error) {
        setNhcDataError(error instanceof Error ? error.message : "NHC storm data unavailable");
      } finally {
        setNhcInitialLoadSettled(true);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadNhcData();
    };

    loadNhcData();
    const interval = setInterval(loadNhcData, 600_000);
    window.addEventListener("focus", loadNhcData);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", loadNhcData);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  // Fetch current model guidance on mount, every minute, and on focus.
  // The artifact is accepted only when it has strict public NHC A-deck provenance,
  // validates structurally, is current, and is no older than the session payload.
  useEffect(() => {
    const loadModelGuidance = async () => {
      try {
        const res = await fetch(`/nhc_model_guidance.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`NHC model guidance request failed (${res.status})`);
        const candidate: unknown = await res.json();
        if (!isValidNhcModelGuidanceData(candidate)) throw new Error("NHC model guidance failed validation");
        if (isNhcArtifactStale(candidate.generated)) {
          throw new Error("NHC model guidance is older than 8 hours and was withheld");
        }

        setModelGuidance(current => {
          const currentGenerated = current ? Date.parse(current.generated) : 0;
          const candidateGenerated = Date.parse(candidate.generated);
          return candidateGenerated >= currentGenerated ? candidate : current;
        });
        setModelGuidanceError(null);
      } catch (error) {
        setModelGuidanceError(error instanceof Error ? error.message : "NHC model guidance unavailable");
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadModelGuidance();
    };

    loadModelGuidance();
    const interval = setInterval(loadModelGuidance, MODEL_GUIDANCE_REFRESH_MS);
    window.addEventListener("focus", loadModelGuidance);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", loadModelGuidance);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  // Fetch the authoritative GTWO payload on mount, every minute, and when
  // the page regains focus. Invalid or older responses never replace the current
  // session payload, and failures remain visible instead of becoming false zeroes.
  useEffect(() => {
    const loadGtwo = async () => {
      try {
        const res = await fetch(`/nhc_gtwo.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`NHC outlook request failed (${res.status})`);
        const candidate: unknown = await res.json();
        if (!isValidGtwoData(candidate)) throw new Error("NHC outlook data failed validation");

        setGtwoData(current => {
          const currentGenerated = current ? Date.parse(current.metadata.generated_at) : 0;
          const candidateGenerated = Date.parse(candidate.metadata.generated_at);
          return candidateGenerated >= currentGenerated ? candidate : current;
        });
        setGtwoError(null);
      } catch (error) {
        setGtwoError(error instanceof Error ? error.message : "NHC outlook data unavailable");
      } finally {
        setGtwoInitialLoadSettled(true);
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadGtwo();
    };

    loadGtwo();
    const interval = setInterval(loadGtwo, MODEL_GUIDANCE_REFRESH_MS);
    window.addEventListener("focus", loadGtwo);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", loadGtwo);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  // Choose an active-storm basin first, then fall back to outlook-only activity.
  // State must be committed, not merely fetched, before choosing a default. On an
  // active Atlantic day this keeps the first mobile and desktop view on the Atlantic
  // even if the outlook payload resolves a render earlier than the storm payload.
  useEffect(() => {
    if (didAutoSelectNhcBasin.current || !nhcInitialLoadSettled || !gtwoInitialLoadSettled) return;

    const nhcReady = Boolean(nhcData) || Boolean(nhcDataError);
    const gtwoReady = Boolean(gtwoData) || Boolean(gtwoError);
    if (!nhcReady || !gtwoReady) return;

    const preferredBasins: BasinTab[] = ["al", "ep", "cp"];
    const selectedStormBasin = preferredBasins.find(basin =>
      (nhcData?.storms ?? []).some(storm => storm.basin === basin),
    );
    const selectedDisturbanceBasin = preferredBasins.find(basin =>
      (gtwoData?.features ?? []).some(feature => gtwoFeatureBasin(feature) === basin),
    );
    const selected = selectedStormBasin ?? selectedDisturbanceBasin;

    if (selected) {
      setActiveBasin(selected);
      didAutoSelectNhcBasin.current = true;
    }
  }, [gtwoData, gtwoError, gtwoInitialLoadSettled, nhcData, nhcDataError, nhcInitialLoadSettled]);

  // Fetch marine zone boundaries AND marine forecasts on mount (lazy -- only when
  // Zone Forecasts is first toggled on). Both files come from gh-pages and are
  // refreshed by scripts/generate_marine_zones.py and generate_marine_forecasts.py.
  useEffect(() => {
    if (!showZoneForecasts) return;
    if (marineZones && marineForecasts) return;
    const loadAll = async () => {
      try {
        const [zonesRes, forecastsRes] = await Promise.all([
          marineZones ? Promise.resolve(null) : fetch("/marine_zones.json"),
          marineForecasts ? Promise.resolve(null) : fetch("/marine_forecasts.json"),
        ]);
        if (zonesRes && zonesRes.ok) {
          const data = await zonesRes.json();
          setMarineZones(data as GeoJSON.FeatureCollection);
        }
        if (forecastsRes && forecastsRes.ok) {
          const data = await forecastsRes.json();
          setMarineForecasts(data as MarineForecastsFile);
        }
      } catch {
        // Silently fail -- zone layer is optional
      }
    };
    loadAll();
  }, [showZoneForecasts, marineZones, marineForecasts]);

  // Scroll sidebar to highlighted alert
  useEffect(() => {
    if (highlightedId && sidebarRef.current) {
      const el = sidebarRef.current.querySelector(`[data-alert-id="${highlightedId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightedId]);

  const highestSeverity = alerts.length > 0
    ? (["Extreme", "Severe", "Moderate", "Minor"].find(s => alerts.some(a => a.severity === s)) ?? "Unknown")
    : null;
  const sevColor = highestSeverity ? alertColor(highestSeverity) : "#39FF14";
  const nhcDataStale = Boolean(nhcData && isNhcArtifactStale(nhcData.generated));
  const activeNhcData = nhcDataStale ? null : nhcData;
  const modelGuidanceStale = Boolean(modelGuidance && isNhcArtifactStale(modelGuidance.generated));
  const directModelGuidance = modelGuidanceStale ? null : modelGuidance;
  const embeddedModelGuidance = validatedEmbeddedModelGuidance(gtwoData);
  const activeModelGuidance = directModelGuidance ?? embeddedModelGuidance;
  const usingEmbeddedModelGuidance = Boolean(embeddedModelGuidance && !directModelGuidance);
  // Advisory, PTC, and post-tropical systems must remain in the independently
  // validated current-storm artifact. A verified invest is eligible directly
  // from its fresh official public A-deck, because no advisory record exists yet.
  const currentStormIds = new Set((activeNhcData?.storms ?? []).map(storm => storm.id));
  const currentModelGuidanceStorms = (activeModelGuidance?.storms ?? []).filter(
    storm => storm.systemType === "invest" || currentStormIds.has(storm.id),
  );
  const gtwoSourceTimestamp = gtwoData?.metadata.source_last_modified || gtwoData?.metadata.generated_at;
  const gtwoDataStale = Boolean(gtwoSourceTimestamp && isNhcArtifactStale(gtwoSourceTimestamp));
  const tropicalDataWarnings = [
    nhcDataError
      ? `Storm-track refresh warning: ${nhcDataError}. ${activeNhcData ? "Showing the last validated payload." : "Storm tracks are unavailable."}`
      : null,
    gtwoError
      ? `Outlook refresh warning: ${gtwoError}. ${gtwoData ? "Showing the last validated payload." : "Disturbance status is unavailable."}`
      : null,
    nhcDataStale ? "Storm-track data is older than 8 hours and has been withheld to avoid showing an outdated storm." : null,
    modelGuidanceError
      ? `Model-guidance refresh warning: ${modelGuidanceError}. ${usingEmbeddedModelGuidance ? "Showing the current validated GTWO-published guidance fallback." : currentModelGuidanceStorms.length > 0 ? "Showing the last validated guidance." : "Model guidance is unavailable."}`
      : null,
    modelGuidanceStale ? "Model guidance is older than 8 hours and has been withheld to avoid showing outdated model output." : null,
    gtwoDataStale ? "Tropical outlook data is older than 8 hours and may be stale." : null,
  ].filter((message): message is string => Boolean(message));

  // Detect mobile for sidebar layout
  const [isMobile, setIsMobile] = useState(false);
  // Mobile: sidebar hidden by default so map fills full width on load
  const [showSidebar, setShowSidebar] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // On mobile, hide sidebar by default; on desktop always show
      if (!mobile) setShowSidebar(true);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "#0A0E14",
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      overflowX: "hidden",
    }}>
      {/* ── Top bar: back button + title ── */}
      <div style={{
        background: "#0D1520",
        borderBottom: "1px solid #1A2D42",
        padding: isMobile ? "8px 10px" : "8px 14px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: isMobile ? 8 : 12,
      }}>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: "1px solid #1A2D42",
            color: "#7B9BB5",
            cursor: "pointer",
            fontSize: "1rem",
            letterSpacing: "0.08em",
            padding: "6px 14px",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M7 1L3 5l4 4" stroke="#7B9BB5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          HOME
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? "0.84rem" : "1.2rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: isMobile ? "0.04em" : "0.08em", lineHeight: 1.2 }}>
            TROPICAL &amp; MARINE ADVISORIES
          </div>
          <div style={{ fontSize: isMobile ? "0.66rem" : "0.9rem", color: "#7B9BB5", marginTop: 3, lineHeight: 1.35 }}>
            {isMobile ? "NHC tropical · NWS marine" : "NWS Marine + NHC Tropical Watches, Warnings & Statements"}
          </div>
        </div>
        {/* Mobile sidebar toggle */}
        {isMobile && (
          <button
            onClick={() => setShowSidebar(v => !v)}
            style={{
              background: showSidebar ? "rgba(0,212,255,0.12)" : "none",
              border: `1px solid ${showSidebar ? "#00D4FF" : "#1A2D42"}`,
              color: showSidebar ? "#00D4FF" : "#7B9BB5",
              cursor: "pointer",
              fontSize: isMobile ? "0.74rem" : "1rem",
              letterSpacing: isMobile ? "0.05em" : "0.08em",
              padding: isMobile ? "7px 9px" : "6px 14px",
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            {alerts.length > 0 ? `${alerts.length} ALERTS` : "ALERTS"}
          </button>
        )}
      </div>

      {/* ── Layer toolbar ── */}
      <div style={{
        background: "#0D1520",
        borderBottom: "1px solid #1A2D42",
        padding: isMobile ? "7px 10px" : "7px 14px",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}>
          <LayerBtn label="Active Alerts" active={showAlerts} color="#FF8C00" onClick={() => setShowAlerts(v => !v)} />
          <LayerBtn label="Weather Satellite" active={showSatellite} onClick={() => setShowSatellite(v => !v)} />
          <LayerBtn label="Zone Forecasts" active={showZoneForecasts} onClick={() => setShowZoneForecasts(v => !v)} />
          {/* NHC Tropical Outlook period control */}
          <div
            role="group"
            aria-label="NHC Tropical Outlook display period"
            data-outlook-control="TROPICAL_OUTLOOK_DEFAULT_7DAY_V1"
            data-outlook-mode={outlookMode}
            style={{ display: "flex", alignItems: "center", gap: 0, marginLeft: 8, border: "1px solid #1A2D42", overflow: "hidden" }}
          >
            <span style={{ minHeight: 36, display: "flex", alignItems: "center", padding: "6px 8px", color: "#E8F4FF", fontSize: "0.78rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
              TROPICAL OUTLOOK
            </span>
            {(["7day", "2day", "off"] as OutlookMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setOutlookMode(mode)}
                aria-pressed={outlookMode === mode}
                style={{
                  minHeight: 36,
                  padding: "6px 8px",
                  background: outlookMode === mode ? "rgba(255,69,0,0.18)" : "rgba(13,21,32,0.85)",
                  color: outlookMode === mode ? "#FF4500" : "#7B9BB5",
                  border: "none",
                  borderLeft: "1px solid #1A2D42",
                  cursor: "pointer",
                  fontSize: "0.78rem",
                  letterSpacing: "0.06em",
                  fontFamily: "inherit",
                  fontWeight: outlookMode === mode ? 700 : 400,
                  transition: "all 0.15s",
                }}
              >
                {mode === "7day" ? "7-Day" : mode === "2day" ? "2-Day" : "Hide"}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: isMobile ? 0 : "auto", display: "flex", gap: 4 }}>
            {(["street", "satellite"] as const).map(b => (
              <button key={b} onClick={() => setBasemap(b)} style={{
                minHeight: 36, padding: "6px 9px", cursor: "pointer", fontSize: "0.78rem", letterSpacing: "0.06em",
                border: `1px solid ${basemap === b ? "#00D4FF" : "#1A2D42"}`,
                background: basemap === b ? "rgba(0,212,255,0.12)" : "rgba(13,21,32,0.85)",
                color: basemap === b ? "#00D4FF" : "#7B9BB5",
                fontFamily: "inherit",
              }}>
                {b === "street" ? "Map" : "Satellite"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Map + sidebar ── */}
      <div
        data-map-mobile-height="MOBILE_MAP_HEIGHT_RESPONSIVE_V2"
        style={{ flex: "0 0 auto", height: isMobile ? "clamp(360px, 60dvh, 500px)" : "calc(100dvh - 100px)", display: "flex", overflow: "hidden", position: "relative" }}
      >
        {/* Leaflet map -- flex:1 always so it fills remaining width after sidebar */}
        <div
          ref={mapContainerRef}
          data-map-scroll-mode="MAP_SCROLL_CLICK_OR_PINCH_ZOOM_V1"
          style={{ flex: 1, position: "relative", minWidth: 0 }}
        >
          <MapContainer
            center={[22.0, -75.0]}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
            scrollWheelZoom={false}
            touchZoom={true}
          >
            {/* Page scroll remains available over the map. Zoom uses controls or touch pinch. */}
            {/* Base tiles */}
            {basemap === "street" ? (
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                maxZoom={19}
              />
            ) : (
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="&copy; Esri, Maxar, Earthstar Geographics"
                maxZoom={19}
              />
            )}
            {/* Geographic context remains visible over both imagery basemaps and weather imagery. */}
            <SatelliteGeographyReference enabled={showSatellite || basemap === "satellite"} />

            {/* Zone Forecasts -- NWS marine zone boundaries (pre-baked GeoJSON from marine_zones.json) */}
            {showZoneForecasts && marineZones && marineForecasts && (
              <GeoJSON
                key="marine-zones"
                data={marineZones}
                style={() => ({
                  color: "#00D4FF",
                  weight: 1,
                  fillColor: "#00D4FF",
                  fillOpacity: 0.04,
                  opacity: 0.45,
                })}
                onEachFeature={(feature, layer) => {
                  const props = feature.properties as {
                    name?: string;
                    id?: string;
                    productCode?: string;
                    forecastOffice?: string;
                    zoneType?: string;
                  } | undefined;
                  const name = props?.name ?? "Marine Zone";
                  const id = props?.id ?? "";
                  const productCode = props?.productCode ?? "";
                  // Hover tooltip: quick zone identification
                  layer.bindTooltip(
                    `<div style="font-family:monospace;font-size:12px;padding:4px 8px;background:#0D1520;border:1px solid #00D4FF;color:#E8F4FF">${name}<br/><span style="color:#7B9BB5;font-size:11px">${id}${productCode ? ` &middot; ${productCode}` : ""}</span></div>`,
                    { sticky: true, opacity: 1 }
                  );
                  // Click popup: full NOAA forecast text for this zone
                  const renderForecastHtml = () => {
                    const seg = id && marineForecasts?.zones?.[id];
                    if (!seg) {
                      return `<div style="font-family:monospace;font-size:12px;padding:8px 10px;background:#0D1520;border:1px solid #00D4FF;color:#E8F4FF;max-width:320px"><div style="font-weight:600;color:#00D4FF;margin-bottom:4px">${name}</div><div style="color:#7B9BB5;font-size:11px;margin-bottom:6px">${id}${productCode ? ` &middot; ${productCode}` : ""}</div><div style="color:#A8B8C8">No NWS forecast text available for this zone yet.</div></div>`;
                    }
                    const periodsHtml = (seg.periods || [])
                      .slice(0, 10)
                      .map((p: MarineForecastPeriod) =>
                        `<div style="margin-bottom:6px"><span style="color:#00D4FF;font-weight:600">${p.label}</span> &middot; <span style="color:#E8F4FF">${p.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span></div>`
                      )
                      .join("");
                    return (
                      `<div style="font-family:monospace;font-size:12px;padding:10px 12px;background:#0D1520;border:1px solid #00D4FF;color:#E8F4FF;max-width:380px;max-height:360px;overflow-y:auto">` +
                        `<div style="font-weight:600;color:#00D4FF;margin-bottom:2px">${seg.name || name}</div>` +
                        `<div style="color:#7B9BB5;font-size:11px;margin-bottom:6px">${id} &middot; ${seg.productCode}${seg.issuedAt ? ` &middot; ${seg.issuedAt}` : ""}</div>` +
                        periodsHtml +
                      `</div>`
                    );
                  };
                  layer.bindPopup(renderForecastHtml, { maxWidth: 400, autoPan: true });
                }}
              />
            )}

            {/* Satellite -- NOAA nowCOAST global GMGSI mosaic (animated, 6-hour loop) */}
            {/* Covers 60N-60S globally: GOES-19 East, GOES-18 West, Himawari-9, Meteosat-9/10 */}
            <SatelliteLayer
              enabled={showSatellite}
              isPlaying={pbPlaying}
              frameIdx={pbState.frameIdx}
              onFrameChange={handleFrameChange}
            />

            {/* Active Alerts WMS -- NWS hazard polygons (background layer) */}
            {showAlerts && (
              <WMSTileLayer
                url="https://opengeo.ncep.noaa.gov/geoserver/ows"
                params={{
                  layers: "nws_alerts",
                  format: "image/png",
                  transparent: true,
                  version: "1.3.0",
                }}
                opacity={0.6}
                zIndex={250}
                maxNativeZoom={10}
              />
            )}

            {/* Recalculate Leaflet after sidebar, viewport, or mobile layout changes. */}
            <MapInvalidator trigger={isMobile || showSidebar} />

            {/* Clickable GeoJSON alert zones from NWS API */}
            <AlertZonesLayer
              alerts={alerts}
              highlightedId={highlightedId}
              onAlertClick={id => setHighlightedId(prev => prev === id ? null : id)}
            />

            {/* NHC active storm markers -- shown when outlook is 2day or 7day */}
            {outlookMode !== "off" && nhcStorms.length > 0 && (
              <StormMarkersLayer storms={nhcStorms} />
            )}

            {/* NHC GTWO disturbance ellipses from the authoritative standalone payload */}
            <GtwoLayer features={gtwoData?.features ?? []} mode={outlookMode} />

            {/* NHC forecast track cone + waypoints from pre-baked nhc_data.json */}
            {activeNhcData && activeNhcData.storms
              .filter(s => s.basin === activeBasin)
              .map(storm => (
                <>
                  <TrackConeLayer key={`cone-${storm.id}`} storm={storm} />
                  <TrackWaypointsLayer key={`wpts-${storm.id}`} storm={storm} />
                </>
              ))
            }

            {/* Auto-fit map to active basin systems when basin tab changes */}
            {(activeNhcData || gtwoData) && (
              <MapFitBounds
                storms={activeNhcData?.storms ?? []}
                disturbances={gtwoData?.features ?? []}
                basin={activeBasin}
              />
            )}
          </MapContainer>


          {outlookMode !== "off" && (
            <div
              aria-label={`${outlookMode === "2day" ? "2-day" : "7-day"} NHC Tropical Outlook color legend`}
              data-outlook-legend="NHC_GTWO_LEGEND_V1"
              style={{
                position: "absolute",
                bottom: pbActive ? 92 : 10,
                left: 10,
                zIndex: 1000,
                background: "rgba(10,18,28,0.88)",
                border: "1px solid #1A2D42",
                borderRadius: 6,
                padding: "7px 9px",
                minWidth: 190,
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                backdropFilter: "blur(4px)",
              }}
            >
              <div style={{ color: "#E8F4FF", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 5 }}>
                NHC {outlookMode === "2day" ? "2-DAY" : "7-DAY"} DEVELOPMENT CHANCE
              </div>
              {[
                { color: "#FFD700", label: "Yellow · Low (<40%)" },
                { color: "#FF8C00", label: "Orange · Medium (40–60%)" },
                { color: "#FF0000", label: "Red · High (>60%)" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  <span style={{ color: "#B0C8E0", fontSize: "0.7rem" }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Playback control bar -- shown when satellite is active ── */}
          {pbActive && (
            <div style={{
              position: "absolute",
              bottom: 28,
              left: 10,
              zIndex: 1000,
              background: "rgba(10,18,28,0.88)",
              border: "1px solid #1A2D42",
              borderRadius: 6,
              padding: "6px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 220,
              backdropFilter: "blur(4px)",
            }}>
              {/* Timestamp and frame counter */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.72rem", color: "#7B9BB5", fontFamily: "monospace" }}>
                  {pbState.timestamp
                    ? new Date(pbState.timestamp).toLocaleString("en-US", {
                        month: "numeric", day: "numeric", year: "2-digit",
                        hour: "numeric", minute: "2-digit", hour12: true,
                        timeZoneName: "short",
                      })
                    : "Loading..."}
                </span>
                <span style={{ fontSize: "0.72rem", color: "#7B9BB5", marginLeft: 12 }}>
                  {pbState.total > 0 ? `${pbState.frameIdx + 1} / ${pbState.total}` : "--"}
                </span>
              </div>
              {/* Controls row */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
                {/* Step back */}
                <button
                  onClick={pbStepBack}
                  title="Step back one frame"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#00D4FF", padding: 4, lineHeight: 1 }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <polygon points="14,2 6,8 14,14" fill="#00D4FF" />
                    <rect x="2" y="2" width="3" height="12" rx="0.5" fill="#00D4FF" />
                  </svg>
                </button>
                {/* Play/Pause */}
                <button
                  onClick={() => setPbPlaying(v => !v)}
                  title={pbPlaying ? "Pause" : "Play"}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#00D4FF", padding: 4, lineHeight: 1 }}
                >
                  {pbPlaying ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="3" y="2" width="4" height="12" rx="0.5" fill="#00D4FF" />
                      <rect x="9" y="2" width="4" height="12" rx="0.5" fill="#00D4FF" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <polygon points="3,1 14,8 3,15" fill="#00D4FF" />
                    </svg>
                  )}
                </button>
                {/* Step forward */}
                <button
                  onClick={pbStepForward}
                  title="Step forward one frame"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#00D4FF", padding: 4, lineHeight: 1 }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <polygon points="2,2 10,8 2,14" fill="#00D4FF" />
                    <rect x="11" y="2" width="3" height="12" rx="0.5" fill="#00D4FF" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Advisory sidebar ── */}
        {(!isMobile || showSidebar) && (
          <div
            ref={sidebarRef}
            style={{
              width: isMobile ? "100%" : 310,
              position: isMobile ? "absolute" : "relative",
              top: isMobile ? 0 : undefined,
              right: isMobile ? 0 : undefined,
              bottom: isMobile ? 0 : undefined,
              zIndex: isMobile ? 1000 : undefined,
              background: "#0D1520",
              borderLeft: isMobile ? "none" : "1px solid #1A2D42",
              borderTop: isMobile ? "1px solid #1A2D42" : "none",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #1A2D42", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.05em" }}>
                    Tropical &amp; Marine Advisories
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "#7B9BB5", marginTop: 2 }}>
                    {alertsLoading ? "Loading..." : `${alerts.length} active`}
                    {lastUpdated && ` · Updated ${lastUpdated}`}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (refreshing) return;
                    setRefreshing(true);
                    await fetchAlerts();
                    setRefreshing(false);
                  }}
                  style={{
                    fontSize: "0.9rem",
                    color: refreshing ? "#FFD700" : "#00D4FF",
                    background: refreshing ? "rgba(255,215,0,0.08)" : "none",
                    border: refreshing ? "1px solid #FFD700" : "none",
                    cursor: refreshing ? "default" : "pointer",
                    letterSpacing: "0.1em",
                    fontFamily: "inherit",
                    padding: "2px 8px",
                    transition: "all 0.2s",
                  }}
                  disabled={refreshing}
                >
                  {refreshing ? "REFRESHING..." : "REFRESH"}
                </button>
              </div>
              {/* Severity summary */}
              {!alertsLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: alerts.length > 0 ? sevColor : "#39FF14",
                    boxShadow: `0 0 8px ${alerts.length > 0 ? sevColor : "#39FF14"}`,
                    flexShrink: 0,
                    animation: alerts.length > 0 ? "pulse 2s infinite" : "none",
                  }} />
                  <div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: alerts.length > 0 ? sevColor : "#39FF14", lineHeight: 1 }}>
                      {alerts.length}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#7B9BB5" }}>ADVISORIES</div>
                  </div>
                  {highestSeverity && (
                    <div style={{ fontSize: "0.9rem", color: sevColor, border: `1px solid ${sevColor}`, padding: "3px 10px", letterSpacing: "0.08em" }}>
                      {highestSeverity.toUpperCase()}
                    </div>
                  )}
                  {alerts.length === 0 && (
                    <div style={{ fontSize: "1rem", color: "#39FF14", letterSpacing: "0.1em" }}>ALL CLEAR</div>
                  )}
                </div>
              )}
            </div>

            {/* Alert list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 20px" }}>
              {alertsLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "32px 0", justifyContent: "center" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00D4FF" }} />
                  <span style={{ fontSize: "1rem", color: "#7B9BB5" }}>FETCHING NOAA ALERTS...</span>
                </div>
              )}
              {alertsError && (
                <div style={{ fontSize: "1rem", color: "#FF8C00", padding: "16px 0", textAlign: "center" }}>
                  {alertsError}
                </div>
              )}
              {!alertsLoading && alerts.length === 0 && !alertsError && (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#39FF14", letterSpacing: "0.12em", marginBottom: 8 }}>
                    ALL CLEAR
                  </div>
                  <div style={{ fontSize: "1rem", color: "#7B9BB5", marginBottom: 16 }}>
                    No active marine or tropical advisories
                  </div>
                  {/* Color legend */}
                  <div style={{ textAlign: "left", padding: "0 8px" }}>
                    <div style={{ fontSize: "0.9rem", color: "#3A5068", letterSpacing: "0.08em", marginBottom: 8 }}>
                      ALERT COLOR LEGEND
                    </div>
                    {[
                      { color: "#FF0000", label: "Hurricane Warning" },
                      { color: "#FF69B4", label: "Hurricane Watch" },
                      { color: "#4169E1", label: "Tropical Storm Warning" },
                      { color: "#FFD700", label: "Tropical Storm Watch" },
                      { color: "#00CED1", label: "Storm Surge Warning" },
                      { color: "#FF3C3C", label: "Marine Warning" },
                      { color: "#FFD700", label: "Marine Advisory" },
                      { color: "#00D4FF", label: "Statement / Other" },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <div style={{ width: 14, height: 14, background: item.color, flexShrink: 0, opacity: 0.9 }} />
                        <span style={{ fontSize: "0.95rem", color: "#7B9BB5" }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {alerts.map(alert => (
                <div key={alert.id} data-alert-id={alert.id}>
                  <AlertCard
                    alert={alert}
                    highlighted={highlightedId === alert.id}
                    onHighlight={() => setHighlightedId(prev => prev === alert.id ? null : alert.id)}
                  />
                </div>
              ))}
              {/* Legend shown below alerts when alerts are present */}
              {!alertsLoading && alerts.length > 0 && (
                <div style={{ marginTop: 16, padding: "10px 8px", borderTop: "1px solid #1A2D42" }}>
                <div style={{ fontSize: "0.9rem", color: "#3A5068", letterSpacing: "0.08em", marginBottom: 8 }}>
                  ALERT COLOR LEGEND
                </div>
                {[
                  { color: "#FF0000", label: "Hurricane Warning" },
                  { color: "#FF69B4", label: "Hurricane Watch" },
                  { color: "#4169E1", label: "Tropical Storm Warning" },
                  { color: "#FFD700", label: "Tropical Storm Watch" },
                  { color: "#00CED1", label: "Storm Surge Warning" },
                  { color: "#FF3C3C", label: "Marine Warning" },
                  { color: "#FFD700", label: "Marine Advisory" },
                  { color: "#00D4FF", label: "Statement / Other" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <div style={{ width: 14, height: 14, background: item.color, flexShrink: 0, opacity: 0.9 }} />
                    <span style={{ fontSize: "0.95rem", color: "#7B9BB5" }}>{item.label}</span>
                  </div>
                ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "7px 12px", borderTop: "1px solid #1A2D42", flexShrink: 0 }}>
              <div style={{ fontSize: "0.85rem", color: "#3A5068", textAlign: "center" }}>
                Data: NOAA/NWS + NHC api.weather.gov · Auto-refreshes every 5 min
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── NHC TROPICAL WEATHER TRACKER SECTION ── */}
      {/* NHC_TRACKER_SECTION_MARKER */}
      <div style={{
        background: "#0A0E14",
        borderTop: "2px solid #1A2D42",
        padding: isMobile ? "20px 14px 28px" : "24px 20px 32px",
      }}>
        {/* Section header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: isMobile ? "0.72rem" : "0.85rem", color: "#FF4500", letterSpacing: isMobile ? "0.1em" : "0.15em", marginBottom: 6 }}>
            NHC TROPICAL WEATHER TRACKER
          </div>
          <div style={{ fontSize: isMobile ? "1.16rem" : "1.4rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.04em", lineHeight: 1.2 }}>
            Active Storms &amp; Disturbances
          </div>
          <div style={{ fontSize: isMobile ? "0.78rem" : "0.9rem", color: "#7B9BB5", marginTop: 6, lineHeight: 1.5 }}>
            Official NHC forecast tracks, uncertainty cones, and tropical weather outlook. Data refreshes 4x daily.
          </div>
        </div>

        {tropicalDataWarnings.length > 0 && (
          <div
            role="status"
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              border: "1px solid #FFB000",
              background: "rgba(255,176,0,0.08)",
              color: "#FFD166",
              fontSize: "0.82rem",
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>
              NHC DATA STATUS
            </div>
            {tropicalDataWarnings.map(message => (
              <div key={message}>{message}</div>
            ))}
          </div>
        )}

        {/* Basin tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "1px solid #1A2D42", overflow: "hidden", width: isMobile ? "100%" : "fit-content" }}>
          {([
            { id: "al" as BasinTab, label: "Atlantic" },
            { id: "ep" as BasinTab, label: "E. Pacific" },
            { id: "cp" as BasinTab, label: "C. Pacific" },
          ]).map(({ id, label }) => {
            const basinStorms = activeNhcData?.storms.filter(s => s.basin === id) ?? [];
            const basinDist = (gtwoData?.features ?? []).filter(f => gtwoFeatureBasin(f) === id);
            const badgeCount = basinStorms.length + basinDist.length;
            const isActive = activeBasin === id;
            return (
              <button
                key={id}
                onClick={() => setActiveBasin(id)}
                style={{
                  padding: isMobile ? "8px 7px" : "8px 16px",
                  background: isActive ? "rgba(255,69,0,0.18)" : "rgba(13,21,32,0.85)",
                  color: isActive ? "#FF4500" : "#7B9BB5",
                  border: "none",
                  borderLeft: id !== "al" ? "1px solid #1A2D42" : "none",
                  cursor: "pointer",
                  fontSize: isMobile ? "0.72rem" : "0.9rem",
                  letterSpacing: isMobile ? "0.02em" : "0.06em",
                  fontFamily: "inherit",
                  fontWeight: isActive ? 700 : 400,
                  transition: "all 0.15s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: isMobile ? 1 : undefined,
                  gap: isMobile ? 4 : 6,
                  minHeight: 44,
                }}
              >
                {label}
                {badgeCount > 0 && (
                  <span style={{
                    background: isActive ? "#FF4500" : "#1A2D42",
                    color: isActive ? "#fff" : "#7B9BB5",
                    borderRadius: 10,
                    padding: "1px 7px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    minWidth: 20,
                    textAlign: "center",
                  }}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active storms for selected basin */}
        {(() => {
          const basinStorms = activeNhcData?.storms.filter(s => s.basin === activeBasin) ?? [];
          const basinDist = (gtwoData?.features ?? []).filter(f => gtwoFeatureBasin(f) === activeBasin);

          if (!activeNhcData && !gtwoData && !nhcDataError && !gtwoError) {
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "32px 0" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00D4FF" }} />
                <span style={{ fontSize: "1rem", color: "#7B9BB5" }}>LOADING NHC DATA...</span>
              </div>
            );
          }

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Storm stat cards */}
              {basinStorms.length === 0 && basinDist.length === 0 && activeNhcData && gtwoData && (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#39FF14", letterSpacing: "0.12em", marginBottom: 8 }}>
                    NO ACTIVE STORMS
                  </div>
                  <div style={{ fontSize: "0.95rem", color: "#7B9BB5" }}>
                    No active tropical cyclones or disturbances in this basin.
                  </div>
                </div>
              )}

              {basinStorms.length === 0 && basinDist.length === 0 && (!activeNhcData || !gtwoData) && (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#FFD166", letterSpacing: "0.1em", marginBottom: 8 }}>
                    ACTIVITY STATUS UNAVAILABLE
                  </div>
                  <div style={{ fontSize: "0.95rem", color: "#7B9BB5" }}>
                    The complete NHC storm and disturbance feeds are not both available, so zero activity cannot be confirmed.
                  </div>
                </div>
              )}

              {basinStorms.map(storm => {
                const col = stormSymbolColor(storm.classification);
                const windKt = typeof storm.intensity === "number" ? storm.intensity : parseInt(String(storm.intensity || "0"), 10);
                const windMph = Math.round(windKt * 1.15078);
                const pressureMb = typeof storm.pressure === "number" ? storm.pressure : parseInt(String(storm.pressure || "0"), 10);
                const movDir = storm.movementDir != null ? `${storm.movementDir}\u00b0` : "";
                const movSpd = storm.movementSpeed != null ? `${storm.movementSpeed} kt` : "";
                const movStr = movDir && movSpd ? `${movDir} at ${movSpd}` : movDir || movSpd || "N/A";
                const advNum = (storm.publicAdvisory as Record<string, unknown> | null)?.advNum as string | undefined;

                return (
                  <div
                    key={storm.id}
                    style={{
                      background: "#0D1520",
                      border: `1px solid ${col}40`,
                      padding: 18,
                      boxShadow: `0 0 20px ${col}15`,
                    }}
                  >
                    {/* Storm header */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: col, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "1rem", fontWeight: 700, color: "#000", flexShrink: 0,
                          }}>
                            {stormSymbol(storm.classification)}
                          </div>
                          <div>
                            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: col, letterSpacing: "0.08em" }}>
                              {storm.name}
                            </div>
                            <div style={{ fontSize: "0.9rem", color: "#7B9BB5", marginTop: 2 }}>
                              {storm.classification === "TS" ? "Tropical Storm" :
                               storm.classification === "HU" ? "Hurricane" :
                               storm.classification === "MH" ? "Major Hurricane" :
                               storm.classification === "TD" ? "Tropical Depression" :
                               storm.classification === "DB" ? "Tropical Disturbance" :
                               storm.classification}
                              {advNum ? ` · Advisory #${advNum}` : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#3A5068", textAlign: "right" }}>
                        {storm.lastUpdate || ""}
                      </div>
                    </div>

                    {/* Storm stat grid */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: 10,
                      marginBottom: 16,
                    }}>
                      {[
                        { label: "MAX WINDS", value: `${windMph} mph (${windKt} kt)`, color: col },
                        { label: "PRESSURE", value: pressureMb ? `${pressureMb} mb` : "N/A", color: "#E8F4FF" },
                        { label: "MOVEMENT", value: movStr, color: "#E8F4FF" },
                        { label: "POSITION", value: `${storm.latitude || ""} ${storm.longitude || ""}`, color: "#E8F4FF" },
                      ].map(stat => (
                        <div key={stat.label} style={{ background: "rgba(0,0,0,0.3)", padding: "8px 10px", border: "1px solid #1A2D42" }}>
                          <div style={{ fontSize: "0.72rem", color: "#3A5068", letterSpacing: "0.1em", marginBottom: 4 }}>{stat.label}</div>
                          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: stat.color }}>{stat.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Forecast waypoint table */}
                    {storm.trackPoints && storm.trackPoints.length > 0 && (
                      <div>
                        <div style={{ fontSize: "0.8rem", color: "#3A5068", letterSpacing: "0.1em", marginBottom: 8 }}>FORECAST TRACK</div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid #1A2D42" }}>
                                {["Time", "Date", "Type", "Winds", "Pressure"].map(h => (
                                  <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: "#3A5068", fontWeight: 600, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {storm.trackPoints.map((pt, i) => {
                                const ptCol = stormSymbolColor(pt.STORMTYPE || storm.classification);
                                const ptWindMph = Math.round((pt.MAXWIND || 0) * 1.15078);
                                return (
                                  <tr key={i} style={{ borderBottom: "1px solid rgba(26,45,66,0.5)", background: pt.TAU === 0 ? "rgba(255,255,255,0.04)" : "transparent" }}>
                                    <td style={{ padding: "4px 8px", color: pt.TAU === 0 ? "#E8F4FF" : "#7B9BB5", whiteSpace: "nowrap" }}>
                                      {pt.TAU === 0 ? "NOW" : `+${pt.TAU}h`}
                                    </td>
                                    <td style={{ padding: "4px 8px", color: "#7B9BB5", whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                                      {pt.DATELBL || ""}
                                    </td>
                                    <td style={{ padding: "4px 8px", color: ptCol, fontWeight: 600, whiteSpace: "nowrap" }}>
                                      {pt.TCDVLP || pt.STORMTYPE || ""}
                                    </td>
                                    <td style={{ padding: "4px 8px", color: ptCol, whiteSpace: "nowrap" }}>
                                      {pt.MAXWIND} kt ({ptWindMph} mph)
                                    </td>
                                    <td style={{ padding: "4px 8px", color: "#7B9BB5", whiteSpace: "nowrap" }}>
                                      {pt.MSLP != null ? `${pt.MSLP} mb` : "N/A"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Disturbance cards */}
              {basinDist.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.85rem", color: "#7B9BB5", letterSpacing: "0.1em", marginBottom: 12 }}>
                    TROPICAL WEATHER OUTLOOK · {outlookMode === "2day" ? "2-DAY" : "7-DAY"} SUMMARY
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {basinDist.map((feat, i) => {
                      const p = feat.properties;
                      const displayMode = outlookMode === "off" ? "7day" : outlookMode;
                      const periodLabel = displayMode === "2day" ? "2-DAY" : "7-DAY";
                      const color = displayMode === "2day" ? p.color_2day : p.color_7day;
                      const prob = displayMode === "2day" ? p.prob_2day : p.prob_7day;
                      const risk = displayMode === "2day" ? p.risk_2day : p.risk_7day;
                      return (
                          <div
                          key={i}
                          data-outlook-card-mode={displayMode}
                          style={{
                            background: "#0D1520",
                            border: `1px solid ${color}40`,
                            padding: 14,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF" }}>{p.name}</div>
                            <div style={{
                              background: `${color}20`,
                              border: `1px solid ${color}`,
                              color,
                              padding: "2px 8px",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              letterSpacing: "0.06em",
                            }}>
                              {periodLabel} {risk || "LOW"}
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div style={{ background: "rgba(0,0,0,0.3)", padding: "6px 10px", border: "1px solid #1A2D42" }}>
                              <div style={{ fontSize: "0.7rem", color: "#3A5068", letterSpacing: "0.1em", marginBottom: 3 }}>2-DAY</div>
                              <div style={{ fontSize: "1rem", fontWeight: 700, color: p.color_2day }}>{p.prob_2day || "N/A"}</div>
                              <div style={{ fontSize: "0.75rem", color: "#7B9BB5" }}>{p.risk_2day || ""}</div>
                            </div>
                            <div style={{ background: "rgba(0,0,0,0.3)", padding: "6px 10px", border: "1px solid #1A2D42" }}>
                              <div style={{ fontSize: "0.7rem", color: "#3A5068", letterSpacing: "0.1em", marginBottom: 3 }}>7-DAY</div>
                              <div style={{ fontSize: "1rem", fontWeight: 700, color: p.color_7day }}>{p.prob_7day || "N/A"}</div>
                              <div style={{ fontSize: "0.75rem", color: "#7B9BB5" }}>{p.risk_7day || ""}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Independent source timestamps */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "0.8rem", color: "#3A5068", marginTop: 4 }}>
                {activeNhcData?.generated && (
                  <div>
                    Storm tracks updated: {new Date(activeNhcData.generated).toLocaleString("en-US", {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      hour12: true, timeZoneName: "short",
                    })}
                  </div>
                )}
                {gtwoData?.metadata.generated_at && (
                  <>
                    <div>
                      NHC outlook source: {new Date(gtwoData.metadata.source_last_modified || gtwoData.metadata.generated_at).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                        hour12: true, timeZoneName: "short",
                      })}
                    </div>
                    {gtwoData.metadata.source_last_modified && (
                      <div>
                        Outlook artifact validated: {new Date(gtwoData.metadata.generated_at).toLocaleString("en-US", {
                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          hour12: true, timeZoneName: "short",
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── TROPICAL WEATHER GRAPHICS SECTION ── */}
      {/* TROPICAL_GRAPHICS_SECTION_MARKER */}
      <div style={{
        background: "#0A0E14",
        borderTop: "2px solid #1A2D42",
        padding: "32px 20px 48px",
      }}>
        {/* Section header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: "0.85rem", color: "#00D4FF", letterSpacing: "0.15em", marginBottom: 6 }}>
            TROPICAL WEATHER INTELLIGENCE
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.04em", lineHeight: 1.2 }}>
            Graphics &amp; Forecast Tools
          </div>
          <div style={{ fontSize: "0.95rem", color: "#7B9BB5", marginTop: 6 }}>
            Live-updating charts from NOAA, NHC, and CIMSS. Images refresh automatically as new data is published.
          </div>
        </div>

        {/* Graphics grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 20,
        }}>

          {/* Card 1 -- Official NHC five-day forecast cone for every active advisory system */}
          <div
            data-nhc-five-day-cone-card="WEATHERSTREAM_OFFICIAL_NHC_CONE_CARDS_V2"
            style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16, gridColumn: "1 / -1" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>NHC 5-DAY FORECAST CONES</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>Official NHC forecast-cone geometry and forecast track for every active advisory system</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>OFFICIAL NHC</div>
            </div>
            {(activeNhcData?.storms ?? []).length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18 }}>
                {(activeNhcData?.storms ?? []).map(storm => {
                  const advisory = storm.publicAdvisory as Record<string, unknown> | null;
                  const advisoryUrl = typeof advisory?.url === "string" ? advisory.url : undefined;
                  const advisoryNumber = typeof advisory?.advNum === "string" ? advisory.advNum : undefined;
                  const coneAvailable = storm.coneCoords.length >= 3 && storm.trackPoints.length > 0;
                  const stormColor = stormSymbolColor(storm.classification);

                  return (
                    <article key={storm.id} style={{ background: "#08111A", border: `1px solid ${stormColor}55`, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ color: stormColor, fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.08em" }}>{storm.name.toUpperCase()}</div>
                          <div style={{ color: "#AFC4D3", fontSize: "0.78rem", marginTop: 3 }}>
                            {storm.classification === "TS" ? "Tropical Storm" : storm.classification === "TD" ? "Tropical Depression" : storm.classification === "HU" ? "Hurricane" : storm.classification}
                            {advisoryNumber ? ` · Advisory #${advisoryNumber}` : ""}
                          </div>
                        </div>
                        {advisoryUrl && (
                          <a href={advisoryUrl} target="_blank" rel="noreferrer" style={{ color: "#7DD3FC", fontSize: "0.73rem", textDecoration: "underline", textUnderlineOffset: 3, whiteSpace: "nowrap" }}>
                            Official advisory
                          </a>
                        )}
                      </div>
                      {coneAvailable ? (
                        <OfficialFiveDayConeMap storm={storm} />
                      ) : (
                        <div style={{ minHeight: 240, display: "grid", placeItems: "center", textAlign: "center", color: "#FFD166", fontSize: "0.86rem", lineHeight: 1.5, padding: 18, border: "1px solid #19374D" }}>
                          The official NHC forecast geometry for this advisory is not yet available. Check the official advisory link above.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 9, color: "#7B9BB5", fontSize: "0.72rem", lineHeight: 1.4 }}>
                        <span><span style={{ color: "#78001E", fontWeight: 700 }}>Shaded cone</span> · probable five-day center track envelope</span>
                        <span><span style={{ color: stormColor, fontWeight: 700 }}>Labeled points</span> · official forecast positions</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", color: "#39FF14", letterSpacing: "0.1em", marginBottom: 8 }}>NO ACTIVE STORMS</div>
                <div style={{ fontSize: "0.9rem", color: "#7B9BB5" }}>An official NHC five-day forecast cone will appear here when a named storm has an active advisory.</div>
              </div>
            )}
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 12, lineHeight: 1.5 }}>
              Each cone is generated from the current official NHC forecast geometry for that system. The cone represents the probable track of the storm center over five days. Impacts can extend well outside the cone.
            </div>
          </div>

          {/* Card 2 -- Official public A-deck track and intensity guidance */}
          <div style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16, gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>TRACK &amp; INTENSITY GUIDANCE</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>WeatherStream spaghetti plots · Public NHC A-deck · Current advisory systems and fresh verified invests</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>NHC ATCF</div>
            </div>
            {currentModelGuidanceStorms.length > 0 ? (
              currentModelGuidanceStorms.map(storm => (
                <div key={storm.id} style={{ marginBottom: 18 }}>
                  <ModelGuidancePanel storm={storm} />
                </div>
              ))
            ) : (
              <div data-model-guidance-no-current-system="WEATHERSTREAM_CURRENT_SYSTEM_GUIDANCE_V2" style={{ padding: "32px 0", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", color: (activeNhcData?.storms ?? []).length > 0 ? "#FFD166" : "#39FF14", letterSpacing: "0.1em", marginBottom: 8 }}>
                  {(activeNhcData?.storms ?? []).length > 0 ? "GUIDANCE PENDING" : "NO CURRENT MODEL GUIDANCE"}
                </div>
                <div style={{ fontSize: "0.9rem", color: "#7B9BB5", maxWidth: 640, margin: "0 auto", lineHeight: 1.5 }}>
                  "Guidance appears only after a current official NHC public A-deck cycle passes validation. An unnumbered outlook area is not plotted as a tropical system."
                </div>
              </div>
            )}
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 8, lineHeight: 1.5 }}>
              Track spread is an uncertainty signal, not a confidence forecast. Invest guidance does not imply an NHC advisory or official forecast cone. The intensity plot below the tracks shows each available aid's maximum sustained wind guidance in knots. Official NHC forecasts and local NWS products remain authoritative.
            </div>
          </div>

          {/* Card 3 -- Wind Shear */}
          <div style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>WIND SHEAR</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>Atlantic Basin · CIMSS/UWisc · Updates every 6 hours</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>CIMSS</div>
            </div>
            <img
              src="https://tropic.ssec.wisc.edu/real-time/atlantic/winds/wg8shrZ.GIF"
              alt="Atlantic Wind Shear Analysis"
              style={{ width: "100%", display: "block", background: "#0A0E14", cursor: "pointer" }}
              loading="lazy"
              onClick={() => setLightboxSrc("https://tropic.ssec.wisc.edu/real-time/atlantic/winds/wg8shrZ.GIF")}
            />
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 8, lineHeight: 1.5 }}>
              High wind shear (red/orange) suppresses tropical development. Low shear (blue/green) allows storms to organize and intensify.
            </div>
          </div>

          {/* Card 4 -- Saharan Air Layer */}
          <div style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>SAHARAN AIR LAYER (SAL)</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>GOES-East RGB Airmass · CIMSS · Updates hourly</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>CIMSS</div>
            </div>
            <img
              src="https://tropic.ssec.wisc.edu/real-time/sal/g16rgbairmass/g16airmass.jpg"
              alt="Saharan Air Layer RGB Airmass"
              style={{ width: "100%", display: "block", background: "#0A0E14", cursor: "pointer" }}
              loading="lazy"
              onClick={() => setLightboxSrc("https://tropic.ssec.wisc.edu/real-time/sal/g16rgbairmass/g16airmass.jpg")}
            />
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 8, lineHeight: 1.5 }}>
              Dry, dusty Saharan air (orange/tan tones) suppresses hurricane formation in the Caribbean and Atlantic. A clear path signals higher storm risk.
            </div>
          </div>

          {/* Card 5 -- SST Anomaly */}
          <div style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>SEA SURFACE TEMP ANOMALY</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>Global SST vs. Average · NOAA CPC · Updates weekly</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>NOAA CPC</div>
            </div>
            <img
              src="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_update/sstanim.gif"
              alt="Global Sea Surface Temperature Anomaly"
              style={{ width: "100%", display: "block", background: "#0A0E14", cursor: "pointer" }}
              loading="lazy"
              onClick={() => setLightboxSrc("https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_update/sstanim.gif")}
            />
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 8, lineHeight: 1.5 }}>
              Warmer-than-average ocean temperatures (red/orange) provide more energy for storm intensification. Anomalies in the Main Development Region (MDR) are especially significant.
            </div>
          </div>

          {/* Card 6 -- MJO Phase Diagram */}
          <div style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>MJO PHASE DIAGRAM</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>Madden-Julian Oscillation · NOAA CPC · 15-day running mean · Updates daily</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>NOAA CPC</div>
            </div>
            <img
              src="https://www.cpc.ncep.noaa.gov/products/precip/CWlink/daily_mjo_index/tm_long_order.gif"
              alt="MJO 15-Day Running Mean Phase Diagram"
              style={{ width: "100%", display: "block", background: "#0A0E14", cursor: "pointer" }}
              loading="lazy"
              onClick={() => setLightboxSrc("https://www.cpc.ncep.noaa.gov/products/precip/CWlink/daily_mjo_index/tm_long_order.gif")}
            />
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 8, lineHeight: 1.5 }}>
              The MJO is a 30 to 60-day pulse of tropical convection. Atlantic-favorable phases can lower wind shear and raise moisture over the Caribbean and Gulf, helping frame tropical potential two to four weeks ahead.
            </div>
          </div>

          {/* Card 7 -- Atlantic Activity Bell Curve */}
          <div style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>ATLANTIC SEASON ACTIVITY</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>Historical Climatology · NHC · 1944-2020 baseline</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>NHC</div>
            </div>
            <img
              src="https://www.nhc.noaa.gov/climo/images/2021climo/AtlanticCampfire_sm.png"
              alt="Atlantic Hurricane Season Activity Bell Curve"
              style={{ width: "100%", display: "block", background: "#0A0E14", cursor: "pointer" }}
              loading="lazy"
              onClick={() => setLightboxSrc("https://www.nhc.noaa.gov/climo/images/2021climo/AtlanticCampfire_sm.png")}
            />
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 8, lineHeight: 1.5 }}>
              Peak of the Atlantic hurricane season is September 10. Most activity occurs between mid-August and mid-October. The Caribbean and Gulf of Mexico are most active during this window.
            </div>
          </div>

        </div>{/* end graphics grid */}

        {/* Data sources footer */}
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #1A2D42" }}>
          <div style={{ fontSize: "0.82rem", color: "#3A5068", textAlign: "center" }}>
            Data sources: NOAA/NHC, NOAA CPC, CIMSS/University of Wisconsin-Madison. Images update automatically as new data is published by each source.
          </div>
        </div>
      </div>

      {/* ── LIGHTBOX OVERLAY ── */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          {/* X close button */}
          <button
            onClick={e => { e.stopPropagation(); setLightboxSrc(null); }}
            style={{
              position: "absolute",
              top: 16,
              right: 20,
              background: "none",
              border: "none",
              color: "#E8F4FF",
              fontSize: "2rem",
              lineHeight: 1,
              cursor: "pointer",
              padding: "4px 8px",
              zIndex: 10000,
            }}
            aria-label="Close"
          >
            &times;
          </button>
          {/* Expanded image */}
          <img
            src={lightboxSrc}
            alt="Expanded graphic"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: "95vw",
              maxHeight: "90vh",
              objectFit: "contain",
              display: "block",
              boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            }}
          />
        </div>
      )}

    </div>
  );
}
