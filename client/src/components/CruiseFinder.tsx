import { useState, useEffect } from "react";
import { Ship, MapPin, Calendar, ChevronDown, Search, Navigation, Thermometer, Wind, Droplets, Gauge, Waves, Eye, Cloud, Sun, CloudRain, CloudLightning, Snowflake } from "lucide-react";

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
  tempMaxC: number | null;
  tempMinC: number | null;
  windKt: number | null;
  windDir: string;
  windDeg: number | null;
  precipMm: number | null;
  precipChance: number | null;
  cloudCoverPct: number | null;
  condition: string;
  wmoCode: number | null;
  pressureHpa: number | null;
  waveHeightM: number | null;
  swellHeightM: number | null;
  loading: boolean;
  error: boolean;
}

// Map port names to their image filenames
function portImageSlug(port: string): string {
  const map: Record<string, string> = {
    "Miami": "miami",
    "Nassau": "nassau",
    "San Juan": "san-juan",
    "St. Thomas": "st-thomas",
    "St. Maarten": "st-maarten",
    "Philipsburg": "philipsburg",
    "Cozumel": "cozumel",
    "Key West": "key-west",
    "Falmouth": "falmouth",
    "Oranjestad": "oranjestad",
    "Willemstad": "willemstad",
    "Bridgetown": "bridgetown",
    "Castries": "castries",
    "Fort-de-France": "fort-de-france",
    "Basseterre": "basseterre",
    "St. John's": "st-johns",
    "Tortola": "tortola",
    "Roatan": "roatan",
    "Costa Maya": "costa-maya",
    "Belize City": "belize-city",
    "Grand Turk": "grand-turk",
    "The Beach Club at Bimini": "the-beach-club-at-bimini",
    "Amber Cove": "amber-cove",
    "Puerto Plata": "puerto-plata",
    "Labadee": "labadee",
    "Perfect Day at CocoCay": "perfect-day-at-cococay",
    "George Town": "george-town",
    "Cartagena": "cartagena",
    "Colon": "colon",
    "Puntarenas": "puntarenas",
    "Puerto Quetzal": "puerto-quetzal",
    "Cabo San Lucas": "cabo-san-lucas",
    "Los Angeles": "los-angeles",
    "Fort Lauderdale": "fort-lauderdale",
    "Port Canaveral": "port-canaveral",
    "Tampa": "tampa",
    "Galveston": "galveston",
    "New York": "new-york",
    "Newport": "newport",
    "Charleston": "charleston",
    "Princess Cays": "princess-cays",
    "Celebration Key": "celebration-key",
    "Ocean Cay": "ocean-cay",
    "Roseau": "roseau",
    "St. Croix": "st-croix",
    "New Orleans": "new-orleans",
    "Port of New Orleans": "new-orleans",
    "Seattle": "seattle",
  };
  return map[port] || "";
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
function ktToMph(kt: number): number { return Math.round(kt * 1.15078); }

async function fetchPortWeather(lat: number, lon: number, date: string): Promise<Partial<PortForecast>> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const targetDate = new Date(date + "T12:00:00Z");
    const todayDate = new Date(today + "T12:00:00Z");
    const diffDays = Math.round((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 || diffDays > 16) {
      return { condition: "Beyond forecast range", loading: false, error: false };
    }

    // Fetch weather forecast and marine data in parallel
    const [weatherResp, marineResp] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,winddirection_10m_dominant,precipitation_sum,precipitation_probability_max,cloudcover_mean,surface_pressure_mean&wind_speed_unit=kn&timezone=auto&forecast_days=16`),
      fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max,swell_wave_height_max&timezone=auto&forecast_days=16`),
    ]);

    if (!weatherResp.ok) throw new Error("API error");
    const data = await weatherResp.json();
    const idx = data.daily.time.indexOf(date);
    if (idx === -1) return { condition: "No data available", loading: false, error: false };
    const d = data.daily;

    // Parse marine data (best-effort -- may not be available for all locations)
    let waveHeightM: number | null = null;
    let swellHeightM: number | null = null;
    if (marineResp.ok) {
      try {
        const marineData = await marineResp.json();
        const marineIdx = marineData.daily?.time?.indexOf(date) ?? -1;
        if (marineIdx !== -1) {
          const wh = marineData.daily?.wave_height_max?.[marineIdx];
          const sh = marineData.daily?.swell_wave_height_max?.[marineIdx];
          waveHeightM = (wh !== null && wh !== undefined) ? Math.round(wh * 10) / 10 : null;
          swellHeightM = (sh !== null && sh !== undefined) ? Math.round(sh * 10) / 10 : null;
        }
      } catch {
        // Marine data unavailable -- leave as null
      }
    }

    return {
      tempMaxC: d.temperature_2m_max?.[idx] ?? null,
      tempMinC: d.temperature_2m_min?.[idx] ?? null,
      windKt: d.windspeed_10m_max?.[idx] !== null ? Math.round(d.windspeed_10m_max[idx]) : null,
      windDeg: d.winddirection_10m_dominant?.[idx] ?? null,
      windDir: d.winddirection_10m_dominant?.[idx] !== null ? degToDir(d.winddirection_10m_dominant[idx]) : "--",
      precipMm: d.precipitation_sum?.[idx] !== null ? Math.round(d.precipitation_sum[idx] * 10) / 10 : null,
      precipChance: d.precipitation_probability_max?.[idx] ?? null,
      cloudCoverPct: d.cloudcover_mean?.[idx] ?? null,
      condition: d.weathercode?.[idx] !== null ? wmoToCondition(d.weathercode[idx]) : "Unknown",
      wmoCode: d.weathercode?.[idx] ?? null,
      pressureHpa: d.surface_pressure_mean?.[idx] !== null ? Math.round(d.surface_pressure_mean[idx]) : null,
      waveHeightM,
      swellHeightM,
      loading: false,
      error: false,
    };
  } catch {
    return { loading: false, error: true, condition: "Error" };
  }
}

