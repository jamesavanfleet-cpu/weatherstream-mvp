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
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocation } from "wouter";

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

// ── NHC GTWO disturbance feature type ────────────────────────────────────────
interface GtwoProperties {
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
}

interface GtwoFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: GtwoProperties;
}

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
// Architecture: one Leaflet TileLayer per frame, all created upfront.
// Only one TileLayer is visible at a time (opacity 1 vs 0). Tiles are
// CDN-cached by NASA GIBS and load in 0.3-0.5 s each, so the first frame
// appears in ~1-2 s and 12 frames finish loading in ~12-24 s total.
//
// GIBS layers used:
//   GOES-East  (Caribbean/US/Gulf/East Coast): GOES-East_ABI_Band13_Clean_Infrared
//   GOES-West  (Pacific):                     GOES-West_ABI_Band13_Clean_Infrared
//   Himawari   (Mediterranean/Asia/global):   Himawari_AHI_Band13_Clean_Infrared
//
// WMTS URL pattern:
//   https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png
// Time format: YYYY-MM-DDTHH:MM:SSZ (10-minute intervals, last ~2 hours available)
// TileMatrixSet: GoogleMapsCompatible_Level6 (max zoom 6 -- confirmed from GetCapabilities)
// Safety margin: subtract 2 intervals from latest to avoid "not yet cached" 404s
interface SatelliteLayerProps {
  enabled: boolean;
  isPlaying: boolean;
  frameIdx: number;
  onFrameChange: (idx: number, total: number, timestamp: string) => void;
}

