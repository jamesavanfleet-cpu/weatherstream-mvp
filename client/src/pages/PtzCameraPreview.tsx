import { Camera, ExternalLink, Cloud, Sparkles, ThermometerSun, Wind } from "lucide-react";

// Mock data: the 12 ports that overlap between MyCruisingWeather.com Live Conditions
// and PTZ.com Port Cameras. Each entry mirrors the visual style of the production
// Live Conditions card, including weather icon and gradient color, so David sees
// exactly how the camera icon will appear in context.
interface CameraPort {
  location: string;
  sublabel: string | null;
  temp: number;
  condition: string;
  windKt: number;
  windDir: string;
  icon: typeof Cloud;
  color: string;
  cameraUrl: string;
}

const CAMERA_PORTS: CameraPort[] = [
  { location: "Bermuda -- Hamilton", sublabel: "Bermuda", temp: 72, condition: "Partly Cloudy", windKt: 9, windDir: "SW", icon: Cloud, color: "from-teal-400 to-cyan-500", cameraUrl: "https://www.portbermudawebcam.com/" },
  { location: "Bermuda -- Royal Naval Dockyard", sublabel: "Bermuda", temp: 72, condition: "Partly Cloudy", windKt: 9, windDir: "SW", icon: Cloud, color: "from-teal-500 to-blue-500", cameraUrl: "https://www.portbermudawebcam.com/" },
  { location: "Bimini", sublabel: "Bahamas", temp: 76, condition: "Clear", windKt: 6, windDir: "ESE", icon: Sparkles, color: "from-sky-400 to-cyan-400", cameraUrl: "http://www.portbiminiwebcam.com/" },
  { location: "Juneau", sublabel: "Alaska", temp: 48, condition: "Partly Cloudy", windKt: 8, windDir: "SE", icon: Cloud, color: "from-slate-500 to-blue-500", cameraUrl: "https://www.juneauharborwebcam.com/" },
  { location: "Key West", sublabel: "Florida", temp: 80, condition: "Clear", windKt: 7, windDir: "E", icon: Sparkles, color: "from-yellow-400 to-orange-400", cameraUrl: "https://www.keywestharborwebcam.com/" },
  { location: "Miami", sublabel: "Florida", temp: 78, condition: "Sunny", windKt: 6, windDir: "S", icon: ThermometerSun, color: "from-orange-500 to-yellow-500", cameraUrl: "https://www.portmiamiwebcam.com/" },
  { location: "Nassau", sublabel: "Bahamas", temp: 77, condition: "Breezy", windKt: 12, windDir: "ENE", icon: Wind, color: "from-cyan-400 to-blue-500", cameraUrl: "https://www.portnassauwebcam.com/" },
  { location: "Port Canaveral", sublabel: "Florida", temp: 76, condition: "Sunny", windKt: 14, windDir: "SSE", icon: ThermometerSun, color: "from-orange-400 to-amber-400", cameraUrl: "https://www.portcanaveralwebcam.com/" },
  { location: "Port Everglades", sublabel: "Fort Lauderdale", temp: 78, condition: "Sunny", windKt: 14, windDir: "SSE", icon: ThermometerSun, color: "from-orange-500 to-yellow-400", cameraUrl: "https://www.portevergladeswebcam.com/" },
  { location: "St. Maarten", sublabel: "Caribbean", temp: 83, condition: "Sunny", windKt: 14, windDir: "E", icon: ThermometerSun, color: "from-orange-500 to-red-400", cameraUrl: "https://www.portstmaartenwebcam.com/" },
  { location: "St. Thomas", sublabel: "USVI", temp: 83, condition: "Sunny", windKt: 13, windDir: "E", icon: ThermometerSun, color: "from-orange-400 to-yellow-400", cameraUrl: "http://www.portstthomaswebcam.com/" },
  { location: "Tampa Bay", sublabel: "Florida", temp: 76, condition: "Partly Cloudy", windKt: 10, windDir: "SSW", icon: Cloud, color: "from-sky-500 to-cyan-500", cameraUrl: "https://www.porttampawebcam.com/" },
];

