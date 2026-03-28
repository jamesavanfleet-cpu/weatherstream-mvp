import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPin, Search, X,
  Sun, Cloud, CloudRain, CloudLightning, Snowflake, Eye, ChevronDown
} from "lucide-react";

// ============================================================
// PORT MASTER LIST -- v3: corrected terminal coords + island/city aliases
// Last updated: 2026-03-28
// ============================================================
export const PORT_LIST: { name: string; lat: number; lon: number; region: string }[] = [
  // ---- Caribbean ----
  { name: "Miami",                  lat: 25.7753, lon: -80.1698, region: "Caribbean" },
  { name: "Key West",               lat: 24.5551, lon: -81.7800, region: "Caribbean" },
  // Nassau / Prince George Wharf
  { name: "Nassau",                 lat: 25.0780, lon: -77.3390, region: "Caribbean" },
  { name: "Bimini",                 lat: 25.7300, lon: -79.2900, region: "Caribbean" },
  { name: "Freeport",               lat: 26.5285, lon: -78.6960, region: "Caribbean" },
  { name: "Berry Islands",          lat: 25.7380, lon: -77.8400, region: "Caribbean" },
  { name: "San Juan",               lat: 18.4655, lon: -66.1057, region: "Caribbean" },
  { name: "St. Thomas",             lat: 18.3381, lon: -64.9312, region: "Caribbean" },
  // St. Croix -- port is Frederiksted
  { name: "St. Croix",              lat: 17.7130, lon: -64.8830, region: "Caribbean" },
  { name: "Frederiksted",           lat: 17.7130, lon: -64.8830, region: "Caribbean" },
  // St. Kitts -- port is Basseterre (Port Zante)
  { name: "St. Kitts",              lat: 17.2983, lon: -62.7260, region: "Caribbean" },
  { name: "Basseterre",             lat: 17.2983, lon: -62.7260, region: "Caribbean" },
  // Antigua -- port is St. John's (Heritage Quay)
  { name: "Antigua",                lat: 17.1175, lon: -61.8456, region: "Caribbean" },
  { name: "St. John's",             lat: 17.1175, lon: -61.8456, region: "Caribbean" },
  // Barbados -- port is Bridgetown Cruise Terminal
  { name: "Barbados",               lat: 13.1000, lon: -59.6167, region: "Caribbean" },
  { name: "Bridgetown",             lat: 13.1000, lon: -59.6167, region: "Caribbean" },
  // St. Lucia -- port is Castries
  { name: "St. Lucia",              lat: 14.0101, lon: -60.9875, region: "Caribbean" },
  { name: "Castries",               lat: 14.0101, lon: -60.9875, region: "Caribbean" },
  // Martinique -- port is Fort-de-France
  { name: "Martinique",             lat: 14.6037, lon: -61.0722, region: "Caribbean" },
  { name: "Fort-de-France",         lat: 14.6037, lon: -61.0722, region: "Caribbean" },
  // St. Maarten -- port is Philipsburg (Dr. A.C. Wathey Pier)
  { name: "St. Maarten",            lat: 18.0236, lon: -63.0458, region: "Caribbean" },
  { name: "Philipsburg",            lat: 18.0236, lon: -63.0458, region: "Caribbean" },
  // Turks & Caicos -- port is Grand Turk Cruise Center
  { name: "Turks & Caicos",         lat: 21.4667, lon: -71.1389, region: "Caribbean" },
  { name: "Grand Turk",             lat: 21.4667, lon: -71.1389, region: "Caribbean" },
  { name: "Cozumel",                lat: 20.5088, lon: -86.9468, region: "Caribbean" },
  // Costa Maya -- actual town is Mahahual
  { name: "Costa Maya",             lat: 18.7070, lon: -87.7130, region: "Caribbean" },
  { name: "Mahahual",               lat: 18.7070, lon: -87.7130, region: "Caribbean" },
  // Roatan -- main port is Coxen Hole / Mahogany Bay
  { name: "Roatan",                 lat: 16.3167, lon: -86.5333, region: "Caribbean" },
  { name: "Coxen Hole",             lat: 16.3167, lon: -86.5333, region: "Caribbean" },
  { name: "Belize City",            lat: 17.2510, lon: -88.7670, region: "Caribbean" },
  // Grand Cayman -- port is George Town
  { name: "Grand Cayman",           lat: 19.2869, lon: -81.3674, region: "Caribbean" },
  { name: "George Town",            lat: 19.2869, lon: -81.3674, region: "Caribbean" },
  { name: "Ocho Rios",              lat: 18.4083, lon: -77.1028, region: "Caribbean" },
  { name: "Falmouth",               lat: 18.4956, lon: -77.6583, region: "Caribbean" },
  // Aruba -- port is Oranjestad
  { name: "Aruba",                  lat: 12.5186, lon: -70.0358, region: "Caribbean" },
  { name: "Oranjestad",             lat: 12.5186, lon: -70.0358, region: "Caribbean" },
  // Curacao -- port is Willemstad (Mega Pier)
  { name: "Curacao",                lat: 12.1084, lon: -68.9335, region: "Caribbean" },
  { name: "Willemstad",             lat: 12.1084, lon: -68.9335, region: "Caribbean" },
  // Bonaire -- port is Kralendijk
  { name: "Bonaire",                lat: 12.1500, lon: -68.2700, region: "Caribbean" },
  { name: "Kralendijk",             lat: 12.1500, lon: -68.2700, region: "Caribbean" },
  // Dominica -- port is Roseau
  { name: "Dominica",               lat: 15.3017, lon: -61.3881, region: "Caribbean" },
  { name: "Roseau",                 lat: 15.3017, lon: -61.3881, region: "Caribbean" },
  { name: "La Romana",              lat: 18.4275, lon: -68.9722, region: "Caribbean" },
  { name: "Puerto Plata",           lat: 19.7936, lon: -70.6878, region: "Caribbean" },
  { name: "Samana",                 lat: 19.2075, lon: -69.3356, region: "Caribbean" },
  { name: "Santo Domingo",          lat: 18.4725, lon: -69.8853, region: "Caribbean" },
  { name: "Cartagena",              lat: 10.3910, lon: -75.4794, region: "Caribbean" },
  { name: "CocoCay",                lat: 25.8300, lon: -77.6700, region: "Caribbean" },
  // ---- Western Mediterranean ----
  { name: "Barcelona",              lat: 41.3500, lon:   2.1700, region: "Mediterranean" },
  { name: "Valencia",               lat: 39.4500, lon:  -0.3200, region: "Mediterranean" },
  // Palma de Mallorca
  { name: "Palma",                  lat: 39.5700, lon:   2.6500, region: "Mediterranean" },
  { name: "Palma de Mallorca",      lat: 39.5700, lon:   2.6500, region: "Mediterranean" },
  // Ibiza -- port is Ibiza Town
  { name: "Ibiza",                  lat: 38.9100, lon:   1.4300, region: "Mediterranean" },
  { name: "Ibiza Town",             lat: 38.9100, lon:   1.4300, region: "Mediterranean" },
  { name: "Malaga",                 lat: 36.7200, lon:  -4.4200, region: "Mediterranean" },
  { name: "Cadiz",                  lat: 36.5300, lon:  -6.3000, region: "Mediterranean" },
  { name: "Lisbon",                 lat: 38.7200, lon:  -9.1400, region: "Mediterranean" },
  { name: "Marseille",              lat: 43.3000, lon:   5.3700, region: "Mediterranean" },
  { name: "Nice",                   lat: 43.7000, lon:   7.2700, region: "Mediterranean" },
  { name: "Monaco",                 lat: 43.7300, lon:   7.4200, region: "Mediterranean" },
  { name: "Genoa",                  lat: 44.4100, lon:   8.9300, region: "Mediterranean" },
  { name: "La Spezia",              lat: 44.1000, lon:   9.8200, region: "Mediterranean" },
  { name: "Livorno",                lat: 43.5500, lon:  10.3100, region: "Mediterranean" },
  { name: "Civitavecchia",          lat: 42.0900, lon:  11.8000, region: "Mediterranean" },
  { name: "Naples",                 lat: 40.8500, lon:  14.2700, region: "Mediterranean" },
  // Sardinia -- main cruise port is Cagliari
  { name: "Sardinia",               lat: 39.2238, lon:   9.1217, region: "Mediterranean" },
  { name: "Cagliari",               lat: 39.2238, lon:   9.1217, region: "Mediterranean" },
  // Corsica -- main cruise port is Ajaccio
  { name: "Corsica",                lat: 41.9194, lon:   8.7386, region: "Mediterranean" },
  { name: "Ajaccio",                lat: 41.9194, lon:   8.7386, region: "Mediterranean" },
  { name: "Split",                  lat: 43.5100, lon:  16.4400, region: "Mediterranean" },
  { name: "Dubrovnik",              lat: 42.6500, lon:  18.0900, region: "Mediterranean" },
  { name: "Venice",                 lat: 45.4400, lon:  12.3300, region: "Mediterranean" },
  // ---- Eastern Mediterranean ----
  // Athens -- cruise port is Piraeus
  { name: "Athens",                 lat: 37.9475, lon:  23.6430, region: "Mediterranean" },
  { name: "Piraeus",                lat: 37.9475, lon:  23.6430, region: "Mediterranean" },
  // Santorini -- port is Athinios / Fira
  { name: "Santorini",              lat: 36.3932, lon:  25.4615, region: "Mediterranean" },
  { name: "Fira",                   lat: 36.3932, lon:  25.4615, region: "Mediterranean" },
  { name: "Mykonos",                lat: 37.4500, lon:  25.3300, region: "Mediterranean" },
  { name: "Rhodes",                 lat: 36.4300, lon:  28.2200, region: "Mediterranean" },
  { name: "Corfu",                  lat: 39.6200, lon:  19.9200, region: "Mediterranean" },
  { name: "Istanbul",               lat: 41.0100, lon:  28.9800, region: "Mediterranean" },
  { name: "Izmir",                  lat: 38.4200, lon:  27.1400, region: "Mediterranean" },
  // Cyprus -- main cruise port is Limassol
  { name: "Cyprus",                 lat: 34.6786, lon:  33.0413, region: "Mediterranean" },
  { name: "Limassol",               lat: 34.6786, lon:  33.0413, region: "Mediterranean" },
  { name: "Haifa",                  lat: 32.8200, lon:  34.9900, region: "Mediterranean" },
  { name: "Alexandria",             lat: 31.2000, lon:  29.9200, region: "Mediterranean" },
  // ---- Eastern Pacific ----
  { name: "Ensenada",               lat: 31.8700, lon: -116.6000, region: "Pacific" },
  { name: "Cabo San Lucas",         lat: 22.8900, lon: -109.9100, region: "Pacific" },
  { name: "Mazatlan",               lat: 23.2400, lon: -106.4100, region: "Pacific" },
  { name: "Puerto Vallarta",        lat: 20.6500, lon: -105.2200, region: "Pacific" },
  { name: "Manzanillo",             lat: 19.0500, lon: -104.3200, region: "Pacific" },
  { name: "Huatulco",               lat: 15.7400, lon:  -96.1300, region: "Pacific" },
];

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

