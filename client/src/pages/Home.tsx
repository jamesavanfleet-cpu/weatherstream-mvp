import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Anchor, ArrowRight, Calendar, Cloud, Waves, Droplets, Info,
  MapPin, Play, Ship, Sparkles, ThermometerSun, TrendingUp, 
  Wind, Zap, Clock, Users, Navigation, AlertTriangle
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

/**
 * WeatherStream - Next-Gen Weather Platform
 * 
 * Design Philosophy: Video-First, Cinematic, Interactive
 * - Full-screen video hero with glassmorphism overlays
 * - Dark mode for premium, streaming-service aesthetic
 * - Animated gradients and micro-interactions everywhere
 * - Live data with smooth transitions
 * - Depth through layering and blur effects
 */

const HERO_BG = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-1_1771041482000_na1fn_aGVyby13ZWF0aGVyLXNreQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTFfMTc3MTA0MTQ4MjAwMF9uYTFmbl9hR1Z5YnkxM1pXRjBhR1Z5TFhOcmVRLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=KK1QCR0Sl1y9Qj73ab1HaJtPQGQmBqHWEETKpj0bxlATD3yG0YKMw16CmQOQsGjyHrUxOK2fz-yg6rUb2Fb7EoxbRPv7X4us15i~UJLNQVRy1aSjGM-j5v8heuuf1kI4CoNiUbJC~dsNriGf04Pm3rB8T6iiuy2s0gF0XWoedgi8X3NJ0QvwVKBsGIo0xjCTum6mLeNpRSCqX61YnpLiOJA0mwlFv3uXtnV7pNQa20Lvy~h~D1-uQmI-wvl4ZKlES4~1rBay9PkyXWogmok0HeL5vl~cji-i4Xnogbg8e7Yblw2dARmBsM9bCiThkU9Upqi-whLcqapz0EpzfuUH8A__";
const CRUISE_SUNSET = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-2_1771041480000_na1fn_Y2FyaWJiZWFuLWNydWlzZS1zdW5zZXQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTJfMTc3MTA0MTQ4MDAwMF9uYTFmbl9ZMkZ5YVdKaVpXRnVMV055ZFdselpTMXpkVzV6WlhRLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=q7HRCQyQ~-w~C5w33nY2ql2sG3uXJCzYOhBWvxdtDbze05vqRtYbS1MyRLwFD-TcVNJiFFpZJHcV2VwV~1q2R3cALqcMsvdGRwHnu21~weD8Sbi-uWiSdqPpU9WlWn2TKGKSeggtUFRQyfGACZXSWEN8fFARTbR6zzad3L~CHbe4XhsMPFnsc3p-wyMqi~d0BXyI285CVEa7MEblcdb65PW9fdjkfHT~qRlFn6r07oCoZ0-QNyv5bieV7Uc3tjnaZPINOxgUEUae~nkcYOMaSW3rbEpaeOPirXqd8MTpAakVSef6F4V~VkghbCiPu~VmHDnSaWoQ6uLrTOXc4UCehA__";
const TROPICAL_BEACH = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-4_1771041481000_na1fn_dHJvcGljYWwtYmVhY2gtd2VhdGhlcg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTRfMTc3MTA0MTQ4MTAwMF9uYTFmbl9kSEp2Y0dsallXd3RZbVZoWTJndGQyVmhkR2hsY2cucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=gc3iC93INNkqrzR5EnGIKflyv9FZdTH2fcgfdAbMjhXxoCZjknQ5xd9PeoZfZIuPgpkgSKejVD--ZpA7V17td1MzXUUjYzjxXZntB4pNkCjJYyWtpcW1PhtJoRFqVtUCsUAyhpxkxIbNWc8pWg2Lb7hCro~xzqd7PmRe2J2nO21MUlSzZmuIG1ogNLRm7UeSmtlxqvuQozC~DnA8ux49xns-BKzSBXIfPHW6FZKDKdqcQSP2nYkS9FZCLwtX2dyf~cwa78K5P0KYg3twSHu5t9UQGasE4Brn8NEIVTsP2ECZxrNdoc7urtkzPyCZlM3ZfeeOoA9iZ6bI5mvbgSD3bA__";