// Lucide icon for sky condition
function SkyIcon({ condition, className }: { condition: string; className?: string }) {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return <CloudLightning className={className} />;
  if (c.includes("rain") || c.includes("shower") || c.includes("drizzle")) return <CloudRain className={className} />;
  if (c.includes("snow")) return <Snowflake className={className} />;
  if (c.includes("fog") || c.includes("haze")) return <Eye className={className} />;
  if (c.includes("partly") || c.includes("mostly clear")) return <Cloud className={className} />;
  if (c.includes("mostly cloudy") || c.includes("overcast") || c.includes("cloudy")) return <Cloud className={className} />;
  if (c.includes("clear") || c.includes("sunny")) return <Sun className={className} />;
  return <Cloud className={className} />;
}

// Forecast card component -- icon size w-10 h-10 matching site-wide style
function ForecastCard({
  icon, label, value, subValue
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="glass-dark rounded-2xl p-4 border border-white/5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-white/50 text-xs">{label}</span>
      </div>
      <p className="text-white font-black text-2xl leading-tight">{value}</p>
      {subValue && <p className="text-white/40 text-xs mt-0.5">{subValue}</p>}
    </div>
  );
}

// Temperature card with extra-large high temp display
function TempCard({
  tempHigh, tempLow, label
}: {
  tempHigh: string;
  tempLow: string | null;
  label: string;
}) {
  return (
    <div className="glass-dark rounded-2xl p-4 border border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <Thermometer className="w-10 h-10 text-orange-400" />
        <span className="text-white/50 text-xs">{label}</span>
      </div>
      <p className="text-white font-black text-4xl leading-tight">{tempHigh}</p>
      {tempLow && <p className="text-white/40 text-xs mt-0.5">Low: {tempLow}</p>}
    </div>
  );
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
  const [localMetric, setLocalMetric] = useState<boolean>(parentIsMetric);

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
      pressureHpa: null, waveHeightM: null, swellHeightM: null,
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
      {/* Promotional teaser -- shown only when no selection has been made yet */}
      {!selectedLine && (
        <div
          className="rounded-2xl overflow-hidden relative"
          style={{
            backgroundImage: "url('/teaser_bg.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center 40%",
            minHeight: "260px",
          }}
        >
          {/* Dark overlay */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(8,14,32,0.92) 38%, rgba(8,14,32,0.70) 100%)" }} />

          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-6 px-6 py-7">
            {/* Left: headline + bullets + CTA */}
            <div className="flex-shrink-0 lg:w-72">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full bg-cyan-400 inline-block" />
                <span className="text-white/50 text-xs tracking-widest uppercase font-semibold">Cruise Weather Tool</span>
              </div>
              <h3 className="text-white font-black text-2xl leading-tight mb-1">Your Cruise Forecast,</h3>
              <h3 className="text-cyan-400 font-black text-2xl leading-tight mb-3">Port by Port.</h3>
              <p className="text-white/60 text-sm mb-4 leading-relaxed">Personalized weather for every port of call and every sea day on your itinerary.</p>
              <ul className="space-y-1.5 mb-5">
                {[
                  "Select your cruise line, ship, and sailing date",
                  "See a 5-day forecast for each stop",
                  "Wind, temperature, and sky conditions at a glance",
                ].map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-white/50 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1 flex-shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="inline-block bg-cyan-400 text-[#080e20] font-bold text-sm px-5 py-2.5 rounded-full">
                Get Your Forecast
              </div>
            </div>

            {/* Right: port weather cards */}
            <div className="flex-1 flex items-center justify-center gap-2 lg:gap-3 overflow-x-auto pb-1">
              {([
                { name: "Miami",   temp: "79", cond: "Sunny",        wind: "12", type: "Departure",  typeColor: "text-yellow-400",  sunny: true },
                { name: "Nassau",  temp: "82", cond: "Sunny",        wind: "10", type: "Port Call",  typeColor: "text-cyan-400",    sunny: true },
                { name: "CocoCay", temp: "84", cond: "Clear",        wind: "9",  type: "Port Call",  typeColor: "text-cyan-400",    sunny: true },
                { name: "Miami",   temp: "78", cond: "Mostly Clear", wind: "14", type: "Return",     typeColor: "text-emerald-400", sunny: false },
              ] as const).map((p, i, arr) => (
                <div key={i} className="flex items-center gap-2 lg:gap-3">
                  <div className="flex-shrink-0 bg-[rgba(12,28,60,0.85)] border border-cyan-400/30 rounded-2xl px-3 py-3 flex flex-col items-center w-[110px] sm:w-[130px]">
                    <span className={`text-[9px] font-bold tracking-widest uppercase mb-1 ${p.typeColor}`}>{p.type}</span>
                    <span className="text-white font-bold text-sm mb-2">{p.name}</span>
                    {/* Sun icon */}
                    <svg width="36" height="36" viewBox="0 0 36 36" className="mb-1">
                      {[0,45,90,135,180,225,270,315].map(a => (
                        <line key={a}
                          x1={18 + 11*Math.cos(a*Math.PI/180)}
                          y1={18 + 11*Math.sin(a*Math.PI/180)}
                          x2={18 + 17*Math.cos(a*Math.PI/180)}
                          y2={18 + 17*Math.sin(a*Math.PI/180)}
                          stroke="#FFC837" strokeWidth="2.5" strokeLinecap="round"
                        />
                      ))}
                      <circle cx="18" cy="18" r="8" fill="#FFC837" />
                      {!p.sunny && <ellipse cx="24" cy="24" rx="9" ry="6" fill="#BDD5F0" opacity="0.9" />}
                    </svg>
                    <span className="text-white font-black text-2xl leading-none">{p.temp}&deg;</span>
                    <span className="text-white/40 text-[10px] mt-0.5 text-center">{p.cond}</span>
                    <span className="text-green-400 text-xs font-semibold mt-1.5">{p.wind} mph</span>
                  </div>
                  {/* Arrow connector */}
                  {i < arr.length - 1 && (
                    <svg width="20" height="14" viewBox="0 0 20 14" className="flex-shrink-0 opacity-60">
                      <line x1="0" y1="7" x2="14" y2="7" stroke="#00D4FF" strokeWidth="1.5" strokeDasharray="3 2" />
                      <polygon points="14,3 20,7 14,11" fill="#00D4FF" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom strip */}
          <div className="relative z-10 border-t border-white/10 px-6 py-2.5 flex items-center justify-center">
            <span className="text-white/35 text-xs text-center">Select your cruise line, ship, and sailing date above &nbsp;|&nbsp; Instant 5-day forecast for every port of call and sea day &nbsp;|&nbsp; Free</span>
          </div>
        </div>
      )}

      {/* Metric toggle -- matches site-wide style */}
      <div className="flex justify-end">
        <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-semibold">
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

      {/* Three dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* Port tabs */}
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

          {/* Forecast panel */}
          {activePort && (() => {
            const pf = portForecasts.find(p => (p.port + "|" + p.date) === activePort);
            if (!pf) return null;
            const isBeyond = pf.condition === "Beyond forecast range";
            const skyCondition = pf.wmoCode !== null ? wmoToSkyCondition(pf.wmoCode, pf.cloudCoverPct) : pf.condition;

            const tempHighDisplay = pf.tempMaxC !== null
              ? (localMetric ? `${Math.round(pf.tempMaxC)}°C` : `${cToF(pf.tempMaxC)}°F`)
              : "--";
            const tempLowDisplay = pf.tempMinC !== null
              ? (localMetric ? `${Math.round(pf.tempMinC)}°C` : `${cToF(pf.tempMinC)}°F`)
              : null;
            // US Standard: mph | Metric: knots
            const windDisplay = pf.windKt !== null
              ? (localMetric ? `${pf.windKt} kt` : `${ktToMph(pf.windKt)} mph`)
              : "--";
            const precipDisplay = pf.precipMm !== null
              ? (localMetric ? `${pf.precipMm} mm` : `${mmToIn(pf.precipMm)}"`)
              : null;
            const pressureDisplay = pf.pressureHpa !== null
              ? (localMetric ? `${pf.pressureHpa} hPa` : `${hpaToInHg(pf.pressureHpa)} inHg`)
              : "--";
            const waveDisplay = pf.waveHeightM !== null
              ? (localMetric ? `${pf.waveHeightM} m` : `${mToFt(pf.waveHeightM)} ft`)
              : null;
            const swellDisplay = pf.swellHeightM !== null
              ? (localMetric ? `Swell: ${pf.swellHeightM} m` : `Swell: ${mToFt(pf.swellHeightM)} ft`)
              : null;

            const isSeaDay = pf.port === 'At Sea';
            return (
              <div className="bg-white/5 border border-cyan-400/20 rounded-2xl p-5">
                {/* Port header with wide photo on right */}
                {(() => {
                  const slug = isSeaDay ? 'at-sea' : portImageSlug(pf.port);
                  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
                  const imgSrc = slug ? `${base}/port-images/${slug}.jpg` : null;
                  return (
                    <div className="mb-4">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-white font-bold text-xl flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                            <span className="truncate">{pf.port}</span>
                          </h4>
                          <p className="text-white/50 text-sm mt-0.5">Day {pf.day} &mdash; {formatDate(pf.date)}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <SkyIcon condition={pf.condition} className="w-10 h-10 ml-auto mb-1 text-yellow-300" />
                          <div className="text-white/60 text-sm">{skyCondition}</div>
                        </div>
                      </div>
                      {imgSrc && (
                        <div className="mt-3 w-full h-40 sm:h-52 rounded-xl overflow-hidden border border-white/10">
                          <img
                            src={imgSrc}
                            alt={pf.port}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {pf.loading ? (
                  <div className="flex items-center gap-2 text-white/40 text-sm py-4">
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
                    {/* Row 1: Temperature (large), Wind, Rain Chance, Cloud Cover */}
                    <div>
                      <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">Conditions</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <TempCard
                          tempHigh={tempHighDisplay}
                          tempLow={tempLowDisplay}
                          label="High Temp"
                        />
                        <ForecastCard
                          icon={<Wind className="w-10 h-10 text-cyan-400" />}
                          label="Wind"
                          value={windDisplay}
                          subValue={pf.windDir}
                        />
                        <ForecastCard
                          icon={<Droplets className="w-10 h-10 text-blue-400" />}
                          label="Rain Chance"
                          value={pf.precipChance !== null ? `${pf.precipChance}%` : "--"}
                          subValue={precipDisplay ? `Precip: ${precipDisplay}` : undefined}
                        />
                        <ForecastCard
                          icon={<Cloud className="w-10 h-10 text-slate-300" />}
                          label="Cloud Cover"
                          value={pf.cloudCoverPct !== null ? `${Math.round(pf.cloudCoverPct)}%` : "--"}
                          subValue={skyCondition}
                        />
                      </div>
                    </div>
                    {/* Row 2: Sea State, Pressure, Sky Condition */}
                    <div>
                      <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">Marine</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <ForecastCard
                          icon={<Waves className="w-10 h-10 text-cyan-400" />}
                          label="Sea State"
                          value={waveDescription(pf.waveHeightM)}
                          subValue={waveDisplay ? (swellDisplay ? `${waveDisplay} | ${swellDisplay}` : waveDisplay) : "No wave data"}
                        />
                        <ForecastCard
                          icon={<Gauge className="w-10 h-10 text-violet-400" />}
                          label="Pressure"
                          value={pressureDisplay}
                          subValue={pressureTendency(pf.pressureHpa)}
                        />
                        <ForecastCard
                          icon={<SkyIcon condition={skyCondition} className="w-10 h-10 text-yellow-300" />}
                          label="Sky Condition"
                          value={skyCondition}
                          subValue={pf.condition !== skyCondition ? pf.condition : undefined}
                        />
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
