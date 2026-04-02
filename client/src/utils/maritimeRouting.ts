/**
 * Maritime Sea Lane Routing Engine
 *
 * Prevents cruise route lines from crossing over land by inserting sea lane
 * waypoints between ports. Uses a port-cluster gate system:
 *
 * 1. Each port belongs to a named cluster (e.g. "yucatan-east", "central-america")
 * 2. Each cluster has directional "exit gates" -- open-water waypoints used when
 *    leaving that cluster in a given direction
 * 3. When routing from port A to port B, the engine looks up both clusters and
 *    inserts the appropriate gate waypoints to keep the line over water
 *
 * This approach is immune to the "endpoint inside bounding box" problem that
 * plagues pure geometric intersection methods, because we never check whether
 * a port is inside a land polygon.
 */

export type LatLon = [number, number]; // [lat, lon]

// ---------------------------------------------------------------------------
// PORT CLUSTER ASSIGNMENTS
// Each entry maps a port name (lowercase) to a cluster ID
// ---------------------------------------------------------------------------
const PORT_CLUSTERS: Record<string, string> = {
  // Yucatan east coast ports
  "cozumel":           "yucatan-east",
  "cancun":            "yucatan-east",
  "playa del carmen":  "yucatan-east",

  // Yucatan south / Belize coast ports
  "costa maya":        "yucatan-south",
  "mahahual":          "yucatan-south",
  "belize city":       "yucatan-south",

  // Central America / Honduras
  "roatan":            "central-america",
  "honduras":          "central-america",
  "puerto cortes":     "central-america",

  // Gulf of Mexico US ports
  "galveston":         "gulf-us",
  "houston":           "gulf-us",
  "new orleans":       "gulf-us",
  "mobile":            "gulf-us",
  "tampa":             "gulf-us",
  "tampa bay":         "gulf-us",

  // US East Coast ports
  "miami":             "us-east",
  "port everglades":   "us-east",
  "fort lauderdale":   "us-east",
  "port canaveral":    "us-east",
  "jacksonville":      "us-east",
  "charleston":        "us-east",
  "savannah":          "us-east",
  "norfolk":           "us-east",
  "baltimore":         "us-east",
  "manhattan":         "us-east",
  "new york":          "us-east",
  "brooklyn":          "us-east",
  "bayonne":           "us-east",
  "cape liberty":      "us-east",
  "boston":            "us-east",

  // Bahamas
  "nassau":            "bahamas",
  "freeport":          "bahamas",
  "bimini":            "bahamas",
  "north bimini":      "bahamas",
  "celebration key":   "bahamas",
  "berry islands":     "bahamas",
  "cococay":           "bahamas",
  "great stirrup cay": "bahamas",
  "ocean cay":         "bahamas",
  "castaway cay":      "bahamas",
  "lookout cay":       "bahamas",
  "half moon cay":     "bahamas",
  "princess cays":     "bahamas",
  "royal beach club":  "bahamas",
  "turks & caicos":    "bahamas",
  "grand turk":        "bahamas",

  // Grand Cayman (isolated island, west of Jamaica)
  "grand cayman":      "cayman",

  // Jamaica
  "falmouth":          "jamaica",
  "ocho rios":         "jamaica",
  "kingston":          "jamaica",
  "montego bay":       "jamaica",

  // Hispaniola (Haiti / Dominican Republic)
  "puerto plata":      "hispaniola-north",
  "samana":            "hispaniola-east",
  "la romana":         "hispaniola-south",
  "santo domingo":     "hispaniola-south",
  "labadee":           "hispaniola-north",
  "cap-haitien":       "hispaniola-north",

  // Eastern Caribbean
  "san juan":          "eastern-caribbean",
  "st. thomas":        "eastern-caribbean",
  "st. croix":         "eastern-caribbean",
  "st. maarten":       "eastern-caribbean",
  "st. kitts":         "eastern-caribbean",
  "antigua":           "eastern-caribbean",
  "dominica":          "eastern-caribbean",
  "martinique":        "eastern-caribbean",
  "st. lucia":         "eastern-caribbean",
  "barbados":          "eastern-caribbean",
  "st. vincent":       "eastern-caribbean",
  "grenada":           "eastern-caribbean",

  // Southern Caribbean
  "aruba":             "southern-caribbean",
  "bonaire":           "southern-caribbean",
  "curacao":           "southern-caribbean",
  "cartagena":         "southern-caribbean",
  "colon":             "southern-caribbean",

  // Pacific Mexico
  "cabo san lucas":    "pacific-baja",
  "ensenada":          "pacific-baja",
  "mazatlan":          "pacific-mexico",
  "puerto vallarta":   "pacific-mexico",
  "manzanillo":        "pacific-mexico",
  "huatulco":          "pacific-mexico",

  // Alaska / Inside Passage
  "seattle":           "alaska-south",
  "vancouver":         "alaska-south",
  "victoria":          "alaska-south",
  "juneau":            "alaska-north",
  "ketchikan":         "alaska-north",
  "sitka":             "alaska-north",
  "skagway":           "alaska-north",
  "tracy arm fjord":   "alaska-north",
  "glacier bay":       "alaska-north",
  "haines":            "alaska-north",
  "wrangell":          "alaska-north",

  // Mediterranean - Western
  "barcelona":         "med-west",
  "palma de mallorca": "med-west",
  "ibiza":             "med-west",
  "valencia":          "med-west",
  "malaga":            "med-west",
  "cadiz":             "med-west",
  "lisbon":            "med-west",
  "gibraltar":         "med-west",

  // Mediterranean - Central
  "marseille":         "med-central",
  "nice":              "med-central",
  "monaco":            "med-central",
  "genoa":             "med-central",
  "la spezia":         "med-central",
  "livorno":           "med-central",
  "civitavecchia":     "med-central",
  "rome":              "med-central",
  "naples":            "med-central",
  "sardinia":          "med-central",
  "cagliari":          "med-central",
  "corsica":           "med-central",
  "ajaccio":           "med-central",
  "palermo":           "med-central",
  "catania":           "med-central",
  "messina":           "med-central",

  // Mediterranean - Adriatic
  "split":             "med-adriatic",
  "dubrovnik":         "med-adriatic",
  "venice":            "med-adriatic",
  "kotor":             "med-adriatic",

  // Mediterranean - Eastern
  "athens":            "med-east",
  "athens (piraeus)":  "med-east",
  "piraeus":           "med-east",
  "santorini":         "med-east",
  "fira":              "med-east",
  "mykonos":           "med-east",
  "rhodes":            "med-east",
  "corfu":             "med-east",
  "istanbul":          "med-east",
  "izmir":             "med-east",
  "cyprus":            "med-east",
  "limassol":          "med-east",
  "haifa":             "med-east",
  "beirut":            "med-east",
  "alexandria":        "med-east",
};