// --- Live Conditions Data ---
const LIVE_DATA = [
  { location: "Miami",         sublabel: null,                              temp: 78, condition: "Sunny",         icon: ThermometerSun, color: "from-orange-500 to-yellow-500" },
  { location: "Key West",      sublabel: null,                              temp: 80, condition: "Clear",         icon: Sparkles,       color: "from-yellow-400 to-orange-400" },
  { location: "Nassau",        sublabel: null,                              temp: 77, condition: "Breezy",        icon: Wind,           color: "from-cyan-400 to-blue-500" },
  { location: "Bimini",        sublabel: null,                              temp: 76, condition: "Clear",         icon: Sparkles,       color: "from-sky-400 to-cyan-400" },
  { location: "Freeport",      sublabel: null,                              temp: 75, condition: "Partly Cloudy", icon: Cloud,          color: "from-blue-400 to-sky-400" },
  { location: "Berry Islands", sublabel: "Cruise Lines' Private Islands",   temp: 77, condition: "Sunny",         icon: ThermometerSun, color: "from-amber-400 to-yellow-400" },
  { location: "San Juan",      sublabel: null,                              temp: 84, condition: "Partly Cloudy", icon: Cloud,          color: "from-blue-400 to-cyan-400" },
  { location: "St. Thomas",    sublabel: null,                              temp: 83, condition: "Sunny",         icon: ThermometerSun, color: "from-orange-400 to-yellow-400" },
  { location: "St. Croix",     sublabel: null,                              temp: 82, condition: "Clear",         icon: Sparkles,       color: "from-yellow-500 to-orange-400" },
  { location: "St. Kitts",     sublabel: null,                              temp: 83, condition: "Sunny",         icon: ThermometerSun, color: "from-orange-500 to-amber-400" },
  { location: "St. Maarten",   sublabel: null,                              temp: 83, condition: "Sunny",         icon: ThermometerSun, color: "from-orange-500 to-red-400" },
  { location: "Antigua",       sublabel: null,                              temp: 82, condition: "Trade Winds",   icon: Wind,           color: "from-cyan-500 to-blue-500" },
  { location: "Dominica",      sublabel: null,                              temp: 81, condition: "Partly Cloudy", icon: Cloud,          color: "from-green-500 to-teal-500" },
  { location: "St. Lucia",     sublabel: null,                              temp: 83, condition: "Sunny",         icon: ThermometerSun, color: "from-yellow-500 to-amber-500" },
  { location: "Barbados",      sublabel: null,                              temp: 82, condition: "Trade Winds",   icon: Wind,           color: "from-blue-500 to-indigo-500" },
  { location: "Turks & Caicos",sublabel: null,                              temp: 79, condition: "Clear",         icon: Sparkles,       color: "from-sky-500 to-cyan-400" },
  { location: "Grand Cayman",  sublabel: null,                              temp: 84, condition: "Sunny",         icon: ThermometerSun, color: "from-amber-500 to-yellow-400" },
  { location: "Cozumel",       sublabel: null,                              temp: 86, condition: "Clear",         icon: Sparkles,       color: "from-emerald-400 to-cyan-400" },
  { location: "Costa Maya",    sublabel: "Mahahual",                        temp: 85, condition: "Sunny",         icon: ThermometerSun, color: "from-teal-500 to-emerald-500" },
  { location: "Roatan",        sublabel: null,                              temp: 85, condition: "Partly Cloudy", icon: Cloud,          color: "from-teal-400 to-blue-400" },
  { location: "Belize City",   sublabel: null,                              temp: 84, condition: "Partly Cloudy", icon: Cloud,          color: "from-green-500 to-teal-500" },
  { location: "Cartagena",     sublabel: null,                              temp: 88, condition: "Sunny",         icon: ThermometerSun, color: "from-amber-500 to-orange-500" },
  { location: "Aruba",         sublabel: null,                              temp: 87, condition: "Clear",         icon: Sparkles,       color: "from-yellow-500 to-amber-400" },
  { location: "Curacao",       sublabel: null,                              temp: 86, condition: "Sunny",         icon: ThermometerSun, color: "from-orange-400 to-amber-400" },
  { location: "Bonaire",       sublabel: null,                              temp: 85, condition: "Clear",         icon: Sparkles,       color: "from-cyan-400 to-teal-400" },
  { location: "Ocho Rios",     sublabel: null,                              temp: 86, condition: "Partly Cloudy", icon: Cloud,          color: "from-green-400 to-emerald-400" },
  { location: "Falmouth",      sublabel: null,                              temp: 85, condition: "Sunny",         icon: ThermometerSun, color: "from-yellow-400 to-orange-400" },
  { location: "Puerto Plata",  sublabel: null,                              temp: 82, condition: "Breezy",        icon: Wind,           color: "from-blue-400 to-cyan-500" },
  { location: "La Romana",     sublabel: null,                              temp: 83, condition: "Sunny",         icon: ThermometerSun, color: "from-orange-400 to-yellow-500" },
  { location: "Samana",        sublabel: null,                              temp: 81, condition: "Partly Cloudy", icon: Cloud,          color: "from-teal-400 to-blue-400" },
  { location: "Santo Domingo", sublabel: null,                              temp: 84, condition: "Sunny",         icon: ThermometerSun, color: "from-amber-400 to-orange-400" },
];

