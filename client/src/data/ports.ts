// ============================================================
// PORT MASTER LIST
// ============================================================
// HOW TO ADD A PORT:
//   Add one line: { name: "Port Name", lat: XX.XXXX, lon: XX.XXXX, region: "Region" }
//   That is ALL. Nothing else needs to change anywhere in the codebase.
//   Regions: "Caribbean" | "Bahamas" | "Mediterranean" | "Pacific" | "Alaska"
// Last updated: 2026-03-29
// ============================================================

export type Port = { name: string; lat: number; lon: number; region: string };

export const PORT_LIST: Port[] = [
  // ---- Caribbean ----
  { name: "Miami",                  lat: 25.7753, lon:  -80.1698, region: "Caribbean" },
  { name: "Key West",               lat: 24.5551, lon:  -81.7800, region: "Caribbean" },
  // Nassau / Prince George Wharf
  { name: "Nassau",                 lat: 25.0780, lon:  -77.3390, region: "Bahamas" },
  { name: "Bimini",                 lat: 25.7200, lon:  -79.2900, region: "Bahamas" },
  { name: "Freeport",               lat: 26.5300, lon:  -78.7000, region: "Bahamas" },
  // Berry Islands -- Cruise Lines' Private Islands (CocoCay, etc.)
  { name: "Berry Islands",          lat: 25.6500, lon:  -77.8200, region: "Bahamas" },
  { name: "CocoCay",                lat: 25.8200, lon:  -77.6800, region: "Bahamas" },
  // Turks & Caicos
  { name: "Turks & Caicos",         lat: 21.4670, lon:  -71.1390, region: "Bahamas" },
  { name: "Grand Turk",             lat: 21.4670, lon:  -71.1390, region: "Bahamas" },
  // Western Caribbean
  { name: "Cozumel",                lat: 20.5088, lon:  -86.9468, region: "Caribbean" },
  { name: "Costa Maya",             lat: 18.7200, lon:  -87.7100, region: "Caribbean" },
  { name: "Mahahual",               lat: 18.7200, lon:  -87.7100, region: "Caribbean" },
  { name: "Belize City",            lat: 17.2500, lon:  -88.7700, region: "Caribbean" },
  { name: "Roatan",                 lat: 16.3200, lon:  -86.5500, region: "Caribbean" },
  { name: "Grand Cayman",           lat: 19.2869, lon:  -81.3674, region: "Caribbean" },
  { name: "Falmouth",               lat: 18.4900, lon:  -77.6600, region: "Caribbean" },
  { name: "Ocho Rios",              lat: 18.4100, lon:  -77.1000, region: "Caribbean" },
  // Eastern Caribbean
  { name: "San Juan",               lat: 18.4655, lon:  -66.1057, region: "Caribbean" },
  { name: "St. Thomas",             lat: 18.3430, lon:  -64.9307, region: "Caribbean" },
  { name: "St. Croix",              lat: 17.7300, lon:  -64.7300, region: "Caribbean" },
  { name: "St. Maarten",            lat: 18.0300, lon:  -63.0500, region: "Caribbean" },
  { name: "St. Kitts",              lat: 17.3000, lon:  -62.7200, region: "Caribbean" },
  { name: "Antigua",                lat: 17.1274, lon:  -61.8468, region: "Caribbean" },
  { name: "Dominica",               lat: 15.3000, lon:  -61.3800, region: "Caribbean" },
  { name: "Martinique",             lat: 14.6160, lon:  -61.0590, region: "Caribbean" },
  { name: "St. Lucia",              lat: 13.9094, lon:  -60.9789, region: "Caribbean" },
  { name: "Barbados",               lat: 13.1000, lon:  -59.6200, region: "Caribbean" },
  { name: "St. Vincent",            lat: 13.1600, lon:  -61.2300, region: "Caribbean" },
  { name: "Grenada",                lat: 12.0560, lon:  -61.7488, region: "Caribbean" },
  // Southern Caribbean -- ABC islands and Colombia
  { name: "Aruba",                  lat: 12.5200, lon:  -70.0300, region: "Caribbean" },
  { name: "Bonaire",                lat: 12.2000, lon:  -68.2700, region: "Caribbean" },
  { name: "Cartagena",              lat: 10.3900, lon:  -75.4800, region: "Caribbean" },
  { name: "Curacao",                lat: 12.1100, lon:  -68.9300, region: "Caribbean" },
  // ---- Eastern Pacific ----
  { name: "Ensenada",               lat: 31.8700, lon: -116.6000, region: "Pacific" },
  { name: "Cabo San Lucas",         lat: 22.8900, lon: -109.9100, region: "Pacific" },
  { name: "Mazatlan",               lat: 23.2400, lon: -106.4100, region: "Pacific" },
  { name: "Puerto Vallarta",        lat: 20.6500, lon: -105.2200, region: "Pacific" },
  { name: "Manzanillo",             lat: 19.0500, lon: -104.3200, region: "Pacific" },
  { name: "Huatulco",               lat: 15.7400, lon:  -96.1300, region: "Pacific" },
  // ---- Alaska ----
  { name: "Seattle",                lat: 47.6062, lon: -122.3321, region: "Alaska" },
  { name: "Juneau",                 lat: 58.3005, lon: -134.4197, region: "Alaska" },
  { name: "Ketchikan",              lat: 55.3422, lon: -131.6461, region: "Alaska" },
  { name: "Sitka",                  lat: 57.0531, lon: -135.3300, region: "Alaska" },
  { name: "Skagway",                lat: 59.4583, lon: -135.3139, region: "Alaska" },
  // Tracy Arm Fjord -- scenic cruising area, no dock; coords are the fjord entrance
  { name: "Tracy Arm Fjord",        lat: 57.8500, lon: -133.6500, region: "Alaska" },
  // ---- Western Mediterranean ----
  { name: "Barcelona",              lat: 41.3500, lon:    2.1700, region: "Mediterranean" },
  { name: "Palma de Mallorca",      lat: 39.5700, lon:    2.6500, region: "Mediterranean" },
  { name: "Ibiza",                  lat: 38.9100, lon:    1.4300, region: "Mediterranean" },
  { name: "Valencia",               lat: 39.4700, lon:   -0.3700, region: "Mediterranean" },
  { name: "Malaga",                 lat: 36.7200, lon:   -4.4200, region: "Mediterranean" },
  { name: "Cadiz",                  lat: 36.5300, lon:   -6.3000, region: "Mediterranean" },
  { name: "Lisbon",                 lat: 38.7200, lon:   -9.1400, region: "Mediterranean" },
  { name: "Marseille",              lat: 43.3000, lon:    5.3700, region: "Mediterranean" },
  { name: "Nice",                   lat: 43.7000, lon:    7.2700, region: "Mediterranean" },
  { name: "Monaco",                 lat: 43.7300, lon:    7.4200, region: "Mediterranean" },
  { name: "Genoa",                  lat: 44.4100, lon:    8.9300, region: "Mediterranean" },
  { name: "La Spezia",              lat: 44.1000, lon:    9.8200, region: "Mediterranean" },
  { name: "Livorno",                lat: 43.5500, lon:   10.3100, region: "Mediterranean" },
  // Civitavecchia -- port for Rome
  { name: "Civitavecchia",          lat: 42.0900, lon:   11.8000, region: "Mediterranean" },
  { name: "Rome",                   lat: 42.0900, lon:   11.8000, region: "Mediterranean" },
  { name: "Naples",                 lat: 40.8500, lon:   14.2700, region: "Mediterranean" },
  // Sardinia -- main cruise port is Cagliari
  { name: "Sardinia",               lat: 39.2238, lon:    9.1217, region: "Mediterranean" },
  { name: "Cagliari",               lat: 39.2238, lon:    9.1217, region: "Mediterranean" },
  // Corsica -- main cruise port is Ajaccio
  { name: "Corsica",                lat: 41.9194, lon:    8.7386, region: "Mediterranean" },
  { name: "Ajaccio",                lat: 41.9194, lon:    8.7386, region: "Mediterranean" },
  { name: "Split",                  lat: 43.5100, lon:   16.4400, region: "Mediterranean" },
  { name: "Dubrovnik",              lat: 42.6500, lon:   18.0900, region: "Mediterranean" },
  { name: "Venice",                 lat: 45.4400, lon:   12.3300, region: "Mediterranean" },
  // ---- Eastern Mediterranean ----
  // Athens -- cruise port is Piraeus; both names resolve to same coords
  { name: "Athens",                 lat: 37.9475, lon:   23.6430, region: "Mediterranean" },
  { name: "Athens (Piraeus)",       lat: 37.9475, lon:   23.6430, region: "Mediterranean" },
  { name: "Piraeus",                lat: 37.9475, lon:   23.6430, region: "Mediterranean" },
  // Santorini -- port is Athinios / Fira
  { name: "Santorini",              lat: 36.3932, lon:   25.4615, region: "Mediterranean" },
  { name: "Fira",                   lat: 36.3932, lon:   25.4615, region: "Mediterranean" },
  { name: "Mykonos",                lat: 37.4500, lon:   25.3300, region: "Mediterranean" },
  { name: "Rhodes",                 lat: 36.4300, lon:   28.2200, region: "Mediterranean" },
  { name: "Corfu",                  lat: 39.6200, lon:   19.9200, region: "Mediterranean" },
  { name: "Istanbul",               lat: 41.0100, lon:   28.9800, region: "Mediterranean" },
  { name: "Izmir",                  lat: 38.4200, lon:   27.1400, region: "Mediterranean" },
  // Cyprus -- main cruise port is Limassol
  { name: "Cyprus",                 lat: 34.6786, lon:   33.0413, region: "Mediterranean" },
  { name: "Limassol",               lat: 34.6786, lon:   33.0413, region: "Mediterranean" },
  { name: "Haifa",                  lat: 32.8200, lon:   34.9900, region: "Mediterranean" },
  { name: "Beirut",                 lat: 33.8938, lon:   35.5018, region: "Mediterranean" },
  { name: "Alexandria",             lat: 31.2000, lon:   29.9200, region: "Mediterranean" },
];
