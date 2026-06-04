import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  MapPin, Search, X, Calendar,
  Sun, Cloud, CloudRain, CloudLightning, Snowflake, Eye, ChevronDown,
  Anchor, Plus
} from "lucide-react";
import { PORT_LIST } from "../data/ports";
// PORT_LIST is now in client/src/data/ports.ts
// To add a port: edit ports.ts only -- no other file needs to change

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
  humidity: number | null;
  uvIndex: number | null;
  cloudCover: number | null;
  visibility: number | null;
  seaState: string | null;
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
  isSeaDay: boolean;
}

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ============================================================
// NWS eligibility and authoritative PoP helpers
// ============================================================
// US ports and US territories use NWS api.weather.gov for authoritative PoP.
// All other ports use the ECMWF IFS025 precipitation threshold method.
// Key: "lat_lon" string with 2 decimal places.
const NWS_ELIGIBLE_COORDS_PS = new Set<string>([
  // US Ports (regions.ts us-ports slug)
  "39.29_-76.61",  // Baltimore
  "40.67_-74.11",  // Bayonne
  "42.36_-71.06",  // Boston
  "40.68_-74.01",  // Brooklyn
  "32.78_-79.93",  // Charleston
  "29.30_-94.80",  // Galveston
  "29.74_-95.01",  // Houston
  "30.33_-81.66",  // Jacksonville
  "33.77_-118.19", // Long Beach
  "33.74_-118.29", // Los Angeles
  "40.77_-74.00",  // Manhattan
  "25.78_-80.17",  // Miami (ports.ts lat/lon)
  "29.95_-90.07",  // New Orleans
  "36.85_-76.30",  // Norfolk
  "39.91_-75.14",  // Philadelphia
  "28.41_-80.62",  // Port Canaveral
  "26.08_-80.12",  // Port Everglades
  "32.72_-117.16", // San Diego
  "37.80_-122.41", // San Francisco
  "32.08_-81.10",  // Savannah
  "27.93_-82.45",  // Tampa Bay
  // US territories (eastern-caribbean slug)
  "18.47_-66.11",  // San Juan, PR (ports.ts)
  "18.34_-64.93",  // St. Thomas, USVI
  "17.73_-64.73",  // St. Croix, USVI
  // Key West (bahamas-central-caribbean slug)
  "24.56_-81.78",  // Key West, FL
  // Alaska
  "61.22_-149.90", // Anchorage
  "58.30_-134.42", // Juneau
  "55.34_-131.65", // Ketchikan
  "47.61_-122.33", // Seattle
  "57.05_-135.33", // Sitka
  "59.46_-135.31", // Skagway
  "57.85_-133.65", // Tracy Arm Fjord
  "59.24_-135.45", // Haines
]);

function isNwsEligiblePS(lat: number, lon: number): boolean {
  const key = `${Math.round(lat * 100) / 100}_${Math.round(lon * 100) / 100}`;
  return NWS_ELIGIBLE_COORDS_PS.has(key);
}

