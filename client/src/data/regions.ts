export interface Port {
  name: string;
  lat: number;
  lon: number;
  sublabel?: string;
}

export interface Region {
  slug: string;
  name: string;
  image: string;
  gradient: string;
  ports: Port[];
  intel: string;
}

export const REGIONS: Region[] = [
  {
    slug: "eastern-caribbean",
    name: "Eastern Caribbean",
    intel: "ENE trade winds 15-20 kt with 3-5 ft seas across the eastern chain. San Juan and St. Thomas seeing typical trade wind conditions with good visibility. St. Maarten and Antigua well-positioned for leeward anchorages on the western sides. Turks and Caicos exposed to open Atlantic swell on the north shore; Providenciales south coast calm. Afternoon convective showers possible on the larger islands — plan port arrivals for morning hours.",
    image: "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-4_1771041481000_na1fn_dHJvcGljYWwtYmVhY2gtd2VhdGhlcg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTRfMTc3MTA0MTQ4MTAwMF9uYTFmbl9kSEp2Y0dsallXd3RZbVZoWTJndGQyVmhkR2hsY2cucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=gc3iC93INNkqrzR5EnGIKflyv9FZdTH2fcgfdAbMjhXxoCZjknQ5xd9PeoZfZIuPgpkgSKejVD--ZpA7V17td1MzXUUjYzjxXZntB4pNkCjJYyWtpcW1PhtJoRFqVtUCsUAyhpxkxIbNWc8pWg2Lb7hCro~xzqd7PmRe2J2nO21MUlSzZmuIG1ogNLRm7UeSmtlxqvuQozC~DnA8ux49xns-BKzSBXIfPHW6FZKDKdqcQSP2nYkS9FZCLwtX2dyf~cwa78K5P0KYg3twSHu5t9UQGasE4Brn8NEIVTsP2ECZxrNdoc7urtkzPyCZlM3ZfeeOoA9iZ6bI5mvbgSD3bA__",
    gradient: "from-emerald-500/20 to-cyan-500/20",
    ports: [
      { name: "San Juan", lat: 18.47, lon: -66.12 },
      { name: "St. Thomas", lat: 18.34, lon: -64.93 },
      { name: "St. Croix", lat: 17.73, lon: -64.73 },
      { name: "St. Maarten", lat: 18.07, lon: -63.07 },
      { name: "St. Kitts", lat: 17.30, lon: -62.72 },
      { name: "Antigua", lat: 17.12, lon: -61.85 },
      { name: "Turks & Caicos", lat: 21.46, lon: -71.14 },
    ],
  },
  {
    slug: "western-caribbean",
    name: "Western Caribbean",
    intel: "Light to moderate E-SE winds 10-15 kt across the western Caribbean with seas 2-4 ft. Cozumel and Costa Maya seeing calm conditions on the leeward western shores. Roatan and the Bay Islands benefiting from the Honduran mountains blocking the prevailing trades. Grand Cayman flat and calm on the western side. Jamaica's north coast ports — Ocho Rios and Falmouth — occasionally see northerly swell wrap around the island during winter cold front passages.",
    image: "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-2_1771041480000_na1fn_Y2FyaWJiZWFuLWNydWlzZS1zdW5zZXQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTJfMTc3MTA0MTQ4MDAwMF9uYTFmbl9ZMkZ5YVdKaVpXRnVMV055ZFdselpTMXpkVzV6WlhRLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=q7HRCQyQ~-w~C5w33nY2ql2sG3uXJCzYOhBWvxdtDbze05vqRtYbS1MyRLwFD-TcVNJiFFpZJHcV2VwV~1q2R3cALqcMsvdGRwHnu21~weD8Sbi-uWiSdqPpU9WlWn2TKGKSeggtUFRQyfGACZXSWEN8fFARTbR6zzad3L~CHbe4XhsMPFnsc3p-wyMqi~d0BXyI285CVEa7MEblcdb65PW9fdjkfHT~qRlFn6r07oCoZ0-QNyv5bieV7Uc3tjnaZPINOxgUEUae~nkcYOMaSW3rbEpaeOPirXqd8MTpAakVSef6F4V~VkghbCiPu~VmHDnSaWoQ6uLrTOXc4UCehA__",
    gradient: "from-orange-500/20 to-pink-500/20",
    ports: [
      { name: "Cozumel", lat: 20.51, lon: -86.95 },
      { name: "Costa Maya", lat: 18.73, lon: -87.71, sublabel: "Mahahual" },
      { name: "Roatan", lat: 16.32, lon: -86.53 },
      { name: "Belize City", lat: 17.25, lon: -88.77 },
      { name: "Grand Cayman", lat: 19.29, lon: -81.38 },
      { name: "Ocho Rios", lat: 18.41, lon: -77.10 },
      { name: "Falmouth", lat: 18.49, lon: -77.66 },
    ],
  },
  {
    slug: "bahamas",
    name: "Bahamas",
    intel: "Nassau and Freeport conditions depend heavily on the current synoptic pattern. Western Bahamas anchorages well-protected from the prevailing E-SE trades. Bimini and the Berry Islands offer excellent protected waters on their western sides. Atlantic-facing eastern shores can see 4-6 ft swells during active trade wind periods. Cold front passages in winter can bring brief NW winds 20-30 kt followed by crystal-clear visibility and excellent diving conditions.",
    image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop",
    gradient: "from-blue-500/20 to-purple-500/20",
    ports: [
      { name: "Nassau", lat: 25.04, lon: -77.35 },
      { name: "Freeport", lat: 26.53, lon: -78.70 },
      { name: "Bimini", lat: 25.73, lon: -79.30 },
      { name: "Berry Islands", lat: 25.63, lon: -77.83, sublabel: "Cruise Lines' Private Islands" },
      { name: "Turks & Caicos", lat: 21.46, lon: -71.14 },
    ],
  },
  {
    slug: "southern-caribbean",
    name: "Southern Caribbean",
    intel: "The ABC islands sit outside the hurricane belt and enjoy consistent ENE trades 15-20 kt year-round. Aruba is the windiest of the three with open Atlantic exposure. Curacao and Bonaire offer excellent leeward anchorages on their southern and western shores. Cartagena benefits from the South American landmass blocking the trade swell, keeping the harbor calm. Seas in the open Venezuelan Basin typically 3-5 ft ENE with good visibility throughout.",
    image: "https://files.manuscdn.com/user_upload_by_module/session_file/110462184/INhsBOFIHROpOBep.jpg",
    gradient: "from-teal-500/20 to-emerald-500/20",
    ports: [
      { name: "Aruba", lat: 12.52, lon: -70.03 },
      { name: "Curacao", lat: 12.11, lon: -68.93 },
      { name: "Bonaire", lat: 12.20, lon: -68.27 },
      { name: "Cartagena", lat: 10.39, lon: -75.48 },
    ],
  },
  {
    slug: "central-caribbean",
    name: "Central Caribbean",
    intel: "Central Caribbean conditions influenced by the Caribbean Low-Level Jet, keeping trades E-SE 12-18 kt. Cozumel's western shore is well-protected from the prevailing swell. The Bay of Honduras around Roatan and Belize is generally calmer than the open Caribbean. Grand Cayman sits in the center of the Caribbean Sea with exposure to swells from multiple directions — check the forecast carefully for any active weather to the north or east.",
    image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&h=600&fit=crop",
    gradient: "from-cyan-500/20 to-blue-500/20",
    ports: [
      { name: "Roatan", lat: 16.32, lon: -86.53 },
      { name: "Belize City", lat: 17.25, lon: -88.77 },
      { name: "Grand Cayman", lat: 19.29, lon: -81.38 },
      { name: "Cozumel", lat: 20.51, lon: -86.95 },
      { name: "Costa Maya", lat: 18.73, lon: -87.71, sublabel: "Mahahual" },
    ],
  },
  {
    slug: "lesser-antilles",
    name: "Lesser Antilles",
    intel: "ENE trades 15-20 kt with a 3-5 ft easterly swell across the chain. Barbados windward east coast fully exposed; Carlisle Bay and Bridgetown on the leeward west coast are calm and well-protected. St. Lucia, Martinique, and Dominica seeing afternoon squalls on the windward volcanic peaks — plan arrivals before noon. St. Vincent and the Grenadines offer excellent leeward anchorages. Visibility outstanding at 80+ ft throughout.",
    image: "/weatherstream-mvp/locations/barbados.jpg",
    gradient: "from-violet-500/20 to-blue-500/20",
    ports: [
      { name: "Barbados", lat: 13.10, lon: -59.62 },
      { name: "St. Lucia", lat: 13.91, lon: -60.98 },
      { name: "Martinique", lat: 14.64, lon: -61.02 },
      { name: "Dominica", lat: 15.30, lon: -61.39 },
      { name: "Antigua", lat: 17.12, lon: -61.85 },
      { name: "St. Kitts", lat: 17.30, lon: -62.72 },
      { name: "St. Maarten", lat: 18.07, lon: -63.07 },
      { name: "St. Vincent", lat: 13.16, lon: -61.22 },
      { name: "Grenada", lat: 12.11, lon: -61.68 },
    ],
  },
  {
    slug: "los-angeles",
    name: "Los Angeles",
    intel: "Southern California Bight providing typical morning low clouds and afternoon sea breeze 10-15 kt from the W-SW. San Pedro and Long Beach harbors calm with 1-2 ft wind chop in the afternoons. Catalina Island's Avalon anchorage well-protected from the prevailing westerly swell. Marina del Rey entrance manageable. Offshore Santa Ana wind events possible in fall and winter — monitor closely as winds can gust 30-50 kt with dangerous fire weather conditions ashore.",
    image: "/weatherstream-mvp/locations/la-san-pedro.jpg",
    gradient: "from-blue-600/20 to-slate-500/20",
    ports: [
      { name: "Los Angeles / San Pedro", lat: 33.73, lon: -118.26 },
      { name: "Long Beach", lat: 33.77, lon: -118.19 },
      { name: "Marina del Rey", lat: 33.98, lon: -118.45 },
      { name: "Catalina Island", lat: 33.39, lon: -118.42 },
    ],
  },
  {
    slug: "ensenada",
    name: "Ensenada",
    intel: "Ensenada Bay offers good protection from the prevailing NW Pacific swell. Winds typically NW 10-20 kt with seas 3-5 ft outside the bay. Islas Todos Santos provides excellent surf break exposure to open Pacific swell. Punta Banda anchorage calm in settled conditions. Baja California Norte coast can see strong NW winds during Pacific storm passages in winter — the Baja Bash northbound passage requires careful weather window selection.",
    image: "/weatherstream-mvp/locations/ensenada.jpg",
    gradient: "from-slate-500/20 to-blue-600/20",
    ports: [
      { name: "Ensenada", lat: 31.87, lon: -116.60 },
      { name: "Punta Banda", lat: 31.72, lon: -116.68 },
      { name: "Islas Todos Santos", lat: 31.81, lon: -116.80 },
    ],
  },
  {
    slug: "cabo-san-lucas",
    name: "Cabo San Lucas",
    intel: "Cabo sits at the confluence of the Pacific Ocean and Sea of Cortez, making conditions highly variable. The famous Arch anchorage is exposed to Pacific swell from the SW and W — use the marina or inner anchorage in any swell above 4 ft. Sea of Cortez side at San Jose del Cabo is calmer. La Paz in the Sea of Cortez offers excellent protected anchorage. Coromuel afternoon winds in summer can gust 20-30 kt from the SW in the Sea of Cortez.",
    image: "/weatherstream-mvp/locations/cabo-san-lucas.jpg",
    gradient: "from-amber-500/20 to-orange-500/20",
    ports: [
      { name: "Cabo San Lucas", lat: 22.89, lon: -109.91 },
      { name: "San Jose del Cabo", lat: 23.06, lon: -109.70 },
      { name: "La Paz", lat: 24.14, lon: -110.31 },
    ],
  },
  {
    slug: "mazatlan",
    name: "Mazatlan",
    intel: "Mazatlan sits on the eastern shore of the Sea of Cortez with generally calm conditions year-round. Prevailing winds light and variable 5-10 kt with seas 1-3 ft in the harbor approaches. Summer brings the Mexican Monsoon with afternoon thunderstorms and brief gusty winds. Hurricane season June-November requires close monitoring — Mazatlan has been impacted by major hurricanes historically. The outer anchorage is exposed to NW swell during winter Pacific storm passages.",
    image: "/weatherstream-mvp/locations/mazatlan.jpg",
    gradient: "from-yellow-500/20 to-amber-500/20",
    ports: [
      { name: "Mazatlan", lat: 23.22, lon: -106.42 },
      { name: "Topolobampo", lat: 25.60, lon: -109.05 },
      { name: "Altata", lat: 24.64, lon: -107.92 },
    ],
  },
  {
    slug: "puerto-vallarta",
    name: "Puerto Vallarta",
    intel: "Banderas Bay is one of the largest bays on the Pacific coast of Mexico, offering excellent protection from ocean swell. Marina Vallarta and the old town anchorage are well-sheltered. Afternoon sea breeze 10-15 kt from the W-SW is typical. Punta Mita on the north point of the bay is more exposed to Pacific swell — good surf but challenging for anchoring. Summer and fall bring the Mexican Monsoon with daily afternoon convective storms building over the Sierra Madre. Hurricane season requires vigilance June through November.",
    image: "/weatherstream-mvp/locations/puerto-vallarta.jpg",
    gradient: "from-emerald-500/20 to-teal-500/20",
    ports: [
      { name: "Puerto Vallarta", lat: 20.65, lon: -105.22 },
      { name: "Punta Mita", lat: 20.77, lon: -105.53 },
      { name: "Yelapa", lat: 20.50, lon: -105.43 },
      { name: "Chacala", lat: 21.17, lon: -105.23 },
    ],
  },
];
