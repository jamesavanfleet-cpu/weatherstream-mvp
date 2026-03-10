import { useState, useEffect } from "react";
import { Ship, MapPin, Calendar, Cloud, Wind, Thermometer, Droplets, ChevronDown, Search, Navigation } from "lucide-react";

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
  tempF: number | null;
  tempC: number | null;
  windKt: number | null;
  windDir: string;
  precip: number | null;
  condition: string;
  loading: boolean;
  error: boolean;
}

function degToDir(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function wmoToCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly Cloudy";
  if (code <= 9) return "Foggy";
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

async function fetchPortWeather(lat: number, lon: number, date: string): Promise<Partial<PortForecast>> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const targetDate = new Date(date + "T12:00:00Z");
    const todayDate = new Date(today + "T12:00:00Z");
    const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 16) {
      return { condition: "Beyond forecast range", loading: false, error: false };
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,winddirection_10m_dominant,precipitation_sum&wind_speed_unit=kn&timezone=auto&forecast_days=16`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("API error");
    const data = await resp.json();
    const idx = data.daily.time.indexOf(date);
    if (idx === -1) return { condition: "No data available", loading: false, error: false };
    const tempMaxF = data.daily.temperature_2m_max[idx];
    const tempMinF = data.daily.temperature_2m_min[idx];
    const avgTempF = tempMaxF !== null && tempMinF !== null ? Math.round((tempMaxF + tempMinF) / 2) : null;
    const avgTempC = avgTempF !== null ? Math.round((avgTempF - 32) * 5 / 9) : null;
    const windKt = data.daily.windspeed_10m_max[idx] !== null ? Math.round(data.daily.windspeed_10m_max[idx]) : null;
    const windDeg = data.daily.winddirection_10m_dominant[idx];
    const wmoCode = data.daily.weathercode[idx];
    const precip = data.daily.precipitation_sum[idx];
    return {
      tempF: avgTempF, tempC: avgTempC, windKt,
      windDir: windDeg !== null ? degToDir(windDeg) : "--",
      precip: precip !== null ? Math.round(precip * 10) / 10 : null,
      condition: wmoCode !== null ? wmoToCondition(wmoCode) : "Unknown",
      loading: false, error: false,
    };
  } catch {
    return { loading: false, error: true, condition: "Error" };
  }
}

interface CruiseFinderProps { isMetric: boolean; }

export default function CruiseFinder({ isMetric }: CruiseFinderProps) {
  const [cruiseData, setCruiseData] = useState<CruiseData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string>("");
  const [selectedShip, setSelectedShip] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [portForecasts, setPortForecasts] = useState<PortForecast[]>([]);
  const [loadingForecasts, setLoadingForecasts] = useState(false);
  const [activePort, setActivePort] = useState<string | null>(null);

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
      tempF: null, tempC: null, windKt: null, windDir: "--",
      precip: null, condition: "Loading...", loading: true, error: false,
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
    if (c.includes("fog")) return "🌫";
    if (c.includes("partly")) return "⛅";
    if (c.includes("cloudy")) return "☁";
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
          {selectedItinerary.ports.length === 0 && (
            <span className="ml-auto text-amber-400/70 text-xs">Detailed port schedule coming soon</span>
          )}
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
                  {pf.port}
                  <span className="ml-1 text-white/30 text-[10px]">{formatDate(pf.date)}</span>
                </button>
              );
            })}
          </div>

          {activePort && (() => {
            const pf = portForecasts.find(p => (p.port + "|" + p.date) === activePort);
            if (!pf) return null;
            return (
              <div className="bg-white/5 border border-cyan-400/30 rounded-xl p-5 animate-in fade-in duration-200">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-white font-bold text-lg flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-cyan-400" />{pf.port}
                    </h4>
                    <p className="text-white/50 text-sm mt-0.5">Day {pf.day} &mdash; {formatDate(pf.date)}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl mb-1">{conditionIcon(pf.condition)}</div>
                    <div className="text-white/70 text-sm">{pf.condition}</div>
                  </div>
                </div>
                {pf.loading ? (
                  <div className="flex items-center gap-2 text-white/40 text-sm">
                    <div className="w-4 h-4 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    Loading forecast...
                  </div>
                ) : pf.condition === "Beyond forecast range" ? (
                  <div className="text-white/40 text-sm py-2">
                    This sailing is beyond the 16-day forecast window. Check back as your departure date approaches for a full port-by-port forecast.
                  </div>
                ) : pf.error ? (
                  <div className="text-white/40 text-sm">Forecast unavailable for this port.</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1"><Thermometer className="w-3 h-3" /> Temperature</div>
                      <div className="text-white font-bold text-xl">{isMetric ? (pf.tempC !== null ? `${pf.tempC}°C` : "--") : (pf.tempF !== null ? `${pf.tempF}°F` : "--")}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1"><Wind className="w-3 h-3" /> Wind</div>
                      <div className="text-white font-bold text-xl">{pf.windKt !== null ? (isMetric ? `${Math.round(pf.windKt * 1.852)} km/h` : `${pf.windKt} kt`) : "--"}</div>
                      <div className="text-white/50 text-xs mt-0.5">{pf.windDir}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1"><Droplets className="w-3 h-3" /> Precip</div>
                      <div className="text-white font-bold text-xl">{pf.precip !== null ? (isMetric ? `${pf.precip} mm` : `${(pf.precip / 25.4).toFixed(2)}"`) : "--"}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-white/40 text-xs mb-1"><Cloud className="w-3 h-3" /> Conditions</div>
                      <div className="text-white font-semibold text-sm leading-tight mt-1">{pf.condition}</div>
                    </div>
                  </div>
                )}
                {pf.lat !== 0 && pf.condition !== "Beyond forecast range" && (
                  <div className="mt-3 pt-3 border-t border-white/5 text-white/30 text-xs flex items-center gap-1">
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

      {/* No port data state */}
      {selectedItinerary && selectedItinerary.ports.length === 0 && !loadingForecasts && (
        <div className="text-center py-8 text-white/30 text-sm space-y-2">
          <MapPin className="w-8 h-8 mx-auto opacity-30" />
          <p>Detailed port schedule for this sailing is being compiled.</p>
          <p className="text-white/20 text-xs">Check back shortly -- new itineraries are added daily.</p>
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
