// =============================================================================
// PtzThumb -- shared live PTZ partner camera thumbnail component.
//
// Used by:
//   - client/src/pages/Home.tsx           (Live Conditions Now strip, "compact" size)
//   - client/src/pages/RegionDetail.tsx   (Port Conditions accordion, "default" size)
//
// Behavior:
//   - Renders nothing if the given portName has no PTZ camera registered
//   - Click opens the partner's PTZ.com webcam page in a NEW BROWSER TAB
//     (target="_blank") so the user's mycruisingweather.com tab stays open
//     and they can return with a single tab switch instead of multiple Back
//     button presses. rel="noopener noreferrer" hardens the new tab against
//     opener-window manipulation and prevents leaking referrer data.
//   - We render a true <a> anchor element (NOT a <button> + window.open) so
//     the browser treats this as a normal user-initiated link navigation.
//     Anchors with target="_blank" are never blocked by popup blockers, while
//     window.open() can be downgraded to same-tab navigation in some mobile
//     browsers / OS settings -- which is what was happening for users.
//   - stopPropagation on click prevents the click from bubbling to parent
//     handlers (e.g. accordion toggle, port-detail modal opener).
//   - Falls back to a small Camera icon link if the snapshot image fails.
//   - LIVE badge with pulsing red dot overlays the bottom-left of the thumbnail.
//   - Cache-busted via ptzCacheBucket() once every 5 minutes.
//
// Attribution text ("Port Camera via our partners PTZtv") is rendered by the
// CONSUMER (Home.tsx / RegionDetail.tsx), not by this component, so each call
// site can place the attribution in the position that fits its layout.
// =============================================================================
import { useState } from "react";
import { Camera } from "lucide-react";
import { getPtzCameras, ptzCacheBucket } from "@/lib/ptzCameras";

type Size = "compact" | "default" | "dual";

interface Props {
  portName: string;
  size?: Size;
  className?: string;
  // For ports with multiple cameras, selects which camera to render. Defaults
  // to 0 (the first camera). Single-camera ports ignore this prop. Multi-cam
  // consumers (Manhattan/Brooklyn/Bayonne) render <PtzThumb> once per cam.
  cameraIndex?: number;
}

export default function PtzThumb({ portName, size = "default", className = "", cameraIndex = 0 }: Props) {
  const cams = getPtzCameras(portName);
  const cam = cams[cameraIndex];
  const [errored, setErrored] = useState(false);
  if (!cam) return null;
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); };

  // Compact = home page Live Conditions card (very tight 3-column grid)
  // Default = forecast region accordion header, single camera (more room)
  // Dual   = forecast region accordion header, two cameras side-by-side
  //          (narrower so both fit without overflowing the port name text)
  const dims = size === "compact"
    ? "w-10 h-10"
    : size === "dual"
      ? "w-14 h-[32px]"
      : "w-24 h-[54px]";

  if (errored) {
    return (
      <a
        href={cam.cameraUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Live camera at ${portName} on PTZ.com (opens in new tab)`}
        title={`Live camera at ${portName} on PTZ.com (opens in new tab)`}
        onClick={stop}
        className={`w-6 h-6 rounded-md bg-red-500/20 border border-red-400/40 flex items-center justify-center hover:bg-red-500/40 hover:border-red-400/70 transition-colors flex-shrink-0 ${className}`}
      >
        <Camera className="w-3.5 h-3.5 text-red-300" />
      </a>
    );
  }

  const bucket = ptzCacheBucket();
  return (
    <a
      href={cam.cameraUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Live PTZ.com camera at ${portName} (opens in new tab)`}
      title={`Live PTZ.com camera at ${portName} (opens in new tab)`}
      onClick={stop}
      className={`relative block ${dims} rounded-md overflow-hidden border border-red-400/60 hover:border-red-400 hover:shadow-[0_0_0_2px_rgba(248,113,113,0.4)] transition-all bg-slate-950 group flex-shrink-0 ${className}`}
    >
      <img
        src={`${cam.previewUrl}?cb=${bucket}`}
        alt={`Live PTZ webcam preview of ${portName}`}
        loading="lazy"
        onError={() => setErrored(true)}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
      />
      <div className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 px-1 py-[1px] rounded-sm bg-black/70 backdrop-blur-sm">
        <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[7px] font-black tracking-widest text-white leading-none">LIVE</span>
      </div>
    </a>
  );
}
