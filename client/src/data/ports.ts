// ============================================================
// PORT MASTER LIST
// ============================================================
// HOW TO ADD A PORT:
//   Add one line: { name: "Port Name", lat: XX.XXXX, lon: XX.XXXX, region: "Region" }
//   That is ALL. Nothing else needs to change anywhere in the codebase.
//   Regions: "Caribbean" | "Bahamas" | "Mediterranean" | "Pacific" | "Alaska" | "US Homeport"
//
// ALIASES (optional):
//   aliases: ["alt name 1", "alt name 2", ...]
//   Use for marketing names, geographic names, island chain names, and common
//   alternate spellings. The autocomplete and resolvePort logic searches aliases
//   in addition to the primary name. The primary name is always what displays
//   in the forecast card header.
//
// ============================================================
// !! PERMANENT PROTECTION -- DO NOT REMOVE ANY PORT !!
// ============================================================
// Once a port has been approved and added to this list it MUST NEVER be removed.
// The GitHub Actions workflow (.github/workflows/port-guard.yml) enforces this
// automatically on every push: if any port in the APPROVED_PORTS list inside
// that workflow is missing from this file, the build will fail and the deploy
// will be blocked. Adding new ports is always welcome; removing them is not.
// ============================================================
//
// Last updated: 2026-04-02
// ============================================================

export type Port = { name: string; lat: number; lon: number; region: string; aliases?: string[] };