// Returns { dailyPop: number[], hourlyPop: Map<string, number> } for NWS ports.
// dailyPop[i] = daily mean PoP for day i (0-indexed, today = 0).
// hourlyPop: keyed by "YYYY-MM-DDTHH:00" -> PoP value.
async function fetchNwsPopDetailed(lat: number, lon: number): Promise<{ dailyPop: number[]; hourlyPop: Map<string, number> }> {
  const NWS_HEADERS = { "User-Agent": "mycruisingweather.com/1.0 james@mycruisingweather.com" };

  async function getHourlyPeriods(la: number, lo: number): Promise<any[]> {
    const ptsRes = await fetch(`https://api.weather.gov/points/${la.toFixed(4)},${lo.toFixed(4)}`, { headers: NWS_HEADERS });
    if (!ptsRes.ok) throw new Error(`NWS points ${ptsRes.status}`);
    const pts = await ptsRes.json();
    const fxRes = await fetch(pts.properties.forecastHourly, { headers: NWS_HEADERS });
    if (!fxRes.ok) throw new Error(`NWS hourly ${fxRes.status}`);
    const fx = await fxRes.json();
    return fx.properties.periods;
  }

  let periods: any[];
  try {
    periods = await getHourlyPeriods(lat, lon);
  } catch (e: any) {
    if (e?.message?.includes("404")) {
      periods = await getHourlyPeriods(lat + 0.05, lon + 0.05);
    } else {
      throw e;
    }
  }

  // Build hourlyPop map and dailyPop array
  const hourlyPop = new Map<string, number>();
  const dayBuckets = new Map<string, number[]>();

  for (const period of periods) {
    const startTime: string = period.startTime; // ISO 8601 e.g. "2026-05-31T14:00:00-04:00"
    const pop = period.probabilityOfPrecipitation?.value ?? 0;
    // Normalize to "YYYY-MM-DDTHH:00" local time
    const localKey = startTime.slice(0, 13) + ":00";
    hourlyPop.set(localKey, pop);
    const dayKey = startTime.slice(0, 10);
    if (!dayBuckets.has(dayKey)) dayBuckets.set(dayKey, []);
    dayBuckets.get(dayKey)!.push(pop);
  }

  const dailyPop: number[] = [];
  for (const [, pops] of dayBuckets) {
    dailyPop.push(Math.round(pops.reduce((a, b) => a + b, 0) / pops.length));
    if (dailyPop.length >= 8) break;
  }

  return { dailyPop, hourlyPop };
}

