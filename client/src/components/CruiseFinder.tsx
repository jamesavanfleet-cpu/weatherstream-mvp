import { useState, useEffect } from "react";
import { Ship, MapPin, Calendar, Cloud, Wind, Thermometer, Droplets, ChevronDown, Search, Navigation, Gauge, Eye } from "lucide-react";

// Types
interface PortEntry {
  day: number;
  date: string;
  port: string;
  lat: number | null;
  lon: number | null;
  country: string | null;
}

interface Itinerary {
  departure_date: string;
  departure_port: string;
  description: string;
  duration_days: number | null;
  ports: PortEntry[];
}

interface ShipData {
  name: string;
  itineraries: Itinerary[];
}

interface CruiseLine {
  id: string;
  display: string;
  color: string;
  ships: ShipData[];
}

interface CruiseData {
  generated_at: string;
  port_coords: Record<string, { lat: number; lon: number }>;
  cruise_lines: CruiseLine[];
}

interface PortForecast {
  port: string;
  date: string;
  day: number;
  lat: number;
  lon: number;
  // Temperature (stored as Celsius from API)
  tempMaxC: number | null;
  tempMinC: number | null;
  // Wind
  windKt: number | null;
  windDir: string;
  windDeg: number | null;
  // Precipitation
  precipMm: number | null;
  precipChance: number | null;
  // Cloud / sky
  cloudCoverPct: number | null;
  condition: string;
  wmoCode: number | null;
  // Pressure
  pressureHpa: number | null;
  // Sea state (wave height in meters)
  waveHeightM: number | null;
  loading: boolean;
  error: boolean;
}

function degToDir(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function wmoToCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Mostly Cloudy";
  if (code <= 9) return "Haze";
  if (code <= 19) return "Drizzle";
  if (code <= 29) return "Rain";
  if (code <= 39) return "Snow";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 82) return "Rain Showers";
  if (code <= 84) return "Heavy Showers";
  if (code <= 86) return "Snow Showers";
  if (code <= 99) return "Thunderstorms";
  return "Unknown";
}

function wmoToSkyCondition(code: number, cloudCover: number | null): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Mostly Cloudy";
  if (cloudCover !== null) {
    if (cloudCover <= 10) return "Clear";
    if (cloudCover <= 30) return "Mostly Clear";
    if (cloudCover <= 60) return "Partly Cloudy";
    if (cloudCover <= 85) return "Mostly Cloudy";
    return "Overcast";
  }
  return wmoToCondition(code);
}

function pressureTendency(hpa: number | null): string {
  if (hpa === null) return "--";
  if (hpa >= 1020) return "High";
  if (hpa >= 1013) return "Normal";
  if (hpa >= 1000) return "Low";
  return "Very Low";
}

