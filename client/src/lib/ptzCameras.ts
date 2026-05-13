// =============================================================================
// PTZ.com partner camera registry -- single source of truth.
//
// This module is imported by every place on the site that needs to render a
// live PTZ partner camera thumbnail (currently the home page Live Conditions
// strip and the forecast region pages). All consumers MUST import from here
// instead of redefining the map locally to prevent drift over time.
//
// Keys are the EXACT location/port name strings used by:
//   - client/src/pages/Home.tsx     LIVE_DATA[].location
//   - client/src/data/regions.ts    Port.name
// Both data sources use identical strings for camera-equipped ports, which is
// what makes a single shared map possible.
//
// `cameraUrl`  : the destination PTZ.com webcam page (opens in new tab on click)
// `previewUrl` : the live snapshot image hotlinked from PTZ.com
//
// Snapshots are hotlinked from PTZ.com with David's permission. The
// `ptzCacheBucket()` helper rotates the URL once every 5 minutes so users see
// fresh snapshots without hammering PTZ servers on every page load.
//
// MULTI-CAMERA SUPPORT (added 2026-05-13):
// A single port may have MULTIPLE partner cameras. The map value is therefore
// either a single PtzCamera or an array. Existing single-cam ports stay as
// single objects (unchanged). Manhattan, Brooklyn, and Bayonne use arrays so
// both the NY Harbor Webcam and the Port NY Webcam render side-by-side under
// each of those three NYC-area ports per James's explicit instruction.
// `getPtzCamera()` returns the FIRST camera (back-compat with code that
// expects a single object). `getPtzCameras()` always returns an array.
// =============================================================================

export interface PtzCamera {
  cameraUrl: string;
  previewUrl: string;
}

type Entry = PtzCamera | PtzCamera[];

// Individual camera definitions reused across multiple ports (NYC).
const NY_HARBOR_WEBCAM: PtzCamera = {
  cameraUrl:  "https://www.nyharborwebcam.com/",
  previewUrl: "https://www.nyharborwebcam.com/images/nyhw_preview.jpg",
};
const PORT_NY_WEBCAM: PtzCamera = {
  cameraUrl:  "https://www.portnywebcam.com/",
  previewUrl: "https://www.portnywebcam.com/images/pnyw_preview.jpg",
};

export const PTZ_CAMERAS: Record<string, Entry> = {
  "Miami":                          { cameraUrl: "https://www.portmiamiwebcam.com/",          previewUrl: "https://www.portmiamiwebcam.com/images/pmw1_preview.jpg" },
  "Port Everglades":                { cameraUrl: "https://www.portevergladeswebcam.com/",     previewUrl: "https://www.portevergladeswebcam.com/images/pew_preview.jpg" },
  "Port Canaveral":                 { cameraUrl: "https://www.portcanaveralwebcam.com/",      previewUrl: "https://www.portcanaveralwebcam.com/images/pcw_preview.jpg" },
  "Tampa Bay":                      { cameraUrl: "https://www.porttampawebcam.com/",          previewUrl: "https://www.porttampawebcam.com/images/ptw_preview.jpg" },
  "Key West":                       { cameraUrl: "https://www.keywestharborwebcam.com/",      previewUrl: "https://www.keywestharborwebcam.com/images/kwhw_preview.jpg" },
  "Nassau":                         { cameraUrl: "https://www.portnassauwebcam.com/",         previewUrl: "https://www.portnassauwebcam.com/images/pnw_preview.jpg" },
  "Bimini":                         { cameraUrl: "http://www.portbiminiwebcam.com/",          previewUrl: "https://www.portbiminiwebcam.com/images/bim_preview.jpg" },
  "Bermuda -- Hamilton":            { cameraUrl: "https://www.portbermudawebcam.com/",        previewUrl: "https://www.portbermudawebcam.com/images/pbw_preview.jpg" },
  "Bermuda -- Royal Naval Dockyard":{ cameraUrl: "https://www.portbermudawebcam.com/",        previewUrl: "https://www.portbermudawebcam.com/images/pbw_preview.jpg" },
  "St. Maarten":                    { cameraUrl: "https://www.portstmaartenwebcam.com/",      previewUrl: "https://www.portstmaartenwebcam.com/images/psmw_preview.jpg" },
  // "St. Thomas" temporarily removed 2026-05-08 -- partner camera offline per David at PTZtv.
  // To reinstate when David confirms it is back online, uncomment the line below:
  // "St. Thomas":                  { cameraUrl: "http://www.portstthomaswebcam.com/",        previewUrl: "https://www.portstthomaswebcam.com/images/pstw1_preview.jpg" },
  "Juneau":                         { cameraUrl: "https://www.juneauharborwebcam.com/",       previewUrl: "https://www.juneauharborwebcam.com/images/jhw_preview.jpg" },

  // ---- Added 2026-05-13 ----
  // Philadelphia (new port) -- single Port Philly Webcam from PTZtv (partner: Paulsboro Sportsmen's Club).
  "Philadelphia":                   { cameraUrl: "https://www.portphillywebcam.com/",         previewUrl: "https://www.portphillywebcam.com/images/ppw_preview.jpg" },
  // Manhattan / Brooklyn / Bayonne -- BOTH NY Harbor Webcam and Port NY Webcam displayed for all three NYC-area
  // ports, per James's explicit instruction. Intentionally redundant; both cameras render side-by-side.
  "Manhattan":                      [NY_HARBOR_WEBCAM, PORT_NY_WEBCAM],
  "Brooklyn":                       [NY_HARBOR_WEBCAM, PORT_NY_WEBCAM],
  "Bayonne":                        [NY_HARBOR_WEBCAM, PORT_NY_WEBCAM],
};

// Cache-bucket rotates every 5 minutes (300_000 ms) so the snapshot URL changes
// at most 12 times per hour. This gives users fresh imagery without hammering
// PTZ servers on every page render or rotation tick.
export function ptzCacheBucket(): string {
  return String(Math.floor(Date.now() / 300000));
}

export function openPtzCamera(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function hasPtzCamera(name: string): boolean {
  const entry = PTZ_CAMERAS[name];
  if (!entry) return false;
  if (Array.isArray(entry)) return entry.length > 0;
  return true;
}

// Returns the FIRST camera for a port. Kept for back-compat with single-cam
// call sites that pre-date multi-camera support.
export function getPtzCamera(name: string): PtzCamera | undefined {
  const entry = PTZ_CAMERAS[name];
  if (!entry) return undefined;
  return Array.isArray(entry) ? entry[0] : entry;
}

// Returns ALL cameras for a port as a normalized array (1 or more entries).
// Empty array if the port has no camera. Use this in places that need to
// render every camera assigned to a port.
export function getPtzCameras(name: string): PtzCamera[] {
  const entry = PTZ_CAMERAS[name];
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}
