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

interface HourlySlot {
  hour: number;
  label: string;
  tempF: number;
  windKt: number;
  windDir: string;
  rainChance: number;
  condition: string;
  wmoCode: number;
  humidity: number;
  uvIndex: number;
  cloudCover: number;
  visibility: number;
  seaState: string;
}

interface DayForecast {
  date: string;
  maxF: number;
  minF: number;
  windKt: number;
  windDir: string;
  rainChance: number;
  condition: string;
  waveHeightFt: number | null;
  swellHeightFt: number | null;
  swellDir: string | null;
  swellPeriod: number | null;
  humidity: number | null;
  uvIndex: number | null;
  cloudCover: number | null;
  visibility: number | null;
  seaState: string;
}

interface FullForecastData {
  tempF: number;
  windKt: number;
  windDir: string;
  condition: string;
  hourlyToday: HourlySlot[];
  forecast: DayForecast[];
}

interface PopupData {
  portName: string;
  dates: string[]; // Multiple dates if same port appears more than once
  lat: number;
  lon: number;
  isSeaDay: boolean;
  loading: boolean;
  forecastData: FullForecastData | null;
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

// ============================================================
// Helpers
// ============================================================
function degToCompass(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}
function msToKt(ms: number): number { return Math.round(ms * 1.94384); }
function cToF(c: number): number { return Math.round(c * 9 / 5 + 32); }
function ktToMph(kt: number): number { return Math.round(kt * 1.15078); }
function fToCStr(f: number): string { return Math.round((f - 32) * 5 / 9) + "\u00b0C"; }
function swellFtToM(ft: number | null): string | null {
  if (ft == null) return null;
  return (ft * 0.3048).toFixed(1) + "m";
}

function seaStateFromWind(ktSpeed: number): string {
  if (ktSpeed <= 6) return "< 1 ft";
  if (ktSpeed <= 10) return "1-2 ft";
  if (ktSpeed <= 16) return "2-4 ft";
  if (ktSpeed <= 21) return "4-6 ft";
  if (ktSpeed <= 27) return "6-9 ft";
  return "9+ ft";
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

function cloudCoverIcon(pct: number): string {
  if (pct <= 10) return "\u2600\ufe0f";
  if (pct <= 30) return "\uD83C\uDF24\uFE0F";
  if (pct <= 60) return "\u26C5";
  if (pct <= 85) return "\uD83C\uDF25\uFE0F";
  return "\u2601\ufe0f";
}

function isPastDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  return target < today;
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
// Fetch full forecast data for a port (matching PortSearch pattern)
// ============================================================
async function fetchPortData(lat: number, lon: number): Promise<FullForecastData> {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode,precipitation_probability,relativehumidity_2m,uv_index,cloudcover,visibility` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_probability_max,weathercode,uv_index_max,windspeed_10m_max,cloudcover_mean` +
    `&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=8`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&daily=wave_height_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max` +
    `&length_unit=imperial&timezone=auto&forecast_days=8`;

  const [weatherRes, marineRes] = await Promise.allSettled([
    fetch(weatherUrl).then(r => r.json()),
    fetch(marineUrl).then(r => r.json()),
  ]);

  const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
  const marine  = marineRes.status  === "fulfilled" ? marineRes.value  : null;

  if (!weather || weather.error) throw new Error("Weather fetch failed");

  const c = weather.current;
  const d = weather.daily;
  const h = weather.hourly;
  const md = marine?.daily ?? null;

  const currentWindKt = msToKt(c.wind_speed_10m);

  const apiTimezone: string = weather.timezone ?? "UTC";
  const todayLocalDate = new Date().toLocaleDateString("en-CA", { timeZone: apiTimezone });

  const TARGET_HOURS_TODAY = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
  const labelMap: Record<number, string> = {
    6:"6a",7:"7a",8:"8a",9:"9a",10:"10a",11:"11a",
    12:"12p",13:"1p",14:"2p",15:"3p",16:"4p",17:"5p",18:"6p",19:"7p",
    20:"8p",21:"9p",22:"10p"
  };

  const hourlySlots: HourlySlot[] = [];
  const seenHours = new Set<number>();

  if (h?.time) {
    (h.time as string[]).forEach((isoTime: string, idx: number) => {
      const datePart = isoTime.slice(0, 10);
      const hourPart = parseInt(isoTime.slice(11, 13), 10);

      let effectiveHour: number | null = null;

      if (datePart === todayLocalDate && TARGET_HOURS_TODAY.includes(hourPart)) {
        effectiveHour = hourPart;
      }

      if (effectiveHour === null) return;
      if (seenHours.has(effectiveHour)) return;
      seenHours.add(effectiveHour);

      const tempF = cToF(h.temperature_2m[idx] ?? 20);
      const wKt = msToKt(h.wind_speed_10m[idx] ?? 0);
      const wDir = degToCompass(h.wind_direction_10m[idx] ?? 0);
      const wmo = h.weathercode[idx] ?? 0;
      const rain = h.precipitation_probability[idx] ?? 0;
      const hum = h.relativehumidity_2m?.[idx] ?? 0;
      const uv = h.uv_index?.[idx] ?? 0;
      const cc = h.cloudcover?.[idx] ?? 0;
      const vis = h.visibility?.[idx] ?? 0;
      const visKm = Math.round(vis / 100) / 10;

      hourlySlots.push({
        hour: effectiveHour,
        label: labelMap[effectiveHour] ?? `${effectiveHour}:00`,
        tempF,
        windKt: wKt,
        windDir: wDir,
        rainChance: rain,
        condition: wmoToCondition(wmo),
        wmoCode: wmo,
        humidity: hum,
        uvIndex: Math.round(uv * 10) / 10,
        cloudCover: cc,
        visibility: visKm,
        seaState: seaStateFromWind(wKt),
      });
    });
  }

  hourlySlots.sort((a, b) => a.hour - b.hour);

  const forecast: DayForecast[] = (d.time as string[]).slice(1, 8).map((dateStr: string, rawIdx: number) => {
    const i = rawIdx + 1;
    const wKt = msToKt(d.wind_speed_10m_max[i]);
    const swellDeg = md?.swell_wave_direction_dominant?.[i];
    return {
      date: dateStr,
      maxF: cToF(d.temperature_2m_max[i]),
      minF: cToF(d.temperature_2m_min[i]),
      windKt: wKt,
      windDir: degToCompass(d.wind_direction_10m_dominant[i]),
      rainChance: d.precipitation_probability_max[i] ?? 0,
      condition: wmoToCondition(d.weathercode[i]),
      waveHeightFt:  md?.wave_height_max?.[i]       != null ? Math.round(md.wave_height_max[i] * 10) / 10 : null,
      swellHeightFt: md?.swell_wave_height_max?.[i] != null ? Math.round(md.swell_wave_height_max[i] * 10) / 10 : null,
      swellDir:      swellDeg != null ? degToCompass(swellDeg) : null,
      swellPeriod:   md?.swell_wave_period_max?.[i] != null ? Math.round(md.swell_wave_period_max[i]) : null,
      humidity: null,
      uvIndex: d.uv_index_max?.[i] != null ? Math.round(d.uv_index_max[i] * 10) / 10 : null,
      cloudCover: d.cloudcover_mean?.[i] != null ? Math.round(d.cloudcover_mean[i]) : null,
      visibility: null,
      seaState: seaStateFromWind(wKt),
    };
  });

  return {
    tempF: cToF(c.temperature_2m),
    windKt: currentWindKt,
    windDir: degToCompass(c.wind_direction_10m),
    condition: wmoToCondition(c.weathercode),
    hourlyToday: hourlySlots,
    forecast,
  };
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
          if (isSeaDay) return;
          if (value.length >= 2 && suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
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
// Hourly forecast panel
// ============================================================
function HourlyForecast({ slots, isMetric }: { slots: HourlySlot[]; isMetric: boolean }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-1">
      {slots.map((slot, idx) => (
        <div
          key={idx}
          className="flex-shrink-0 w-20 bg-white/5 border border-white/10 rounded-xl p-2.5 text-center"
        >
          <p className="text-white/50 text-xs font-bold mb-1.5">{slot.label}</p>
          <p className="text-white font-black text-lg mb-1">{isMetric ? fToCStr(slot.tempF) : `${slot.tempF}\u00b0`}</p>
          <SkyIcon condition={slot.condition} className="w-5 h-5 text-amber-300 mx-auto mb-1" />
          <p className="text-white/70 text-xs font-bold mb-0.5">{slot.windKt} kt {slot.windDir}</p>
          <p className="text-blue-300 text-xs font-bold mb-0.5">{slot.rainChance}%</p>
          <p className="text-white/50 text-xs font-bold">{cloudCoverIcon(slot.cloudCover)} {slot.cloudCover}%</p>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 7-day forecast panel
// ============================================================
function SevenDayForecast({ days, isMetric }: { days: DayForecast[]; isMetric: boolean }) {
  const hasWave = days.some(d => d.swellHeightFt != null);

  return (
    <div className="space-y-2">
      {days.map((day, idx) => {
        const dt = new Date(day.date + "T12:00:00");
        const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()];
        const monthDay = `${dt.getMonth() + 1}/${dt.getDate()}`;

        return (
          <div key={idx} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="w-16 flex-shrink-0">
              <p className="text-white font-bold text-sm">{dayName}</p>
              <p className="text-white/50 text-xs">{monthDay}</p>
            </div>
            <div className="flex-1 grid grid-cols-6 gap-2 items-center text-center">
              <div>
                <SkyIcon condition={day.condition} className="w-5 h-5 text-amber-300 mx-auto mb-0.5" />
                <p className="text-white/70 text-xs">{day.condition.split(" ")[0]}</p>
              </div>
              <div>
                <p className="text-white font-black text-sm">{isMetric ? fToCStr(day.maxF) : `${day.maxF}\u00b0`}</p>
                <p className="text-white/50 text-xs">{isMetric ? fToCStr(day.minF) : `${day.minF}\u00b0`}</p>
              </div>
              <div>
                <p className="text-cyan-300 text-xs font-bold">{day.windKt} kt</p>
                <p className="text-cyan-400/70 text-xs font-bold">{day.windDir}</p>
              </div>
              <div>
                <p className="text-blue-300 text-xs font-bold">{day.rainChance}%</p>
                <p className="text-white/50 text-xs">{cloudCoverIcon(day.cloudCover ?? 0)}</p>
              </div>
              <div>
                <p className="text-orange-300 text-xs font-bold">{day.seaState}</p>
              </div>
              <div>
                {day.swellHeightFt != null && (
                  <>
                    <p className="text-teal-300 text-xs font-bold">
                      {isMetric ? swellFtToM(day.swellHeightFt) : `${day.swellHeightFt}ft`}
                    </p>
                    {day.swellDir && <p className="text-teal-400/70 text-xs font-bold">{day.swellDir}</p>}
                    {day.swellPeriod && <p className="text-white/50 text-xs font-bold">{day.swellPeriod}s</p>}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {hasWave && (
        <div className="flex gap-4 text-xs font-bold px-2">
          <span className="text-orange-300">orange = wind-wave estimate</span>
          <span className="text-teal-300">teal = swell height (marine API)</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Forecast popup card
// ============================================================
function ForecastPopup({ data, climateDb, onClose }: { data: PopupData; climateDb: Record<string, ClimateData>; onClose: () => void }) {
  const [isMetric, setIsMetric] = useState(false);
  const [hourlyOpen, setHourlyOpen] = useState(false);
  const [sevenDayOpen, setSevenDayOpen] = useState(false);

  const firstDate = data.dates[0] ?? "";
  const phase = getMoonPhase(firstDate);

  const climateEntry = climateDb[data.portName];
  const climateMonth = climateEntry && firstDate
    ? climateEntry.months.find(m => m.m === new Date(firstDate + "T12:00:00").getMonth() + 1)
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
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
            <div className="text-white/50 text-sm mt-0.5">
              {data.dates.map(formatDateDisplay).join(", ")}
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Unit toggle */}
        <div className="px-5 py-2 bg-white/3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{moonEmoji(phase)}</span>
            <span className="text-white/60 text-sm">{phase}</span>
          </div>
          <button
            onClick={() => setIsMetric(!isMetric)}
            className="text-xs font-bold text-white/60 hover:text-white border border-white/20 rounded px-2 py-1"
          >
            {isMetric ? "Metric" : "US Standard"}
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {data.loading && (
            <div className="text-white/50 text-sm text-center py-4">Loading forecast...</div>
          )}

          {!data.loading && isPastDate(firstDate) && (
            <div className="text-white/50 text-sm text-center py-4 italic">
              This day has already occurred. No weather forecast available.
            </div>
          )}

          {!data.loading && !isPastDate(firstDate) && data.forecastData && (
            <>
              {/* Current conditions summary */}
              <div className="flex items-center gap-3">
                <SkyIcon condition={data.forecastData.condition} className="w-10 h-10 text-amber-300" />
                <div>
                  <div className="text-white font-black text-3xl">
                    {isMetric ? fToCStr(data.forecastData.tempF) : `${data.forecastData.tempF}\u00b0F`}
                  </div>
                  <div className="text-white/60 text-sm">{data.forecastData.condition}</div>
                </div>
              </div>

              {/* Wind */}
              <div className="bg-white/5 rounded-lg px-3 py-2">
                <div className="text-white/50 text-xs">Wind</div>
                <div className="text-cyan-300 font-bold">
                  {isMetric ? Math.round(data.forecastData.windKt * 1.852) : data.forecastData.windKt} {isMetric ? "km/h" : "kt"} {data.forecastData.windDir}
                </div>
              </div>

              {/* Hourly forecast accordion */}
              {data.forecastData.hourlyToday.length > 0 && (
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setHourlyOpen(!hourlyOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-white font-bold text-sm">12-Hour Forecast</span>
                    {hourlyOpen ? <ChevronUp className="w-4 h-4 text-white/60" /> : <ChevronDown className="w-4 h-4 text-white/60" />}
                  </button>
                  {hourlyOpen && (
                    <div className="p-3 bg-white/3">
                      <HourlyForecast slots={data.forecastData.hourlyToday} isMetric={isMetric} />
                    </div>
                  )}
                </div>
              )}

              {/* 7-day forecast accordion */}
              {data.forecastData.forecast.length > 0 && (
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setSevenDayOpen(!sevenDayOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <span className="text-white font-bold text-sm">7-Day Forecast</span>
                    {sevenDayOpen ? <ChevronUp className="w-4 h-4 text-white/60" /> : <ChevronDown className="w-4 h-4 text-white/60" />}
                  </button>
                  {sevenDayOpen && (
                    <div className="p-3 bg-white/3">
                      <SevenDayForecast days={data.forecastData.forecast} isMetric={isMetric} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!data.loading && !isPastDate(firstDate) && !data.forecastData && climateMonth && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white/70 text-xs font-semibold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Climate Averages
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Avg High / Low</div>
                  <div className="text-white font-bold">{climateMonth.hiF}&deg; / {climateMonth.loF}&deg;F</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Humidity</div>
                  <div className="text-white font-bold">{climateMonth.hum}%</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Wind</div>
                  <div className="text-cyan-300 font-bold">{climateMonth.windKt} kt {climateMonth.windDir}</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2">
                  <div className="text-white/50 text-xs">Rain Chance</div>
                  <div className="text-blue-300 font-bold">{climateMonth.rain}%</div>
                </div>
                <div className="bg-white/5 rounded-lg px-3 py-2 col-span-2">
                  <div className="text-white/50 text-xs">Avg Seas</div>
                  <div className="text-orange-300 font-bold">{climateMonth.seaFt} ft</div>
                </div>
              </div>
            </div>
          )}

          {!data.loading && !isPastDate(firstDate) && !data.forecastData && !climateMonth && (
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
    if (mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [25, -75],
      zoom: 4,
      zoomControl: true,
    });

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri",
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
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }

    const validStops = stops.filter(s => s.lat != null && s.lon != null && s.date);
    if (validStops.length === 0) return;

    // Group stops by port name to create combined markers
    const portGroups: Record<string, { lat: number; lon: number; dates: string[]; stopNumbers: number[]; isSeaDay: boolean }> = {};
    validStops.forEach((s, idx) => {
      const key = s.portName;
      if (!portGroups[key]) {
        portGroups[key] = { lat: s.lat!, lon: s.lon!, dates: [], stopNumbers: [], isSeaDay: s.isSeaDay };
      }
      portGroups[key].dates.push(s.date);
      portGroups[key].stopNumbers.push(idx + 1);
    });

    Object.entries(portGroups).forEach(([portName, group]) => {
      const icon = L.divIcon({
        html: `<div style="background:${group.isSeaDay ? "#3b82f6" : "#06b6d4"}; color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; border:2px solid white;">${group.stopNumbers.join(", ")}</div>`,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([group.lat, group.lon], { icon }).addTo(map);
      marker.on("click", () => handleMarkerClick(portName, group.lat, group.lon, group.dates, group.isSeaDay));
      markersRef.current.push(marker);
    });