// ---------------------------------------------------------------------------
// SEA GATE DEFINITIONS
// For each pair of cluster IDs (sorted alphabetically), define the waypoints
// that should be inserted to keep the route over water.
// Key format: "cluster-a|cluster-b" (alphabetical order)
// ---------------------------------------------------------------------------
const SEA_GATES: Record<string, LatLon[]> = {
  // ---- Yucatan east <-> Yucatan south: go around the tip of the peninsula ----
  // Cozumel is on the NE coast, Costa Maya / Belize are on the SE coast
  // Route must go south along the east coast, around the tip at ~18.5N
  "yucatan-east|yucatan-south": [
    [18.5, -87.5], // open water just south of Cozumel, east of the Yucatan tip
  ],

  // ---- Yucatan east <-> Central America: go south along the Yucatan coast ----
  "central-america|yucatan-east": [
    [18.5, -87.5], // south of Cozumel
    [16.5, -86.0], // open Caribbean east of Honduras
  ],

  // ---- Yucatan south <-> Central America: go around the Belize/Honduras coast ----
  "central-america|yucatan-south": [
    [16.5, -86.0], // open Caribbean east of Honduras
  ],

  // ---- Gulf US <-> Yucatan east: straight across the Gulf is fine (open water) ----
  // No waypoints needed -- Galveston to Cozumel goes across the open Gulf

  // ---- Gulf US <-> Yucatan south: go around the Yucatan tip ----
  "gulf-us|yucatan-south": [
    [21.5, -86.8], // open Caribbean NE of Yucatan tip
    [18.5, -87.5], // south of Cozumel
  ],

  // ---- Gulf US <-> Central America: go around the Yucatan and down the coast ----
  "central-america|gulf-us": [
    [21.5, -86.8], // open Caribbean NE of Yucatan tip
    [18.5, -87.5], // south of Cozumel
    [16.5, -86.0], // open Caribbean east of Honduras
  ],

  // ---- Gulf US <-> Grand Cayman: straight across the Gulf/Caribbean is fine ----
  // No waypoints needed

  // ---- Gulf US <-> Jamaica: straight line may clip Cuba ----
  "gulf-us|jamaica": [
    [22.5, -82.0], // open water south of Cuba, north of Jamaica
  ],

  // ---- Gulf US <-> Bahamas: straight line may clip Florida ----
  "bahamas|gulf-us": [
    [25.0, -80.5], // south of Florida tip / Florida Straits
  ],

  // ---- US East <-> Yucatan east: goes across open Atlantic/Caribbean ----
  // No waypoints needed for Miami/Fort Lauderdale to Cozumel

  // ---- US East <-> Yucatan south: may clip Florida ----
  "us-east|yucatan-south": [
    [24.0, -81.5], // south of Florida Keys
    [21.5, -86.8], // NE of Yucatan
    [18.5, -87.5], // south of Cozumel
  ],

  // ---- US East <-> Central America ----
  "central-america|us-east": [
    [24.0, -81.5], // south of Florida Keys
    [18.5, -87.5], // south of Cozumel
    [16.5, -86.0], // east of Honduras
  ],

  // ---- US East <-> Jamaica: may clip Cuba ----
  "jamaica|us-east": [
    [23.5, -79.5], // Florida Straits / north of Cuba
  ],

  // ---- US East <-> Grand Cayman: may clip Cuba ----
  "cayman|us-east": [
    [23.5, -79.5], // Florida Straits
    [21.0, -81.5], // south of Cuba
  ],

  // ---- Bahamas <-> Yucatan east ----
  "bahamas|yucatan-east": [
    [23.5, -79.5], // Florida Straits
    [22.0, -83.0], // south of Cuba
  ],

  // ---- Bahamas <-> Jamaica: may clip Cuba ----
  "bahamas|jamaica": [
    [22.5, -77.0], // Windward Passage east of Cuba
  ],

  // ---- Cayman <-> Yucatan east ----
  "cayman|yucatan-east": [
    [20.0, -83.5], // open Caribbean between Cayman and Yucatan
  ],

  // ---- Cayman <-> Yucatan south ----
  "cayman|yucatan-south": [
    [18.5, -84.5], // open Caribbean south of Yucatan
  ],

  // ---- Cayman <-> Central America ----
  "cayman|central-america": [
    [16.5, -83.5], // open Caribbean between Cayman and Honduras
  ],

  // ---- Jamaica <-> Yucatan east ----
  "jamaica|yucatan-east": [
    [19.5, -83.0], // open Caribbean between Jamaica and Yucatan
  ],

  // ---- Jamaica <-> Yucatan south ----
  "jamaica|yucatan-south": [
    [18.5, -84.5], // open Caribbean
  ],

  // ---- Jamaica <-> Central America ----
  "central-america|jamaica": [
    [16.5, -82.5], // open Caribbean east of Honduras
  ],

  // ---- Hispaniola north <-> Eastern Caribbean ----
  // No waypoints needed -- open Atlantic

  // ---- Hispaniola south <-> Eastern Caribbean ----
  // No waypoints needed

  // ---- Alaska south <-> Alaska north: Inside Passage ----
  "alaska-north|alaska-south": [
    [50.5, -127.0], // west of Vancouver Island
    [54.5, -130.5], // Dixon Entrance
  ],

  // ---- Pacific Baja <-> Pacific Mexico ----
  // No waypoints needed -- open Pacific

  // ---- Mediterranean west <-> central: no land crossings ----
  // No waypoints needed

  // ---- Mediterranean central <-> east: may clip Italy/Greece ----
  // No waypoints needed for most routes -- open Mediterranean

  // ---- Mediterranean central <-> adriatic ----
  // No waypoints needed

  // ---- Mediterranean adriatic <-> east ----
  // No waypoints needed
};