// --- Caribbean Cruise Routes ---
const CRUISE_ROUTES = [
  {
    name: "Eastern Caribbean",
    image: TROPICAL_BEACH,
    temp: 84,
    seas: "2-3 ft",
    wind: "10-15 kt",
    rain: "5%",
    status: "Perfect",
    gradient: "from-emerald-500/20 to-cyan-500/20",
    intel: "High pressure dominating the region through the weekend. Expect light trade winds and calm seas—ideal for tender operations in St. Thomas and St. Maarten. UV index will be extreme, so remind passengers about sun protection."
  },
  {
    name: "Western Caribbean",
    image: CRUISE_SUNSET,
    temp: 86,
    seas: "3-4 ft",
    wind: "12-18 kt",
    rain: "10%",
    status: "Excellent",
    gradient: "from-orange-500/20 to-pink-500/20",
    intel: "Typical pattern with easterly flow. Cozumel and Grand Cayman will see afternoon sea breezes—perfect beach weather. Watch for isolated showers near Jamaica's Blue Mountains in the late afternoon, but they'll stay inland."
  },
  {
    name: "Bahamas",
    image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop",
    temp: 77,
    seas: "3-5 ft",
    wind: "15-20 kt",
    rain: "20%",
    status: "Very Good",
    gradient: "from-blue-500/20 to-purple-500/20",
    intel: "Cold front passed through yesterday—cooler temps but crystal-clear visibility. Seas building slightly on the Atlantic side, but western anchorages (Nassau, Freeport) remain protected. Great conditions for snorkeling and diving with 100+ ft visibility."
  },
  {
    name: "Southern Caribbean",
    image: "https://files.manuscdn.com/user_upload_by_module/session_file/110462184/INhsBOFIHROpOBep.jpg",
    temp: 85,
    seas: "2-4 ft",
    wind: "12-16 kt",
    rain: "3%",
    status: "Excellent",
    gradient: "from-teal-500/20 to-emerald-500/20",
    intel: "ABC islands sitting in the dry zone south of the hurricane belt. Aruba and Curacao enjoying persistent easterlies—perfect for windsurfing and sailing. Bonaire's leeward coast is glass-calm for diving. Minimal rain expected all week, with visibility exceeding 100 ft underwater."
  },
];


// --- Mediterranean Routes ---
const MED_ROUTES = [
  {
    name: "Western Mediterranean",
    image: "/weatherstream-mvp/locations/western-mediterranean.jpg",
    temp: 62,
    seas: "2-4 ft",
    wind: "12-20 kt",
    rain: "15%",
    status: "Good",
    gradient: "from-blue-500/20 to-indigo-500/20",
    intel: "Mistral threat low this week. Barcelona and the Balearics enjoying light E-SE sea breezes 10-15 kt. Strait of Gibraltar Levante winds calm. Lisbon and the Portuguese coast seeing NW 15-20 kt with 3-5 ft Atlantic swell on the approach."
  },
  {
    name: "Central Mediterranean",
    image: "/weatherstream-mvp/locations/central-mediterranean.jpg",
    temp: 58,
    seas: "2-5 ft",
    wind: "10-18 kt",
    rain: "20%",
    status: "Good",
    gradient: "from-cyan-500/20 to-teal-500/20",
    intel: "Ligurian Sea calm with light variable winds. Tyrrhenian Sea 2-3 ft with NW 10-15 kt. Adriatic watching for Bora development — current forecast shows no significant event this week. Naples and Civitavecchia conditions favorable for cruise operations."
  },
  {
    name: "Eastern Mediterranean",
    image: "/weatherstream-mvp/locations/eastern-mediterranean.jpg",
    temp: 65,
    seas: "2-4 ft",
    wind: "15-25 kt",
    rain: "8%",
    status: "Very Good",
    gradient: "from-indigo-500/20 to-violet-500/20",
    intel: "Aegean Meltemi winds running 20-25 kt N-NW. Santorini and Mykonos exposed on northern approaches — use leeward anchorages. Ionian Sea calm. Turkish coast thermal winds building to 15-20 kt by afternoon. Levantine coast light NW 10-15 kt with excellent visibility."
  },
];

