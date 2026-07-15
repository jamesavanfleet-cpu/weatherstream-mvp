// =============================================================================
// ACCORDION BEHAVIOR -- DO NOT CHANGE WITHOUT READING THIS
// =============================================================================
// Port cards are accordion rows. The expand/collapse rules are:
//   1. All ports start COLLAPSED on page load (expandedRows is an empty Set).
//   2. Ports are laid out in a 3-column grid. Clicking any port header toggles
//      the entire ROW (all 3 ports in that row) together.
//   3. Row index = Math.floor(portIndex / COLS) where COLS = 3.
//   4. The toggle handler MUST use a functional update (prev => ...) to avoid
//      closing over stale state. Never replace it with a direct setState call.
//   5. There is NO useEffect that resets expandedRows after mount.
// =============================================================================
import { useState, useEffect, useLayoutEffect } from "react";
import { useParams, useLocation } from "wouter";
import { REGIONS, type Port } from "@/data/regions";
import {
  ArrowLeft, ThermometerSun, Waves, Wind, Droplets, Sparkles, AlertTriangle, ChevronDown, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PtzThumb from "@/components/PtzThumb";
import { getPtzCameras } from "@/lib/ptzCameras";


// ---- Conversion helpers ----
function fToCStr(f: number): string {
  return Math.round((f - 32) * 5 / 9) + "\u00b0C";
}

function seaFtToMStr(seas: string): string {
  const range = seas.match(/([\d.]+)(?:-([\d.]+))?\s*ft/);
  if (!range) return seas;
  const lo = parseFloat(range[1]);
  const hi = range[2] ? parseFloat(range[2]) : null;
  const toM = (ft: number) => (ft * 0.3048).toFixed(1);
  return hi ? `${toM(lo)}-${toM(hi)} m` : `${toM(lo)} m`;
}

function swellFtToM(ft: number | null): string | null {
  if (ft == null) return null;
  return (ft * 0.3048).toFixed(1) + "m";
}

function degToCompass(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function msToKt(ms: number): number {
  return Math.round(ms * 1.94384);
}

function cToF(c: number): number {
  return Math.round(c * 9 / 5 + 32);
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

function seaStateFromWind(ktSpeed: number): string {
  if (ktSpeed <= 6) return "< 1 ft";
  if (ktSpeed <= 10) return "1-2 ft";
  if (ktSpeed <= 16) return "2-4 ft";
  if (ktSpeed <= 21) return "4-6 ft";
  if (ktSpeed <= 27) return "6-9 ft";
  return "9+ ft";
}

// ---- Determine time-of-day label from a local hour (0-23) ----
// Morning: 6-11, Afternoon: 12-17, Evening: 18-21, Overnight: 22-23 or 0-5
function hourToTimeOfDay(hour: number): string {
  if (hour >= 6 && hour <= 11) return "Morning";
  if (hour >= 12 && hour <= 17) return "Afternoon";
  if (hour >= 18 && hour <= 21) return "Evening";
  return "Overnight";
}

// ---- Interfaces ----
interface DayForecast {
  date: string;
  maxF: number;
  minF: number;
  windKt: number;
  windDir: string;
  rainChance: number;
  peakRainTimeOfDay: string;
  condition: string;
  waveHeightFt: number | null;
  swellHeightFt: number | null;
  swellDir: string | null;
  swellPeriod: number | null;
}

interface PortWeather {
  port: Port;
  tempF: number;
  windKt: number;
  windDir: string;
  seas: string;
  rainChance: number;       // current hourly snapshot
  peakRainChance: number;   // today's daily max (matches 5-day forecast day 0)
  peakRainTimeOfDay: string; // Morning / Afternoon / Evening / Overnight
  condition: string;
  loading: boolean;
  error: boolean;
  forecast: DayForecast[];
}

const COLS = 3; // Number of columns in the port grid -- used for row-level accordion toggling
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ---- ECMWF precipitation_probability PoP (all ports) ----
// FIX_MARKER: ECMWF_PRECIP_PROB_v1
// Returns array of daily mean PoP values (0-100) for up to 7 days
// using ECMWF IFS025 precipitation_probability directly (no NWS, no mm threshold).
async function fetchAuthoritativePop(lat: number, lon: number): Promise<number[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation_probability&timezone=auto&forecast_days=7&models=ecmwf_ifs025`;
  const res = await fetchJsonWithRetry(url);
  const hourlyProbs: number[] = (res.hourly?.precipitation_probability ?? []).map((v: number | null) => v ?? 0);
  const dailyMeans: number[] = [];
  for (let day = 0; day < 7; day++) {
    const start = day * 24;
    const end = start + 24;
    const dayProbs = hourlyProbs.slice(start, end);
    if (dayProbs.length === 0) break;
    dailyMeans.push(Math.round(dayProbs.reduce((a, b) => a + b, 0) / dayProbs.length));
  }
  return dailyMeans;
}

// Bounded retry with exponential backoff for the per-port forecast fetches.
// Fetches a weather URL with ecmwf_ifs025 first; if that model times out or errors,
// retries once with best_match so the site stays operational during ECMWF outages.
// FIX_MARKER: ECMWF_FALLBACK_v1
async function fetchWeatherWithFallback(url: string): Promise<any> {
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
    // ecmwf_ifs025 failed or timed out -- fall back to best_match
    const fallbackUrl = url.replace("models=ecmwf_ifs025", "models=best_match");
    return await tryFetch(fallbackUrl);
  }
}

// Root-cause fix for transient Open-Meteo failures (network blips / rate limiting)
// that previously caused ports to permanently render "Data temporarily unavailable".
// FIX_MARKER: NASSAU_RETRY_v1
async function fetchJsonWithRetry(url: string, attempts = 4): Promise<any> {
  const delays = [300, 700, 1500, 3000];
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      if (!json || (typeof json === "object" && "error" in json && (json as any).error === true)) {
        throw new Error("API error payload");
      }
      return json;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise(res => setTimeout(res, delays[i]));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchJsonWithRetry failed");
}

async function fetchPortWeather(port: Port): Promise<Omit<PortWeather, "port" | "loading" | "error">> {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${port.lat}&longitude=${port.lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,weathercode` +
    `&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=7&models=ecmwf_ifs025`;

  // Use marineLat/marineLon if set (offshore nudge for ports where the marine model
  // grid falls on land or in an enclosed harbor returning null swell data).
  const marineLat = port.marineLat ?? port.lat;
  const marineLon = port.marineLon ?? port.lon;
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${marineLat}&longitude=${marineLon}` +
    `&daily=wave_height_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max` +
    `&length_unit=imperial&timezone=auto&forecast_days=7`;

  const [weatherRes, marineRes, popRes] = await Promise.allSettled([
    fetchWeatherWithFallback(weatherUrl),
    fetchJsonWithRetry(marineUrl),
    fetchAuthoritativePop(port.lat, port.lon),
  ]);

  const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
  const marine  = marineRes.status  === "fulfilled" ? marineRes.value  : null;
  // authPop: array of daily mean PoP values (0-100) for up to 7 days
  const authPop: number[] = popRes.status === "fulfilled" ? popRes.value : [];

  if (!weather || !weather.current || !weather.daily) throw new Error("Weather fetch failed");

  const c = weather.current;
  const d = weather.daily;
  const md = marine?.daily ?? null;

  const windKt = msToKt(c.wind_speed_10m);

  // ---- Authoritative PoP for today ----
  // authPop[0] is today's daily mean PoP from NWS (US ports) or ECMWF threshold (non-US).
  // peakRainTimeOfDay defaults to "Afternoon" since the authoritative sources don't
  // provide sub-daily timing -- this is a display label only.
  const peakRainChance = authPop[0] ?? 0;
  const peakRainTimeOfDay = "Afternoon";

  const forecast: DayForecast[] = (d.time as string[]).map((dateStr: string, i: number) => {
    const wKt = msToKt(d.wind_speed_10m_max[i]);
    const swellDeg = md?.swell_wave_direction_dominant?.[i];
    // Use authoritative PoP for each forecast day
    const dayMeanRain = authPop[i] ?? 0;
    return {
      date: dateStr,
      maxF: cToF(d.temperature_2m_max[i]),
      minF: cToF(d.temperature_2m_min[i]),
      windKt: wKt,
      windDir: degToCompass(d.wind_direction_10m_dominant[i]),
      rainChance: dayMeanRain,
      peakRainTimeOfDay: "Afternoon",
      condition: wmoToCondition(d.weathercode[i]),
      waveHeightFt:  md?.wave_height_max?.[i]       != null ? Math.round(md.wave_height_max[i] * 10) / 10 : null,
      swellHeightFt: md?.swell_wave_height_max?.[i] != null ? Math.round(md.swell_wave_height_max[i] * 10) / 10 : null,
      swellDir:      swellDeg != null ? degToCompass(swellDeg) : null,
      swellPeriod:   md?.swell_wave_period_max?.[i] != null ? Math.round(md.swell_wave_period_max[i]) : null,
    };
  });

  return {
    tempF: cToF(c.temperature_2m),
    windKt,
    windDir: degToCompass(c.wind_direction_10m),
    seas: seaStateFromWind(windKt),
    rainChance: peakRainChance,
    peakRainChance,
    peakRainTimeOfDay,
    condition: wmoToCondition(c.weathercode),
    forecast,
  };
}

// ---- Toggle button component ----
function UnitsToggle({ isMetric, onToggle }: { isMetric: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative flex items-center gap-0 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm overflow-hidden h-9 w-52 select-none"
      aria-label="Toggle units"
    >
      <span
        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 shadow transition-all duration-300 ease-in-out ${
          isMetric ? 'left-[calc(50%+2px)]' : 'left-1'
        }`}
      />
      <span className={`relative z-10 flex-1 text-center text-xs font-bold transition-colors duration-200 ${
        !isMetric ? 'text-white' : 'text-white/50'
      }`}>US Standard</span>
      <span className={`relative z-10 flex-1 text-center text-xs font-bold transition-colors duration-200 ${
        isMetric ? 'text-white' : 'text-white/50'
      }`}>Metric</span>
    </button>
  );
}

// ---- Port Row (click/tap to expand, hover also works on desktop) ----
function PortRow({ pw, gradient, expanded, onToggle, isMetric }: {
  pw: PortWeather;
  gradient: string;
  expanded: boolean;
  onToggle: () => void;
  isMetric: boolean;
}) {
  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all duration-300 ${expanded ? 'glass-dark border border-white/10' : ''}`}
    >
      {/* Port name tab -- always visible, tap/click to toggle.
          For PTZ partner-camera ports we render live thumbnails + LIVE badges
          beside the attribution. Dual-camera thumbnails are stacked at a
          reduced size so every tab keeps the same outer height. Each thumb
          stops click propagation so opening a webcam does not toggle the tab. */}
      {(() => {
        const cameras = getPtzCameras(pw.port.name);
        const hasCam = cameras.length > 0;
        const hasMultipleCameras = cameras.length > 1;
        return (
          <div
            className={`bg-gradient-to-r ${gradient} min-h-[86px] px-5 py-4 cursor-pointer select-none flex flex-nowrap items-center justify-between gap-x-3`}
            onClick={onToggle}
            data-camera-layout={hasMultipleCameras ? "dual-compact" : hasCam ? "single" : "none"}
          >
            <div className="flex items-center justify-between gap-3 min-w-0 flex-1">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-lg leading-tight">{pw.port.name}</p>
                {pw.port.sublabel && (
                  <p className="text-white/50 text-xs mt-0.5">{pw.port.sublabel}</p>
                )}
              </div>
              <ChevronDown
                className={`w-5 h-5 text-white/50 transition-transform duration-300 flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
              />
            </div>
            {hasCam && (
              <div className={`flex items-center flex-shrink-0 ${hasMultipleCameras ? "gap-1" : "gap-2"}`}>
                {/* Single-camera ports keep the original thumbnail. For ports
                    with two cameras, the thumbnails stack at half-size so the
                    full pair occupies no more space than one single camera. */}
                <div className={`flex ${hasMultipleCameras ? "flex-col gap-0.5" : "flex-row"}`}>
                  {cameras.map((_, i) => (
                    <PtzThumb
                      key={i}
                      portName={pw.port.name}
                      size={hasMultipleCameras ? "dual" : "default"}
                      cameraIndex={i}
                    />
                  ))}
                </div>
                <p className={`text-white/85 leading-tight ${hasMultipleCameras ? "w-[72px] text-[8px]" : "text-[10px]"}`}>
                  Port Camera via our<br />partners PTZtv
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Expandable forecast panel */}
          <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          expanded ? "max-h-[1100px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="p-5">
          {pw.loading ? (
            <div className="grid grid-cols-2 gap-3">
              {[0,1,2,3].map(i => (
                <div key={i} className="glass rounded-xl p-3 text-center">
                  <div className="h-5 w-5 bg-white/10 rounded-full mx-auto mb-2 animate-pulse" />
                  <div className="h-6 bg-white/10 rounded animate-pulse mb-1" />
                  <div className="h-3 bg-white/10 rounded animate-pulse w-2/3 mx-auto" />
                </div>
              ))}
            </div>
          ) : pw.error ? (
            <p className="text-white/40 text-sm text-center py-4">Data temporarily unavailable</p>
          ) : (
            <>
              {/* ---- CURRENT CONDITIONS section ---- */}
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">Current Conditions</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {/* Temperature */}
                <div className="glass rounded-xl p-3 text-center">
                  <ThermometerSun className="w-5 h-5 mx-auto mb-1 text-orange-400" />
                  <p className="text-xl font-bold text-white">{isMetric ? fToCStr(pw.tempF) : `${pw.tempF}\u00b0`}</p>
                  <p className="text-xs text-white/50">Temperature</p>
                </div>
                {/* Sea State */}
                <div className="glass rounded-xl p-3 text-center">
                  <Waves className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                  <p className="text-xl font-bold text-white">{isMetric ? seaFtToMStr(pw.seas) : pw.seas}</p>
                  <p className="text-xs text-white/50">Sea State</p>
                </div>
                {/* Wind */}
                <div className="glass rounded-xl p-3 text-center">
                  <Wind className="w-5 h-5 mx-auto mb-1 text-cyan-400" />
                  <p className="text-xl font-bold text-white">{pw.windDir} {pw.windKt} kt</p>
                  <p className="text-xs text-white/50">Wind</p>
                </div>
                {/* Rain Chance This Hour */}
                <div className="glass rounded-xl p-3 text-center">
                  <Droplets className="w-5 h-5 mx-auto mb-1 text-purple-400" />
                  <p className="text-xl font-bold text-white">{pw.rainChance}%</p>
                  <p className="text-xs text-white/50">Rain Chance This Hour</p>
                </div>
                {/* Peak Rain Chance Today -- spans full width for emphasis */}
                <div className="glass rounded-xl p-3 text-center col-span-2">
                  <TrendingUp className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
                  <p className="text-xl font-bold text-white">{pw.peakRainChance}%</p>
                  <p className="text-xs text-white/50">
                    Peak Rain Chance Today
                    <span className="ml-1 text-yellow-400/80">({pw.peakRainTimeOfDay})</span>
                  </p>
                </div>
              </div>

              {/* 5-day forecast strip */}
              <div>
                <p className="text-white/50 text-lg font-bold uppercase tracking-wider mb-4">5-Day Forecast</p>
                <div className="grid grid-cols-5 gap-3">
                  {pw.forecast.slice(0, 5).map((day) => {
                    const d = new Date(day.date + "T12:00:00");
                    const hasWave = day.swellHeightFt != null;
                    return (
                      <div key={day.date} className="text-center">
                        <p className="text-white/60 text-base mb-1 font-extrabold">{DAY_NAMES[d.getDay()]}</p>
                        <p className="text-white text-xl font-extrabold">{isMetric ? fToCStr(day.maxF) : `${day.maxF}\u00b0`}</p>
                        <p className="text-white/60 text-base font-bold">{isMetric ? fToCStr(day.minF) : `${day.minF}\u00b0`}</p>
                        <p className="text-cyan-300 text-base mt-1 font-extrabold">{day.windDir}</p>
                        <p className="text-white/80 text-base font-bold">{day.windKt}kt</p>
                        <p className="text-purple-300 text-base font-extrabold">{day.rainChance}%</p>
                        <p className="text-yellow-400/80 text-xs font-bold">({day.peakRainTimeOfDay})</p>
                        {hasWave && (
                          <>
                            <div className="border-t border-white/15 my-2" />
                            <p className="text-blue-300 text-base font-extrabold leading-snug">{isMetric ? swellFtToM(day.swellHeightFt) : `${day.swellHeightFt}ft`}</p>
                            <p className="text-teal-300 text-base leading-snug font-extrabold">{day.swellDir}</p>
                            <p className="text-white/70 text-base leading-snug font-bold">{day.swellPeriod}s</p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {pw.forecast.some(d => d.swellHeightFt != null) && (
                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/10">
                    <span className="text-blue-300 text-sm font-bold">ft = swell ht</span>
                    <span className="text-teal-300 text-sm font-bold">dir = swell dir</span>
                    <span className="text-white/60 text-sm font-bold">s = period</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Component ----
export default function RegionDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const region = REGIONS.find(r => r.slug === slug);
  const [portWeather, setPortWeather] = useState<PortWeather[]>([]);
  const [intel, setIntel] = useState<string>("");
  const [intelDate, setIntelDate] = useState<string>("");
  const [intelLoading, setIntelLoading] = useState(true);
  const [isMetric, setIsMetric] = useState(false);
  // expandedRows must be declared before any early return to satisfy Rules of Hooks.
  // Starts empty (all rows collapsed). Each entry is a row index (Math.floor(portIndex / COLS)).
  const [expandedRows, setExpandedRows] = useState<Set<number>>(() => new Set<number>());

  // Client-side navigation preserves the previous page's scroll offset. Reset
  // each regional forecast to the top before paint so mobile users never land
  // partway down the port list. Temporarily override the global smooth-scroll
  // rule so the reset is immediate rather than visibly animated.
  // FIX_MARKER: REGION_SCROLL_TOP_v1
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.dataset.regionScrollTopFix = "v1";
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousScrollBehavior;
  }, [slug]);

  useEffect(() => {
    if (!region) return;
    const initial: PortWeather[] = region.ports.map(p => ({
      port: p, tempF: 0, windKt: 0, windDir: "", seas: "",
      rainChance: 0, peakRainChance: 0, peakRainTimeOfDay: "Afternoon",
      condition: "", loading: true, error: false, forecast: [],
    }));
    setPortWeather(initial);
    region.ports.forEach((port, i) => {
      fetchPortWeather(port)
        .then(data => {
          setPortWeather(prev => {
            const next = [...prev];
            next[i] = { ...next[i], ...data, loading: false, error: false };
            return next;
          });
        })
        .catch(() => {
          setPortWeather(prev => {
            const next = [...prev];
            next[i] = { ...next[i], loading: false, error: true };
            return next;
          });
        });
    });
  }, [region]);

  useEffect(() => {
    if (!region) return;
    setIntelLoading(true);
    const base = import.meta.env.BASE_URL || "/";
    fetch(`${base}intel.json?v=${new Date().toISOString().slice(0, 10)}`)
      .then(r => {
        // Guard against GitHub Pages returning HTML 404 redirect instead of JSON
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json") && !ct.includes("text/plain")) throw new Error("Not JSON");
        return r.json();
      })
      .then((data: { regions?: Record<string, string>; generated?: string }) => {
        const text = data.regions?.[region.slug] ?? "";
        setIntel(text || region.intel);
        // Format the generated date as "March 8, 2026" for display
        if (data.generated) {
          const d = new Date(data.generated + "T12:00:00");
          setIntelDate(d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
        }
        setIntelLoading(false);
      })
      .catch(() => {
        setIntel(region.intel);
        setIntelLoading(false);
      });
  }, [region]);


  if (!region) {
    return (
      <div className="min-h-screen gradient-animate flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <p className="text-white text-xl">Region not found.</p>
          <Button className="mt-4" onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-animate">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-dark border-b border-white/5">
        <div className="container py-3 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="h-5 w-px bg-white/20" />
          <div>
            <p className="text-white font-bold text-sm">{region.name}</p>
            <p className="text-white/40 text-xs">Live Conditions and 5-Day Forecast</p>
          </div>
        </div>
      </header>

      {/* Hero banner */}
      <div className="relative h-48 overflow-hidden">
        <img src={region.image} alt={region.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-slate-950" />
        <div className="absolute bottom-6 left-6">
          <h1 className="text-4xl font-black text-white">{region.name}</h1>
          <p className="text-white/60 text-sm mt-1">Weather Intelligence by James Van Fleet</p>
        </div>
      </div>

      <div className="container pt-6 pb-20 space-y-10">

        {/* James's Intel */}
        <div className="glass-dark rounded-2xl border border-cyan-500/20 p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-cyan-400 font-bold text-sm mb-2">
                James's Intel{intelDate ? ` -- ${intelDate}` : " -- Updated Daily"}
              </p>
              {intelLoading ? (
                <div className="space-y-2">
                  <div className="h-3 bg-white/10 rounded animate-pulse w-full" />
                  <div className="h-3 bg-white/10 rounded animate-pulse w-5/6" />
                  <div className="h-3 bg-white/10 rounded animate-pulse w-4/6" />
                </div>
              ) : intel ? (
                <p className="text-white/85 text-sm leading-relaxed">{intel}</p>
              ) : (
                <p className="text-white/40 text-sm italic">Intel briefing temporarily unavailable. Check back shortly.</p>
              )}
            </div>
          </div>
        </div>

        {/* Port list */}
        <div>
          <div className="flex items-end justify-between mb-2">
            <h2 className="text-2xl font-black text-white">Port Conditions and Forecasts</h2>
            <UnitsToggle isMetric={isMetric} onToggle={() => setIsMetric(m => !m)} />
          </div>
          <p className="text-white/40 text-sm mb-6">Tap any port to view live conditions and 5-day forecast.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {portWeather.map((pw, i) => {
              const rowIdx = Math.floor(i / COLS);
              return (
                <PortRow
                  key={pw.port.name}
                  pw={pw}
                  gradient={region.gradient}
                  expanded={expandedRows.has(rowIdx)}
                  onToggle={() => {
                    // IMPORTANT: always use functional update so we never close over stale state.
                    // Toggles the entire row (all COLS ports in the same row).
                    setExpandedRows(prev => {
                      const next = new Set(prev);
                      if (next.has(rowIdx)) next.delete(rowIdx); else next.add(rowIdx);
                      return next;
                    });
                  }}
                  isMetric={isMetric}
                />
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