function waveDescription(m: number | null): string {
  if (m === null) return "--";
  if (m < 0.1) return "Calm";
  if (m < 0.5) return "Smooth";
  if (m < 1.25) return "Slight";
  if (m < 2.5) return "Moderate";
  if (m < 4.0) return "Rough";
  if (m < 6.0) return "Very Rough";
  return "High";
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDepartureDate(dateStr: string, durationDays: number | null, homePort: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const dur = durationDays ? ` (${durationDays} nights)` : "";
  return `${label}${dur} -- ${homePort}`;
}

function cToF(c: number): number { return Math.round(c * 9 / 5 + 32); }
function mmToIn(mm: number): number { return Math.round(mm / 25.4 * 100) / 100; }
function hpaToInHg(hpa: number): number { return Math.round(hpa * 0.02953 * 100) / 100; }
function mToFt(m: number): number { return Math.round(m * 3.281 * 10) / 10; }
function ktToKmh(kt: number): number { return Math.round(kt * 1.852); }
function ktToMph(kt: number): number { return Math.round(kt * 1.151); }

async function fetchPortWeather(lat: number, lon: number, date: string): Promise<Partial<PortForecast>> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const targetDate = new Date(date + "T12:00:00Z");
    const todayDate = new Date(today + "T12:00:00Z");
    const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 16) {
      return { condition: "Beyond forecast range", loading: false, error: false };
    }
    // Request all needed parameters including cloud cover, precipitation probability, pressure, and marine waves
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,winddirection_10m_dominant,precipitation_sum,precipitation_probability_max,cloudcover_mean,surface_pressure_mean,wave_height_max&wind_speed_unit=kn&timezone=auto&forecast_days=16`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("API error");
    const data = await resp.json();
    const idx = data.daily.time.indexOf(date);
    if (idx === -1) return { condition: "No data available", loading: false, error: false };

    const d = data.daily;
    // Temperature comes back in Celsius from Open-Meteo (default)
    const tempMaxC = d.temperature_2m_max?.[idx] ?? null;
    const tempMinC = d.temperature_2m_min?.[idx] ?? null;
    const windKt = d.windspeed_10m_max?.[idx] !== null ? Math.round(d.windspeed_10m_max[idx]) : null;
    const windDeg = d.winddirection_10m_dominant?.[idx] ?? null;
    const wmoCode = d.weathercode?.[idx] ?? null;
    const precipMm = d.precipitation_sum?.[idx] !== null ? Math.round(d.precipitation_sum[idx] * 10) / 10 : null;
    const precipChance = d.precipitation_probability_max?.[idx] ?? null;
    const cloudCoverPct = d.cloudcover_mean?.[idx] ?? null;
    const pressureHpa = d.surface_pressure_mean?.[idx] !== null ? Math.round(d.surface_pressure_mean[idx]) : null;
    const waveHeightM = d.wave_height_max?.[idx] !== null ? Math.round(d.wave_height_max[idx] * 10) / 10 : null;

    return {
      tempMaxC, tempMinC,
      windKt,
      windDeg,
      windDir: windDeg !== null ? degToDir(windDeg) : "--",
      precipMm,
      precipChance,
      cloudCoverPct,
      condition: wmoCode !== null ? wmoToCondition(wmoCode) : "Unknown",
      wmoCode,
      pressureHpa,
      waveHeightM,
      loading: false,
      error: false,
    };
  } catch {
    return { loading: false, error: true, condition: "Error" };
  }
}

interface CruiseFinderProps { isMetric: boolean; }

export default function CruiseFinder({ isMetric: parentIsMetric }: CruiseFinderProps) {
  const [cruiseData, setCruiseData] = useState<CruiseData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string>("");
  const [selectedShip, setSelectedShip] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [portForecasts, setPortForecasts] = useState<PortForecast[]>([]);
  const [loadingForecasts, setLoadingForecasts] = useState(false);
  const [activePort, setActivePort] = useState<string | null>(null);
  // Local metric toggle -- defaults to parent but user can override within this section
  const [localMetric, setLocalMetric] = useState<boolean>(parentIsMetric);

  // Sync with parent toggle changes
  useEffect(() => { setLocalMetric(parentIsMetric); }, [parentIsMetric]);

  useEffect(() => {
    setLoadingData(true);
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    fetch(`${base}/cruise_itineraries.json?v=${new Date().toISOString().slice(0, 10)}`)
      .then(r => r.json())
      .then((d: CruiseData) => { setCruiseData(d); setLoadingData(false); })
      .catch(() => { setDataError(true); setLoadingData(false); });
  }, []);

  const availableShips = cruiseData?.cruise_lines.find(cl => cl.id === selectedLine)?.ships ?? [];
  const availableDates = availableShips.find(s => s.name === selectedShip)?.itineraries ?? [];
  const selectedItinerary = availableDates.find(i => i.departure_date === selectedDate);

  const handleLineChange = (line: string) => { setSelectedLine(line); setSelectedShip(""); setSelectedDate(""); setPortForecasts([]); setActivePort(null); };
  const handleShipChange = (ship: string) => { setSelectedShip(ship); setSelectedDate(""); setPortForecasts([]); setActivePort(null); };
  const handleDateChange = (date: string) => { setSelectedDate(date); setPortForecasts([]); setActivePort(null); };

  useEffect(() => {
    if (!selectedItinerary || !cruiseData) return;
    const ports = selectedItinerary.ports;
    if (!ports || ports.length === 0) return;
    setLoadingForecasts(true);
    setActivePort(null);
    const initial: PortForecast[] = ports.map((pe: PortEntry) => ({
      port: pe.port, date: pe.date, day: pe.day,
      lat: pe.lat ?? 0, lon: pe.lon ?? 0,
      tempMaxC: null, tempMinC: null,
      windKt: null, windDir: "--", windDeg: null,
      precipMm: null, precipChance: null,
      cloudCoverPct: null,
      condition: "Loading...", wmoCode: null,
      pressureHpa: null, waveHeightM: null,
      loading: true, error: false,
    }));
    setPortForecasts(initial);
    Promise.all(initial.map(async (pf) => {
      if (!pf.lat && !pf.lon) return { ...pf, loading: false, error: false, condition: "Location unknown" };
      const weather = await fetchPortWeather(pf.lat, pf.lon, pf.date);
      return { ...pf, ...weather } as PortForecast;
    })).then(results => {
      setPortForecasts(results);
      setLoadingForecasts(false);
      if (results.length > 0) setActivePort(results[0].port + "|" + results[0].date);
    });
  }, [selectedItinerary, cruiseData]);

  const conditionIcon = (condition: string) => {
    const c = condition.toLowerCase();
    if (c.includes("thunder")) return "⛈";
    if (c.includes("rain") || c.includes("shower") || c.includes("drizzle")) return "🌧";
    if (c.includes("snow")) return "❄";
    if (c.includes("fog") || c.includes("haze")) return "🌫";
    if (c.includes("partly")) return "⛅";
    if (c.includes("mostly clear")) return "🌤";
    if (c.includes("mostly cloudy") || c.includes("overcast")) return "☁";
    if (c.includes("cloudy")) return "⛅";
    if (c.includes("clear") || c.includes("sunny")) return "☀";
    if (c.includes("beyond") || c.includes("no data")) return "📅";
    return "🌤";
  };

  if (loadingData) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mr-3" />
      <span className="text-white/60 text-sm">Loading cruise data...</span>
    </div>
  );

  if (dataError) return (
    <div className="text-center py-8 text-white/40 text-sm">Cruise itinerary data unavailable. Please check back shortly.</div>
  );

  return (
    <div className="space-y-6">
      {/* Header row with metric toggle */}
      <div className="flex items-center justify-between">
        <div className="text-white/40 text-xs">Select your ship and sailing date for a port-by-port forecast</div>
        <button
          onClick={() => setLocalMetric(!localMetric)}
          className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-cyan-400/50 hover:text-white transition-colors"
        >
          <span className={localMetric ? "text-white" : "text-white/30"}>°C / km/h</span>
          <span className="text-white/20 mx-0.5">|</span>
          <span className={!localMetric ? "text-white" : "text-white/30"}>°F / kt</span>
        </button>
      </div>

      {/* Three dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Cruise Line */}
        <div className="space-y-2">
          <label className="text-white/50 text-xs font-semibold tracking-widest uppercase flex items-center gap-2">
            <Ship className="w-3 h-3" /> Cruise Line
          </label>
          <div className="relative">
            <select value={selectedLine} onChange={e => handleLineChange(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm appearance-none cursor-pointer hover:border-cyan-400/50 focus:border-cyan-400 focus:outline-none transition-colors">
              <option value="" disabled className="bg-[#0a0f1a]">Select cruise line...</option>
              {cruiseData?.cruise_lines.map(cl => <option key={cl.id} value={cl.id} className="bg-[#0a0f1a]">{cl.display}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          </div>
        </div>
        {/* Ship */}
        <div className="space-y-2">
          <label className="text-white/50 text-xs font-semibold tracking-widest uppercase flex items-center gap-2">
            <Navigation className="w-3 h-3" /> Ship
          </label>
          <div className="relative">
            <select value={selectedShip} onChange={e => handleShipChange(e.target.value)} disabled={!selectedLine}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm appearance-none cursor-pointer hover:border-cyan-400/50 focus:border-cyan-400 focus:outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <option value="" disabled className="bg-[#0a0f1a]">{selectedLine ? "Select ship..." : "Select cruise line first"}</option>
              {availableShips.map(s => <option key={s.name} value={s.name} className="bg-[#0a0f1a]">{s.name}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          </div>
        </div>
        {/* Departure Date */}
        <div className="space-y-2">
          <label className="text-white/50 text-xs font-semibold tracking-widest uppercase flex items-center gap-2">
            <Calendar className="w-3 h-3" /> Departure Date
          </label>
          <div className="relative">
            <select value={selectedDate} onChange={e => handleDateChange(e.target.value)} disabled={!selectedShip}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm appearance-none cursor-pointer hover:border-cyan-400/50 focus:border-cyan-400 focus:outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <option value="" disabled className="bg-[#0a0f1a]">{selectedShip ? "Select departure date..." : "Select ship first"}</option>
              {availableDates.map(i => (
                <option key={i.departure_date} value={i.departure_date} className="bg-[#0a0f1a]">
                  {formatDepartureDate(i.departure_date, i.duration_days, i.departure_port)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Itinerary summary bar */}
      {selectedItinerary && (
        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
          <Ship className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span className="text-white/70 text-sm font-medium">{selectedShip}</span>
          <span className="text-white/30">|</span>
          <span className="text-white/50 text-sm">{selectedItinerary.description}</span>
        </div>
      )}

      {/* Port tabs + forecast panel */}
      {portForecasts.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {portForecasts.map((pf) => {
              const key = pf.port + "|" + pf.date;
              const isActive = activePort === key;
              return (
                <button key={key} onClick={() => setActivePort(isActive ? null : key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${isActive
                    ? "bg-cyan-400/20 border-cyan-400/60 text-cyan-300"
                    : "bg-white/5 border-white/10 text-white/70 hover:border-cyan-400/40 hover:text-white"}`}>
                  <span className="text-xs text-white/40 mr-1">Day {pf.day}</span>
                  <span className="font-semibold">{pf.port}</span>
                  <span className="ml-1 text-white/30 text-[10px]">{formatDate(pf.date)}</span>
                </button>
              );
            })}
          </div>

          {activePort && (() => {
            const pf = portForecasts.find(p => (p.port + "|" + p.date) === activePort);
            if (!pf) return null;
            const isBeyond = pf.condition === "Beyond forecast range";
            const skyCondition = pf.wmoCode !== null ? wmoToSkyCondition(pf.wmoCode, pf.cloudCoverPct) : pf.condition;

            // Formatted values based on unit preference
            const tempHighDisplay = pf.tempMaxC !== null
              ? (localMetric ? `${Math.round(pf.tempMaxC)}°C` : `${cToF(pf.tempMaxC)}°F`)
              : "--";
            const tempLowDisplay = pf.tempMinC !== null
              ? (localMetric ? `${Math.round(pf.tempMinC)}°C` : `${cToF(pf.tempMinC)}°F`)
              : "--";
            const windDisplay = pf.windKt !== null
              ? (localMetric ? `${ktToKmh(pf.windKt)} km/h` : `${pf.windKt} kt`)
              : "--";
            const precipDisplay = pf.precipMm !== null
              ? (localMetric ? `${pf.precipMm} mm` : `${mmToIn(pf.precipMm)}"`)
              : "--";
            const pressureDisplay = pf.pressureHpa !== null
              ? (localMetric ? `${pf.pressureHpa} hPa` : `${hpaToInHg(pf.pressureHpa)} inHg`)
              : "--";
            const waveDisplay = pf.waveHeightM !== null
              ? (localMetric ? `${pf.waveHeightM} m` : `${mToFt(pf.waveHeightM)} ft`)
              : "--";

            return (
              <div className="bg-white/5 border border-cyan-400/30 rounded-xl p-5 animate-in fade-in duration-200">
                {/* Port header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h4 className="text-white font-bold text-lg flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-cyan-400" />{pf.port}
                    </h4>
                    <p className="text-white/50 text-sm mt-0.5">Day {pf.day} &mdash; {formatDate(pf.date)}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl mb-1">{conditionIcon(pf.condition)}</div>
                    <div className="text-white/70 text-sm font-medium">{skyCondition}</div>
                  </div>
                </div>

                {pf.loading ? (
                  <div className="flex items-center gap-2 text-white/40 text-sm">
                    <div className="w-4 h-4 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    Loading forecast...
                  </div>
                ) : isBeyond ? (
                  <div className="text-white/40 text-sm py-2">
                    This sailing is beyond the 16-day forecast window. Check back as your departure date approaches for a full port-by-port forecast.
                  </div>
                ) : pf.error ? (
                  <div className="text-white/40 text-sm">Forecast unavailable for this port.</div>
                ) : (
                  <div className="space-y-3">
                    {/* Row 1: Temperature, Wind, Rain Chance, Precip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* High Temperature */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1.5">
                          <Thermometer className="w-3 h-3" /> High Temp
                        </div>
                        <div className="text-white font-bold text-xl">{tempHighDisplay}</div>
                        <div className="text-white/40 text-xs mt-0.5">Low: {tempLowDisplay}</div>
                      </div>
                      {/* Wind */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1.5">
                          <Wind className="w-3 h-3" /> Wind
                        </div>
                        <div className="text-white font-bold text-xl">{windDisplay}</div>
                        <div className="text-white/50 text-xs mt-0.5">{pf.windDir}</div>
                      </div>
                      {/* Rain Chance */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1.5">
                          <Droplets className="w-3 h-3" /> Rain Chance
                        </div>
                        <div className="text-white font-bold text-xl">
                          {pf.precipChance !== null ? `${pf.precipChance}%` : "--"}
                        </div>
                        <div className="text-white/40 text-xs mt-0.5">Precip: {precipDisplay}</div>
                      </div>
                      {/* Cloud Cover */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1.5">
                          <Cloud className="w-3 h-3" /> Cloud Cover
                        </div>
                        <div className="text-white font-bold text-xl">
                          {pf.cloudCoverPct !== null ? `${Math.round(pf.cloudCoverPct)}%` : "--"}
                        </div>
                        <div className="text-white/40 text-xs mt-0.5">{skyCondition}</div>
                      </div>
                    </div>
                    {/* Row 2: Sea State, Pressure, Sky Condition */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {/* Sea State */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1.5">
                          <Navigation className="w-3 h-3" /> Sea State
                        </div>
                        <div className="text-white font-bold text-lg">{waveDescription(pf.waveHeightM)}</div>
                        <div className="text-white/40 text-xs mt-0.5">
                          {pf.waveHeightM !== null ? waveDisplay : "No wave data"}
                        </div>
                      </div>
                      {/* Pressure */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1.5">
                          <Gauge className="w-3 h-3" /> Pressure
                        </div>
                        <div className="text-white font-bold text-lg">{pressureDisplay}</div>
                        <div className="text-white/40 text-xs mt-0.5">{pressureTendency(pf.pressureHpa)}</div>
                      </div>
                      {/* Sky Condition */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1.5">
                          <Eye className="w-3 h-3" /> Sky Condition
                        </div>
                        <div className="text-white font-bold text-lg leading-tight">{skyCondition}</div>
                        <div className="text-white/40 text-xs mt-0.5">{pf.condition}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer */}
                {pf.lat !== 0 && !isBeyond && !pf.loading && !pf.error && (
                  <div className="mt-4 pt-3 border-t border-white/5 text-white/25 text-xs flex items-center gap-1 flex-wrap">
                    <MapPin className="w-3 h-3" />
                    {pf.lat.toFixed(2)}N, {Math.abs(pf.lon).toFixed(2)}W
                    <span className="ml-2">Open-Meteo 16-day forecast</span>
                  </div>
                )}
              </div>
            );
          })()}

          {!activePort && (
            <div className="text-center py-6 text-white/30 text-sm">Tap any port above to see the forecast for that day</div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedDate && !loadingForecasts && (
        <div className="text-center py-8 text-white/30 text-sm">
          <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
          Select your cruise line, ship, and departure date to see port-by-port weather forecasts
        </div>
      )}
    </div>
  );
}
