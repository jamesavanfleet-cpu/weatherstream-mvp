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
}

export const REGIONS: Region[] = [
  {
    slug: "eastern-caribbean",
    name: "Eastern Caribbean",
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