// --- Eastern Pacific Routes ---
const PACIFIC_ROUTES = [
  {
    name: "Ensenada",
    image: "/weatherstream-mvp/locations/ensenada.jpg",
    temp: 65,
    seas: "4-6 ft",
    wind: "15-22 kt",
    rain: "10%",
    status: "Moderate",
    gradient: "from-slate-500/20 to-blue-600/20",
    intel: "NW swell running 4-6 ft with a 14-second period—comfortable offshore but watch the harbor entrance. Afternoon thermal winds pick up to 20+ kt in the afternoon along the Baja coast. Overnight conditions settle considerably. Fuel and provisions readily available."
  },
  {
    name: "Cabo San Lucas",
    image: "/weatherstream-mvp/locations/cabo-san-lucas.jpg",
    temp: 78,
    seas: "2-4 ft",
    wind: "10-15 kt",
    rain: "2%",
    status: "Excellent",
    gradient: "from-amber-500/20 to-orange-500/20",
    intel: "The Cape region is in a favorable pattern. Pacific swell is wrapping around the tip but staying below 4 ft at the anchorage. Sea of Cortez side is glass-calm. Excellent visibility for diving at the arch. Light NW breeze in the mornings, calm by afternoon."
  },
  {
    name: "Mazatlan",
    image: "/weatherstream-mvp/locations/mazatlan.jpg",
    temp: 82,
    seas: "2-3 ft",
    wind: "8-12 kt",
    rain: "3%",
    status: "Perfect",
    gradient: "from-yellow-500/20 to-amber-500/20",
    intel: "Mazatlan is enjoying classic Sea of Cortez winter conditions. Light winds, minimal swell, and outstanding visibility. The Stone Island anchorage is perfectly calm. Excellent conditions for the crossing to La Paz or heading north toward the Tres Marias Islands."
  },
  {
    name: "Puerto Vallarta",
    image: "/weatherstream-mvp/locations/puerto-vallarta.jpg",
    temp: 84,
    seas: "2-4 ft",
    wind: "10-16 kt",
    rain: "5%",
    status: "Excellent",
    gradient: "from-emerald-500/20 to-teal-500/20",
    intel: "Banderas Bay is one of the most protected anchorages on the Pacific coast of Mexico. Afternoon sea breeze is building to 15 kt by 2 PM, ideal for sailing. Yelapa and the southern bay anchorages are calm. Chacala and Punta Mita are excellent day-trip destinations this week."
  },
];

// --- Briefing Client Types ---
const BRIEFING_CLIENTS = [
  {
    icon: Anchor,
    title: "Fishing Captains",
    description: "Florida and surrounding waters. Know where the fish are holding and where the weather will let you run. Get a decision briefing before you leave the dock—wind, seas, current, and the best window to get out and get back safely.",
    color: "from-blue-500 to-cyan-500",
    examples: ["Offshore trolling windows", "Sea state by fishing grounds", "Return window timing", "Squall and storm cell tracking"],
  },
  {
    icon: Users,
    title: "Charter Captains",
    description: "Day charters and rental guests deserve the best experience. Know which direction to run for the calmest water, the clearest skies, and the best conditions for your guests—whether that's snorkeling, diving, or just a comfortable ride.",
    color: "from-emerald-500 to-teal-500",
    examples: ["Best direction to run for calm water", "Guest comfort sea state forecasts", "Afternoon thunderstorm timing", "Alternate destination planning"],
  },
  {
    icon: Navigation,
    title: "Yacht Owners and Captains",
    description: "Longer passages, repositioning voyages, and multi-port itineraries require serious weather intelligence. Get a full briefing covering routing, passage windows, anchorage conditions, and tropical weather threats—including hurricane track analysis and vessel movement decisions.",
    color: "from-violet-500 to-purple-500",
    examples: ["Passage routing and timing", "Tropical storm and hurricane decisions", "Stay tied up or move the vessel?", "When and where to relocate for safety"],
  },
];

// Coordinates for each route card — used to fetch live wind direction
const ROUTE_COORDS: Record<string, { lat: number; lon: number }> = {
  "Eastern Caribbean":  { lat: 18.0,   lon: -63.0  },
  "Western Caribbean":  { lat: 19.3,   lon: -81.4  },
  "Bahamas":            { lat: 25.0,   lon: -77.4  },
  "Southern Caribbean": { lat: 12.5,   lon: -70.0  },
  "Ensenada":           { lat: 31.87,  lon: -116.6  },
  "Cabo San Lucas":     { lat: 22.89,  lon: -109.91 },
  "Mazatlan":           { lat: 23.22,  lon: -106.42 },
  "Puerto Vallarta":    { lat: 20.65,  lon: -105.22 },
  "Western Mediterranean": { lat: 39.57, lon: 2.65 },
  "Central Mediterranean":  { lat: 43.30, lon: 5.37 },
  "Eastern Mediterranean":  { lat: 37.45, lon: 25.33 },
};

// Convert Fahrenheit integer to Celsius string
function fToC(f: number): string {
  return Math.round((f - 32) * 5 / 9) + "°C";
}