function SatelliteLayer({ enabled, isPlaying, frameIdx, onFrameChange }: SatelliteLayerProps) {
  const map = useMap();
  const tileLayersRef = useRef<L.TileLayer[]>([]);
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timestampsRef = useRef<string[]>([]);
  const enabledRef = useRef(enabled);
  const isPlayingRef = useRef(isPlaying);
  const onFrameChangeRef = useRef(onFrameChange);
  onFrameChangeRef.current = onFrameChange;
  const moveListenerRef = useRef<(() => void) | null>(null);
  const currentLayerRef = useRef<string>("");
  // Per-frame readiness state.
  // "pending" = tiles still loading or retrying
  // "ready"   = enough tiles loaded successfully -- safe to display
  // "bad"     = permanently failed after all retries -- skip in animation
  const frameStateRef = useRef<Array<"pending" | "ready" | "bad">>([]);
  // Per-frame tile error counters: how many tiles failed for each frame index
  const tileErrorCountRef = useRef<number[]>([]);
  // Per-frame tile load counters: how many tiles loaded successfully for each frame index
  const tileLoadCountRef = useRef<number[]>([]);
  // Per-frame total tile counts: how many tiles were requested for each frame index
  const tileTotalCountRef = useRef<number[]>([]);
  // Max retries per tile before marking the frame as bad
  const MAX_TILE_RETRIES = 2;
  // Per-tile retry counters keyed by tile URL
  const tileRetriesRef = useRef<Map<string, number>>(new Map());

  // GOES-East coverage bounds (viewport center check)
  const GOES_EAST_WEST = -179.5;
  const GOES_EAST_EAST = -52.0;
  const GOES_EAST_SOUTH = 12.0;
  const GOES_EAST_NORTH = 50.6;

  // GOES-West coverage bounds (viewport center check)
  const GOES_WEST_WEST = -179.5;
  const GOES_WEST_EAST = -100.0;
  const GOES_WEST_SOUTH = 10.0;
  const GOES_WEST_NORTH = 60.0;

  // GIBS WMTS URL template builder
  // TileMatrixSet must be GoogleMapsCompatible_Level6 (not GoogleMapsCompatible) -- confirmed from GetCapabilities
  const gibsUrl = (layer: string, time: string) =>
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;

  // Determine which GIBS layer to use based on viewport center.
  // GOES_CENTER_MARKER
  const getActiveLayer = (bounds: L.LatLngBounds): { layer: string; intervalMin: number; maxFrames: number } => {
    const center = bounds.getCenter();
    // Pacific: use GOES-West
    if (
      center.lng >= GOES_WEST_WEST && center.lng <= GOES_WEST_EAST &&
      center.lat >= GOES_WEST_SOUTH && center.lat <= GOES_WEST_NORTH
    ) {
      return { layer: "GOES-West_ABI_Band13_Clean_Infrared", intervalMin: 10, maxFrames: 12 };
    }
    // Caribbean / US / Gulf / East Coast: use GOES-East
    if (
      center.lng >= GOES_EAST_WEST && center.lng <= GOES_EAST_EAST &&
      center.lat >= GOES_EAST_SOUTH && center.lat <= GOES_EAST_NORTH
    ) {
      return { layer: "GOES-East_ABI_Band13_Clean_Infrared", intervalMin: 10, maxFrames: 12 };
    }
    // Mediterranean / Asia / other regions: use Himawari (covers 80E-160W, 60S-60N)
    return { layer: "Himawari_AHI_Band13_Clean_Infrared", intervalMin: 10, maxFrames: 12 };
  };

  // Generate the last N timestamps at 10-minute intervals ending at the most
  // recent confirmed-available 10-minute mark. GIBS NRT tiles take ~5-15 min
  // to become available after observation time. Subtract 2 intervals (20 min)
  // as a safety margin to avoid 404s on the most recent not-yet-cached tiles.
  const buildTimestamps = (count: number): string[] => {
    const now = new Date();
    // Round down to the nearest 10-minute mark, then subtract 2 intervals
    const ms10 = 10 * 60 * 1000;
    const latest = new Date(Math.floor(now.getTime() / ms10) * ms10 - 2 * ms10);
    const stamps: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const t = new Date(latest.getTime() - i * ms10);
      const yyyy = t.getUTCFullYear();
      const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(t.getUTCDate()).padStart(2, "0");
      const hh = String(t.getUTCHours()).padStart(2, "0");
      const min = String(t.getUTCMinutes()).padStart(2, "0");
      stamps.push(`${yyyy}-${mm}-${dd}T${hh}:${min}:00Z`);
    }
    return stamps;
  };

  // Show one frame by index, skipping frames that are permanently bad.
  // Searches forward (wrapping) from the requested index until it finds a
  // frame that is not "bad". If ALL frames are bad, shows the requested index
  // anyway (degenerate case -- better than freezing).
  const showFrame = useCallback((idx: number) => {
    const layers = tileLayersRef.current;
    if (layers.length === 0) return;
    const states = frameStateRef.current;
    // Find the nearest non-bad frame starting from idx, searching forward
    let target = Math.max(0, Math.min(idx, layers.length - 1));
    if (states.length === layers.length) {
      let searched = 0;
      while (states[target] === "bad" && searched < layers.length) {
        target = (target + 1) % layers.length;
        searched++;
      }
      // If every frame is bad, fall back to the original clamped index
      if (searched === layers.length) {
        target = Math.max(0, Math.min(idx, layers.length - 1));
      }
    }
    layers.forEach((tl, i) => tl.setOpacity(i === target ? 0.85 : 0));
    idxRef.current = target;
    // Report position within ready-only frames so the counter shows meaningful numbers
    const readyIndices = states.length === layers.length
      ? states.map((s, i) => s !== "bad" ? i : -1).filter(i => i !== -1)
      : layers.map((_, i) => i);
    const posInReady = readyIndices.indexOf(target);
    const displayIdx = posInReady >= 0 ? posInReady : target;
    const displayTotal = readyIndices.length > 0 ? readyIndices.length : layers.length;
    const ts = timestampsRef.current[target] ?? "";
    onFrameChangeRef.current(displayIdx, displayTotal, ts);
  }, []);

  // Remove all tile layers from the map and clear the ref array
  const removeTileLayers = useCallback(() => {
    tileLayersRef.current.forEach(tl => { try { map.removeLayer(tl); } catch { /* ignore */ } });
    tileLayersRef.current = [];
  }, [map]);

  // Full teardown: stop timer, remove all tile layers, detach map listeners
  const teardown = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    removeTileLayers();
    if (moveListenerRef.current) {
      map.off("moveend", moveListenerRef.current);
      map.off("zoomend", moveListenerRef.current);
      moveListenerRef.current = null;
    }
  }, [map, removeTileLayers]);

  // Build and add tile layers for all frames, show the most recent one immediately.
  // Attaches per-tile load/error listeners to track frame readiness and retry failed tiles.
  const loadFrames = useCallback((layer: string, timestamps: string[]) => {
    removeTileLayers();
    tileRetriesRef.current = new Map();
    if (timestamps.length === 0) return;

    // Initialise per-frame state arrays
    frameStateRef.current = timestamps.map(() => "pending" as const);
    tileErrorCountRef.current = timestamps.map(() => 0);
    tileLoadCountRef.current = timestamps.map(() => 0);
    tileTotalCountRef.current = timestamps.map(() => 0);

    const newLayers = timestamps.map((ts, frameIdx) => {
      const tl = L.tileLayer(gibsUrl(layer, ts), {
        opacity: frameIdx === timestamps.length - 1 ? 0.85 : 0,
        attribution: "NASA GIBS",
        tileSize: 256,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // Track how many tiles Leaflet requests for this frame
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tl.on("tileloadstart", () => {
        tileTotalCountRef.current[frameIdx] = (tileTotalCountRef.current[frameIdx] ?? 0) + 1;
      });

      // On successful tile load: increment loaded counter; if all tiles for this
      // frame are now loaded, mark the frame as ready.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tl.on("tileload", () => {
        tileLoadCountRef.current[frameIdx] = (tileLoadCountRef.current[frameIdx] ?? 0) + 1;
        const loaded = tileLoadCountRef.current[frameIdx];
        const errors = tileErrorCountRef.current[frameIdx];
        const total = tileTotalCountRef.current[frameIdx];
        // Mark ready once the loaded tiles account for the non-errored tiles
        // (i.e. all tiles that could load have loaded)
        if (total > 0 && loaded + errors >= total && errors < total) {
          frameStateRef.current[frameIdx] = "ready";
        }
      });

      // On tile error: retry up to MAX_TILE_RETRIES times with a 1.5 s delay.
      // After all retries exhausted, increment the error counter and check
      // whether the frame should be marked bad.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tl.on("tileerror", (e: any) => {
        const tileEl: HTMLImageElement | undefined = e.tile;
        const url: string = tileEl?.src ?? "";
        const retries = tileRetriesRef.current.get(url) ?? 0;
        if (retries < MAX_TILE_RETRIES && tileEl) {
          // Schedule a retry: blank the src briefly then restore it
          tileRetriesRef.current.set(url, retries + 1);
          setTimeout(() => {
            if (tileEl && tileEl.src) {
              const originalSrc = url;
              tileEl.src = "";
              tileEl.src = originalSrc;
            }
          }, 1500 * (retries + 1)); // back-off: 1.5 s, 3 s
        } else {
          // Retries exhausted for this tile -- count it as a permanent error
          tileErrorCountRef.current[frameIdx] = (tileErrorCountRef.current[frameIdx] ?? 0) + 1;
          const loaded = tileLoadCountRef.current[frameIdx];
          const errors = tileErrorCountRef.current[frameIdx];
          const total = tileTotalCountRef.current[frameIdx];
          // Mark the frame bad only if MORE than half the tiles failed.
          // A few 404s on out-of-coverage edge tiles is normal and acceptable;
          // we only want to skip frames where the majority of imagery is missing.
          if (total > 0 && errors > total / 2) {
            frameStateRef.current[frameIdx] = "bad";
          } else if (total > 0 && loaded + errors >= total) {
            // Minority of tiles failed but enough loaded -- still mark ready
            frameStateRef.current[frameIdx] = "ready";
          }
        }
      });

      return tl;
    });

    // Add all layers to the map (invisible ones load in background)
    newLayers.forEach(tl => tl.addTo(map));
    tileLayersRef.current = newLayers;
    // Show the most recent frame immediately
    const startIdx = newLayers.length - 1;
    idxRef.current = startIdx;
    const ts = timestamps[startIdx] ?? "";
    onFrameChangeRef.current(startIdx, newLayers.length, ts);
    // Start playback if playing
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (isPlayingRef.current && newLayers.length > 1) {
      timerRef.current = setInterval(() => {
        showFrame((idxRef.current + 1) % tileLayersRef.current.length);
      }, 900);
    }
  }, [map, removeTileLayers, showFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Main effect: build tile layers when enabled, tear down when disabled
  useEffect(() => {
    if (!enabled) {
      teardown();
      enabledRef.current = false;
      return;
    }
    enabledRef.current = true;

    const init = () => {
      const bounds = map.getBounds();
      const { layer, maxFrames } = getActiveLayer(bounds);
      // If the active layer changed (e.g. user panned from Caribbean to Pacific),
      // rebuild all tile layers with the new GIBS layer name.
      if (layer !== currentLayerRef.current || tileLayersRef.current.length === 0) {
        currentLayerRef.current = layer;
        const timestamps = buildTimestamps(maxFrames);
        timestampsRef.current = timestamps;
        loadFrames(layer, timestamps);
      }
    };
    init();

    // Detach any previously registered listeners before registering new ones
    if (moveListenerRef.current) {
      map.off("moveend", moveListenerRef.current);
      map.off("zoomend", moveListenerRef.current);
    }
    const onMove = () => { if (enabledRef.current) init(); };
    moveListenerRef.current = onMove;
    map.on("moveend", onMove);
    map.on("zoomend", onMove);

    return () => { teardown(); };
  }, [enabled, map, teardown, loadFrames]); // eslint-disable-line react-hooks/exhaustive-deps

  // Respond to play/pause toggle
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!enabled || tileLayersRef.current.length === 0) return;
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        // Always advance through the full layer array; showFrame will skip bad frames
        showFrame((idxRef.current + 1) % tileLayersRef.current.length);
      }, 900);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isPlaying, enabled, showFrame]);

  // Respond to external frame index changes (playback bar scrubbing)
  useEffect(() => {
    if (!enabled || tileLayersRef.current.length === 0) return;
    const clamped = Math.max(0, Math.min(frameIdx, tileLayersRef.current.length - 1));
    if (clamped !== idxRef.current) showFrame(clamped);
  }, [frameIdx, enabled, showFrame]);

  return null;
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
        padding: "4px 7px",
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
  const [outlookMode, setOutlookMode] = useState<OutlookMode>("off");

  // NHC active storms
  const [nhcStorms, setNhcStorms] = useState<NHCStorm[]>([]);

  // NHC GTWO disturbance GeoJSON features
  const [gtwoFeatures, setGtwoFeatures] = useState<GtwoFeature[]>([]);

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

  // Fetch NHC GTWO disturbance GeoJSON on mount and every 3 hours
  useEffect(() => {
    const loadGtwo = async () => {
      try {
        const res = await fetch("/nhc_gtwo.json");
        if (!res.ok) return;
        const data = await res.json();
        setGtwoFeatures((data.features ?? []) as GtwoFeature[]);
      } catch {
        // Silently fail -- GTWO layer is optional
      }
    };
    loadGtwo();
    const interval = setInterval(loadGtwo, 10_800_000); // 3 hours
    return () => clearInterval(interval);
  }, []);

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
        padding: "8px 14px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
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
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.08em" }}>
            TROPICAL &amp; MARINE ADVISORIES
          </div>
          <div style={{ fontSize: "0.9rem", color: "#7B9BB5", marginTop: 2 }}>
            NWS Marine + NHC Tropical Watches, Warnings &amp; Statements
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
              fontSize: "1rem",
              letterSpacing: "0.08em",
              padding: "6px 14px",
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
        padding: "7px 14px",
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
          {/* NHC Tropical Outlook three-state toggle */}
          <div style={{ display: "flex", gap: 0, marginLeft: 8, border: "1px solid #1A2D42", overflow: "hidden" }}>
            {(["off", "2day", "7day"] as OutlookMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setOutlookMode(mode)}
                style={{
                  padding: "4px 8px",
                  background: outlookMode === mode ? "rgba(255,69,0,0.18)" : "rgba(13,21,32,0.85)",
                  color: outlookMode === mode ? "#FF4500" : "#7B9BB5",
                  border: "none",
                  borderLeft: mode !== "off" ? "1px solid #1A2D42" : "none",
                  cursor: "pointer",
                  fontSize: "0.78rem",
                  letterSpacing: "0.06em",
                  fontFamily: "inherit",
                  fontWeight: outlookMode === mode ? 700 : 400,
                  transition: "all 0.15s",
                }}
              >
                {mode === "off" ? "Tropical Outlook OFF" : mode === "2day" ? "2-Day" : "7-Day"}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: isMobile ? 0 : "auto", display: "flex", gap: 4 }}>
            {(["street", "satellite"] as const).map(b => (
              <button key={b} onClick={() => setBasemap(b)} style={{
                padding: "4px 9px", cursor: "pointer", fontSize: "0.78rem", letterSpacing: "0.06em",
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
      <div style={{ flex: "0 0 auto", height: "calc(100dvh - 100px)", display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Leaflet map -- flex:1 always so it fills remaining width after sidebar */}
        <div ref={mapContainerRef} style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <MapContainer
            center={[22.0, -75.0]}
            zoom={5}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
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

            {/* Invalidate Leaflet canvas size when sidebar shows/hides on mobile */}
            <MapInvalidator trigger={showSidebar} />

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

            {/* NHC GTWO disturbance ellipses -- interactive GeoJSON polygons on the map */}
            <GtwoLayer features={gtwoFeatures} mode={outlookMode} />
          </MapContainer>

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

          {/* Card 1 -- NHC 5-Day Forecast Cone (storm-dependent) */}
          <div style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>NHC 5-DAY FORECAST CONE</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>Official Track Forecast · NHC · Active storms only</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>NHC</div>
            </div>
            {nhcStorms.length > 0 ? (
              nhcStorms.map(storm => (
                <div key={storm.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: "0.85rem", color: "#00D4FF", marginBottom: 6, letterSpacing: "0.06em" }}>
                    {storm.name}
                  </div>
                  <img
                    src={`https://www.nhc.noaa.gov/storm_graphics/${storm.id.toUpperCase().slice(0,2)}/${storm.id.toUpperCase()}_5day_cone_no_line_and_wind.png`}
                    alt={`${storm.name} 5-day forecast cone`}
                    style={{ width: "100%", display: "block", background: "#0A0E14", cursor: "pointer" }}
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    onClick={() => setLightboxSrc(`https://www.nhc.noaa.gov/storm_graphics/${storm.id.toUpperCase().slice(0,2)}/${storm.id.toUpperCase()}_5day_cone_no_line_and_wind.png`)}
                  />
                </div>
              ))
            ) : (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", color: "#39FF14", letterSpacing: "0.1em", marginBottom: 8 }}>NO ACTIVE STORMS</div>
                <div style={{ fontSize: "0.9rem", color: "#7B9BB5" }}>The official NHC 5-day forecast cone will appear here when a named storm is active.</div>
              </div>
            )}
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 8, lineHeight: 1.5 }}>
              The cone represents the probable track of the storm center over 5 days. Roughly 60-70% of historical storm centers have remained within the cone. Impacts can extend well outside the cone.
            </div>
          </div>

          {/* Card 2 -- Spaghetti Models (storm-dependent) */}
          <div style={{ background: "#0D1520", border: "1px solid #1A2D42", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.06em" }}>ENSEMBLE TRACK MODELS</div>
                <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 2 }}>Spaghetti Models · NHC · Active storms only</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3A5068", letterSpacing: "0.08em" }}>NHC</div>
            </div>
            {nhcStorms.length > 0 ? (
              nhcStorms.map(storm => (
                <div key={storm.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: "0.85rem", color: "#00D4FF", marginBottom: 6, letterSpacing: "0.06em" }}>
                    {storm.name}
                  </div>
                  <img
                    src={`https://www.nhc.noaa.gov/storm_graphics/${storm.id.toUpperCase().slice(0,2)}/${storm.id.toUpperCase()}_5day_models.png`}
                    alt={`${storm.name} ensemble track models`}
                    style={{ width: "100%", display: "block", background: "#0A0E14", cursor: "pointer" }}
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    onClick={() => setLightboxSrc(`https://www.nhc.noaa.gov/storm_graphics/${storm.id.toUpperCase().slice(0,2)}/${storm.id.toUpperCase()}_5day_models.png`)}
                  />
                </div>
              ))
            ) : (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", color: "#39FF14", letterSpacing: "0.1em", marginBottom: 8 }}>NO ACTIVE STORMS</div>
                <div style={{ fontSize: "0.9rem", color: "#7B9BB5" }}>Ensemble track models will appear here when a named storm is active in the Atlantic or Caribbean.</div>
              </div>
            )}
            <div style={{ fontSize: "0.82rem", color: "#7B9BB5", marginTop: 8, lineHeight: 1.5 }}>
              Each line represents a different computer model's predicted track. A tight cluster means high confidence; a wide spread means uncertainty. Use the cone of uncertainty on the map for the official NHC forecast.
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
              The Madden-Julian Oscillation is a large-scale pulse of enhanced rainfall and thunderstorm activity that originates over the Indian Ocean and travels eastward around the globe, completing one full circuit every 30 to 60 days. It was discovered in the early 1970s by Dr. Roland Madden and Dr. Paul Julian while studying tropical wind and pressure patterns. The MJO cycles through eight geographic phases as it propagates east. When the active, convective phase reaches the Atlantic basin (roughly Phases 8 through 3), it reduces wind shear, increases atmospheric moisture, and enhances upper-level divergence over the Caribbean and Gulf of Mexico -- conditions that strongly favor tropical cyclone formation and intensification. Research shows that Gulf of Mexico and Caribbean hurricanes are four times more likely to occur during an active, Atlantic-favorable MJO phase than during a suppressed phase. Forecasters use the MJO to extend tropical outlooks 2 to 4 weeks beyond what daily weather models can reliably predict.
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