// ============================================================
// Interfaces
// ============================================================
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
}

interface PortWeatherData {
  tempF: number;
  windKt: number;
  windDir: string;
  condition: string;
  hourlyToday: HourlySlot[];
  forecast: DayForecast[];
}

interface PortSlot {
  portName: string;
  lat: number;
  lon: number;
  weather: PortWeatherData | null;
  loading: boolean;
  error: boolean;
}

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ============================================================
// Data Fetching
// ============================================================
async function fetchPortData(lat: number, lon: number): Promise<PortWeatherData> {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_probability_max,weathercode` +
    `&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=6`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&daily=wave_height_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max` +
    `&length_unit=imperial&timezone=auto&forecast_days=6`;

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

  // Determine today's local date using the API's timezone string
  // Open-Meteo returns timezone e.g. "America/Nassau" -- use it to get the correct local date
  const apiTimezone: string = weather.timezone ?? "UTC";
  const todayLocalDate = new Date().toLocaleDateString("en-CA", { timeZone: apiTimezone }); // "YYYY-MM-DD"

  // Target hours for the hourly strip: 6 AM through 10 PM (17 slots)
  const TARGET_HOURS_TODAY = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
  const labelMap: Record<number, string> = {
    6:"6a",7:"7a",8:"8a",9:"9a",10:"10a",11:"11a",
    12:"12p",13:"1p",14:"2p",15:"3p",16:"4p",17:"5p",18:"6p",19:"7p",
    20:"8p",21:"9p",22:"10p"
  };

  // No midnight slot needed for 6a-10p range
  const nextLocalDate = "";

  const hourlySlots: HourlySlot[] = [];
  const seenHours = new Set<number>();

  if (h?.time) {
    (h.time as string[]).forEach((isoTime: string, idx: number) => {
      const datePart = isoTime.slice(0, 10);
      const hourPart = parseInt(isoTime.slice(11, 13), 10);

      let effectiveHour: number | null = null;

      if (datePart === todayLocalDate && TARGET_HOURS_TODAY.includes(hourPart)) {
        effectiveHour = hourPart;
      } else if (datePart === nextLocalDate && hourPart === 0) {
        // Midnight of the following local day = end of today's strip
        effectiveHour = 24;
      }

      if (effectiveHour === null || effectiveHour === 24) return;
      if (seenHours.has(effectiveHour)) return; // deduplicate
      seenHours.add(effectiveHour);

      const tempF = cToF(h.temperature_2m[idx] ?? 20);
      const wKt = msToKt(h.wind_speed_10m[idx] ?? 0);
      const wDir = degToCompass(h.wind_direction_10m[idx] ?? 0);
      const wmo = h.weathercode[idx] ?? 0;
      const rain = h.precipitation_probability[idx] ?? 0;

      hourlySlots.push({
        hour: effectiveHour,
        label: labelMap[effectiveHour] ?? `${effectiveHour}:00`,
        tempF,
        windKt: wKt,
        windDir: wDir,
        rainChance: rain,
        condition: wmoToCondition(wmo),
        wmoCode: wmo,
      });
    });
  }

  hourlySlots.sort((a, b) => a.hour - b.hour);

  // Build 5-day forecast (skip today = index 0, show days 1-5)
  const forecast: DayForecast[] = (d.time as string[]).slice(1, 6).map((dateStr: string, rawIdx: number) => {
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
// Today's Hourly Forecast Panel
// ============================================================
function HourlyForecast({ slots, isMetric }: { slots: HourlySlot[]; isMetric: boolean }) {
  if (slots.length === 0) {
    return <p className="text-white/30 text-xs py-2">Hourly data unavailable for this port.</p>;
  }
  // Full-width CSS grid -- each card gets an equal share of the container, no scroll, no empty space
  return (
    <div className="w-full">
      <div
        className="grid w-full gap-1"
        style={{ gridTemplateColumns: `repeat(${slots.length}, 1fr)` }}
      >
        {slots.map(slot => (
          <div
            key={slot.hour}
            className="flex flex-col items-center justify-between bg-white/5 border border-white/10 rounded-lg py-2 px-0.5 min-w-0"
          >
            <span className="text-amber-100/70 text-[11px] font-bold truncate w-full text-center">{slot.label}</span>
            <SkyIcon condition={slot.condition} className="w-5 h-5 text-yellow-300 my-0.5 flex-shrink-0" />
            <span className="text-white font-black text-sm leading-none">
              {isMetric ? fToCStr(slot.tempF) : `${slot.tempF}\u00b0`}
            </span>
            <span className="text-cyan-300 text-[10px] font-bold mt-0.5 truncate w-full text-center">
              {isMetric ? `${slot.windKt}kt` : `${ktToMph(slot.windKt)}mph`}
            </span>
            <span className="text-white/50 text-[9px] truncate w-full text-center">{slot.windDir}</span>
            <span className="text-blue-300 text-[10px] font-bold mt-0.5">{slot.rainChance}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 5-Day Forecast Panel
// ============================================================
function FiveDayForecast({ days, isMetric }: { days: DayForecast[]; isMetric: boolean }) {
  if (days.length === 0) return null;
  const hasWave = days.some(d => d.swellHeightFt != null);

  return (
    <div>
      <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3">5-Day Forecast</p>
      <div className="grid grid-cols-5 gap-3">
        {days.map(day => {
          const d = new Date(day.date + "T12:00:00");
          return (
              <div key={day.date} className="flex flex-col justify-between text-center bg-white/5 border border-white/10 rounded-xl py-4 px-1">
              <div>
                <p className="text-white/70 text-base font-extrabold mb-2">{DAY_NAMES[d.getDay()]}</p>
                <SkyIcon condition={day.condition} className="w-14 h-14 text-yellow-300 mx-auto mb-2" />
                <p className="text-white text-3xl font-extrabold leading-tight">
                  {isMetric ? fToCStr(day.maxF) : `${day.maxF}\u00b0`}
                </p>
                <p className="text-white/50 text-xl font-bold mb-3">
                  {isMetric ? fToCStr(day.minF) : `${day.minF}\u00b0`}
                </p>
              </div>
              <div className="border-t border-white/10 my-2" />
              <div>
                <p className="text-cyan-300 text-base font-extrabold">{day.windDir}</p>
                <p className="text-white/80 text-base font-bold">
                  {isMetric ? `${day.windKt}kt` : `${ktToMph(day.windKt)}mph`}
                </p>
                <p className="text-blue-300 text-base font-extrabold">{day.rainChance}%</p>
              </div>
              {(() => {
                // Use swellHeightFt if available, fall back to waveHeightFt
                const displayHt = day.swellHeightFt ?? day.waveHeightFt;
                if (displayHt == null) return null;
                return (
                  <>
                    <div className="border-t border-white/10 my-2" />
                    <p className="text-teal-300 text-sm font-extrabold leading-snug">
                      {isMetric ? swellFtToM(displayHt) : `${displayHt}ft`}
                    </p>
                    {day.swellDir && <p className="text-teal-400/70 text-xs font-bold leading-snug">{day.swellDir}</p>}
                    {day.swellPeriod && <p className="text-white/50 text-xs font-bold leading-snug">{day.swellPeriod}s</p>}
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>
      {hasWave && (
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-white/10">
          <span className="text-teal-300 text-xs font-bold">ft/m = swell ht</span>
          <span className="text-teal-400/70 text-xs font-bold">dir = swell dir</span>
          <span className="text-white/50 text-xs font-bold">s = period</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Single Port Slot -- typeahead + Get Forecast button + inline forecast
// ============================================================
function PortSlotCard({
  slotIndex,
  slot,
  isMetric,
  query,
  selectedPort,
  onQueryChange,
  onClear,
}: {
  slotIndex: number;
  slot: PortSlot | null;
  isMetric: boolean;
  query: string;
  selectedPort: typeof PORT_LIST[0] | null;
  onQueryChange: (q: string, port: typeof PORT_LIST[0] | null) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const labels = ["Port 1", "Port 2", "Port 3", "Port 4"];

  // Auto-expand when new weather data arrives
  useEffect(() => {
    if (slot?.weather && !slot.loading) setExpanded(true);
  }, [slot?.weather, slot?.loading]);

  // Collapse open dropdown when slot is cleared
  useEffect(() => {
    if (!slot && !query) setOpen(false);
  }, [slot, query]);

  const suggestions = query.length >= 1
    ? PORT_LIST.filter(p =>
        p.name.toLowerCase().startsWith(query.toLowerCase()) ||
        p.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  const handlePickSuggestion = (port: typeof PORT_LIST[0]) => {
    onQueryChange(port.name, port);
    setOpen(false);
  };

  const handleClear = () => {
    onQueryChange("", null);
    setOpen(false);
    onClear();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hasForecast = slot?.weather && !slot.loading && !slot.error;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      {/* Search row */}
      <div className="p-4">
        <label className="text-[#d4c5a9] text-xs font-semibold tracking-widest uppercase flex items-center gap-2 mb-2">
          <MapPin className="w-3 h-3 text-cyan-400" />
          {labels[slotIndex]}
        </label>

        <div className="flex gap-2">
          {/* Typeahead input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => {
                onQueryChange(e.target.value, null); // lift query up, clear selection
                setOpen(true);
              }}
              onFocus={() => { if (query.length >= 1) setOpen(true); }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  setOpen(false);
                  // Enter key on a slot: let the parent's shared button handle it,
                  // but if a suggestion is already selected fire it immediately
                  if (selectedPort) onQueryChange(selectedPort.name, selectedPort);
                }
              }}
              placeholder="Type a port name..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-9 py-3 text-white text-sm placeholder-white/30 focus:border-cyan-400/60 focus:outline-none transition-colors"
            />
            {query && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {/* Dropdown suggestions */}
            {open && suggestions.length > 0 && (
              <div
                ref={listRef}
                className="absolute z-50 w-full mt-1 bg-[#0c1a30] border border-cyan-400/30 rounded-lg shadow-xl overflow-hidden"
              >
                {suggestions.map(port => (
                  <button
                    key={port.name}
                    onMouseDown={() => handlePickSuggestion(port)}
                    className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-cyan-400/10 hover:text-white flex items-center justify-between transition-colors"
                  >
                    <span>{port.name}</span>
                    <span className="text-white/30 text-xs">{port.region}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* No per-slot button -- the shared Get Forecast button below fires all slots */}
        </div>
      </div>

      {/* Loading state */}
      {slot?.loading && (
        <div className="px-4 pb-4 flex items-center gap-2 text-white/40 text-sm">
          <div className="w-4 h-4 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
          Loading forecast for {slot.portName}...
        </div>
      )}

      {/* Error state */}
      {slot?.error && !slot.loading && (
        <div className="px-4 pb-4 text-white/40 text-sm">
          Forecast unavailable for {slot.portName}. Please try again.
        </div>
      )}

      {/* Forecast content -- expands below the search row */}
      {hasForecast && (
        <div>
          {/* Port summary bar -- click to collapse/expand */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500/15 to-blue-600/10 border-t border-cyan-400/20 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <SkyIcon condition={slot!.weather!.condition} className="w-5 h-5 text-yellow-300" />
              <div className="text-left">
                <span className="text-white font-bold text-sm">{slot!.portName}</span>
                <span className="text-white/50 text-xs ml-2">{slot!.weather!.condition}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-white font-black text-xl">
                {isMetric ? fToCStr(slot!.weather!.tempF) : `${slot!.weather!.tempF}\u00b0`}
              </span>
              <span className="text-cyan-300 text-sm font-bold">
                {isMetric ? `${slot!.weather!.windKt}kt` : `${ktToMph(slot!.weather!.windKt)}mph`}
                <span className="text-white/40 text-xs ml-1">{slot!.weather!.windDir}</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-white/40 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
              />
            </div>
          </button>

          {/* Expandable forecast panels */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              expanded ? "max-h-[1400px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="px-4 py-4 space-y-5">
              {/* Today's hourly */}
              <div>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3">
                  Today's Forecast -- 4 AM to Midnight (2-Hour Increments)
                </p>
                <HourlyForecast slots={slot!.weather!.hourlyToday} isMetric={isMetric} />
              </div>
              {/* 5-day forecast */}
              <FiveDayForecast days={slot!.weather!.forecast} isMetric={isMetric} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main PortSearch Component
// ============================================================
interface PortSearchProps { isMetric: boolean; }

export default function PortSearch({ isMetric: parentIsMetric }: PortSearchProps) {
  const [localMetric, setLocalMetric] = useState(parentIsMetric);
  const [slots, setSlots] = useState<(PortSlot | null)[]>([null, null, null, null]);
  // Lifted query state so the shared Get Forecast button can read all 4 inputs
  const [queries, setQueries] = useState<string[]>(["" , "", "", ""]);
  const [selectedPorts, setSelectedPorts] = useState<(typeof PORT_LIST[0] | null)[]>([null, null, null, null]);
  // Whether any forecast has been loaded -- controls Back button visibility
  const [forecastsLoaded, setForecastsLoaded] = useState(false);

  useEffect(() => { setLocalMetric(parentIsMetric); }, [parentIsMetric]);

  const fetchSlot = useCallback((slotIndex: number, port: { name: string; lat: number; lon: number }) => {
    setSlots(prev => {
      const next = [...prev];
      next[slotIndex] = { portName: port.name, lat: port.lat, lon: port.lon, weather: null, loading: true, error: false };
      return next;
    });

    fetchPortData(port.lat, port.lon)
      .then(weather => {
        setSlots(prev => {
          const next = [...prev];
          next[slotIndex] = { portName: port.name, lat: port.lat, lon: port.lon, weather, loading: false, error: false };
          return next;
        });
        setForecastsLoaded(true);
      })
      .catch(() => {
        setSlots(prev => {
          const next = [...prev];
          next[slotIndex] = { portName: port.name, lat: port.lat, lon: port.lon, weather: null, loading: false, error: true };
          return next;
        });
      });
  }, []);

  // Resolve a query string to a port entry via fuzzy match
  const resolvePort = (q: string, preSelected: typeof PORT_LIST[0] | null) => {
    if (preSelected) return preSelected;
    const lower = q.trim().toLowerCase();
    if (!lower) return null;
    return (
      PORT_LIST.find(p => p.name.toLowerCase() === lower) ??
      PORT_LIST.find(p => p.name.toLowerCase().startsWith(lower)) ??
      PORT_LIST.find(p => p.name.toLowerCase().includes(lower)) ??
      null
    );
  };

  // Shared Get Forecast: fires all slots that have a non-empty query
  const handleGetAllForecasts = () => {
    let fired = false;
    queries.forEach((q, i) => {
      if (!q.trim()) return;
      const port = resolvePort(q, selectedPorts[i]);
      if (!port) return;
      // Update query display to canonical name
      setQueries(prev => { const n = [...prev]; n[i] = port.name; return n; });
      setSelectedPorts(prev => { const n = [...prev]; n[i] = port; return n; });
      fetchSlot(i, port);
      fired = true;
    });
    if (fired) setForecastsLoaded(true);
  };

  // Back button: clear all forecasts and queries, return to input view
  const handleBack = () => {
    setSlots([null, null, null, null]);
    setQueries(["", "", "", ""]);
    setSelectedPorts([null, null, null, null]);
    setForecastsLoaded(false);
  };

  const handleClear = useCallback((slotIndex: number) => {
    setSlots(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
    setQueries(prev => { const n = [...prev]; n[slotIndex] = ""; return n; });
    setSelectedPorts(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
  }, []);

  const anyQueryFilled = queries.some(q => q.trim().length > 0);

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            <span className="text-white/50 text-xs tracking-widest uppercase font-semibold">Port Forecast Tool</span>
          </div>
          <h3 className="text-white font-black text-2xl leading-tight">Your Cruise Forecast,</h3>
          <h3 className="text-cyan-400 font-black text-2xl leading-tight">Port by Port.</h3>
          <p className="text-white/50 text-sm mt-1 max-w-md">
            Type up to 4 ports, then tap <strong className="text-white/70">Get Forecast</strong> to load all at once.
          </p>
        </div>
        {/* Units toggle */}
        <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-semibold self-start">
          <button
            onClick={() => setLocalMetric(false)}
            className={`px-3 py-1.5 transition-colors ${!localMetric ? "bg-cyan-500 text-white" : "bg-white/5 text-white/50 hover:text-white"}`}
          >
            US Standard
          </button>
          <button
            onClick={() => setLocalMetric(true)}
            className={`px-3 py-1.5 transition-colors ${localMetric ? "bg-cyan-500 text-white" : "bg-white/5 text-white/50 hover:text-white"}`}
          >
            Metric
          </button>
        </div>
      </div>

      {/* 4 port slots stacked vertically */}
      <div className="space-y-4">
        {[0, 1, 2, 3].map(i => (
          <PortSlotCard
            key={i}
            slotIndex={i}
            slot={slots[i]}
            isMetric={localMetric}
            query={queries[i]}
            selectedPort={selectedPorts[i]}
            onQueryChange={(q, port) => {
              setQueries(prev => { const n = [...prev]; n[i] = q; return n; });
              setSelectedPorts(prev => { const n = [...prev]; n[i] = port; return n; });
            }}
            onClear={() => handleClear(i)}
          />
        ))}
      </div>

      {/* Shared action row: Get Forecast + Back */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleGetAllForecasts}
          disabled={!anyQueryFilled}
          className={`flex-1 sm:flex-none px-8 py-3.5 rounded-xl text-sm font-black tracking-wide transition-all ${
            anyQueryFilled
              ? "bg-cyan-500 hover:bg-cyan-400 text-white shadow-lg shadow-cyan-500/30"
              : "bg-white/5 text-white/20 cursor-not-allowed border border-white/10"
          }`}
        >
          Get Forecast
        </button>
        {forecastsLoaded && (
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