    const coords: [number, number][] = validStops.map(s => [s.lat!, s.lon!]);
    const polyline = L.polyline(coords, {
      color: "#06b6d4",
      weight: 2,
      opacity: 0.7,
      dashArray: "5, 10",
    }).addTo(map);
    polylineRef.current = polyline;

    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
  }, [stops]);

  const handleMarkerClick = async (portName: string, lat: number, lon: number, dates: string[], isSeaDay: boolean) => {
    setPopup({
      portName,
      dates,
      lat,
      lon,
      isSeaDay,
      loading: true,
      forecastData: null,
    });

    try {
      const data = await fetchPortData(lat, lon);
      setPopup(prev => prev ? { ...prev, loading: false, forecastData: data } : null);
    } catch {
      setPopup(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const updateStop = (id: string, updates: Partial<PortStop>) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const addStop = () => {
    setStops(prev => [...prev, { id: generateId(), portName: "", lat: null, lon: null, date: "", isSeaDay: false }]);
  };

  const removeStop = (id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
  };

  const handlePortChange = (id: string, val: string) => {
    updateStop(id, { portName: val });
    const port = resolvePort(val);
    if (port) updateStop(id, { portName: port.name, lat: port.lat, lon: port.lon });
  };

  const handleDateChange = (id: string, date: string) => {
    updateStop(id, { date });
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

          <div className="space-y-4">
            {stops.map((stop, idx) => (
              <div key={stop.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
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

                <PortAutocomplete
                  value={stop.isSeaDay ? "Sea Day" : stop.portName}
                  onChange={val => {
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

          <button
            onClick={addStop}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-colors text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Add Another Port
          </button>

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

      <div ref={mapContainerRef} className="flex-1 w-full" />

      {popup && <ForecastPopup data={popup} climateDb={climateDb} onClose={() => setPopup(null)} />}
    </div>
  );
}
