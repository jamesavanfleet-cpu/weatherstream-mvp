import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Calendar, Plus, Trash2, ArrowLeft, Save, Share2, Anchor, Sun, Cloud, CloudRain, CloudLightning, Snowflake, Eye, X, ChevronDown, ChevronUp, Thermometer, Droplets, Wind, Waves } from "lucide-react";
import { PORT_LIST } from "../data/ports";
import { maritimeRoute } from "../utils/maritimeRouting";
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
  sunrise: string | null;
  sunset: string | null;
  moonrise: string | null;
  moonset: string | null;
  rainMorning: number | null;
  rainAfternoon: number | null;
  rainEvening: number | null;
  rainOvernight: number | null;
  hourly: { time: string; tempF: number; windKt: number; rainChance: number; condition: string }[];
  sevenDay: { date: string; maxF: number; minF: number; condition: string; rainChance: number; windKt: number; windDir: string }[];
  dewF: number | null;
  humidity: number | null;
  gustKt: number | null;
  swellFt: number | null;
  swellDir: string | null;
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
  // For combined markers: all stops at this location
  allStops?: PortStop[];
  activeStopIdx?: number;
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
    const dailyUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,` +
      `precipitation_probability_max,weathercode,sunrise,sunset,moonrise,moonset` +
      `&hourly=temperature_2m,wind_speed_10m,precipitation_probability,weathercode,dewpoint_2m,relativehumidity_2m,windgusts_10m` +
      `&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=16`;
    // Marine API -- try exact coordinates first, fall back to slightly offshore if it errors
    const marineUrl =
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
      `&daily=wave_height_max,swell_wave_height_max,swell_wave_direction_dominant` +
      `&hourly=wave_height` +
      `&length_unit=imperial&timezone=auto&forecast_days=16`;
    // Offshore fallback: nudge 0.3 degrees offshore for near-coast ports where marine API fails
    const marineOffshoreUrl =
      `https://marine-api.open-meteo.com/v1/marine?latitude=${(lat - 0.3).toFixed(4)}&longitude=${(lon - 0.3).toFixed(4)}` +
      `&daily=wave_height_max,swell_wave_height_max,swell_wave_direction_dominant` +
      `&hourly=wave_height` +
      `&length_unit=imperial&timezone=auto&forecast_days=16`;

    const [weatherRes, marineRes] = await Promise.allSettled([
      fetch(dailyUrl).then(r => r.json()),
      fetch(marineUrl).then(r => r.json()).then(async (data) => {
        // If marine API returns an error for this coordinate, try offshore fallback
        if (data?.error) {
          const fallback = await fetch(marineOffshoreUrl).then(r => r.json()).catch(() => null);
          return fallback?.error ? null : fallback;
        }
        return data;
      }).catch(() => null),
    ]);

    const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
    const marine = marineRes.status === "fulfilled" ? marineRes.value : null;
    if (!weather || weather.error) return null;

    const d = weather.daily;
    const h = weather.hourly;
    const dayIdx = (d.time as string[]).indexOf(dateStr);
    if (dayIdx === -1) return null;

    // Parse sunrise/sunset to local time string
    function fmtTime(iso: string | null): string | null {
      if (!iso) return null;
      const dt = new Date(iso);
      return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }

    // Hourly data for the target date (24 hours)
    const hourlyTimes: string[] = h.time ?? [];
    const dayHours = hourlyTimes
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.startsWith(dateStr))
      .map(({ t, i }) => ({
        time: new Date(t).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
        tempF: cToF(h.temperature_2m[i]),
        windKt: msToKt(h.wind_speed_10m[i]),
        rainChance: h.precipitation_probability[i] ?? 0,
        condition: wmoToCondition(h.weathercode[i]),
      }));

    // Rain chance by time of day (morning 6-12, afternoon 12-18, evening 18-22, overnight 22-6)
    function avgRain(startH: number, endH: number): number | null {
      const vals = hourlyTimes
        .map((t, i) => ({ hour: new Date(t).getHours(), val: h.precipitation_probability[i] ?? 0, t }))
        .filter(({ t, hour }) => t.startsWith(dateStr) && hour >= startH && hour < endH)
        .map(({ val }) => val);
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    // 5-day forecast centered on the target date
    const allDates: string[] = d.time ?? [];
    const centerIdx = dayIdx;
    const startIdx = Math.max(0, centerIdx - 2);
    const endIdx = Math.min(allDates.length - 1, centerIdx + 2);
    const sevenDay = [];
    for (let i = startIdx; i <= endIdx; i++) {
      sevenDay.push({
        date: allDates[i],
        maxF: cToF(d.temperature_2m_max[i]),
        minF: cToF(d.temperature_2m_min[i]),
        condition: wmoToCondition(d.weathercode[i]),
        rainChance: d.precipitation_probability_max[i] ?? 0,
        windKt: msToKt(d.wind_speed_10m_max[i]),
        windDir: degToCompass(d.wind_direction_10m_dominant[i]),
      });
    }

    // Dew point and humidity for the noon hour of the target date
    const noonIdx = hourlyTimes.findIndex(t => t === `${dateStr}T12:00`);
    const dewF = noonIdx >= 0 ? cToF(h.dewpoint_2m[noonIdx]) : null;
    const humidity = noonIdx >= 0 ? Math.round(h.relativehumidity_2m[noonIdx]) : null;
    const gustKt = noonIdx >= 0 ? msToKt(h.windgusts_10m[noonIdx]) : null;

    return {
      date: dateStr,
      maxF: cToF(d.temperature_2m_max[dayIdx]),
      minF: cToF(d.temperature_2m_min[dayIdx]),
      windKt: msToKt(d.wind_speed_10m_max[dayIdx]),
      windDir: degToCompass(d.wind_direction_10m_dominant[dayIdx]),
      rainChance: d.precipitation_probability_max[dayIdx] ?? 0,
      condition: wmoToCondition(d.weathercode[dayIdx]),
      waveHeightFt: marine?.daily?.wave_height_max?.[dayIdx] != null
        ? Math.round(marine.daily.wave_height_max[dayIdx] * 10) / 10
        : null,
      sunrise: fmtTime(d.sunrise?.[dayIdx] ?? null),
      sunset: fmtTime(d.sunset?.[dayIdx] ?? null),
      moonrise: fmtTime(d.moonrise?.[dayIdx] ?? null),
      moonset: fmtTime(d.moonset?.[dayIdx] ?? null),
      rainMorning: avgRain(6, 12),
      rainAfternoon: avgRain(12, 18),
      rainEvening: avgRain(18, 22),
      rainOvernight: avgRain(22, 30),
      hourly: dayHours,
      sevenDay,
      dewF,
      humidity,
      gustKt,
      swellFt: marine?.daily?.swell_wave_height_max?.[dayIdx] != null
        ? Math.round(marine.daily.swell_wave_height_max[dayIdx] * 10) / 10
        : null,
      swellDir: marine?.daily?.swell_wave_direction_dominant?.[dayIdx] != null
        ? degToCompass(marine.daily.swell_wave_direction_dominant[dayIdx])
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
        autoComplete="new-password"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-form-type="other"
        data-lpignore="true"
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
function ForecastPopup({ data, onClose, onSwitchStop }: { data: PopupData; onClose: () => void; onSwitchStop?: (stop: PortStop, idx: number) => void }) {
  const phase = getMoonPhase(data.date);
  const [showHourly, setShowHourly] = useState(false);
  const [showFiveDay, setShowFiveDay] = useState(false);
  const [isMetric, setIsMetric] = useState(false);
  const [sunMoon, setSunMoon] = useState<{ sunrise: string; sunset: string; moonrise: string; moonset: string } | null>(null);

  // Always fetch sun/moon times independently from sunrise-sunset.org for any date
  useEffect(() => {
    if (!data.lat || !data.lon || !data.date || isPastDate(data.date)) return;
    setSunMoon(null);
    const url = `https://api.sunrise-sunset.org/json?lat=${data.lat}&lng=${data.lon}&date=${data.date}&formatted=0`;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (json.status !== "OK") return;
        const r = json.results;
        function fmtUtc(iso: string): string {
          const d = new Date(iso);
          return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
        }
        setSunMoon({
          sunrise: fmtUtc(r.sunrise),
          sunset: fmtUtc(r.sunset),
          moonrise: r.moonrise ? fmtUtc(r.moonrise) : "",
          moonset: r.moonset ? fmtUtc(r.moonset) : "",
        });
      })
      .catch(() => {});
  }, [data.lat, data.lon, data.date]);

  const live = data.liveData;

  // Unit conversion helpers
  function dispTemp(f: number): string {
    return isMetric ? Math.round((f - 32) * 5 / 9) + "\u00b0C" : f + "\u00b0F";
  }
  function dispWind(kt: number): string {
    return isMetric ? kt + " kt" : Math.round(kt * 1.15078) + " mph";
  }
  function dispHeight(ft: number): string {
    return isMetric ? (ft * 0.3048).toFixed(1) + " m" : ft + " ft";
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-2 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-slate-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-white/5 border-b border-white/10 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              {data.isSeaDay
                ? <Anchor className="w-4 h-4 text-blue-400" />
                : <MapPin className="w-4 h-4 text-cyan-400" />}
              <span className="text-white font-bold text-lg">{data.portName}</span>
            </div>
            <div className="text-white/50 text-sm mt-0.5">{formatDateDisplay(data.date)}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-white/20 text-xs font-semibold">
              <button
                onClick={() => setIsMetric(false)}
                className={`px-2.5 py-1.5 transition-colors ${!isMetric ? "bg-cyan-500 text-slate-900" : "bg-white/5 text-white/50 hover:text-white/80"}`}
              >
                US
              </button>
              <button
                onClick={() => setIsMetric(true)}
                className={`px-2.5 py-1.5 transition-colors ${isMetric ? "bg-cyan-500 text-slate-900" : "bg-white/5 text-white/50 hover:text-white/80"}`}
              >
                Metric
              </button>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Tab toggle for combined markers (same port, multiple dates) */}
        {data.allStops && data.allStops.length > 1 && (
          <div className="flex gap-1 px-5 py-2 bg-white/3 border-b border-white/10 flex-shrink-0 overflow-x-auto">
            {data.allStops.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onSwitchStop && onSwitchStop(s, i)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  data.activeStopIdx === i
                    ? "bg-cyan-400/20 border-cyan-400/40 text-cyan-300"
                    : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center font-black" style={{fontSize: "10px"}}>{i + 1}</span>
                {formatDateDisplay(s.date)}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">

          {/* Moon phase + sunrise/sunset/moonrise/moonset row */}
          <div className="px-5 py-3 bg-white/3 border-b border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{moonEmoji(phase)}</span>
                <span className="text-white/80 text-base font-bold">{phase}</span>
              </div>
            </div>
            {sunMoon ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {sunMoon.sunrise && (
                  <div className="flex items-center gap-2 text-amber-300">
                    <Sun className="w-5 h-5 flex-shrink-0" />
                    <span className="text-white/50 w-16">Sunrise</span>
                    <span className="font-bold">{sunMoon.sunrise}</span>
                  </div>
                )}
                {sunMoon.sunset && (
                  <div className="flex items-center gap-2 text-orange-300">
                    <Sun className="w-5 h-5 flex-shrink-0 opacity-60" />
                    <span className="text-white/50 w-14">Sunset</span>
                    <span className="font-bold">{sunMoon.sunset}</span>
                  </div>
                )}
                {sunMoon.moonrise && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-xl leading-none flex-shrink-0">{moonEmoji(phase)}</span>
                    <span className="text-white/50 w-16">Moonrise</span>
                    <span className="font-bold">{sunMoon.moonrise}</span>
                  </div>
                )}
                {sunMoon.moonset && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-xl leading-none flex-shrink-0 opacity-60">{moonEmoji(phase)}</span>
                    <span className="text-white/50 w-14">Moonset</span>
                    <span className="font-bold">{sunMoon.moonset}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-white/30 text-xs">Loading sun &amp; moon times...</div>
            )}
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">

            {data.loading && (
              <div className="text-white/50 text-sm text-center py-4">Loading forecast...</div>
            )}

            {!data.loading && isPastDate(data.date) && (
              <div className="text-white/50 text-sm text-center py-4 italic">
                This day has already occurred. No weather forecast available.
              </div>
            )}

            {/* LIVE FORECAST */}
            {!data.loading && !isPastDate(data.date) && live && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-white/70 text-xs font-semibold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                  Live 16-Day Forecast
                </div>

                {/* Condition + temp */}
                <div className="flex items-center gap-3">
                  <SkyIcon condition={live.condition} className="w-12 h-12 text-amber-300" />
                  <div>
                    <div className="text-white font-black text-3xl">{dispTemp(live.maxF)} / {dispTemp(live.minF)}</div>
                    <div className="text-white/60 text-base">{live.condition}</div>
                  </div>
                </div>

                {/* Atmosphere */}
                <div className="text-white/50 text-sm font-semibold uppercase tracking-wider pt-1">Atmosphere</div>
                <div className="grid grid-cols-2 gap-3 text-base">
                  {live.dewF != null && (
                    <div className="bg-white/5 rounded-xl px-4 py-3">
                      <div className="text-white/50 text-xs">Dew Point</div>
                      <div className="text-white font-bold text-lg">{dispTemp(live.dewF!)}</div>
                    </div>
                  )}
                  {live.humidity != null && (
                    <div className="bg-white/5 rounded-xl px-4 py-3">
                      <div className="text-white/50 text-xs">Humidity</div>
                      <div className="text-white font-bold text-lg">{live.humidity}%</div>
                    </div>
                  )}
                </div>

                {/* Wind */}
                <div className="text-white/50 text-sm font-semibold uppercase tracking-wider pt-1">Wind</div>
                <div className="grid grid-cols-3 gap-3 text-base">
                  <div className="bg-white/5 rounded-xl px-4 py-3">
                    <div className="text-white/50 text-xs">Direction</div>
                    <div className="text-cyan-300 font-bold text-lg">{live.windDir}</div>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-3">
                    <div className="text-white/50 text-xs">Speed</div>
                    <div className="text-cyan-300 font-bold text-lg">{dispWind(live.windKt)}</div>
                  </div>
                  {live.gustKt != null && (
                    <div className="bg-white/5 rounded-xl px-4 py-3">
                      <div className="text-white/50 text-xs">Gusts</div>
                      <div className="text-cyan-300 font-bold text-lg">{dispWind(live.gustKt!)}</div>
                    </div>
                  )}
                </div>

                {/* Marine */}
                {(live.waveHeightFt != null || live.swellFt != null) && (
                  <>
                    <div className="text-white/50 text-sm font-semibold uppercase tracking-wider pt-1">Marine</div>
                    <div className="grid grid-cols-2 gap-3 text-base">
                      {live.waveHeightFt != null && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <div className="text-white/50 text-xs">Wave Height</div>
                          <div className="text-orange-300 font-bold text-lg">{dispHeight(live.waveHeightFt!)}</div>
                        </div>
                      )}
                      {live.swellFt != null && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <div className="text-white/50 text-xs">Swell</div>
                          <div className="text-orange-300 font-bold text-lg">{dispHeight(live.swellFt!)}{live.swellDir ? ` from ${live.swellDir}` : ""}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Rain by time of day */}
                {(live.rainMorning != null || live.rainAfternoon != null) && (
                  <>
                    <div className="text-white/50 text-sm font-semibold uppercase tracking-wider pt-1">Rain Chance by Period</div>
                    <div className="grid grid-cols-2 gap-3 text-base">
                      {live.rainMorning != null && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <div className="text-white/50 text-xs">Morning</div>
                          <div className="text-blue-300 font-bold text-lg">{live.rainMorning}%</div>
                        </div>
                      )}
                      {live.rainAfternoon != null && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <div className="text-white/50 text-xs">Afternoon</div>
                          <div className="text-blue-300 font-bold text-lg">{live.rainAfternoon}%</div>
                        </div>
                      )}
                      {live.rainEvening != null && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <div className="text-white/50 text-xs">Evening</div>
                          <div className="text-blue-300 font-bold text-lg">{live.rainEvening}%</div>
                        </div>
                      )}
                      {live.rainOvernight != null && (
                        <div className="bg-white/5 rounded-xl px-4 py-3">
                          <div className="text-white/50 text-xs">Overnight</div>
                          <div className="text-blue-300 font-bold text-lg">{live.rainOvernight}%</div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* 24-hour hourly forecast accordion */}
                {live.hourly.length > 0 && (
                  <div className="border border-white/10 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-cyan-300 font-semibold text-sm hover:bg-white/5 transition-colors"
                      onClick={() => setShowHourly(h => !h)}
                    >
                      <span>24-Hour Forecast</span>
                      <span className="text-white/40 text-xs">{showHourly ? "Hide" : "Show"}</span>
                    </button>
                    {showHourly && (
                      <div className="border-t border-white/10 divide-y divide-white/5">
                        {live.hourly.map((hr, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                            <span className="text-white/50 w-16">{hr.time}</span>
                            <span className="text-white font-semibold">{dispTemp(hr.tempF)}</span>
                            <span className="text-cyan-300">{dispWind(hr.windKt)}</span>
                            <span className="text-blue-300">{hr.rainChance}%</span>
                            <span className="text-white/60 text-right">{hr.condition}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 5-day forecast accordion */}
                {live.sevenDay.length > 0 && (
                  <div className="border border-white/10 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-cyan-300 font-semibold text-sm hover:bg-white/5 transition-colors"
                      onClick={() => setShowFiveDay(f => !f)}
                    >
                      <span>5-Day Forecast</span>
                      <span className="text-white/40 text-xs">{showFiveDay ? "Hide" : "Show"}</span>
                    </button>
                    {showFiveDay && (
                      <div className="border-t border-white/10 divide-y divide-white/5">
                        {live.sevenDay.map((day, i) => (
                          <div key={i} className={`flex items-center justify-between px-4 py-2 text-xs ${day.date === data.date ? "bg-cyan-400/10" : ""}`}>
                            <span className={`w-20 font-semibold ${day.date === data.date ? "text-cyan-300" : "text-white/70"}`}>
                              {formatDateDisplay(day.date)}
                            </span>
                            <span className="text-white">{dispTemp(day.maxF)} / {dispTemp(day.minF)}</span>
                            <span className="text-cyan-300">{dispWind(day.windKt)} {day.windDir}</span>
                            <span className="text-blue-300">{day.rainChance}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CLIMATE AVERAGES (beyond 16-day window) */}
            {!data.loading && !isPastDate(data.date) && !live && data.climateData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-white/70 text-xs font-semibold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Climate Averages (beyond 16-day window)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
                    <Thermometer className="w-6 h-6 text-amber-300 flex-shrink-0" />
                    <div>
                      <div className="text-white/50 text-xs">Avg High / Low</div>
                      <div className="text-white font-bold text-lg">{dispTemp(data.climateData.hiF)} / {dispTemp(data.climateData.loF)}</div>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
                    <Droplets className="w-6 h-6 text-blue-300 flex-shrink-0" />
                    <div>
                      <div className="text-white/50 text-xs">Humidity</div>
                      <div className="text-white font-bold text-lg">{data.climateData.hum}%</div>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
                    <Wind className="w-6 h-6 text-cyan-300 flex-shrink-0" />
                    <div>
                      <div className="text-white/50 text-xs">Wind</div>
                      <div className="text-cyan-300 font-bold text-lg">{dispWind(parseInt(data.climateData.windKt))} {data.climateData.windDir}</div>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
                    <CloudRain className="w-6 h-6 text-blue-300 flex-shrink-0" />
                    <div>
                      <div className="text-white/50 text-xs">Rain Chance</div>
                      <div className="text-blue-300 font-bold text-lg">{data.climateData.rain}%</div>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl px-4 py-3 col-span-2 flex items-center gap-3">
                    <Waves className="w-6 h-6 text-orange-300 flex-shrink-0" />
                    <div>
                      <div className="text-white/50 text-xs">Avg Seas</div>
                      <div className="text-orange-300 font-bold text-lg">{dispHeight(data.climateData.seaFt)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!data.loading && !isPastDate(data.date) && !live && !data.climateData && (
              <div className="text-white/50 text-sm text-center py-4 italic">
                No forecast data available for this location.
              </div>
            )}

          </div>
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
  const newStopRef = useRef<HTMLDivElement | null>(null);

  // Load climate database
  useEffect(() => {
    fetch("/climate_database.json")
      .then(r => r.json())
      .then(data => setClimateDb(data))
      .catch(() => {});
  }, []);

  // Load saved itinerary on mount -- checks multiple sources in priority order:
  // 1. sessionStorage.sharedItinerary -- set by index.html when gh-pages redirects /route-map#itinerary=...
  // 2. URL hash fragment -- #itinerary=BASE64 (direct navigation)
  // 3. Legacy ?itinerary= query param (old shared links)
  // 4. localStorage -- user's own saved route
  useEffect(() => {
    // 1. Check sessionStorage first (set by index.html SPA redirect handler for shared links)
    const sessionShared = sessionStorage.getItem("sharedItinerary");
    if (sessionShared) {
      sessionStorage.removeItem("sharedItinerary"); // consume it
      try {
        const decoded: PortStop[] = JSON.parse(atob(sessionShared));
        if (Array.isArray(decoded) && decoded.length > 0) {
          setStops(decoded);
          setPlotted(true);
          return;
        }
      } catch {}
    }

    // 2. Check hash fragment (direct navigation to /route-map#itinerary=BASE64)
    const hash = window.location.hash;
    const hashMatch = hash.match(/[#&]itinerary=([^&]+)/);
    if (hashMatch) {
      try {
        const decoded: PortStop[] = JSON.parse(atob(decodeURIComponent(hashMatch[1])));
        if (Array.isArray(decoded) && decoded.length > 0) {
          setStops(decoded);
          setPlotted(true);
          history.replaceState(null, "", window.location.pathname);
          return;
        }
      } catch {}
    }

    // 3. ?itinerary= query param (shared links via URL)
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("itinerary");
    if (encoded) {
      try {
        // Try Unicode-safe decoding first (new format), fall back to plain atob for legacy links
        let decoded: PortStop[];
        try {
          decoded = JSON.parse(decodeURIComponent(escape(atob(encoded))));
        } catch {
          decoded = JSON.parse(atob(encoded));
        }
        if (Array.isArray(decoded) && decoded.length > 0) {
          setStops(decoded);
          setPlotted(true);
          return;
        }
      } catch {}
    }

    // 4. Load from localStorage ONLY if user explicitly saved the route
    // A separate flag "routeMapSaved" is written by handleSave -- without it,
    // we never auto-populate the form with old data the user did not intend to keep.
    const wasSaved = localStorage.getItem("routeMapSaved") === "true";
    if (wasSaved) {
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

    // Group stops by location key (rounded to 3 decimal places) to detect same-port duplicates
    const locationGroups = new Map<string, { stops: typeof validStops; indices: number[] }>();
    validStops.forEach((stop, idx) => {
      const key = `${stop.lat!.toFixed(3)},${stop.lon!.toFixed(3)}`;
      if (!locationGroups.has(key)) locationGroups.set(key, { stops: [], indices: [] });
      locationGroups.get(key)!.stops.push(stop);
      locationGroups.get(key)!.indices.push(idx + 1);
    });

    validStops.forEach((stop, idx) => {
      const lat = stop.lat!;
      const lon = stop.lon!;
      latlngs.push([lat, lon]);

      const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
      const group = locationGroups.get(key)!;

      // Only render one marker per unique location (skip duplicates)
      if (group.indices[0] !== idx + 1) return;

      const color = stop.isSeaDay ? "#60a5fa" : "#22d3ee";
      const label = group.indices.join(", ");
      // Wider badge when showing multiple stop numbers
      const badgeW = group.indices.length > 1 ? Math.max(36, label.length * 9 + 12) : 28;
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          background:${color};
          border:2px solid white;
          border-radius:${group.indices.length > 1 ? "14px" : "50%"};
          width:${badgeW}px;height:28px;
          display:flex;align-items:center;justify-content:center;
          font-weight:900;font-size:12px;color:#0f172a;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
          cursor:pointer;white-space:nowrap;padding:0 4px;
        ">${label}</div>`,
        iconSize: [badgeW, 28],
        iconAnchor: [badgeW / 2, 14],
      });

      const marker = L.marker([lat, lon], { icon })
        .addTo(map)
        .on("click", () => handleMarkerClick(group.stops[0], group.stops));

      markersRef.current.push(marker);
    });

    // ---- Maritime routing: handled by ../utils/maritimeRouting.ts ----
    // The utility uses a port-cluster gate system to keep lines over water.

    // approxDistKm no longer needed here -- routing handled by maritimeRouting.ts

    // -----------------------------------------------------------------------
    // Old bounding-box engine removed. See ../utils/maritimeRouting.ts
    // -----------------------------------------------------------------------

    // Build the full routed polyline path using the sea gate routing engine
    const routedPath: L.LatLngTuple[] = [];
    for (let i = 0; i < validStops.length - 1; i++) {
      const fromStop = validStops[i];
      const toStop = validStops[i + 1];
      const fromCoord: [number, number] = [fromStop.lat!, fromStop.lon!];
      const toCoord: [number, number] = [toStop.lat!, toStop.lon!];
      const segment = maritimeRoute(
        fromStop.portName,
        fromCoord,
        toStop.portName,
        toCoord
      );
      if (i === 0) routedPath.push(segment[0] as L.LatLngTuple);
      for (let j = 1; j < segment.length; j++) routedPath.push(segment[j] as L.LatLngTuple);
    }

    // Draw route line
    if (routedPath.length > 1) {
      polylineRef.current = L.polyline(routedPath, {
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

  const handleMarkerClick = useCallback(async (stop: PortStop, allStops?: PortStop[]) => {
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
      allStops: allStops && allStops.length > 1 ? allStops : undefined,
      activeStopIdx: 0,
    });

    if (isWithin16Days(stop.date) && !isPastDate(stop.date)) {
      const live = await fetchLiveForecastForDate(stop.lat, stop.lon, stop.date);
      setPopup(prev => prev ? { ...prev, liveData: live, loading: false } : null);
    }
  }, [climateDb]);

  // ---- Stop management ----
  const addStop = () => {
    setStops(prev => {
      // Find the last stop that has a date and advance by 1 day
      const lastDated = [...prev].reverse().find(s => s.date);
      let defaultDate = "";
      if (lastDated?.date) {
        const d = new Date(lastDated.date + "T12:00:00");
        d.setDate(d.getDate() + 1);
        defaultDate = d.toISOString().slice(0, 10);
      }
      return [...prev, { id: generateId(), portName: "", lat: null, lon: null, date: defaultDate, isSeaDay: false }];
    });
    // Scroll to the new card after React re-renders
    setTimeout(() => {
      newStopRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  const removeStop = (id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
  };

  const updateStop = (id: string, patch: Partial<PortStop>) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const handlePortChange = (id: string, val: string) => {
    const port = resolvePort(val);
    // When the user clears the port name, also clear the date so no orphaned date remains
    const patch: Partial<PortStop> = {
      portName: val,
      lat: port?.lat ?? null,
      lon: port?.lon ?? null,
    };
    if (!val.trim()) patch.date = "";
    updateStop(id, patch);
  };

  const handlePortBlur = (id: string, val: string) => {
    const port = resolvePort(val);
    if (port) updateStop(id, { portName: port.name, lat: port.lat, lon: port.lon });
  };

  const handleDateChange = (id: string, date: string) => {
    // Single atomic update: set this stop's date AND auto-fill the next undated stop
    setStops(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      let updated = prev.map(s => s.id === id ? { ...s, date } : s);
      if (date) {
        const next = updated[idx + 1];
        if (next && !next.date) {
          const d = new Date(date + "T12:00:00");
          d.setDate(d.getDate() + 1);
          const nextDate = d.toISOString().slice(0, 10);
          updated = updated.map((s, i) => i === idx + 1 ? { ...s, date: nextDate } : s);
        }
      }
      return updated;
    });
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
    // Write the explicit-save flag so the form reloads this itinerary on next visit
    localStorage.setItem("routeMapSaved", "true");
    setSaveMsg("Saved!");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  const handleShare = () => {
    // Encode itinerary as ?itinerary= query param.
    // GitHub Pages 404.html converts /route-map?itinerary=X to /?p=/route-map&q=itinerary=X
    // and the index.html SPA script reconstructs it as /route-map?itinerary=X
    // which RouteMap reads from window.location.search on mount.
    // Use Unicode-safe base64 encoding so port names and IDs with special characters encode correctly.
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(stops))));
    const url = `${window.location.origin}/route-map?itinerary=${encoded}`;
    if (navigator.share) {
      navigator.share({ title: "My Cruise Route -- My Cruising Weather", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareMsg("Link copied!");
        setTimeout(() => setShareMsg(""), 2500);
      }).catch(() => {
        // Fallback: prompt with the URL if clipboard is not available
        window.prompt("Copy this link to share your route:", url);
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
              <div key={stop.id} ref={idx === stops.length - 1 ? newStopRef : null} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
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
                      onClick={() => updateStop(stop.id, { isSeaDay: !stop.isSeaDay, portName: stop.isSeaDay ? "" : "Sea Day", lat: null, lon: null, ...(stop.isSeaDay ? { date: "" } : {}) })}
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
                        // Clearing Sea Day text back to empty -- clear date too so nothing is orphaned
                        updateStop(stop.id, { isSeaDay: false, portName: "", lat: null, lon: null, date: "" });
                      }
                    } else {
                      handlePortChange(stop.id, val);
                    }
                  }}
                  placeholder={stop.isSeaDay ? "Sea Day -- type to override" : "Type a port name..."}
                  isSeaDay={stop.isSeaDay}
                />

                {/* Date input -- only shown once a port name has been entered or Sea Day is active */}
                {(stop.portName.trim() || stop.isSeaDay) && (
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
                )}
              </div>
            ))}
          </div>

          {/* Add stop button */}
          <button
            onClick={addStop}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-colors text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Add Another Port / Sea Day
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Save className="w-4 h-4 flex-shrink-0 text-[#e8d5b0]" />
            {saveMsg
              ? <span className="text-[#e8d5b0] text-sm font-bold">{saveMsg}</span>
              : <span className="flex items-baseline gap-1">
                  <span className="text-[#e8d5b0] text-base font-bold">Save Route</span>
                  <span className="text-[#a08860] text-xs font-medium">(Reload anytime for the latest forecast)</span>
                </span>
            }
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 transition-colors"
          >
            <Share2 className="w-4 h-4 flex-shrink-0 text-[#e8d5b0]" />
            {shareMsg
              ? <span className="text-[#e8d5b0] text-sm font-bold">{shareMsg}</span>
              : <span className="flex items-baseline gap-1">
                  <span className="text-[#e8d5b0] text-base font-bold">Share Route</span>
                  <span className="text-[#a08860] text-xs font-medium">(Family and friends get the same forecast on their device)</span>
                </span>
            }
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
      {popup && (
        <ForecastPopup
          data={popup}
          onClose={() => setPopup(null)}
          onSwitchStop={async (stop, idx) => {
            const month = parseInt(stop.date.split("-")[1], 10);
            const climateEntry = climateDb[stop.portName];
            const climateMonth = climateEntry?.months?.find(m => m.m === month) ?? null;
            setPopup(prev => prev ? {
              ...prev,
              portName: stop.portName,
              date: stop.date,
              isSeaDay: stop.isSeaDay,
              liveData: null,
              climateData: climateMonth,
              loading: isWithin16Days(stop.date) && !isPastDate(stop.date),
              activeStopIdx: idx,
            } : null);
            if (stop.lat && stop.lon && isWithin16Days(stop.date) && !isPastDate(stop.date)) {
              const live = await fetchLiveForecastForDate(stop.lat, stop.lon, stop.date);
              setPopup(prev => prev ? { ...prev, liveData: live, loading: false } : null);
            }
          }}
        />
      )}
    </div>
  );
}
