import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { REGIONS, type Port } from "@/data/regions";
import {
  ArrowLeft, ThermometerSun, Waves, Wind, Droplets, Sparkles, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ---- Conversion helpers ----
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

// ---- Interfaces ----
interface DayForecast {
  date: string;
  maxF: number;
  minF: number;
  windKt: number;
  windDir: string;
  rainChance: number;
  condition: string;
  // wave / swell
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
  rainChance: number;
  condition: string;
  loading: boolean;
  error: boolean;
  forecast: DayForecast[];
}

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

async function fetchPortWeather(port: Port): Promise<Omit<PortWeather, "port" | "loading" | "error">> {
  // Fetch weather + marine in parallel
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${port.lat}&longitude=${port.lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weathercode,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,precipitation_probability_max,weathercode` +
    `&temperature_unit=celsius&wind_speed_unit=ms&timezone=auto&forecast_days=7`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${port.lat}&longitude=${port.lon}` +
    `&daily=wave_height_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max` +
    `&length_unit=imperial&timezone=auto&forecast_days=7`;

  const [weatherRes, marineRes] = await Promise.allSettled([
    fetch(weatherUrl).then(r => r.json()),
    fetch(marineUrl).then(r => r.json()),
  ]);

  const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
  const marine  = marineRes.status  === "fulfilled" ? marineRes.value  : null;

  if (!weather) throw new Error("Weather fetch failed");

  const c = weather.current;
  const d = weather.daily;
  const md = marine?.daily ?? null;

  const windKt = msToKt(c.wind_speed_10m);

  const forecast: DayForecast[] = (d.time as string[]).map((dateStr: string, i: number) => {
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
      waveHeightFt:  md?.wave_height_max?.[i]           != null ? Math.round(md.wave_height_max[i] * 10) / 10 : null,
      swellHeightFt: md?.swell_wave_height_max?.[i]     != null ? Math.round(md.swell_wave_height_max[i] * 10) / 10 : null,
      swellDir:      swellDeg != null ? degToCompass(swellDeg) : null,
      swellPeriod:   md?.swell_wave_period_max?.[i]     != null ? Math.round(md.swell_wave_period_max[i]) : null,
    };
  });

  return {
    tempF: cToF(c.temperature_2m),
    windKt,
    windDir: degToCompass(c.wind_direction_10m),
    seas: seaStateFromWind(windKt),
    rainChance: c.precipitation_probability ?? 0,
    condition: wmoToCondition(c.weathercode),
    forecast,
  };
}

// ---- Component ----
export default function RegionDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const region = REGIONS.find(r => r.slug === slug);
  const [portWeather, setPortWeather] = useState<PortWeather[]>([]);
  const [intel, setIntel] = useState<string>("");
  const [intelLoading, setIntelLoading] = useState(true);

  // Fetch live weather for all ports
  useEffect(() => {
    if (!region) return;
    const initial: PortWeather[] = region.ports.map(p => ({
      port: p, tempF: 0, windKt: 0, windDir: "", seas: "", rainChance: 0,
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

  // Fetch daily AI intel from intel.json
  useEffect(() => {
    if (!region) return;
    setIntelLoading(true);
    const base = import.meta.env.BASE_URL || "/";
    fetch(`${base}intel.json?v=${new Date().toISOString().slice(0, 10)}`)
      .then(r => r.json())
      .then((data: { regions?: Record<string, string> }) => {
        const text = data.regions?.[region.slug] ?? "";
        setIntel(text || region.intel);
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
            <p className="text-white/40 text-xs">Live Conditions and 7-Day Forecast</p>
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
              <p className="text-cyan-400 font-bold text-sm mb-2">James's Intel — Updated Daily</p>
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

        {/* Port cards */}
        <div>
          <h2 className="text-2xl font-black text-white mb-6">Port Conditions and Forecasts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {portWeather.map((pw) => (
              <div key={pw.port.name} className="glass-dark rounded-2xl border border-white/10 overflow-hidden">
                {/* Port header */}
                <div className={`bg-gradient-to-r ${region.gradient} border-b border-white/10 px-5 py-4`}>
                  <p className="text-white font-bold text-lg leading-tight">{pw.port.name}</p>
                  {pw.port.sublabel && (
                    <p className="text-white/50 text-xs mt-0.5">{pw.port.sublabel}</p>
                  )}
                </div>

                {/* Current conditions */}
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
                      <div className="grid grid-cols-2 gap-3 mb-5">
                        <div className="glass rounded-xl p-3 text-center">
                          <ThermometerSun className="w-5 h-5 mx-auto mb-1 text-orange-400" />
                          <p className="text-xl font-bold text-white">{pw.tempF}°</p>
                          <p className="text-xs text-white/50">Temperature</p>
                        </div>
                        <div className="glass rounded-xl p-3 text-center">
                          <Waves className="w-5 h-5 mx-auto mb-1 text-blue-400" />
                          <p className="text-xl font-bold text-white">{pw.seas}</p>
                          <p className="text-xs text-white/50">Sea State</p>
                        </div>
                        <div className="glass rounded-xl p-3 text-center">
                          <Wind className="w-5 h-5 mx-auto mb-1 text-cyan-400" />
                          <p className="text-xl font-bold text-white">{pw.windDir} {pw.windKt} kt</p>
                          <p className="text-xs text-white/50">Wind</p>
                        </div>
                        <div className="glass rounded-xl p-3 text-center">
                          <Droplets className="w-5 h-5 mx-auto mb-1 text-purple-400" />
                          <p className="text-xl font-bold text-white">{pw.rainChance}%</p>
                          <p className="text-xs text-white/50">Rain Chance</p>
                        </div>
                      </div>

                      {/* 7-day forecast strip */}
                      <div>
                        <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">7-Day Forecast</p>
                        <div className="grid grid-cols-7 gap-1">
                          {pw.forecast.map((day) => {
                            const d = new Date(day.date + "T12:00:00");
                            const hasWave = day.swellHeightFt != null;
                            return (
                              <div key={day.date} className="text-center">
                                {/* Day label */}
                                <p className="text-white/40 text-[10px] mb-1 font-semibold">{DAY_NAMES[d.getDay()]}</p>
                                {/* Temp */}
                                <p className="text-white text-xs font-bold">{day.maxF}°</p>
                                <p className="text-white/40 text-[10px]">{day.minF}°</p>
                                {/* Wind */}
                                <p className="text-cyan-400 text-[10px] mt-1">{day.windDir}</p>
                                <p className="text-white/60 text-[10px]">{day.windKt}kt</p>
                                {/* Rain */}
                                <p className="text-purple-400 text-[10px]">{day.rainChance}%</p>
                                {/* Swell divider */}
                                {hasWave && (
                                  <>
                                    <div className="border-t border-white/10 my-1.5" />
                                    {/* Wave height */}
                                    <p className="text-blue-400 text-[10px] font-bold leading-tight">{day.swellHeightFt}ft</p>
                                    {/* Swell direction */}
                                    <p className="text-teal-400 text-[10px] leading-tight">{day.swellDir}</p>
                                    {/* Swell period */}
                                    <p className="text-white/50 text-[10px] leading-tight">{day.swellPeriod}s</p>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Legend */}
                        {pw.forecast.some(d => d.swellHeightFt != null) && (
                          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-white/5">
                            <span className="text-blue-400 text-[10px]">ft = swell ht</span>
                            <span className="text-teal-400 text-[10px]">dir = swell dir</span>
                            <span className="text-white/40 text-[10px]">s = period</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