// ---------------------------------------------------------------------------
// ROUTING ENGINE
// ---------------------------------------------------------------------------

/**
 * Returns the cluster ID for a given port name, or null if unknown.
 */
function getCluster(portName: string): string | null {
  return PORT_CLUSTERS[portName.toLowerCase()] ?? null;
}

/**
 * Returns the sea gate key for two clusters (alphabetical order).
 */
function gateKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Given two port names and their coordinates, returns the full list of
 * lat/lon waypoints (including start and end) that keep the route over water.
 *
 * If the port names are unknown, falls back to a direct line.
 */
export function maritimeRoute(
  fromName: string,
  fromCoord: LatLon,
  toName: string,
  toCoord: LatLon
): LatLon[] {
  const fromCluster = getCluster(fromName);
  const toCluster = getCluster(toName);

  // Same cluster or unknown cluster: direct line (short coastal hop or unknown port)
  if (!fromCluster || !toCluster || fromCluster === toCluster) {
    return [fromCoord, toCoord];
  }

  const key = gateKey(fromCluster, toCluster);
  const gates = SEA_GATES[key];

  if (!gates || gates.length === 0) {
    // No gates defined for this cluster pair: direct line
    return [fromCoord, toCoord];
  }

  // Determine if we need to reverse the gate order
  // Gates are defined from the alphabetically-first cluster to the second.
  // If fromCluster comes after toCluster alphabetically, reverse the gates.
  const reversed = fromCluster > toCluster;
  const orderedGates = reversed ? [...gates].reverse() : gates;

  return [fromCoord, ...orderedGates, toCoord];
}