// Returns { dailyPop: number[], hourlyPrecip: number[] } for ECMWF threshold path.
// dailyPop[i] = threshold-derived PoP for day i.
// hourlyPrecip: raw mm values indexed 0..N*24-1.
async function fetchEcmwfPrecipDetailed(lat: number, lon: number, numDays = 8): Promise<{ dailyPop: number[]; hourlyPrecip: number[] }> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation&timezone=auto&forecast_days=${numDays}&models=ecmwf_ifs025`;
  const res = await fetch(url).then(r => r.json());
  const hourlyPrecip: number[] = (res.hourly?.precipitation ?? []).map((v: number | null) => v ?? 0);
  const dailyPop: number[] = [];
  for (let day = 0; day < numDays; day++) {
    const start = day * 24;
    const end = start + 24;
    const dayPrecip = hourlyPrecip.slice(start, end);
    if (dayPrecip.length === 0) break;
    const blocks: number[][] = [];
    for (let i = 0; i < dayPrecip.length; i += 3) blocks.push(dayPrecip.slice(i, i + 3));
    const wetBlocks = blocks.filter(b => b.reduce((a, v) => a + v, 0) >= 0.5).length;
    dailyPop.push(Math.round(wetBlocks / blocks.length * 100));
  }
  return { dailyPop, hourlyPrecip };
}

// ============================================================
// Weather fetch with ecmwf_ifs025 -> best_match fallback
// FIX_MARKER: ECMWF_FALLBACK_v1
// ============================================================
async function fetchWeatherWithFallbackPS(url: string): Promise<any> {
  const tryFetch = async (fetchUrl: string): Promise<any> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(fetchUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      if (json && typeof json === "object" && (json as any).error === true) throw new Error("API error payload");
      return json;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };
  try {
    return await tryFetch(url);
  } catch {
    const fallbackUrl = url.replace("models=ecmwf_ifs025", "models=best_match");
    return await tryFetch(fallbackUrl);
  }
}

// ============================================================
// Data Fetching
// ============================================================
async function fetchPortData(lat: number, lon: number): Promise<PortWeatherData> {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode,relativehumidity_2m,uv_index,cloudcover,visibility,precipitation` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,weathercode,uv_index_max,windspeed_10m_max,cloudcover_mean` +
    `&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=8&models=ecmwf_ifs025`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&daily=wave_height_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max` +
    `&length_unit=imperial&timezone=auto&forecast_days=8`;

  const useNws = isNwsEligiblePS(lat, lon);

  // Fetch weather, marine, and authoritative PoP in parallel
  const [weatherRes, marineRes, popRes] = await Promise.allSettled([
    fetchWeatherWithFallbackPS(weatherUrl),
    fetch(marineUrl).then(r => r.json()),
    useNws
      ? fetchNwsPopDetailed(lat, lon)
      : fetchEcmwfPrecipDetailed(lat, lon, 8),
  ]);

  const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
  const marine  = marineRes.status  === "fulfilled" ? marineRes.value  : null;
  const popData  = popRes.status === "fulfilled" ? popRes.value : null;

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

  // For ECMWF non-NWS path: today's daily PoP for scaling hourly precipitation signal
  const todayDailyPop = popData?.dailyPop?.[0] ?? 0;
  // For NWS path: hourlyPop map keyed by "YYYY-MM-DDTHH:00"
  const nwsHourlyPop: Map<string, number> | null = useNws && popData && "hourlyPop" in popData
    ? (popData as { dailyPop: number[]; hourlyPop: Map<string, number> }).hourlyPop
    : null;
  // For ECMWF path: hourly precipitation array
  const ecmwfHourlyPrecip: number[] | null = !useNws && popData && "hourlyPrecip" in popData
    ? (popData as { dailyPop: number[]; hourlyPrecip: number[] }).hourlyPrecip
    : null;

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
      const hum = h.relativehumidity_2m?.[idx] ?? 0;
      const uv = h.uv_index?.[idx] ?? 0;
      const cc = h.cloudcover?.[idx] ?? 0;
      const vis = h.visibility?.[idx] ?? 0; // metres
      const visKm = Math.round(vis / 100) / 10; // km with 1 decimal

      // Authoritative hourly rain chance:
      // NWS path: use NWS hourly PoP directly
      // ECMWF path: if this hour has >= 0.1mm precip, show today's daily PoP; else 0
      let rain = 0;
      if (nwsHourlyPop) {
        // Try exact key match first, then fall back to nearest hour
        const key = `${datePart}T${String(hourPart).padStart(2, "0")}:00`;
        rain = nwsHourlyPop.get(key) ?? 0;
      } else if (ecmwfHourlyPrecip) {
        const precip = ecmwfHourlyPrecip[idx] ?? 0;
        rain = precip >= 0.1 ? todayDailyPop : 0;
      }

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

  // Build 7-day forecast (skip today = index 0, show days 1-7)
  const forecast: DayForecast[] = (d.time as string[]).slice(1, 8).map((dateStr: string, rawIdx: number) => {
    const i = rawIdx + 1;
    const wKt = msToKt(d.wind_speed_10m_max[i]);
    const swellDeg = md?.swell_wave_direction_dominant?.[i];
    // Use authoritative daily PoP for each forecast day
    const dayMeanRain = popData?.dailyPop?.[i] ?? 0;
    return {
      date: dateStr,
      maxF: cToF(d.temperature_2m_max[i]),
      minF: cToF(d.temperature_2m_min[i]),
      windKt: wKt,
      windDir: degToCompass(d.wind_direction_10m_dominant[i]),
      rainChance: dayMeanRain,
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
// Today's Hourly Forecast Panel
// ============================================================
function cloudCoverIcon(pct: number): string {
  if (pct <= 10) return "\u2600\ufe0f";  // clear sun
  if (pct <= 30) return "\uD83C\uDF24\uFE0F"; // sun behind small cloud
  if (pct <= 60) return "\u26C5";  // partly cloudy
  if (pct <= 85) return "\uD83C\uDF25\uFE0F"; // sun behind large cloud
  return "\u2601\ufe0f"; // full cloud
}
function HourlyForecast({ slots, isMetric }: { slots: HourlySlot[]; isMetric: boolean }) {
  if (slots.length === 0) {
    return <p className="text-white/30 text-xs py-2">Hourly data unavailable for this port.</p>;
  }
  return (
    <div className="w-full overflow-x-auto">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(82px, 1fr))`, minWidth: `${slots.length * 82}px` }}
      >
        {slots.map(slot => (
          <div
            key={slot.hour}
            className="flex flex-col items-center bg-white/5 border border-white/10 rounded-lg py-6 px-1.5 gap-3 min-w-0"
          >
            {/* Time label */}
            <span className="text-amber-100/70 text-xs font-bold w-full text-center">{slot.label}</span>
            {/* Cloud cover icon + % at top -- realistic emoji icon reflecting actual cloud amount */}
            <span className="text-[17px] leading-none">{cloudCoverIcon(slot.cloudCover)}</span>
            <span className="text-white/70 text-xs font-bold flex flex-col items-center leading-none gap-0.5">{slot.cloudCover}%<span className="text-[10px] font-bold opacity-80 leading-tight">cloud</span><span className="text-[10px] font-bold opacity-80 leading-tight">cover</span></span>
            {/* SkyIcon removed -- cloud cover emoji already conveys sky condition */}
            {/* Temperature */}
            <span className="text-white font-black text-sm leading-none">
              {isMetric ? fToCStr(slot.tempF) : `${slot.tempF}\u00b0`}
            </span>
            {/* Wind speed + direction */}
            <span className="text-cyan-300 text-xs font-bold w-full text-center">
              {isMetric ? `${slot.windKt}kt` : `${ktToMph(slot.windKt)}mph`}
            </span>
            <span className="text-white/50 text-[11px] font-semibold w-full text-center">{slot.windDir}</span>
            {/* Rain chance */}
            <span className="text-blue-300 text-sm font-bold flex flex-col items-center leading-none gap-0.5">{slot.rainChance}%<span className="text-[11px] font-bold opacity-90 leading-tight">rain chance</span></span>
            {/* Humidity */}
            <span className="text-white/60 text-[10px]">{slot.humidity}%<span className="text-[9px] font-normal opacity-70 ml-0.5">hum</span></span>
            {/* Sea state (wind-wave height estimate) -- orange to distinguish from swell */}
            <span className="text-orange-300 text-[11px] font-bold">{slot.seaState}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-white/10">
        <span className="text-blue-300 text-xs font-bold">% = rain chance</span>
        <span className="text-white/60 text-xs font-bold">hum = humidity</span>
        <span className="text-white/70 text-xs font-bold">cloud % = cloud cover</span>
        <span className="text-orange-300 text-xs font-bold">sea state = wind-wave ht estimate</span>
      </div>
    </div>
  );
}

// ============================================================
// 7-Day Forecast Panel
// ============================================================
function FiveDayForecast({ days, isMetric }: { days: DayForecast[]; isMetric: boolean }) {
  if (days.length === 0) return null;
  const hasWave = days.some(d => d.swellHeightFt != null);

  return (
    <div>
      <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3">7-Day Forecast</p>
      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const d = new Date(day.date + "T12:00:00");
          return (
              <div key={day.date} className="flex flex-col justify-between text-center bg-white/5 border border-white/10 rounded-xl py-6 px-1.5">
              <div>
                <p className="text-white/70 text-base font-extrabold mb-2">{DAY_NAMES[d.getDay()]}</p>
                {/* Cloud cover emoji + % -- matches hourly card style, no SVG icon */}
                <div className="flex flex-col items-center mb-2">
                  <span className="text-2xl leading-none">{cloudCoverIcon(day.cloudCover ?? 0)}</span>
                  <span className="text-white/70 text-xs font-bold mt-1 flex flex-col items-center leading-none gap-0.5">{day.cloudCover ?? 0}%<span className="text-[10px] font-bold opacity-80 leading-tight">cloud</span><span className="text-[10px] font-bold opacity-80 leading-tight">cover</span></span>
                </div>
                <p className="text-white text-xl sm:text-3xl font-extrabold leading-tight">
                  {isMetric ? fToCStr(day.maxF) : `${day.maxF}\u00b0`}
                </p>
                <p className="text-white/50 text-sm sm:text-xl font-bold mb-3">
                  {isMetric ? fToCStr(day.minF) : `${day.minF}\u00b0`}
                </p>
              </div>
              <div className="border-t border-white/10 my-3" />
              <div className="flex flex-col gap-2">
                <p className="text-cyan-300 text-base font-extrabold">{day.windDir}</p>
                <p className="text-white/80 font-bold leading-tight">
                  <span className="text-base">{isMetric ? day.windKt : ktToMph(day.windKt)}</span><span className="text-[10px] sm:text-sm font-semibold ml-px">{isMetric ? 'kt' : 'mph'}</span>
                </p>
                <p className="text-blue-300 text-lg font-extrabold flex flex-col items-center leading-none gap-1">{day.rainChance}%<span className="text-xs font-bold opacity-90 leading-tight">rain chance</span></p>
                {/* Sea state = wind-wave height estimate -- orange to contrast with teal swell */}
                {day.seaState && <p className="text-orange-300 text-sm font-bold">{day.seaState}</p>}
              </div>
              {(() => {
                // Swell height from marine API (actual swell, not wind-wave estimate)
                // swellHeightFt preferred; fall back to waveHeightFt
                // isMetric toggle controls display unit -- never show both at once
                const displayHt = day.swellHeightFt ?? day.waveHeightFt;
                if (displayHt == null) return null;
                return (
                  <>
                    <div className="border-t border-white/10 my-3" />
                    {/* Swell height: ft in US standard, m in metric -- one value only */}
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
      <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-white/10">
        <span className="text-blue-300 text-xs font-bold">% = rain chance</span>
        <span className="text-orange-300 text-xs font-bold">sea state = wind-wave ht estimate</span>
        {hasWave && <span className="text-teal-300 text-xs font-bold">ft/m = swell ht (marine API)</span>}
        {hasWave && <span className="text-teal-400/70 text-xs font-bold">dir = swell dir</span>}
        {hasWave && <span className="text-white/50 text-xs font-bold">s = period</span>}
      </div>
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
  onSetMetric,
  query,
  selectedPort,
  onQueryChange,
  onClear,
  onGetForecast,
  isSeaDay,
  onToggleSeaDay,
}: {
  slotIndex: number;
  slot: PortSlot | null;
  isMetric: boolean;
  onSetMetric: (v: boolean) => void;
  query: string;
  selectedPort: typeof PORT_LIST[0] | null;
  onQueryChange: (q: string, port: typeof PORT_LIST[0] | null) => void;
  onClear: () => void;
  onGetForecast: () => void;
  isSeaDay: boolean;
  onToggleSeaDay: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [date, setDate] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const labels = ["Departure Port", "Destination 1", "Destination 2", "Destination 3", "Destination 4"];

  // Auto-expand when new weather data arrives
  useEffect(() => {
    if (slot?.weather && !slot.loading) setExpanded(true);
  }, [slot?.weather, slot?.loading]);

  // Collapse open dropdown when slot is cleared
  useEffect(() => {
    if (!slot && !query) setOpen(false);
  }, [slot, query]);

  // Normalize: canonicalize "Saint" -> "st", strip periods/ampersands, collapse whitespace.
  // This means "Saint Maarten", "St. Maarten", "St Maarten" all normalize to "st maarten"
  // and match any port whose name or alias normalizes the same way.
  const normStr = (s: string) =>
    s.toLowerCase()
      .replace(/\bsaint\b/g, "st")
      .replace(/[.&]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const qNorm = normStr(query);
  // Check if a port matches the query -- searches both primary name and all aliases
  const portMatches = (p: typeof PORT_LIST[0]): boolean => {
    const pNorm = normStr(p.name);
    if (pNorm.startsWith(qNorm) || pNorm.includes(qNorm)) return true;
    return (p.aliases ?? []).some(a => {
      const aNorm = normStr(a);
      return aNorm.startsWith(qNorm) || aNorm.includes(qNorm);
    });
  };
  const suggestions = query.length >= 3
    ? PORT_LIST.filter(portMatches).slice(0, 8)
    : [];

  const handlePickSuggestion = (port: typeof PORT_LIST[0]) => {
    onQueryChange(port.name, port);
    setOpen(false);
    setActiveIdx(-1);
  };

  const handleClear = () => {
    onQueryChange("", null);
    setOpen(false);
    setActiveIdx(-1);
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
    <div className="bg-white/5 border border-white/10 rounded-2xl">
      {/* Search row */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[#d4c5a9] text-xs font-semibold tracking-widest uppercase flex items-center gap-2">
            <MapPin className="w-3 h-3 text-cyan-400" />
            {labels[slotIndex]}
          </label>
          <button
            onClick={onToggleSeaDay}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              isSeaDay
                ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
            }`}
          >
            <Anchor className="w-3 h-3" />
            Sea Day
          </button>
        </div>

        <div className="flex gap-2 items-center max-w-xl">
          {/* Typeahead input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={isSeaDay ? "Sea Day" : query}
              readOnly={isSeaDay}
              onChange={e => {
                if (isSeaDay) return;
                onQueryChange(e.target.value, null); // lift query up, clear selection
                setActiveIdx(-1);
                setOpen(true);
              }}
              onFocus={() => { if (!isSeaDay && query.length >= 3) setOpen(true); }}
              onKeyDown={e => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx(prev => Math.min(prev + 1, suggestions.length - 1));
                  setOpen(true);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx(prev => Math.max(prev - 1, -1));
                } else if (e.key === "Enter") {
                  if (open && activeIdx >= 0 && suggestions[activeIdx]) {
                    handlePickSuggestion(suggestions[activeIdx]);
                  } else {
                    setOpen(false);
                    // Enter key fires all filled slots -- same as clicking Get Forecast
                    onGetForecast();
                  }
                } else if (e.key === "Escape") {
                  setOpen(false);
                  setActiveIdx(-1);
                }
              }}
              placeholder={isSeaDay ? "Sea Day" : "Type a port name..."}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
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
                {suggestions.map((port, idx) => (
                  <button
                    key={port.name}
                    onMouseDown={() => handlePickSuggestion(port)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                      idx === activeIdx
                        ? "bg-cyan-400/20 text-white"
                        : "text-white/80 hover:bg-cyan-400/10 hover:text-white"
                    }`}
                  >
                    <span>{port.name}</span>
                    <span className="text-white/30 text-xs">{port.region}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Per-slot Get Forecast button -- hidden once forecast is loaded and hidden for Sea Day */}
          {!hasForecast && !isSeaDay && (
            <button
              onClick={onGetForecast}
              disabled={!query.trim()}
              className={`shrink-0 px-4 py-3 rounded-xl text-sm font-black tracking-wide transition-all ${
                query.trim()
                  ? "bg-cyan-500 hover:bg-cyan-400 text-white shadow-lg shadow-cyan-500/30"
                  : "bg-white/5 text-white/20 cursor-not-allowed border border-white/10"
              }`}
            >
              Get Forecast
            </button>
          )}

          {/* Units toggle -- shown only after forecast is loaded */}
          {hasForecast && (
            <div className="flex-shrink-0 flex rounded-lg overflow-hidden border border-white/10 text-xs font-semibold">
              <button
                onClick={() => onSetMetric(false)}
                className={`px-3 py-1.5 transition-colors ${!isMetric ? "bg-cyan-500 text-white" : "bg-white/5 text-white/50 hover:text-white"}`}
              >
                US Standard
              </button>
              <button
                onClick={() => onSetMetric(true)}
                className={`px-3 py-1.5 transition-colors ${isMetric ? "bg-cyan-500 text-white" : "bg-white/5 text-white/50 hover:text-white"}`}
              >
                Metric
              </button>
            </div>
          )}
        </div>

        {/* Date input -- always visible */}
        <div className="flex items-center gap-2 mt-3">
          <Calendar className="w-4 h-4 text-white/40 flex-shrink-0" />
          <input
            type="date"
            value={date}
            onChange={e => {
              setDate(e.target.value);
              (e.target as HTMLInputElement).blur();
            }}
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400/60"
            style={{ colorScheme: "dark" }}
          />
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
          {/* Current conditions (temp, wind) sit RIGHT NEXT TO the sky condition text on the left side */}
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
              {/* Current conditions immediately after sky condition text */}
              <span className="text-white font-black text-xl ml-3">
                {isMetric ? fToCStr(slot!.weather!.tempF) : `${slot!.weather!.tempF}\u00b0`}
              </span>
              <span className="text-cyan-300 text-sm font-bold">
                {isMetric ? `${slot!.weather!.windKt}kt` : `${ktToMph(slot!.weather!.windKt)}mph`}
                <span className="text-white/40 text-xs ml-1">{slot!.weather!.windDir}</span>
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-white/40 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          {/* Expandable forecast panels */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              expanded ? "max-h-[1400px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            {/* Ample spacing between summary bar, hourly header, and hourly cards */}
            <div className="px-4 py-5 space-y-6">
              {/* Today's hourly */}
              <div>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">
                  Today's Forecast -- Hour by Hour (6 AM to 10 PM)
                </p>
                <HourlyForecast slots={slot!.weather!.hourlyToday} isMetric={isMetric} />
              </div>
              {/* 7-day forecast */}
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
  const [, navigate] = useLocation();
  const [localMetric, setLocalMetric] = useState(parentIsMetric);
  const [slots, setSlots] = useState<(PortSlot | null)[]>([null, null, null]);
  // Lifted query state so the shared Get Forecast button can read all inputs
  const [queries, setQueries] = useState<string[]>(["" , "", ""]);
  const [selectedPorts, setSelectedPorts] = useState<(typeof PORT_LIST[0] | null)[]>([null, null, null]);
  const [seaDays, setSeaDays] = useState<boolean[]>([false, false, false]);
  // Whether any forecast has been loaded -- controls Back button visibility
  const [forecastsLoaded, setForecastsLoaded] = useState(false);

  useEffect(() => { setLocalMetric(parentIsMetric); }, [parentIsMetric]);

  const fetchSlot = useCallback((slotIndex: number, port: { name: string; lat: number; lon: number }) => {
    setSlots(prev => {
      const next = [...prev];
      next[slotIndex] = { portName: port.name, lat: port.lat, lon: port.lon, weather: null, loading: true, error: false, isSeaDay: false };
      return next;
    });

    fetchPortData(port.lat, port.lon)
      .then(weather => {
        setSlots(prev => {
          const next = [...prev];
          next[slotIndex] = { portName: port.name, lat: port.lat, lon: port.lon, weather, loading: false, error: false, isSeaDay: false };
          return next;
        });
        setForecastsLoaded(true);
      })
      .catch(() => {
        setSlots(prev => {
          const next = [...prev];
          next[slotIndex] = { portName: port.name, lat: port.lat, lon: port.lon, weather: null, loading: false, error: true, isSeaDay: false };
          return next;
        });
      });
  }, []);

  // Resolve a query string to a port entry.
  // Normalizes "Saint" -> "st", strips periods/ampersands, collapses whitespace.
  // Searches both primary name and aliases in priority order:
  //   1. Exact match on name or alias
  //   2. Name/alias starts with query
  //   3. Name/alias contains query
  const normStr2 = (s: string) =>
    s.toLowerCase()
      .replace(/\bsaint\b/g, "st")
      .replace(/[.&]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const resolvePort = (q: string, preSelected: typeof PORT_LIST[0] | null) => {
    if (preSelected) return preSelected;
    const lower = normStr2(q);
    if (!lower) return null;
    // Helper: does this port match at the given level?
    const nameOrAliasEquals    = (p: typeof PORT_LIST[0]) =>
      normStr2(p.name) === lower ||
      (p.aliases ?? []).some(a => normStr2(a) === lower);
    const nameOrAliasStartsWith = (p: typeof PORT_LIST[0]) =>
      normStr2(p.name).startsWith(lower) ||
      (p.aliases ?? []).some(a => normStr2(a).startsWith(lower));
    const nameOrAliasIncludes  = (p: typeof PORT_LIST[0]) =>
      normStr2(p.name).includes(lower) ||
      (p.aliases ?? []).some(a => normStr2(a).includes(lower));
    return (
      PORT_LIST.find(nameOrAliasEquals) ??
      PORT_LIST.find(nameOrAliasStartsWith) ??
      PORT_LIST.find(nameOrAliasIncludes) ??
      null
    );
  };

  // Shared Get Forecast: fires all slots that have a non-empty query (skips Sea Day slots)
  const handleGetAllForecasts = () => {
    let fired = false;
    queries.forEach((q, i) => {
      if (seaDays[i]) return; // Sea Day slots have no forecast to fetch
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
    const len = slots.length;
    setSlots(Array(len).fill(null));
    setQueries(Array(len).fill(""));
    setSelectedPorts(Array(len).fill(null));
    setSeaDays(Array(len).fill(false));
    setForecastsLoaded(false);
  };

  const handleClear = useCallback((slotIndex: number) => {
    setSlots(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
    setQueries(prev => { const n = [...prev]; n[slotIndex] = ""; return n; });
    setSelectedPorts(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
    setSeaDays(prev => { const n = [...prev]; n[slotIndex] = false; return n; });
  }, []);

  // Add a new slot (up to 5 total)
  const addSlot = () => {
    if (slots.length >= 5) return;
    setSlots(prev => [...prev, null]);
    setQueries(prev => [...prev, ""]);
    setSelectedPorts(prev => [...prev, null]);
    setSeaDays(prev => [...prev, false]);
  };

  // Toggle Sea Day for a specific slot
  const toggleSeaDay = (i: number) => {
    setSeaDays(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
    // Clear any existing query/port selection for this slot when toggling Sea Day on
    if (!seaDays[i]) {
      setQueries(prev => { const n = [...prev]; n[i] = ""; return n; });
      setSelectedPorts(prev => { const n = [...prev]; n[i] = null; return n; });
      setSlots(prev => { const n = [...prev]; n[i] = null; return n; });
    }
  };

  const anyQueryFilled = queries.some(q => q.trim().length > 0);

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
          <span className="text-white/50 text-xs tracking-widest uppercase font-semibold">Port Forecast Tool</span>
        </div>
        <h3 className="text-white font-black text-2xl leading-tight">Your Cruise Forecast,</h3>
        <h3 className="text-cyan-400 font-black text-2xl leading-tight">Port by Port.</h3>
        <p className="text-white/50 text-sm mt-2 max-w-md">
          Enter your ports, plot them on a live map, and get a day-by-day forecast at every stop.
        </p>
      </div>

      {/* Plot My Cruise Route button -- top of destination section */}
      <button
        onClick={() => navigate("/route-map")}
        className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-300 font-bold text-base tracking-wide hover:bg-cyan-400/20 transition-colors cursor-pointer"
      >
        <span>&#9654;</span> Plot My Cruise Route
      </button>

      {/* Helper line below Plot My Cruise Route button */}
      <p className="text-white/50 text-sm max-w-md">
        Click on Plot My Cruise Route to get started, you will enter ports on the next page.
      </p>

      {/* Or divider + instruction line above port slots */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-amber-200/80 text-lg font-bold tracking-widest uppercase">Or</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>
      <p className="text-white/50 text-sm max-w-md">
        Type up to 5 destinations or add Sea Days, then tap <strong className="text-white/70">Get Forecast</strong> to load all at once.
      </p>

      {/* Destination slots -- single column, dynamic */}
      <div className="space-y-4">
        {slots.map((slot, i) => (
          <PortSlotCard
            key={i}
            slotIndex={i}
            slot={slot}
            isMetric={localMetric}
            onSetMetric={setLocalMetric}
            query={queries[i]}
            selectedPort={selectedPorts[i]}
            isSeaDay={seaDays[i]}
            onToggleSeaDay={() => toggleSeaDay(i)}
            onQueryChange={(q, port) => {
              setQueries(prev => { const n = [...prev]; n[i] = q; return n; });
              setSelectedPorts(prev => { const n = [...prev]; n[i] = port; return n; });
            }}
            onClear={() => handleClear(i)}
            onGetForecast={handleGetAllForecasts}
          />
        ))}
      </div>

      {/* Add Another Port / Sea Day button -- hidden once at 5 slots */}
      {slots.length < 5 && (
        <button
          onClick={addSlot}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-colors text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Add Another Port / Sea Day
        </button>
      )}

    </div>
  );
}
