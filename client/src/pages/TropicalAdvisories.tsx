// TropicalAdvisories.tsx
// Full-screen Leaflet map for mycruisingweather.com showing:
//   - NWS marine advisories (watches, warnings, statements) for Atlantic, Caribbean, Gulf waters
//   - NHC tropical advisories (Tropical Storm Watch/Warning, Hurricane Watch/Warning, etc.)
//   - Toggleable overlay layers: Radar, Satellite, Gulf Stream/SST, Zone Forecasts
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

// ── Animated global satellite layer (NOAA nowCOAST GMGSI global mosaic) ─────
// Single-canvas architecture: ONE <canvas> element is positioned over the map.
// All 6 frames are pre-decoded into ImageBitmap objects off-screen.
// Frame advance = ctx.clearRect + ctx.drawImage -- a single GPU blit.
// Zero DOM element swapping, zero Leaflet opacity timing races, zero flash.
interface SatelliteLayerProps {
  enabled: boolean;
  isPlaying: boolean;
  frameIdx: number;
  onFrameChange: (idx: number, total: number, timestamp: string) => void;
}

function SatelliteLayer({ enabled, isPlaying, frameIdx, onFrameChange }: SatelliteLayerProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapsRef = useRef<ImageBitmap[]>([]);
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timestampsRef = useRef<string[]>([]);
  const loadedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const isPlayingRef = useRef(isPlaying);
  const onFrameChangeRef = useRef(onFrameChange);
  onFrameChangeRef.current = onFrameChange;
  const moveListenerRef = useRef<(() => void) | null>(null);
  // Stored so it can be detached on teardown
  const clearListenerRef = useRef<(() => void) | null>(null);
  // Tracks which WMS layer is currently active so we know when to regenerate timestamps
  const currentLayerRef = useRef<string>("");
  const CLOUD_THRESHOLD = 35;

  // GOES-East/West coverage bounds (conservative thresholds to avoid boundary edge cases)
  const GOES_WEST = -179.5;
  const GOES_EAST = -52.0;
  const GOES_SOUTH = 12.0;
  const GOES_NORTH = 50.6;

  // Determine which satellite layer to use based on current map viewport.
  // Uses the viewport CENTER to decide: if the center is within GOES-East coverage,
  // use the high-frequency GOES layer (5-min, 24 frames). This ensures the Caribbean,
  // Gulf, and US East/West Coast views always use GOES even when the viewport extends
  // south of 12N or east of 52W. Switches to global mosaic (60-min, 6 frames) only
  // when the user has panned to a region outside GOES coverage (Mediterranean, Pacific, etc.).
  // GOES_CENTER_MARKER
  const getActiveLayer = (bounds: L.LatLngBounds): { layer: string; intervalMin: number; maxFrames: number } => {
    const center = bounds.getCenter();
    if (center.lng >= GOES_WEST && center.lng <= GOES_EAST && center.lat >= GOES_SOUTH && center.lat <= GOES_NORTH) {
      return { layer: "goes_longwave_imagery", intervalMin: 5, maxFrames: 24 };
    }
    return { layer: "global_longwave_imagery_mosaic", intervalMin: 60, maxFrames: 6 };
  };

  // Immediately blank the canvas -- called on movestart/zoomstart so stale
  // imagery disappears the instant the user begins interacting with the map
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Draw one bitmap onto the canvas
  const drawFrame = useCallback((idx: number) => {
    const canvas = canvasRef.current;
    const bitmaps = bitmapsRef.current;
    if (!canvas || bitmaps.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bm = bitmaps[idx];
    if (bm) ctx.drawImage(bm, 0, 0, canvas.width, canvas.height);
    idxRef.current = idx;
    const ts = timestampsRef.current[idx] ?? "";
    onFrameChangeRef.current(idx, bitmaps.length, ts);
  }, []);

  // Full teardown: stop timer, hide canvas, detach all map listeners
  const teardown = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = "none";
    }
    if (moveListenerRef.current) {
      map.off("moveend", moveListenerRef.current);
      map.off("zoomend", moveListenerRef.current);
      moveListenerRef.current = null;
    }
    if (clearListenerRef.current) {
      map.off("movestart", clearListenerRef.current);
      map.off("zoomstart", clearListenerRef.current);
      clearListenerRef.current = null;
    }
  }, [map]);

  // Build WMS GetMap URL
  const buildWmsUrl = (bounds: L.LatLngBounds, ts: string, size: { x: number; y: number }, layerName: string) => {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const minLat = Math.max(sw.lat, -85);
    const maxLat = Math.min(ne.lat, 85);
    const minLng = Math.max(sw.lng, -180);
    const maxLng = Math.min(ne.lng, 180);
    const w = Math.max(256, Math.min(1024, Math.round(size.x)));
    const h = Math.max(256, Math.min(1024, Math.round(size.y)));
    let url = `https://nowcoast.noaa.gov/geoserver/satellite/wms`
      + `?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap`
      + `&LAYERS=${layerName}`
      + `&CRS=EPSG:4326&BBOX=${minLat},${minLng},${maxLat},${maxLng}`
      + `&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/png&TRANSPARENT=TRUE`;
    if (ts) url += `&TIME=${encodeURIComponent(ts)}`;
    return url;
  };

  // Fetch one WMS frame, apply cloud threshold, return ImageBitmap
  const fetchBitmap = (wmsUrl: string): Promise<ImageBitmap> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const offscreen = document.createElement("canvas");
          offscreen.width = img.naturalWidth || img.width;
          offscreen.height = img.naturalHeight || img.height;
          const ctx = offscreen.getContext("2d");
          if (!ctx) { reject(new Error("no ctx")); return; }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (brightness < CLOUD_THRESHOLD) {
              data[i + 3] = 0;
            } else {
              data[i + 3] = Math.min(255, Math.round(((brightness - CLOUD_THRESHOLD) / (255 - CLOUD_THRESHOLD)) * 220));
            }
          }
          ctx.putImageData(imageData, 0, 0);
          createImageBitmap(offscreen).then(resolve).catch(reject);
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("fetch failed"));
      img.src = wmsUrl;
    });
  };

  // Load all frames off-screen, then swap bitmaps and redraw in one step
  const loadFrames = useCallback(async () => {
    if (!enabledRef.current || timestampsRef.current.length === 0) return;
    const bounds = map.getBounds();
    const size = map.getSize();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      // Download + process ALL frames completely off-screen before touching the canvas
      const newBitmaps = await Promise.all(
        timestampsRef.current.map(ts => fetchBitmap(buildWmsUrl(bounds, ts, size, currentLayerRef.current)))
      );
      if (!enabledRef.current) return;
      // Close old bitmaps to free GPU memory
      bitmapsRef.current.forEach(bm => { try { bm.close(); } catch { /* ignore */ } });
      bitmapsRef.current = newBitmaps;
      // Canvas is already sized to 100% of overlayPane -- just show it and draw
      const canvas = canvasRef.current;
      if (canvas) canvas.style.display = "block";
      const startIdx = newBitmaps.length - 1;
      drawFrame(startIdx);
      if (isPlayingRef.current && newBitmaps.length > 1) {
        timerRef.current = setInterval(() => {
          drawFrame((idxRef.current + 1) % bitmapsRef.current.length);
        }, 900);
      }
    } catch {
      // Silently fail
    }
  }, [map, drawFrame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create and attach the canvas element once on mount.
  // Appended to overlayPane so it moves and scales with the map automatically.
  useEffect(() => {
    const overlayPane = map.getPanes().overlayPane;
    const canvas = document.createElement("canvas");
    canvas.style.display = "none";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "401";
    overlayPane.appendChild(canvas);
    canvasRef.current = canvas;
    // Keep canvas pixel dimensions in sync with the map container size on resize.
    // We measure map.getContainer() -- NOT overlayPane -- because the overlay pane
    // has no intrinsic size and getBoundingClientRect() on it always returns 0x0.
    const onResize = () => {
      const r = map.getContainer().getBoundingClientRect();
      canvas.width = Math.round(r.width);
      canvas.height = Math.round(r.height);
    };
    onResize();
    map.on("resize", onResize);
    return () => {
      map.off("resize", onResize);
      try { overlayPane.removeChild(canvas); } catch { /* ignore */ }
      canvasRef.current = null;
      bitmapsRef.current.forEach(bm => { try { bm.close(); } catch { /* ignore */ } });
      bitmapsRef.current = [];
    };
  }, [map]);

  // Main effect: fetch timestamps and load frames when enabled
  useEffect(() => {
    if (!enabled) {
      teardown();
      enabledRef.current = false;
      loadedRef.current = false;
      return;
    }
    enabledRef.current = true;

    const init = async () => {
      // Determine which layer is appropriate for the current viewport (Option C).
      // If the viewport is fully within GOES coverage, use the high-frequency GOES layer.
      // Otherwise fall back to the global mosaic.
      const { layer } = getActiveLayer(map.getBounds());
      // If the active layer has changed since the last load, force a timestamp refresh.
      if (layer !== currentLayerRef.current) {
        currentLayerRef.current = layer;
        loadedRef.current = false;
      }
      if (!loadedRef.current) {
        // Fetch real available timestamps directly from NOAA nowCOAST WMS GetCapabilities.
        // This is the only reliable source -- it returns exactly the timestamps NOAA has
        // cached right now, with no dependency on a pre-generated JSON file or cron job.
        // SATELLITE_GETCAPS_MARKER
        try {
          const capsUrl = "https://nowcoast.noaa.gov/geoserver/satellite/wms"
            + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities";
          const resp = await fetch(capsUrl);
          const xmlText = await resp.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(xmlText, "text/xml");
          // Walk all <Layer> elements to find the one matching our layer name,
          // then extract the comma-separated TIME dimension values.
          // Use getElementsByTagNameNS("*", ...) so the query matches regardless of
          // whether the XML declares a default namespace (xmlns="http://www.opengis.net/wms").
          // Plain getElementsByTagName("Layer") returns zero elements when a default
          // namespace is present in browsers that apply namespace rules strictly.
          // SATELLITE_GETCAPS_NS_FIX_MARKER
          const layerEls = Array.from(doc.getElementsByTagNameNS("*", "Layer"));
          let times: string[] = [];
          for (const el of layerEls) {
            const nameEl = el.getElementsByTagNameNS("*", "Name")[0];
            if (nameEl && nameEl.textContent === layer) {
              const dimEls = Array.from(el.getElementsByTagNameNS("*", "Dimension"));
              for (const dim of dimEls) {
                if (dim.getAttribute("name") === "time" && dim.textContent) {
                  times = dim.textContent.split(",").map(t => t.trim()).filter(Boolean);
                  break;
                }
              }
              break;
            }
          }
          // Use the most recent maxFrames timestamps so the loop stays manageable.
          const { maxFrames } = getActiveLayer(map.getBounds());
          timestampsRef.current = times.slice(-maxFrames);
        } catch {
          timestampsRef.current = [];
        }
        loadedRef.current = true;
      }
      await loadFrames();
    };
    init();

    // Detach any previously registered listeners before registering new ones.
    // This prevents duplicate listeners accumulating across enable/disable cycles.
    if (moveListenerRef.current) {
      map.off("moveend", moveListenerRef.current);
      map.off("zoomend", moveListenerRef.current);
    }
    if (clearListenerRef.current) {
      map.off("movestart", clearListenerRef.current);
      map.off("zoomstart", clearListenerRef.current);
    }
    // onMove calls init (not loadFrames directly) so that crossing the GOES
    // coverage boundary triggers a layer switch and timestamp regeneration.
    const onMove = () => { if (enabledRef.current) init(); };
    moveListenerRef.current = onMove;
    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    // Clear canvas immediately when user starts panning/zooming so stale
    // imagery does not sit misaligned while new frames download
    const onClear = () => { if (enabledRef.current) clearCanvas(); };
    clearListenerRef.current = onClear;
    map.on("movestart", onClear);
    map.on("zoomstart", onClear);

    return () => {
      teardown();
      loadedRef.current = false;
    };
  }, [enabled, map, teardown, loadFrames, clearCanvas]);

  // Respond to play/pause toggle
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!enabled || bitmapsRef.current.length === 0) return;
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        drawFrame((idxRef.current + 1) % bitmapsRef.current.length);
      }, 900);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isPlaying, enabled, drawFrame]);

  // Respond to external frame index changes
  useEffect(() => {
    if (!enabled || bitmapsRef.current.length === 0) return;
    const clamped = Math.max(0, Math.min(frameIdx, bitmapsRef.current.length - 1));
    if (clamped !== idxRef.current) drawFrame(clamped);
  }, [frameIdx, enabled, drawFrame]);

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
  const [showGulfStream, setShowGulfStream] = useState(false);
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

  // REFRESH button visual feedback
  const [refreshing, setRefreshing] = useState(false);

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
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "#0A0E14",
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      overflow: "hidden",
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
          <LayerBtn label="Gulf Stream / SST" active={showGulfStream} color="#39FF14" onClick={() => setShowGulfStream(v => !v)} />
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
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
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

            {/* Zone Forecasts -- NWS marine zone boundaries */}
            {showZoneForecasts && (
              <WMSTileLayer
                url="https://opengeo.ncep.noaa.gov/geoserver/ows"
                params={{
                  layers: "marine_zones",
                  format: "image/png",
                  transparent: true,
                  version: "1.3.0",
                }}
                opacity={0.55}
                zIndex={210}
                maxNativeZoom={10}
              />
            )}

            {/* Gulf Stream / SST -- NOAA CoastWatch ERDDAP MUR SST */}
            {showGulfStream && (
              <WMSTileLayer
                url="https://coastwatch.pfeg.noaa.gov/erddap/wms/jplMURSST41/request"
                params={{
                  layers: "jplMURSST41:analysed_sst",
                  format: "image/png",
                  transparent: true,
                  version: "1.3.0",
                  styles: "",
                } as Parameters<typeof WMSTileLayer>[0]["params"]}
                opacity={0.7}
                zIndex={220}
                maxNativeZoom={13}
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
    </div>
  );
}