export const PORT_LIST: Port[] = [
  // ============================================================
  // !! APPROVED US HOMEPORTS -- PERMANENT -- DO NOT REMOVE !!
  // ============================================================
  // These ports have been explicitly approved by the Chief Meteorologist.
  // The port-guard GitHub Actions workflow verifies every one of these
  // is present on every push. Removing any entry will break the build.
  // ============================================================

  // ---- US East Coast Homeports ----
  { name: "Miami",                  lat: 25.7753, lon:  -80.1698, region: "US Homeport",
    aliases: ["Miami Cruise Terminal", "PortMiami", "Port of Miami"] },
  { name: "Port Everglades",        lat: 26.0833, lon:  -80.1167, region: "US Homeport",
    aliases: ["Fort Lauderdale", "Fort Lauderdale Port", "Port Everglades Fort Lauderdale"] },
  { name: "Port Canaveral",         lat: 28.4083, lon:  -80.6167, region: "US Homeport",
    aliases: ["Cape Canaveral", "Canaveral", "Port Canaveral Florida"] },
  { name: "Tampa Bay",              lat: 27.9333, lon:  -82.4500, region: "US Homeport",
    aliases: ["Tampa", "Tampa Florida", "Tampa Port"] },
  { name: "Jacksonville",           lat: 30.3322, lon:  -81.6557, region: "US Homeport",
    aliases: ["Jacksonville Florida", "JAXPORT", "Jacksonville Port"] },
  { name: "Charleston",             lat: 32.7765, lon:  -79.9311, region: "US Homeport",
    aliases: ["Charleston South Carolina", "Port of Charleston", "Charleston SC"] },
  { name: "Savannah",               lat: 32.0835, lon:  -81.0998, region: "US Homeport",
    aliases: ["Savannah Georgia", "Port of Savannah", "Savannah GA"] },
  { name: "Norfolk",                lat: 36.8468, lon:  -76.2951, region: "US Homeport",
    aliases: ["Norfolk Virginia", "Port of Virginia Norfolk", "Norfolk VA"] },
  { name: "Baltimore",              lat: 39.2904, lon:  -76.6122, region: "US Homeport",
    aliases: ["Baltimore Maryland", "Port of Baltimore", "Baltimore MD", "Cruise Maryland"] },
  { name: "Manhattan",              lat: 40.7680, lon:  -74.0020, region: "US Homeport",
    aliases: [
      "New York Cruise Terminal",   // official terminal name
      "Manhattan Cruise Terminal",
      "Pier 88",
      "Pier 90",
      "New York",
      "New York City",
      "NYC",
    ] },
  { name: "Brooklyn",               lat: 40.6782, lon:  -74.0060, region: "US Homeport",
    aliases: [
      "Brooklyn Cruise Terminal",   // official terminal name
      "Red Hook",                   // neighborhood where terminal is located
      "Red Hook Brooklyn",
      "Brooklyn Red Hook",
    ] },
  { name: "Bayonne",                lat: 40.6668, lon:  -74.1143, region: "US Homeport",
    aliases: [
      "Cape Liberty",               // official terminal name
      "Cape Liberty Cruise Port",
      "Cape Liberty Bayonne",
      "Bayonne New Jersey",
      "Bayonne NJ",
    ] },
  { name: "Boston",                 lat: 42.3601, lon:  -71.0589, region: "US Homeport",
    aliases: ["Boston Massachusetts", "Black Falcon Cruise Terminal", "Boston MA"] },

  // ---- US Gulf Coast Homeports ----
  { name: "New Orleans",            lat: 29.9511, lon:  -90.0715, region: "US Homeport",
    aliases: ["New Orleans Louisiana", "Port of New Orleans", "NOLA", "Julia Street Wharf"] },
  { name: "Galveston",              lat: 29.3013, lon:  -94.7977, region: "US Homeport",
    aliases: ["Galveston Texas", "Port of Galveston", "Galveston TX"] },
  { name: "Houston",                lat: 29.7355, lon:  -95.0089, region: "US Homeport",
    aliases: ["Houston Texas", "Bayport Cruise Terminal", "Houston Bayport", "Houston TX"] },

  // ---- US West Coast Homeports ----
  { name: "Los Angeles",            lat: 33.7361, lon: -118.2922, region: "US Homeport",
    aliases: [
      "San Pedro",                  // neighborhood where World Cruise Center is located
      "World Cruise Center",
      "Port of Los Angeles",
      "LA Cruise Terminal",
      "Los Angeles California",
      "LA",
    ] },
  { name: "Long Beach",             lat: 33.7701, lon: -118.1937, region: "US Homeport",
    aliases: ["Long Beach California", "Port of Long Beach", "Long Beach CA"] },
  { name: "San Diego",              lat: 32.7157, lon: -117.1611, region: "US Homeport",
    aliases: ["San Diego California", "B Street Pier", "San Diego Cruise Terminal", "San Diego CA"] },
  { name: "San Francisco",          lat: 37.8044, lon: -122.4079, region: "US Homeport",
    aliases: ["San Francisco California", "Pier 27", "San Francisco Cruise Terminal", "SF"] },

  // ---- Caribbean ----
  { name: "Key West",               lat: 24.5551, lon:  -81.7800, region: "Caribbean" },

  // ---- Bahamas ----
  // Nassau / Prince George Wharf -- also resolves for New Providence island
  { name: "Nassau",                 lat: 25.0780, lon:  -77.3390, region: "Bahamas",
    aliases: ["New Providence", "Nassau Bahamas", "Nassau New Providence"] },

  // Bermuda -- Hamilton (capital) and Royal Naval Dockyard (main cruise terminal)
  { name: "Bermuda -- Hamilton",     lat: 32.2948, lon:  -64.7839, region: "Bermuda",
    aliases: ["Hamilton Bermuda", "Hamilton", "Bermuda Hamilton", "Bermuda capital"] },

  { name: "Bermuda -- Royal Naval Dockyard", lat: 32.3167, lon: -64.8333, region: "Bermuda",
    aliases: ["Royal Naval Dockyard", "Dockyard Bermuda", "Bermuda Dockyard", "King's Wharf", "Kings Wharf Bermuda"] },

  // Bimini -- North Bimini is Virgin Voyages' The Beach Club
  { name: "Bimini",                 lat: 25.7200, lon:  -79.2900, region: "Bahamas",
    aliases: ["Bimini Islands", "Bimini Bahamas"] },

  // North Bimini -- Virgin Voyages' The Beach Club
  { name: "North Bimini",          lat: 25.7333, lon:  -79.2833, region: "Bahamas",
    aliases: [
      "The Beach Club",             // Virgin Voyages marketing name
      "Beach Club Bimini",
      "Virgin Voyages Beach Club",
      "Virgin Beach Club",
    ] },

  // Freeport / Grand Bahama
  { name: "Freeport",               lat: 26.5300, lon:  -78.7000, region: "Bahamas",
    aliases: ["Grand Bahama", "Freeport Grand Bahama", "Freeport Bahamas"] },

  // Celebration Key -- Carnival's private destination on Grand Bahama's west end
  { name: "Celebration Key",        lat: 26.6667, lon:  -78.9833, region: "Bahamas",
    aliases: [
      "Sharp Rock",                 // Bahamian geographic name
      "Sharp Rock Grand Bahama",
      "Carnival Celebration Key",
      "Grand Bahama West End",
      "West End Grand Bahama",
    ] },

  // Berry Islands -- group forecast; individual private islands listed below
  { name: "Berry Islands",          lat: 25.6500, lon:  -77.8200, region: "Bahamas",
    aliases: ["Berry Islands Bahamas"] },

  // CocoCay / Little Stirrup Cay -- Royal Caribbean's Perfect Day at CocoCay
  { name: "CocoCay",                lat: 25.8219, lon:  -77.6817, region: "Bahamas",
    aliases: [
      "Perfect Day at CocoCay",     // Royal Caribbean marketing name
      "Perfect Day CocoCay",
      "Coco Cay",                   // common spacing variant
      "Little Stirrup Cay",         // Bahamian/geographic name
      "Little Stirrup",
      "Royal Caribbean CocoCay",
      "Berry Islands CocoCay",
    ] },

  // Great Stirrup Cay -- Norwegian Cruise Line's private island
  { name: "Great Stirrup Cay",      lat: 25.8333, lon:  -77.9000, region: "Bahamas",
    aliases: [
      "NCL Great Stirrup Cay",
      "Norwegian Great Stirrup Cay",
      "Great Stirrup",
      "Berry Islands NCL",
    ] },

  // Ocean Cay -- MSC Cruises' private island, former sand mine in Bimini District
  { name: "Ocean Cay",              lat: 25.3833, lon:  -79.0833, region: "Bahamas",
    aliases: [
      "MSC Ocean Cay",              // MSC Cruises marketing name
      "Ocean Cay MSC Marine Reserve",
      "Ocean Cay Marine Reserve",
      "Bimini District Ocean Cay",
      "Ocean Cay Bimini",
    ] },

  // Castaway Cay -- Disney Cruise Line's private island (Gorda Cay, Abaco Islands)
  { name: "Castaway Cay",           lat: 26.0667, lon:  -77.5500, region: "Bahamas",
    aliases: [
      "Disney Castaway Cay",        // Disney marketing name
      "Gorda Cay",                  // Bahamian/geographic name
      "Abaco Islands Disney",
      "Abaco Cay",
      "Disney Private Island",
    ] },

  // Lookout Cay -- Disney's second private destination (Lighthouse Point, Eleuthera)
  { name: "Lookout Cay",            lat: 24.8333, lon:  -76.3333, region: "Bahamas",
    aliases: [
      "Disney Lookout Cay",         // Disney marketing name
      "Lookout Cay at Lighthouse Point",
      "Lighthouse Point",           // Bahamian/geographic name
      "Lighthouse Point Eleuthera",
      "Eleuthera Disney",
    ] },

  // Half Moon Cay -- Carnival / Holland America's private island (Little San Salvador)
  { name: "Half Moon Cay",          lat: 24.5667, lon:  -75.9667, region: "Bahamas",
    aliases: [
      "Carnival Half Moon Cay",     // Carnival marketing name
      "Holland America Half Moon Cay",
      "HAL Half Moon Cay",
      "Little San Salvador",        // Bahamian/geographic name
      "Little San Salvador Island",
      "Cat Island District",
      "Half Moon Cay Bahamas",
    ] },

  // Princess Cays -- Princess Cruises' private destination (Bannerman Town, Eleuthera)
  { name: "Princess Cays",          lat: 24.6333, lon:  -76.1167, region: "Bahamas",
    aliases: [
      "Princess Cruises Cays",      // Princess marketing name
      "Bannerman Town",             // Bahamian/geographic name
      "Bannerman Town Eleuthera",
      "Eleuthera Princess",
      "Princess Cays Eleuthera",
    ] },

  // Royal Beach Club -- Royal Caribbean's Nassau/Paradise Island destination
  { name: "Royal Beach Club",       lat: 25.0833, lon:  -77.3167, region: "Bahamas",
    aliases: [
      "Royal Beach Club Paradise Island",  // Royal Caribbean marketing name
      "Royal Caribbean Beach Club",
      "Paradise Island",            // geographic name
      "Paradise Island Nassau",
      "Nassau Paradise Island",
    ] },

  // Turks & Caicos
  { name: "Turks & Caicos",         lat: 21.4670, lon:  -71.1390, region: "Bahamas",
    aliases: ["Turks and Caicos", "Turks Caicos", "TCI"] },
  { name: "Grand Turk",             lat: 21.4670, lon:  -71.1390, region: "Bahamas",
    aliases: ["Grand Turk Turks and Caicos"] },

  // ---- Western Caribbean ----
  { name: "Cozumel",                lat: 20.5088, lon:  -86.9468, region: "Caribbean" },
  { name: "Costa Maya",             lat: 18.7200, lon:  -87.7100, region: "Caribbean" },
  { name: "Mahahual",               lat: 18.7200, lon:  -87.7100, region: "Caribbean" },
  { name: "Belize City",            lat: 17.2500, lon:  -88.7700, region: "Caribbean" },
  { name: "Roatan",                 lat: 16.3200, lon:  -86.5500, region: "Caribbean" },
  { name: "Grand Cayman",           lat: 19.2869, lon:  -81.3674, region: "Caribbean" },
  { name: "Falmouth",               lat: 18.4900, lon:  -77.6600, region: "Caribbean" },
  { name: "Ocho Rios",              lat: 18.4100, lon:  -77.1000, region: "Caribbean" },

  // ---- Dominican Republic (Hispaniola) ----
  // Puerto Plata -- north coast DR; Amber Cove (Carnival) and Taino Bay (MSC/Royal) are both cruise piers here
  { name: "Puerto Plata",           lat: 19.7967, lon:  -70.6833, region: "Caribbean",
    aliases: [
      "Amber Cove",                 // Carnival cruise pier marketing name
      "Taino Bay",                  // MSC / Royal Caribbean cruise pier marketing name
      "Amber Cove Puerto Plata",
      "Taino Bay Puerto Plata",
      "Puerto Plata Dominican Republic",
      "Puerto Plata DR",
    ] },
  { name: "Saman\u00e1",                 lat: 19.2061, lon:  -69.3363, region: "Caribbean",
    aliases: [
      "Samana",
      "Santa Barbara de Samana",
      "Saman\u00e1 Bay",
      "Samana Bay",
      "Samana Dominican Republic",
      "Samana DR",
    ] },
  { name: "La Romana",              lat: 18.4274, lon:  -68.9726, region: "Caribbean",
    aliases: [
      "La Romana Dominican Republic",
      "La Romana DR",
      "Casa de Campo",              // upscale resort area adjacent to La Romana port
    ] },
  { name: "Santo Domingo",          lat: 18.4861, lon:  -69.9312, region: "Caribbean",
    aliases: [
      "Santo Domingo Dominican Republic",
      "Santo Domingo DR",
      "Ciudad Colonial",
      "Sans Souci Port",
    ] },

  // ---- Eastern Caribbean ----
  { name: "San Juan",               lat: 18.4655, lon:  -66.1057, region: "Caribbean" },
  { name: "St. Thomas",             lat: 18.3430, lon:  -64.9307, region: "Caribbean",
    aliases: ["Saint Thomas", "St Thomas", "St Thomas USVI", "Charlotte Amalie"] },
  { name: "St. Croix",              lat: 17.7300, lon:  -64.7300, region: "Caribbean",
    aliases: ["Saint Croix", "St Croix", "St Croix USVI"] },
  // St. Maarten / St. Martin -- both Dutch and French spellings accepted
  { name: "St. Maarten",            lat: 18.0300, lon:  -63.0500, region: "Caribbean",
    aliases: [
      "Saint Maarten",
      "St Maarten",
      "St. Martin",                 // French side spelling -- same island, same forecast
      "Saint Martin",
      "St Martin",
      "Sint Maarten",
    ] },
  { name: "St. Kitts",              lat: 17.3000, lon:  -62.7200, region: "Caribbean",
    aliases: ["Saint Kitts", "St Kitts", "St Kitts and Nevis", "Saint Kitts and Nevis"] },
  { name: "Antigua",                lat: 17.1274, lon:  -61.8468, region: "Caribbean" },
  { name: "Dominica",               lat: 15.3000, lon:  -61.3800, region: "Caribbean" },
  { name: "Martinique",             lat: 14.6160, lon:  -61.0590, region: "Caribbean" },
  { name: "St. Lucia",              lat: 13.9094, lon:  -60.9789, region: "Caribbean",
    aliases: ["Saint Lucia", "St Lucia"] },
  { name: "Barbados",               lat: 13.1000, lon:  -59.6200, region: "Caribbean",
    aliases: ["Bridgetown", "Bridgetown Barbados"] },
  { name: "St. Vincent",            lat: 13.1600, lon:  -61.2300, region: "Caribbean",
    aliases: ["Saint Vincent", "St Vincent", "St Vincent and the Grenadines", "Saint Vincent and the Grenadines"] },
  { name: "Grenada",                lat: 12.0560, lon:  -61.7488, region: "Caribbean" },

  // ---- Southern Caribbean -- ABC islands and Colombia ----
  { name: "Aruba",                  lat: 12.5200, lon:  -70.0300, region: "Caribbean" },
  { name: "Bonaire",                lat: 12.2000, lon:  -68.2700, region: "Caribbean" },
  { name: "Cartagena",              lat: 10.3900, lon:  -75.4800, region: "Caribbean" },
  { name: "Curacao",                lat: 12.1100, lon:  -68.9300, region: "Caribbean",
    aliases: ["Curaçao", "Willemstad", "Willemstad Curacao"] },

  // ---- Eastern Pacific ----
  { name: "Ensenada",               lat: 31.8700, lon: -116.6000, region: "Pacific" },
  { name: "Cabo San Lucas",         lat: 22.8900, lon: -109.9100, region: "Pacific",
    aliases: ["Cabo", "Los Cabos", "Cabo Mexico"] },
  { name: "Mazatlan",               lat: 23.2400, lon: -106.4100, region: "Pacific",
    aliases: ["Mazatlán"] },
  { name: "Puerto Vallarta",        lat: 20.6500, lon: -105.2200, region: "Pacific",
    aliases: ["PV", "Puerto Vallarta Mexico"] },
  { name: "Manzanillo",             lat: 19.0500, lon: -104.3200, region: "Pacific" },
  { name: "Huatulco",               lat: 15.7400, lon:  -96.1300, region: "Pacific",
    aliases: ["Bahias de Huatulco"] },

  // ---- Alaska ----
  { name: "Seattle",                lat: 47.6062, lon: -122.3321, region: "Alaska" },
  { name: "Juneau",                 lat: 58.3005, lon: -134.4197, region: "Alaska" },
  { name: "Ketchikan",              lat: 55.3422, lon: -131.6461, region: "Alaska" },
  { name: "Sitka",                  lat: 57.0531, lon: -135.3300, region: "Alaska" },
  { name: "Skagway",                lat: 59.4583, lon: -135.3139, region: "Alaska" },
  { name: "Haines",                 lat: 59.2358, lon: -135.4452, region: "Alaska" },
  // Tracy Arm Fjord -- scenic cruising area, no dock; coords are the fjord entrance
  { name: "Tracy Arm Fjord",        lat: 57.8500, lon: -133.6500, region: "Alaska" },
  { name: "Vancouver",              lat: 49.2827, lon: -123.1207, region: "Alaska" },
  { name: "Victoria",               lat: 48.4284, lon: -123.3656, region: "Alaska" },

  // ---- Western Mediterranean ----
  { name: "Barcelona",              lat: 41.3500, lon:    2.1700, region: "Mediterranean" },
  { name: "Palma de Mallorca",      lat: 39.5700, lon:    2.6500, region: "Mediterranean",
    aliases: ["Palma", "Mallorca", "Majorca"] },
  { name: "Ibiza",                  lat: 38.9100, lon:    1.4300, region: "Mediterranean",
    aliases: ["Eivissa"] },
  { name: "Valencia",               lat: 39.4700, lon:   -0.3700, region: "Mediterranean" },
  { name: "Malaga",                 lat: 36.7200, lon:   -4.4200, region: "Mediterranean",
    aliases: ["Málaga"] },
  { name: "Cadiz",                  lat: 36.5300, lon:   -6.3000, region: "Mediterranean",
    aliases: ["Cádiz"] },
  { name: "Lisbon",                 lat: 38.7200, lon:   -9.1400, region: "Mediterranean",
    aliases: ["Lisboa"] },
  { name: "Marseille",              lat: 43.3000, lon:    5.3700, region: "Mediterranean" },
  { name: "Nice",                   lat: 43.7000, lon:    7.2700, region: "Mediterranean" },
  { name: "Monaco",                 lat: 43.7300, lon:    7.4200, region: "Mediterranean",
    aliases: ["Monte Carlo"] },
  { name: "Genoa",                  lat: 44.4100, lon:    8.9300, region: "Mediterranean",
    aliases: ["Genova"] },
  { name: "La Spezia",              lat: 44.1000, lon:    9.8200, region: "Mediterranean" },
  { name: "Livorno",                lat: 43.5500, lon:   10.3100, region: "Mediterranean",
    aliases: ["Leghorn"] },
  // Civitavecchia -- port for Rome
  { name: "Civitavecchia",          lat: 42.0900, lon:   11.8000, region: "Mediterranean",
    aliases: ["Rome Port", "Port of Rome"] },
  { name: "Rome",                   lat: 42.0900, lon:   11.8000, region: "Mediterranean",
    aliases: ["Roma"] },
  { name: "Naples",                 lat: 40.8500, lon:   14.2700, region: "Mediterranean",
    aliases: ["Napoli"] },
  // Sardinia -- main cruise port is Cagliari
  { name: "Sardinia",               lat: 39.2238, lon:    9.1217, region: "Mediterranean" },
  { name: "Cagliari",               lat: 39.2238, lon:    9.1217, region: "Mediterranean" },
  // Corsica -- main cruise port is Ajaccio
  { name: "Corsica",                lat: 41.9194, lon:    8.7386, region: "Mediterranean" },
  { name: "Ajaccio",                lat: 41.9194, lon:    8.7386, region: "Mediterranean" },
  { name: "Split",                  lat: 43.5100, lon:   16.4400, region: "Mediterranean" },
  { name: "Dubrovnik",              lat: 42.6500, lon:   18.0900, region: "Mediterranean" },
  { name: "Venice",                 lat: 45.4400, lon:   12.3300, region: "Mediterranean",
    aliases: ["Venezia"] },

  // ---- Eastern Mediterranean ----
  // Athens -- cruise port is Piraeus; both names resolve to same coords
  { name: "Athens",                 lat: 37.9475, lon:   23.6430, region: "Mediterranean" },
  { name: "Athens (Piraeus)",       lat: 37.9475, lon:   23.6430, region: "Mediterranean" },
  { name: "Piraeus",                lat: 37.9475, lon:   23.6430, region: "Mediterranean" },
  // Santorini -- port is Athinios / Fira
  { name: "Santorini",              lat: 36.3932, lon:   25.4615, region: "Mediterranean",
    aliases: ["Thira", "Thera"] },
  { name: "Fira",                   lat: 36.3932, lon:   25.4615, region: "Mediterranean" },
  { name: "Mykonos",                lat: 37.4500, lon:   25.3300, region: "Mediterranean" },
  { name: "Rhodes",                 lat: 36.4300, lon:   28.2200, region: "Mediterranean" },
  { name: "Corfu",                  lat: 39.6200, lon:   19.9200, region: "Mediterranean",
    aliases: ["Kerkyra"] },
  { name: "Istanbul",               lat: 41.0100, lon:   28.9800, region: "Mediterranean",
    aliases: ["Constantinople"] },
  { name: "Izmir",                  lat: 38.4200, lon:   27.1400, region: "Mediterranean",
    aliases: ["Smyrna"] },
  // Cyprus -- main cruise port is Limassol
  { name: "Cyprus",                 lat: 34.6786, lon:   33.0413, region: "Mediterranean" },
  { name: "Limassol",               lat: 34.6786, lon:   33.0413, region: "Mediterranean",
    aliases: ["Lemesos"] },
  { name: "Haifa",                  lat: 32.8200, lon:   34.9900, region: "Mediterranean" },
  { name: "Beirut",                 lat: 33.8938, lon:   35.5018, region: "Mediterranean" },
  { name: "Alexandria",             lat: 31.2000, lon:   29.9200, region: "Mediterranean" },
];
