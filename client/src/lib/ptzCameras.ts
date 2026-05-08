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
// =============================================================================

export interface PtzCamera {
  cameraUrl: string;
  previewUrl: string;
}

export const PTZ_CAMERAS: Record<string, PtzCamera> = {
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
  "St. Thomas":                     { cameraUrl: "http://www.portstthomaswebcam.com/",        previewUrl: "https://www.portstthomaswebcam.com/images/pstw1_preview.jpg" },
  "Juneau":                         { cameraUrl: "https://www.juneauharborwebcam.com/",       previewUrl: "https://www.juneauharborwebcam.com/images/jhw_preview.jpg" },
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
  return !!PTZ_CAMERAS[name];
}

export function getPtzCamera(name: string): PtzCamera | undefined {
  return PTZ_CAMERAS[name];
}
