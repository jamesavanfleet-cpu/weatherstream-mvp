import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Calendar, Plus, Trash2, ArrowLeft, Save, Share2, Anchor, Sun, Cloud, CloudRain, CloudLightning, Snowflake, Eye, X, ChevronDown, ChevronUp } from "lucide-react";
import { PORT_LIST } from "../data/ports";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ============================================================
// Fix Leaflet default marker icon paths (broken in Vite builds)
// ============================================================
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ============================================================
// Types
// ============================================================
interface PortStop {
  id: string;
  portName: string;
  lat: number | null;
  lon: number | null;
  date: string; // YYYY-MM-DD
  isSeaDay: boolean;
}

interface ClimateMonth {
  m: number;
  hiF: number;
  loF: number;
  hum: number;
  rain: number;
  seaFt: number;
  windDir: string;
  windKt: string;
}

interface ClimateData {
  port: string;
  months: ClimateMonth[];
}

interface LiveForecastDay {
  date: string;
  maxF: number;
  minF: number;
  windKt: number;
  windDir: string;
  rainChance: number;
  condition: string;
  waveHeightFt: number | null;
}

interface PopupData {
  portName: string;
  date: string;
  lat: number;
  lon: number;
  isSeaDay: boolean;
  liveData: LiveForecastDay | null;
  climateData: ClimateMonth | null;
  loading: boolean;
}

// ============================================================
// Helpers
// ============================================================
function degToCompass(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}
function msToKt(ms: number): number { return Math.round(ms * 1.94384); }
function cToF(c: number): number { return Math.round(c * 9 / 5 + 32); }

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getMoonPhase(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const knownNew = new Date(2000, 0, 6);
  const diff = (date.getTime() - knownNew.getTime()) / (1000 * 60 * 60 * 24);
  const cycle = 29.53058867;
  const phase = ((diff % cycle) + cycle) % cycle;
  if (phase < 1.85) return "New Moon";
  if (phase < 7.38) return "Waxing Crescent";
  if (phase < 9.22) return "First Quarter";
  if (phase < 14.77) return "Waxing Gibbous";
  if (phase < 16.61) return "Full Moon";
  if (phase < 22.15) return "Waning Gibbous";
  if (phase < 23.99) return "Last Quarter";
  if (phase < 29.53) return "Waning Crescent";
  return "New Moon";
}

function moonEmoji(phase: string): string {
  const map: Record<string, string> = {
    "New Moon": "\uD83C\uDF11",
    "Waxing Crescent": "\uD83C\uDF12",
    "First Quarter": "\uD83C\uDF13",
    "Waxing Gibbous": "\uD83C\uDF14",
    "Full Moon": "\uD83C\uDF15",
    "Waning Gibbous": "\uD83C\uDF16",
    "Last Quarter": "\uD83C\uDF17",
    "Waning Crescent": "\uD83C\uDF18",
  };
  return map[phase] ?? "\uD83C\uDF11";
}

function isWithin16Days(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const diffDays = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 16;
}

function isPastDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  return target < today;
}

function wmoToCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 82) return "Rain Showers";
  if (code <= 84) return "Heavy Showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

function SkyIcon({ condition, className }: { condition: string; className?: string }) {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return <CloudLightning className={className} />;
  if (c.includes("rain") || c.includes("shower") || c.includes("drizzle")) return <CloudRain className={className} />;
  if (c.includes("snow")) return <Snowflake className={className} />;
  if (c.includes("fog")) return <Eye className={className} />;
  if (c.includes("partly") || c.includes("overcast") || c.includes("cloudy")) return <Cloud className={className} />;
  return <Sun className={className} />;
}