// Convert a seas string like "2-3 ft" or "3-5 ft" to metres
function seaFtToM(seas: string): string {
  // Match patterns like "2-3 ft" or "4 ft"
  const range = seas.match(/([\d.]+)(?:-([\d.]+))?\s*ft/);
  if (!range) return seas;
  const lo = parseFloat(range[1]);
  const hi = range[2] ? parseFloat(range[2]) : null;
  const toM = (ft: number) => (ft * 0.3048).toFixed(1);
  return hi ? `${toM(lo)}-${toM(hi)} m` : `${toM(lo)} m`;
}

function degToCompass(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleIntel, setVisibleIntel] = useState<Set<number>>(new Set());
  const [hoveredIntel, setHoveredIntel] = useState<number | null>(null);
  const [visiblePacific, setVisiblePacific] = useState<Set<number>>(new Set());
  const [hoveredPacific, setHoveredPacific] = useState<number | null>(null);
  const [visibleMed, setVisibleMed] = useState<Set<number>>(new Set());
  const [hoveredMed, setHoveredMed] = useState<number | null>(null);
  const cruiseRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pacificRefs = useRef<(HTMLDivElement | null)[]>([]);
  const medRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [windDirs, setWindDirs] = useState<Record<string, string>>({});
  const [liveOffset, setLiveOffset] = useState(0);
  const [liveExiting, setLiveExiting] = useState(false);
  const [regionIntel, setRegionIntel] = useState<Record<string, string>>({});
  const [, navigate] = useLocation();
  const [topStory, setTopStory] = useState<{ headline: string; paragraph: string } | null>(null);
  const [isMetric, setIsMetric] = useState(false);

  // Fetch daily top story from top_story.json
  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/";
    fetch(`${base}top_story.json?v=${new Date().toISOString().slice(0, 10)}`)
      .then(r => r.json())
      .then((d: { headline: string; paragraph: string }) => setTopStory(d))
      .catch(() => {});
  }, []);

  // Fetch daily AI intel from intel.json (committed to gh-pages by GitHub Actions)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}intel.json`)
      .then(r => r.json())
      .then((data: { regions?: Record<string, string> }) => {
        if (data.regions) setRegionIntel(data.regions);
      })
      .catch(() => { /* silently fail — static intel text still shown */ });
  }, []);

  // Rotate Live Conditions every 5 seconds: shift 3 cards from the left
  useEffect(() => {
    const id = setInterval(() => {
      setLiveExiting(true);
      setTimeout(() => {
        setLiveOffset(prev => (prev + 3) % LIVE_DATA.length);
        setLiveExiting(false);
      }, 400);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Fetch live wind direction for all route cards from Open-Meteo
  useEffect(() => {
    const entries = Object.entries(ROUTE_COORDS);
    const lats = entries.map(([, c]) => c.lat).join(",");
    const lons = entries.map(([, c]) => c.lon).join(",");
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=wind_direction_10m&wind_speed_unit=kn&timezone=auto`
    )
      .then(r => r.json())
      .then((data: unknown) => {
        const results: Record<string, string> = {};
        const arr = Array.isArray(data) ? data : [data];
        arr.forEach((item: { current?: { wind_direction_10m?: number } }, idx: number) => {
          const name = entries[idx][0];
          const deg = item?.current?.wind_direction_10m;
          if (deg !== undefined) results[name] = degToCompass(deg);
        });
        setWindDirs(results);
      })
      .catch(() => { /* silently fail — static wind speed still shown */ });
  }, []);

  // Scroll-triggered intel expansion for Caribbean cards
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = cruiseRefs.current.indexOf(entry.target as HTMLDivElement);
          if (index === -1) return;
          setVisibleIntel(prev => {
            const newSet = new Set(prev);
            if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
              newSet.add(index);
            } else {
              newSet.delete(index);
            }
            return newSet;
          });
        });
      },
      { threshold: [0, 0.3, 0.5, 0.7, 0.9], rootMargin: '-20% 0px -20% 0px' }
    );
    cruiseRefs.current.forEach((ref) => { if (ref) observer.observe(ref); });
    return () => observer.disconnect();
  }, []);

  // Scroll-triggered intel expansion for Pacific cards
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = pacificRefs.current.indexOf(entry.target as HTMLDivElement);
          if (index === -1) return;
          setVisiblePacific(prev => {
            const newSet = new Set(prev);
            if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
              newSet.add(index);
            } else {
              newSet.delete(index);
            }
            return newSet;
          });
        });
      },
      { threshold: [0, 0.3, 0.5, 0.7, 0.9], rootMargin: '-20% 0px -20% 0px' }
    );
    pacificRefs.current.forEach((ref) => { if (ref) observer.observe(ref); });
    return () => observer.disconnect();
  }, []);

  // Scroll-triggered intel expansion for Mediterranean cards
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = medRefs.current.indexOf(entry.target as HTMLDivElement);
          if (index === -1) return;
          setVisibleMed(prev => {
            const newSet = new Set(prev);
            if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
              newSet.add(index);
            } else {
              newSet.delete(index);
            }
            return newSet;
          });
        });
      },
      { threshold: [0, 0.3, 0.5, 0.7, 0.9], rootMargin: '-20% 0px -20% 0px' }
    );
    medRefs.current.forEach((ref) => { if (ref) observer.observe(ref); });
    return () => observer.disconnect();
  }, []);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success("Welcome to WeatherStream! Check your inbox.");
    setEmail("");
    setIsSubmitting(false);
  };

  // Reusable weather card renderer
  const renderRouteCard = (
    route: typeof CRUISE_ROUTES[0],
    i: number,
    refs: React.MutableRefObject<(HTMLDivElement | null)[]>,
    visible: Set<number>,
    hovered: number | null,
    setHovered: (v: number | null) => void
  ) => {
    const dir = windDirs[route.name];
    // Derive slug from region name to match REGIONS data
    const slug = route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const liveIntel = regionIntel[slug];
    const displayTemp = isMetric ? fToC(route.temp) : `${route.temp}°`;
    const displaySeas = isMetric ? seaFtToM(route.seas) : route.seas;
    return (
    <div
      key={route.name}
      ref={(el) => { refs.current[i] = el; }}
      className="group cursor-pointer"
      style={{ animationDelay: `${i * 150}ms` }}
      onClick={() => navigate(`/region/${slug}`)}
    >
      <div className="glass-dark rounded-3xl overflow-hidden border border-white/10 hover:border-white/30 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
        <div
          className="relative h-64 overflow-hidden"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          <img
            src={route.image}
            alt={route.name}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          />
          <div className={`absolute inset-0 bg-gradient-to-t ${route.gradient} to-transparent`} />

          {/* Weather Intel overlay */}
          <div
            className={`absolute left-8 right-8 top-8 bottom-8 flex items-center justify-center transition-all duration-500 z-20 ${
              visible.has(i) ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <div className={`bg-slate-950/98 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-2xl transition-all duration-300 w-full overflow-hidden ${
              hovered === i ? 'p-4 max-h-52' : 'p-3 max-h-16'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                  hovered === i ? 'w-9 h-9' : 'w-8 h-8'
                }`}>
                  <Sparkles className={`text-white transition-all duration-300 ${hovered === i ? 'w-5 h-5' : 'w-4 h-4'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-cyan-400 font-bold text-sm mb-2">James's Intel</p>
                  <p className={`text-white/90 text-xs leading-snug transition-all duration-300 line-clamp-6 ${
                    hovered === i ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 overflow-hidden'
                  }`}>{liveIntel || route.intel}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="absolute top-4 right-4 glass px-4 py-2 rounded-full">
            <span className="text-white font-bold text-sm">{route.status}</span>
          </div>

          {/* Route Name */}
          <div className="absolute bottom-4 left-4 right-4">
            <h4 className="text-2xl font-black text-white mb-2">{route.name}</h4>
          </div>
        </div>

        {/* Weather Data Grid */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="glass rounded-xl p-3 text-center">
              <ThermometerSun className="w-5 h-5 mx-auto mb-2 text-orange-400" />
              <p className="text-2xl font-bold text-white">{displayTemp}</p>
              <p className="text-xs text-white/60">Temperature</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <Waves className="w-5 h-5 mx-auto mb-2 text-blue-400" />
              <p className="text-2xl font-bold text-white">{displaySeas}</p>
              <p className="text-xs text-white/60">Sea State</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <Wind className="w-5 h-5 mx-auto mb-2 text-cyan-400" />
              <p className="text-2xl font-bold text-white">{dir ? <span>{dir} </span> : null}{route.wind}</p>
              <p className="text-xs text-white/60">Wind</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <Droplets className="w-5 h-5 mx-auto mb-2 text-purple-400" />
              <p className="text-2xl font-bold text-white">{route.rain}</p>
              <p className="text-xs text-white/60">Rain Chance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="min-h-screen gradient-animate">
      {/* Full-Width Banner Photo */}
      <div className="w-full" style={{height: '260px', overflow: 'hidden'}}>
        <img
          src="/weatherstream-mvp/locations/bridge-banner.jpg"
          alt="Ship bridge at sunrise returning to Miami"
          className="w-full h-full object-cover object-center"
          style={{objectPosition: 'center 50%'}}
        />
      </div>

      {/* Full-Screen Video Hero */}
      <section className="relative flex items-center justify-center overflow-hidden pt-0 pb-0" style={{minHeight: '72vh'}}>
        <div className="absolute inset-0">
          <img
            src={HERO_BG}
            alt="Weather"
            className="w-full h-full object-cover opacity-30 scale-110 animate-[pulse_20s_ease-in-out_infinite]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
        </div>

        <div className="container relative z-10 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <Badge className="glass border-white/20 text-white backdrop-blur-xl">
              <TrendingUp className="w-3 h-3 mr-1" />
              30+ Years | Royal Caribbean Chief Met
            </Badge>
            <div className="space-y-3">
              <h2 className="text-6xl md:text-7xl font-black tracking-tighter leading-none">
                <span className="bg-gradient-to-r from-white via-blue-100 to-cyan-200 bg-clip-text text-transparent">
                  Weather Intelligence
                </span>
              </h2>
              <p className="text-2xl text-white/70 font-light">By James Van Fleet</p>
            </div>
            <p className="text-xl text-white/80 leading-relaxed max-w-xl">
              Forecast Video Briefings and breaking storm analysis with the former Chief Meteorologist
              of Royal Caribbean, with 30+ years of experience. Cruise Forecasts for the Caribbean, Mediterranean, and Eastern Pacific.
              <span className="text-white/40"> Coming soon: South Pacific (Australia &amp; New Zealand) and APAC (China &amp; Japan).</span>
            </p>
            <div className="flex gap-3">
              <Button size="lg" className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white border-0 shadow-2xl glow-accent">
                <Play className="w-5 h-5 mr-2" />
                Watch Today's Briefing
              </Button>
            </div>
          </div>

          <div className="relative flex justify-center">
            <div className="glass-dark rounded-3xl overflow-hidden shadow-2xl glow-accent border-2 border-white/10" style={{maxWidth: '380px', width: '100%'}}>
              <div className="aspect-square bg-gradient-to-br from-slate-900 to-slate-800 relative group">
                <video
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                >
                  <source src="https://files.manuscdn.com/user_upload_by_module/session_file/110462184/ZjZxBJiirimaafnf.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                <div className="absolute top-4 right-4 glass-dark px-3 py-1.5 rounded-full flex items-center gap-2 z-10">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white text-xs font-semibold">NEW</span>
                </div>
              </div>
              <div className="p-6 glass-dark border-t border-white/5">
                <h3 className="text-white font-bold text-lg mb-2">
                  {topStory ? topStory.headline : "Arctic Blast Sweeps Midwest, Caribbean Perfect"}
                </h3>
                <p className="text-white/60 text-sm">
                  {topStory ? topStory.paragraph : "Dangerous wind chills hit the central U.S. while Caribbean cruise routes enjoy perfect conditions."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Conditions - Rotating 6-card display */}
      <section className="py-8 relative">
        <div className="container">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50" />
            <h3 className="text-2xl font-bold text-white">Live Conditions</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 overflow-hidden">
            {Array.from({ length: 6 }, (_, i) => {
              const loc = LIVE_DATA[(liveOffset + i) % LIVE_DATA.length];
              return (
                <div
                  key={`${liveOffset}-${i}`}
                  className={`glass-dark rounded-2xl p-5 cursor-pointer group border border-white/5 hover:border-white/20 transition-all duration-400 ${
                    liveExiting && i < 3 ? 'opacity-0 -translate-x-4' : 'opacity-100 translate-x-0'
                  }`}
                  style={{ transition: 'opacity 0.4s ease, transform 0.4s ease', transitionDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-white font-bold text-sm leading-tight truncate">{loc.location}</p>
                      {loc.sublabel && (
                        <p className="text-white/40 text-[10px] leading-tight mt-0.5 truncate">{loc.sublabel}</p>
                      )}
                      <p className="text-3xl font-black text-white mt-1">{loc.temp}°</p>
                    </div>
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${loc.color} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                      <loc.icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <p className="text-white/70 text-xs font-medium">{loc.condition}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Caribbean Cruise Weather */}
      <section className="py-8 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-3xl opacity-20" />
        <div className="container relative z-10">
          {/* Units Toggle */}
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setIsMetric(m => !m)}
              className="relative flex items-center gap-0 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm overflow-hidden h-9 w-52 select-none"
              aria-label="Toggle units"
            >
              {/* Sliding pill */}
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
          </div>
          <div className="text-center mb-5">
            <h3 className="text-5xl font-black text-white mb-4 tracking-tight">
              Caribbean Cruise Weather
            </h3>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              7-day forecasts from the meteorologist who protected Royal Caribbean's fleet for 6+ years
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1400px] mx-auto">
            {CRUISE_ROUTES.map((route, i) =>
              renderRouteCard(route, i, cruiseRefs, visibleIntel, hoveredIntel, setHoveredIntel)
            )}
          </div>
        </div>
      </section>

      {/* Mediterranean Section */}
      <section className="py-8 relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl opacity-30" />
        <div className="container relative z-10">
          <div className="text-center mb-5">
            <h3 className="text-5xl font-black text-white mb-4 tracking-tight">
              Mediterranean Cruise Weather
            </h3>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Western, Central, and Eastern Mediterranean — complete port and passage forecasts
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1400px] mx-auto">
            {MED_ROUTES.map((route, i) =>
              renderRouteCard(
                route as typeof CRUISE_ROUTES[0],
                i,
                medRefs,
                visibleMed,
                hoveredMed,
                setHoveredMed
              )
            )}
          </div>
        </div>
      </section>

      {/* Eastern Pacific Section */}
      <section className="py-8 relative overflow-hidden">
        <div className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl opacity-30" />
        <div className="container relative z-10">
          <div className="text-center mb-5">
            <h3 className="text-5xl font-black text-white mb-4 tracking-tight">
              Eastern Pacific Cruise Weather
            </h3>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              From Los Angeles to Cabo San Lucas — complete Pacific Mexico coastal and offshore forecasts
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1400px] mx-auto">
            {PACIFIC_ROUTES.map((route, i) =>
              renderRouteCard(
                route as typeof CRUISE_ROUTES[0],
                i,
                pacificRefs,
                visiblePacific,
                hoveredPacific,
                setHoveredPacific
              )
            )}
          </div>
        </div>
      </section>


      {/* Weather Decision Briefing - Booking Section */}
      <section className="py-8 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-accent/10 rounded-full blur-3xl opacity-40" />

        <div className="container relative z-10">
          <div className="text-center mb-5">
            <h3 className="text-5xl font-black text-white mb-6 tracking-tight">
              Schedule a Weather Decision Briefing
            </h3>
            <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed">
              A focused 20-minute one-on-one session with James. You bring the question—where to go, when to go, whether to stay tied up or move the vessel. James brings 30+ years of professional meteorology and the answers you need before you leave the dock.
            </p>
          </div>

          {/* Client Type Cards */}
          <div className="grid md:grid-cols-3 gap-8 mb-16 max-w-[1200px] mx-auto">
            {BRIEFING_CLIENTS.map((client, i) => (
              <div
                key={client.title}
                className="glass-dark rounded-3xl p-8 border border-white/10 hover:border-white/25 transition-all duration-500 hover:scale-105 hover:shadow-2xl group"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${client.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
                  <client.icon className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-2xl font-black text-white mb-4">{client.title}</h4>
                <p className="text-white/70 leading-relaxed mb-6 text-sm">{client.description}</p>
                <ul className="space-y-2">
                  {client.examples.map((ex) => (
                    <li key={ex} className="flex items-start gap-2 text-sm text-white/60">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${client.color} mt-1.5 flex-shrink-0`} />
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Tropical / Hurricane Decision Callout */}
          <div className="max-w-[900px] mx-auto glass-dark rounded-3xl p-10 border border-amber-500/20 shadow-2xl mb-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl" />
            <div className="relative z-10 flex flex-col md:flex-row items-start gap-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h4 className="text-2xl font-black text-white mb-3">Tropical Weather and Hurricane Decisions</h4>
                <p className="text-white/70 leading-relaxed text-base">
                  When a tropical system is developing or a hurricane is threatening, the decisions get serious fast. Do you stay tied up or move the vessel? If you move, when do you need to leave, and where should you go? James provides clear, direct answers based on the actual forecast data—not the headlines. This is the same level of decision support he provided for Royal Caribbean's fleet, now available to you directly.
                </p>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="text-center">
            <div className="inline-flex flex-col items-center gap-4">
              <Button
                size="lg"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white border-0 shadow-2xl text-lg px-12 py-6 h-auto rounded-2xl"
                onClick={() => navigate("/book-briefing")}
              >
                <Clock className="w-5 h-5 mr-3" />
                Book a 20-Minute Briefing
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 glass-dark">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 flex items-center justify-center rounded-xl overflow-hidden">
                <img
                  src="https://files.manuscdn.com/user_upload_by_module/session_file/110462184/vIcLAlFQYCjrGjIM.png"
                  alt="VanFleet Wx Logo"
                  className="w-14 h-14 object-contain rounded-xl"
                />
              </div>
              <div>
                <p className="text-white font-bold text-sm">VanFleet Wx</p>
                <p className="text-white/60 text-xs">Weather Intelligence by James Van Fleet</p>
              </div>
            </div>
            <p className="text-white/40 text-xs">
              © 2026 VanFleet Wx. Weather Intelligence by James Van Fleet.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