function openCamera(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function PtzCameraPreview() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">

        {/* Header explainer */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-5 h-5 text-red-400" />
            <span className="uppercase text-xs tracking-widest text-red-400 font-semibold">Private Preview</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black mb-3 leading-tight">
            PTZ.com Live Camera Integration Preview
          </h1>
          <p className="text-white/80 text-sm sm:text-base leading-relaxed mb-3">
            David, James from MyCruisingWeather.com here. This is a private preview of how I would
            like to integrate PTZ.com Port Cameras into the Live Conditions section of my home page.
            Click the small red camera icon on any card below to see exactly where I would send my
            visitors. <span className="font-semibold text-white">Nothing on this page is live to my
            customers yet</span>. Your sign-off comes first.
          </p>
          <p className="text-white/60 text-xs sm:text-sm leading-relaxed">
            Twelve of the ports I feature in Live Conditions overlap with cameras you operate. They
            are all shown below, alphabetically. On the production home page these cards rotate six at
            a time every five seconds, with the camera icon appearing only on the matching ports.
          </p>
        </div>

        {/* Live Conditions mock grid */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm uppercase tracking-widest text-white/70 font-semibold">
              Live Conditions Mock (Camera Ports Only)
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {CAMERA_PORTS.map((p) => (
              <div
                key={p.location}
                className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl p-3 transition-all"
              >
                <div className="flex items-start justify-between mb-1 gap-1">
                  <p className="text-white font-bold text-xs leading-tight truncate pr-1">
                    {p.location}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      aria-label={`Live camera at ${p.location} on PTZ.com`}
                      title={`Live camera at ${p.location} on PTZ.com`}
                      onClick={() => openCamera(p.cameraUrl)}
                      className="w-5 h-5 rounded-md bg-red-500/20 border border-red-400/40 flex items-center justify-center hover:bg-red-500/40 hover:border-red-400/70 transition-colors"
                    >
                      <Camera className="w-3 h-3 text-red-300" />
                    </button>
                    <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center`}>
                      <p.icon className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
                <p className="text-white font-black text-xl leading-none">{p.temp}°F</p>
                <p className="text-white/50 text-[10px] mt-1 truncate">{p.condition}</p>
                <p className="text-white/35 text-[10px]">
                  {p.windKt} kt {p.windDir}
                </p>
              </div>
            ))}
          </div>
          <p className="text-white/40 text-[11px] mt-3 italic">
            Click the small red camera icon on any card to open that port's PTZ.com webcam page in a new tab.
          </p>
        </div>

        {/* URL mapping table */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ExternalLink className="w-4 h-4 text-white/70" />
            <h2 className="text-sm uppercase tracking-widest text-white/70 font-semibold">
              URL Mapping
            </h2>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-white/60 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">MyCruisingWeather Port</th>
                  <th className="px-4 py-3 font-semibold">PTZ.com Webcam Destination</th>
                  <th className="px-4 py-3 font-semibold text-right">Test</th>
                </tr>
              </thead>
              <tbody>
                {CAMERA_PORTS.map((p, i) => (
                  <tr
                    key={p.location}
                    className={`border-t border-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}
                  >
                    <td className="px-4 py-3 text-white font-medium">{p.location}</td>
                    <td className="px-4 py-3 text-white/70 font-mono text-xs">{p.cameraUrl}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openCamera(p.cameraUrl)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-500/20 border border-red-400/40 hover:bg-red-500/40 transition-colors text-red-300 text-xs font-semibold"
                      >
                        <Camera className="w-3 h-3" />
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-10 pt-6 border-t border-white/10 text-center">
          <p className="text-white/40 text-xs">
            Private review page. Not linked from any public navigation on MyCruisingWeather.com.
          </p>
        </div>

      </div>
    </div>
  );
}