function normStr(s: string): string {
  return s.toLowerCase()
    .replace(/\bsaint\b/g, "st")
    .replace(/[.&]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolvePort(q: string): typeof PORT_LIST[0] | null {
  const lower = normStr(q);
  if (!lower) return null;
  const eq = (p: typeof PORT_LIST[0]) =>
    normStr(p.name) === lower || (p.aliases ?? []).some(a => normStr(a) === lower);
  const sw = (p: typeof PORT_LIST[0]) =>
    normStr(p.name).startsWith(lower) || (p.aliases ?? []).some(a => normStr(a).startsWith(lower));
  const inc = (p: typeof PORT_LIST[0]) =>
    normStr(p.name).includes(lower) || (p.aliases ?? []).some(a => normStr(a).includes(lower));
  return PORT_LIST.find(eq) ?? PORT_LIST.find(sw) ?? PORT_LIST.find(inc) ?? null;
}

// ============================================================
// Live forecast fetch for a specific date
// ============================================================
async function fetchLiveForecastForDate(lat: number, lon: number, dateStr: string): Promise<LiveForecastDay | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_probability_max,weathercode` +
      `&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=16`;
    const marineUrl =
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
      `&daily=wave_height_max&length_unit=imperial&timezone=auto&forecast_days=16`;

    const [weatherRes, marineRes] = await Promise.allSettled([
      fetch(url).then(r => r.json()),
      fetch(marineUrl).then(r => r.json()),
    ]);

    const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
    const marine = marineRes.status === "fulfilled" ? marineRes.value : null;
    if (!weather || weather.error) return null;

    const d = weather.daily;
    const idx = (d.time as string[]).indexOf(dateStr);
    if (idx === -1) return null;

    return {
      date: dateStr,
      maxF: cToF(d.temperature_2m_max[idx]),
      minF: cToF(d.temperature_2m_min[idx]),
      windKt: msToKt(d.wind_speed_10m_max[idx]),
      windDir: degToCompass(d.wind_direction_10m_dominant[idx]),
      rainChance: d.precipitation_probability_max[idx] ?? 0,
      condition: wmoToCondition(d.weathercode[idx]),
      waveHeightFt: marine?.daily?.wave_height_max?.[idx] != null
        ? Math.round(marine.daily.wave_height_max[idx] * 10) / 10
        : null,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Port autocomplete input
// ============================================================
function PortAutocomplete({
  value,
  onChange,
  placeholder,
  disabled,
  isSeaDay,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
  isSeaDay?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<typeof PORT_LIST>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value.trim() || value.length < 2) { setSuggestions([]); setOpen(false); return; }
    const lower = normStr(value);
    const matches = PORT_LIST.filter(p =>
      normStr(p.name).includes(lower) || (p.aliases ?? []).some(a => normStr(a).includes(lower))
    ).slice(0, 8);
    setSuggestions(matches);
    setOpen(matches.length > 0);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => {
          if (isSeaDay) return; // let the onChange handler clear Sea Day first
          if (value.length >= 2 && suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={`w-full rounded-lg px-4 py-3 text-base focus:outline-none disabled:opacity-50 ${
          isSeaDay
            ? "bg-blue-500/10 border border-blue-400/20 text-blue-300 placeholder-blue-300/50 focus:border-blue-400/60"
            : "bg-white/10 border border-white/20 text-white placeholder-white/40 focus:border-cyan-400/60"
        }`}
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-white/20 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {suggestions.map(p => (
            <button
              key={p.name}
              className="w-full text-left px-4 py-3 text-white hover:bg-cyan-400/20 text-sm border-b border-white/10 last:border-0"
              onMouseDown={() => { onChange(p.name); setOpen(false); }}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="text-white/40 text-xs ml-2">{p.region}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Forecast popup card
// ============================================================
function ForecastPopup({ data, onClose }: { data: PopupData; onClose: () => void }) {
  const phase = getMoonPhase(data.date);

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-slate-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-white/5 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              {data.isSeaDay
                ? <Anchor className="w-4 h-4 text-blue-400" />
                : <MapPin className="w-4 h-4 text-cyan-400" />}
              <span className="text-white font-bold text-lg">{data.portName}</span>
            </div>
            <div className="text-white/50 text-sm mt-0.5">{formatDateDisplay(data.date)}</div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Moon phase */}
        <div className="px-5 py-2 bg-white/3 border-b border-white/10 flex items-center gap-2">
          <span className="text-lg">{moonEmoji(phase)}</span>
          <span className="text-white/60 text-sm">{phase}</span>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {data.loading && (
            <div className="text-white/50 text-sm text-center py-4">Loading forecast...</div>
          )}

          {!data.loading && isPastDate(data.date) && (
            <div className="text-white/50 text-sm text-center py-4 italic">
              This day has already occurred. No weather forecast available.
            </div>
          )}

          {!data.loading && !isPastDate(data.date) && data.liveData && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white/70 text-xs font-semibold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                Live 16-Day Forecast
              </div>
              <div className="flex items-center gap-3">
                <SkyIcon condition={data.liveData.condition} className="w-8 h-8 text-amber-300" />
                <div>
                  <div className="text-white font-black text-2xl">{data.liveData.maxF}&deg; / {data.liveData.minF}&deg;F</div>
                  <div className="text-white/60 text-sm">{data.liveData.condition}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Wind</div>
                  <div className="text-cyan-300 font-bold">{data.liveData.windKt} kt {data.liveData.windDir}</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Rain Chance</div>
                  <div className="text-blue-300 font-bold">{data.liveData.rainChance}%</div>
                </div>
                {data.liveData.waveHeightFt != null && (
                  <div className="bg-white/5 rounded-lg px-3 py-2 col-span-2">
                    <div className="text-white/50 text-xs">Wave Height</div>
                    <div className="text-orange-300 font-bold">{data.liveData.waveHeightFt} ft</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!data.loading && !isPastDate(data.date) && !data.liveData && data.climateData && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white/70 text-xs font-semibold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Climate Averages (beyond 16-day window)
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Avg High / Low</div>
                  <div className="text-white font-bold">{data.climateData.hiF}&deg; / {data.climateData.loF}&deg;F</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Humidity</div>
                  <div className="text-white font-bold">{data.climateData.hum}%</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Wind</div>
                  <div className="text-cyan-300 font-bold">{data.climateData.windKt} kt {data.climateData.windDir}</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Rain Chance</div>
                  <div className="text-blue-300 font-bold">{data.climateData.rain}%</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2 col-span-2">
                  <div className="text-white/50 text-xs">Avg Seas</div>
                  <div className="text-orange-300 font-bold">{data.climateData.seaFt} ft</div>
                </div>
              </div>
            </div>
          )}

          {!data.loading && !isPastDate(data.date) && !data.liveData && !data.climateData && (
            <div className="text-white/50 text-sm text-center py-4 italic">
              No forecast data available for this location.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main RouteMap page
// ============================================================
export default function RouteMap() {
  const [stops, setStops] = useState<PortStop[]>([
    { id: generateId(), portName: "", lat: null, lon: null, date: "", isSeaDay: false },
    { id: generateId(), portName: "", lat: null, lon: null, date: "", isSeaDay: false },
  ]);
  const [plotted, setPlotted] = useState(false);
  const [popup, setPopup] = useState<PopupData | null>(null);
  const [climateDb, setClimateDb] = useState<Record<string, ClimateData>>({});
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [shareMsg, setShareMsg] = useState("");

  // Load climate database
  useEffect(() => {
    fetch("/climate_database.json")
      .then(r => r.json())
      .then(data => setClimateDb(data))
      .catch(() => {});
  }, []);

  // Load saved itinerary from URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("itinerary");
    if (encoded) {
      try {
        const decoded: PortStop[] = JSON.parse(atob(encoded));
        if (Array.isArray(decoded) && decoded.length > 0) {
          setStops(decoded);
          setPlotted(true);
        }
      } catch {}
    } else {
      // Load from localStorage
      const saved = localStorage.getItem("routeMapItinerary");
      if (saved) {
        try {
          const parsed: PortStop[] = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setStops(parsed);
        } catch {}
      }
    }
  }, []);

  // Initialize map after plotted
  useEffect(() => {
    if (!plotted || !mapContainerRef.current) return;
    if (mapRef.current) return; // already initialized

    const map = L.map(mapContainerRef.current, {
      center: [25, -75],
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        maxZoom: 18,
      }
    ).addTo(map);

    mapRef.current = map;
    renderMapMarkers(map);
  }, [plotted]);

  // Re-render markers when stops change after map is initialized
  useEffect(() => {
    if (mapRef.current && plotted) {
      renderMapMarkers(mapRef.current);
    }
  }, [stops, plotted]);

  const renderMapMarkers = useCallback((map: L.Map) => {
    // Clear old markers and polyline
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }

    const validStops = stops.filter(s => s.lat != null && s.lon != null);
    if (validStops.length === 0) return;

    const latlngs: L.LatLngTuple[] = [];

    validStops.forEach((stop, idx) => {
      const lat = stop.lat!;
      const lon = stop.lon!;
      latlngs.push([lat, lon]);

      const color = stop.isSeaDay ? "#60a5fa" : "#22d3ee";
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          background:${color};
          border:2px solid white;
          border-radius:50%;
          width:28px;height:28px;
          display:flex;align-items:center;justify-content:center;
          font-weight:900;font-size:13px;color:#0f172a;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
          cursor:pointer;
        ">${idx + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lon], { icon })
        .addTo(map)
        .on("click", () => handleMarkerClick(stop));

      markersRef.current.push(marker);
    });

    // Draw route line
    if (latlngs.length > 1) {
      polylineRef.current = L.polyline(latlngs, {
        color: "#22d3ee",
        weight: 2.5,
        opacity: 0.7,
        dashArray: "6 4",
      }).addTo(map);
    }

    // Fit map to bounds
    if (latlngs.length === 1) {
      map.setView(latlngs[0], 7);
    } else {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
    }
  }, [stops]);

  const handleMarkerClick = useCallback(async (stop: PortStop) => {
    if (!stop.lat || !stop.lon || !stop.date) return;

    const month = parseInt(stop.date.split("-")[1], 10);
    const climateEntry = climateDb[stop.portName];
    const climateMonth = climateEntry?.months?.find(m => m.m === month) ?? null;

    setPopup({
      portName: stop.portName,
      date: stop.date,
      lat: stop.lat,
      lon: stop.lon,
      isSeaDay: stop.isSeaDay,
      liveData: null,
      climateData: climateMonth,
      loading: isWithin16Days(stop.date) && !isPastDate(stop.date),
    });

    if (isWithin16Days(stop.date) && !isPastDate(stop.date)) {
      const live = await fetchLiveForecastForDate(stop.lat, stop.lon, stop.date);
      setPopup(prev => prev ? { ...prev, liveData: live, loading: false } : null);
    }
  }, [climateDb]);

  // ---- Stop management ----
  const addStop = () => {
    setStops(prev => [...prev, { id: generateId(), portName: "", lat: null, lon: null, date: "", isSeaDay: false }]);
  };

  const removeStop = (id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
  };

  const updateStop = (id: string, patch: Partial<PortStop>) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const handlePortChange = (id: string, val: string) => {
    const port = resolvePort(val);
    updateStop(id, {
      portName: val,
      lat: port?.lat ?? null,
      lon: port?.lon ?? null,
    });
  };

  const handlePortBlur = (id: string, val: string) => {
    const port = resolvePort(val);
    if (port) updateStop(id, { portName: port.name, lat: port.lat, lon: port.lon });
  };

  const handleDateChange = (id: string, date: string) => {
    updateStop(id, { date });
    // Auto-sort chronologically after a short delay
    setTimeout(() => {
      setStops(prev => {
        const withDates = prev.filter(s => s.date);
        const withoutDates = prev.filter(s => !s.date);
        const sorted = [...withDates].sort((a, b) => a.date.localeCompare(b.date));
        return [...sorted, ...withoutDates];
      });
    }, 300);
  };

  const handlePlot = () => {
    const valid = stops.filter(s => s.portName.trim() && s.date);
    if (valid.length < 1) return;
    // Resolve any unresolved ports
    const resolved = stops.map(s => {
      if (!s.lat && s.portName) {
        const p = resolvePort(s.portName);
        return p ? { ...s, portName: p.name, lat: p.lat, lon: p.lon } : s;
      }
      return s;
    });
    setStops(resolved);
    setPlotted(true);
  };

  const handleBack = () => {
    setPlotted(false);
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    markersRef.current = [];
    polylineRef.current = null;
  };

  const handleSave = () => {
    localStorage.setItem("routeMapItinerary", JSON.stringify(stops));
    setSaveMsg("Saved!");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  const handleShare = () => {
    const encoded = btoa(JSON.stringify(stops));
    const url = `${window.location.origin}${window.location.pathname}?itinerary=${encoded}`;
    if (navigator.share) {
      navigator.share({ title: "My Cruise Route", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareMsg("Link copied!");
        setTimeout(() => setShareMsg(""), 2500);
      });
    }
  };

  // ---- Render: input form ----
  if (!plotted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="max-w-xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <a href="/" className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 no-underline">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </a>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
              <span className="text-white/50 text-xs tracking-widest uppercase font-semibold">Cruise Route Map</span>
            </div>
            <h1 className="text-white font-black text-3xl leading-tight">Plot Your</h1>
            <h1 className="text-cyan-400 font-black text-3xl leading-tight">Cruise Route</h1>
            <p className="text-white/50 text-sm mt-3 max-w-md">
              Enter each port in your itinerary with its date. Dates will sort chronologically automatically.
              Tap a port marker on the map to see the forecast.
            </p>
          </div>

          {/* Stops */}
          <div className="space-y-4">
            {stops.map((stop, idx) => (
              <div key={stop.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                {/* Stop header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-black text-sm">
                      {idx + 1}
                    </span>
                    <span className="text-white/70 text-sm font-semibold">
                      {idx === 0 ? "Departure Port" : `Destination ${idx}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Sea day toggle */}
                    <button
                      onClick={() => updateStop(stop.id, { isSeaDay: !stop.isSeaDay, portName: stop.isSeaDay ? "" : "Sea Day", lat: null, lon: null })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        stop.isSeaDay
                          ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                          : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                      }`}
                    >
                      <Anchor className="w-3 h-3" />
                      Sea Day
                    </button>
                    {stops.length > 1 && (
                      <button onClick={() => removeStop(stop.id)} className="text-white/30 hover:text-red-400 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Port input -- always editable; typing while Sea Day is active clears it */}
                <PortAutocomplete
                  value={stop.isSeaDay ? "Sea Day" : stop.portName}
                  onChange={val => {
                    // If Sea Day is active and user starts typing something other than "Sea Day", clear it
                    if (stop.isSeaDay) {
                      const typed = val.replace(/^Sea Day/i, "").trim();
                      if (typed.length > 0) {
                        updateStop(stop.id, { isSeaDay: false, portName: typed, lat: null, lon: null });
                      } else if (val === "") {
                        updateStop(stop.id, { isSeaDay: false, portName: "", lat: null, lon: null });
                      }
                    } else {
                      handlePortChange(stop.id, val);
                    }
                  }}
                  placeholder={stop.isSeaDay ? "Sea Day -- type to override" : "Type a port name..."}
                  isSeaDay={stop.isSeaDay}
                />

                {/* Date input -- blurs on change to dismiss native calendar picker */}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-white/40 flex-shrink-0" />
                  <input
                    type="date"
                    value={stop.date}
                    onChange={e => {
                      handleDateChange(stop.id, e.target.value);
                      (e.target as HTMLInputElement).blur();
                    }}
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-base focus:outline-none focus:border-cyan-400/60"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Add stop button */}
          <button
            onClick={addStop}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-colors text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Add Another Port
          </button>

          {/* Plot button */}
          <button
            onClick={handlePlot}
            disabled={!stops.some(s => s.portName.trim() && s.date)}
            className="mt-6 w-full py-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-black text-lg tracking-wide transition-colors shadow-lg shadow-cyan-500/20"
          >
            Plot My Cruise Route
          </button>
        </div>
      </div>
    );
  }

  // ---- Render: map view ----
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-white/10 backdrop-blur-sm z-10 flex-shrink-0">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Edit Route
        </button>
        <span className="text-white font-bold text-sm">
          {stops.filter(s => s.portName).length} stops
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saveMsg || "Save"}
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold border border-cyan-400/30 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            {shareMsg || "Share"}
          </button>
        </div>
      </div>

      {/* Map */}
      <div ref={mapContainerRef} className="flex-1" style={{ minHeight: "60vh" }} />

      {/* Itinerary strip below map */}
      <div className="bg-slate-900/95 border-t border-white/10 px-4 py-3 flex-shrink-0">
        <div className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Tap a marker to see the forecast</div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {stops.filter(s => s.portName).map((stop, idx) => (
            <button
              key={stop.id}
              onClick={() => handleMarkerClick(stop)}
              className="flex-shrink-0 flex flex-col items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 min-w-[90px] transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-black text-xs">
                {idx + 1}
              </span>
              {stop.isSeaDay
                ? <Anchor className="w-3.5 h-3.5 text-blue-400" />
                : <MapPin className="w-3.5 h-3.5 text-cyan-400" />}
              <span className="text-white text-xs font-semibold text-center leading-tight max-w-[80px] truncate">{stop.portName}</span>
              {stop.date && (
                <span className="text-white/40 text-[10px] text-center">
                  {formatDateDisplay(stop.date)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Forecast popup */}
      {popup && <ForecastPopup data={popup} onClose={() => setPopup(null)} />}
    </div>
  );
}
