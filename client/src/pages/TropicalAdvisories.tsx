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

// ── Animated radar layer ──────────────────────────────────────────────────────
function RadarLayer({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const layersRef = useRef<L.TileLayer[]>([]);
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      layersRef.current.forEach(l => { try { map.removeLayer(l); } catch { /* ignore */ } });
      layersRef.current = [];
      if (timerRef.current) clearInterval(timerRef.current);
      loadedRef.current = false;
      return;
    }
    if (loadedRef.current) return;
    (async () => {
      try {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
        const data = await res.json();
        const paths: string[] = [
          ...(data.radar?.past ?? []).map((f: { path: string }) => f.path),
          ...(data.radar?.nowcast ?? []).slice(0, 2).map((f: { path: string }) => f.path),
        ].slice(-8);
        if (paths.length === 0) return;
        layersRef.current = paths.map(path =>
          L.tileLayer(
            `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`,
            { opacity: 0.7, zIndex: 300 }
          )
        );
        idxRef.current = layersRef.current.length - 1;
        layersRef.current[idxRef.current].addTo(map);
        loadedRef.current = true;
        timerRef.current = setInterval(() => {
          const prev = idxRef.current;
          const next = (prev + 1) % layersRef.current.length;
          layersRef.current[next].addTo(map);
          try { map.removeLayer(layersRef.current[prev]); } catch { /* ignore */ }
          idxRef.current = next;
        }, 600);
      } catch {
        // Silently fail -- radar is optional
      }
    })();
    return () => {
      layersRef.current.forEach(l => { try { map.removeLayer(l); } catch { /* ignore */ } });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, map]);
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
  const [showRadar, setShowRadar] = useState(false);
  const [showSatellite, setShowSatellite] = useState(false);
  const [showGulfStream, setShowGulfStream] = useState(false);
  const [showZoneForecasts, setShowZoneForecasts] = useState(false);
  const [basemap, setBasemap] = useState<"street" | "satellite">("street");

  // NHC tropical outlook toggle: off | 2day | 7day
  const [outlookMode, setOutlookMode] = useState<OutlookMode>("off");

  // NHC active storms
  const [nhcStorms, setNhcStorms] = useState<NHCStorm[]>([]);
  const [outlookImgKey, setOutlookImgKey] = useState(Date.now());

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
      setOutlookImgKey(Date.now()); // force NHC image refresh
    }, 1_800_000);
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
  const [showSidebar, setShowSidebar] = useState(true);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
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
        overflowX: "auto",
      }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: "max-content" }}>
          <LayerBtn label="Active Alerts" active={showAlerts} color="#FF8C00" onClick={() => setShowAlerts(v => !v)} />
          <LayerBtn label="Weather Radar" active={showRadar} onClick={() => setShowRadar(v => !v)} />
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
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
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
        {/* Leaflet map */}
        <div style={{ flex: 1, position: "relative" }}>
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
              />
            )}

            {/* Satellite -- GOES IR via Iowa State Mesonet */}
            {showSatellite && (
              <WMSTileLayer
                url="https://mesonet.agron.iastate.edu/cgi-bin/wms/goes/conus_ir.cgi"
                params={{
                  layers: "goes_conus_ir",
                  format: "image/png",
                  transparent: true,
                  version: "1.1.1",
                }}
                opacity={0.75}
                zIndex={240}
              />
            )}

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
              />
            )}

            {/* Animated radar */}
            <RadarLayer enabled={showRadar} />

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
          </MapContainer>

          {/* NHC Tropical Outlook image panel -- overlays bottom of map when active */}
          {outlookMode !== "off" && (
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: "rgba(13,21,32,0.92)",
              borderTop: "1px solid #FF4500",
              zIndex: 800,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "8px 12px",
              maxHeight: "55%",
              overflowY: "auto",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 6 }}>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#FF4500", letterSpacing: "0.1em" }}>
                  NHC {outlookMode === "2day" ? "2-Day" : "7-Day"} Graphical Tropical Weather Outlook
                  {nhcStorms.length > 0 && (
                    <span style={{ marginLeft: 12, fontSize: "0.9rem", color: "#FFD700" }}>
                      {nhcStorms.length} active storm{nhcStorms.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setOutlookMode("off")}
                  style={{ background: "none", border: "1px solid #1A2D42", color: "#7B9BB5", cursor: "pointer", fontSize: "0.9rem", fontFamily: "inherit", padding: "3px 10px" }}
                >
                  CLOSE
                </button>
              </div>
              {/* Atlantic basin */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.85rem", color: "#7B9BB5", marginBottom: 4 }}>ATLANTIC</div>
                  <img
                    key={`atl-${outlookMode}-${outlookImgKey}`}
                    src={`https://www.nhc.noaa.gov/xgtwo/two_atl_${outlookMode === "2day" ? "2d0" : "7d0"}.png?t=${outlookImgKey}`}
                    alt={`NHC Atlantic ${outlookMode} Tropical Weather Outlook`}
                    style={{ maxWidth: "100%", maxHeight: 320, border: "1px solid #1A2D42", display: "block" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.85rem", color: "#7B9BB5", marginBottom: 4 }}>EASTERN PACIFIC</div>
                  <img
                    key={`epac-${outlookMode}-${outlookImgKey}`}
                    src={`https://www.nhc.noaa.gov/xgtwo/two_pac_${outlookMode === "2day" ? "2d0" : "7d0"}.png?t=${outlookImgKey}`}
                    alt={`NHC Eastern Pacific ${outlookMode} Tropical Weather Outlook`}
                    style={{ maxWidth: "100%", maxHeight: 320, border: "1px solid #1A2D42", display: "block" }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              </div>
              <div style={{ fontSize: "0.8rem", color: "#3A5068", marginTop: 6, textAlign: "center" }}>
                Source: NOAA National Hurricane Center &bull; nhc.noaa.gov &bull; Updates with every NHC advisory issuance
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
