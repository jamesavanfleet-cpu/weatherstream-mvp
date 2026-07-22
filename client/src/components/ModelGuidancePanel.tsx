import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type {
  NhcModelGuidanceModel,
  NhcModelGuidanceStorm,
} from "../lib/nhcTropicalData";

const MODEL_COLORS = [
  "#00D4FF", "#FF5D8F", "#FFD166", "#39FF14", "#B794F4", "#F97316",
  "#22D3EE", "#FB7185", "#FACC15", "#4ADE80", "#A78BFA", "#F59E0B",
  "#2DD4BF", "#E879F9", "#60A5FA", "#F87171", "#A3E635",
];

const TRACK_MAP_HEIGHT = 330;
const TRACK_MAP_FALLBACK_ZOOM = 5;
// Pixel padding keeps useful coastlines and place names in view without adding
// the large geographic margin that made some initial track maps look global.
const TRACK_MAP_BOUNDS_OPTIONS: L.FitBoundsOptions = {
  animate: false,
  maxZoom: 6,
  padding: [20, 20],
};

const CHART = {
  width: 720,
  height: 330,
  left: 52,
  right: 20,
  top: 22,
  bottom: 40,
};

const INTENSITY_CHART = {
  ...CHART,
  right: 150,
};

const INTENSITY_THRESHOLDS = [
  { wind: 34, label: "Tropical Storm", color: "#38BDF8" },
  { wind: 64, label: "Category 1", color: "#FACC15" },
  { wind: 83, label: "Category 2", color: "#FB923C" },
  { wind: 96, label: "Category 3", color: "#F97316" },
  { wind: 113, label: "Category 4", color: "#EF4444" },
  { wind: 137, label: "Category 5", color: "#D946EF" },
];

type Coordinate = { lat: number; lon: number };
type ColoredModel = NhcModelGuidanceModel & { color: string };

function withColor(models: NhcModelGuidanceModel[]): ColoredModel[] {
  return models.map((model, index) => ({
    ...model,
    color: MODEL_COLORS[index % MODEL_COLORS.length],
  }));
}

function pathFromPoints(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function cycleLabel(cycle: string | undefined): string | null {
  if (!cycle || !/^\d{10}$/.test(cycle)) return null;
  const year = cycle.slice(0, 4);
  const month = cycle.slice(4, 6);
  const day = cycle.slice(6, 8);
  const hour = cycle.slice(8, 10);
  return `${year}-${month}-${day} ${hour}Z`;
}

function ModelTrackMapBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();

  useEffect(() => {
    // The MapContainer receives these same bounds during creation. Re-fitting on
    // the next rendered frame makes the initial view robust to flex/grid layout
    // measurement, so a newly opened map cannot stay at a globe-scale fallback.
    let frame = requestAnimationFrame(() => {
      map.invalidateSize({ animate: false, pan: false });
      frame = requestAnimationFrame(() => {
        map.fitBounds(bounds, TRACK_MAP_BOUNDS_OPTIONS);
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [bounds, map]);

  return null;
}

function TrackPlot({ models, stormName }: { models: ColoredModel[]; stormName: string }) {
  const projectedModels = useMemo(() => models.map(model => ({
    ...model,
    track: model.points.map(point => ({ lat: point.lat, lon: point.lon })),
  })), [models]);

  const allPoints = useMemo(() => projectedModels.flatMap(model => model.track), [projectedModels]);
  const trackBounds = useMemo(() => {
    const bounds = L.latLngBounds(allPoints.map(point => [point.lat, point.lon] as [number, number]));
    return bounds.isValid() ? bounds : null;
  }, [allPoints]);
  if (allPoints.length === 0) return null;

  const initial = allPoints[0];

  return (
    <div data-model-guidance-track-plot="WEATHERSTREAM_OFFICIAL_ADECK_TRACK_GEOGRAPHY_V2">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: "0.76rem", color: "#9DB6C9", letterSpacing: "0.08em", fontWeight: 700 }}>
          TRACK GUIDANCE
        </div>
        <div style={{ fontSize: "0.7rem", color: "#607D93" }}>Coastlines and place names provide geographic reference</div>
      </div>
      <div style={{ border: "1px solid #19374D", background: "#08111A", overflow: "hidden" }}>
        <MapContainer
          {...(trackBounds
            ? { bounds: trackBounds, boundsOptions: TRACK_MAP_BOUNDS_OPTIONS }
            : { center: [initial.lat, initial.lon] as L.LatLngExpression, zoom: TRACK_MAP_FALLBACK_ZOOM })}
          style={{ height: TRACK_MAP_HEIGHT, width: "100%" }}
          zoomControl={true}
          scrollWheelZoom={false}
          attributionControl={true}
          aria-label={`${stormName} model track guidance map`}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
          {trackBounds && <ModelTrackMapBounds bounds={trackBounds} />}
          {projectedModels.map(model => (
            <Polyline
              key={model.id}
              positions={model.track.map(point => [point.lat, point.lon] as [number, number])}
              pathOptions={{
                color: model.color,
                weight: 1.35,
                opacity: 0.78,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          ))}
          <CircleMarker
            center={[initial.lat, initial.lon]}
            radius={5}
            pathOptions={{ color: "#0B1017", weight: 2, fillColor: "#F4FBFF", fillOpacity: 1 }}
          />
        </MapContainer>
      </div>
      <div style={{ color: "#607D93", fontSize: "0.7rem", lineHeight: 1.45, marginTop: 7 }}>
        Thin colored lines are public model aids. The white marker is the model initialization position.
      </div>
    </div>
  );
}

function IntensityPlot({ models, stormName }: { models: ColoredModel[]; stormName: string }) {
  const modelsWithIntensity = models.filter(model => model.points.some(point => point.windKt !== null));
  const allWindPoints = modelsWithIntensity.flatMap(model => model.points.filter(point => point.windKt !== null));
  if (allWindPoints.length === 0) {
    return (
      <div style={{ padding: "18px 0", color: "#7B9BB5", fontSize: "0.86rem" }}>
        Intensity guidance is unavailable for this public guidance cycle.
      </div>
    );
  }

  const highestWind = Math.max(...allWindPoints.map(point => point.windKt ?? 0));
  const topWind = Math.max(80, Math.ceil(highestWind / 20) * 20);
  const innerWidth = INTENSITY_CHART.width - INTENSITY_CHART.left - INTENSITY_CHART.right;
  const innerHeight = INTENSITY_CHART.height - INTENSITY_CHART.top - INTENSITY_CHART.bottom;
  const x = (hour: number) => INTENSITY_CHART.left + (hour / 168) * innerWidth;
  const y = (wind: number) => INTENSITY_CHART.top + ((topWind - wind) / topWind) * innerHeight;
  const xTicks = [0, 24, 48, 72, 96, 120, 144, 168];
  const yTicks = Array.from({ length: Math.floor(topWind / 20) + 1 }, (_, index) => index * 20);
  const thresholdLabelX = INTENSITY_CHART.width - INTENSITY_CHART.right + 8;

  return (
    <div data-model-guidance-intensity-plot="WEATHERSTREAM_OFFICIAL_ADECK_INTENSITY_THRESHOLDS_V2" style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: "0.76rem", color: "#9DB6C9", letterSpacing: "0.08em", fontWeight: 700 }}>
          INTENSITY GUIDANCE: MAX SUSTAINED WIND
        </div>
        <div style={{ fontSize: "0.7rem", color: "#607D93" }}>Knots · Forecast hours from model initialization</div>
      </div>
      <div style={{ border: "1px solid #19374D", background: "#08111A", overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${INTENSITY_CHART.width} ${INTENSITY_CHART.height}`}
          role="img"
          aria-label={`${stormName} model maximum sustained wind guidance plot with tropical cyclone category thresholds`}
          style={{ display: "block", width: "100%", height: "auto", minHeight: 190 }}
        >
          <rect x="0" y="0" width={INTENSITY_CHART.width} height={INTENSITY_CHART.height} fill="#08111A" />
          <rect
            x={INTENSITY_CHART.left}
            y={y(34)}
            width={innerWidth}
            height={INTENSITY_CHART.height - INTENSITY_CHART.bottom - y(34)}
            fill="#38BDF8"
            opacity="0.045"
          />
          {xTicks.map(hour => (
            <g key={`hour-${hour}`}>
              <line x1={x(hour)} y1={INTENSITY_CHART.top} x2={x(hour)} y2={INTENSITY_CHART.height - INTENSITY_CHART.bottom} stroke="#1A3345" strokeWidth="1" />
              <text x={x(hour)} y={INTENSITY_CHART.height - 16} textAnchor="middle" fill="#6D899D" fontSize="11">{hour}h</text>
            </g>
          ))}
          {yTicks.map(wind => (
            <g key={`wind-${wind}`}>
              <line x1={INTENSITY_CHART.left} y1={y(wind)} x2={INTENSITY_CHART.width - INTENSITY_CHART.right} y2={y(wind)} stroke="#1A3345" strokeWidth="1" />
              <text x={INTENSITY_CHART.left - 8} y={y(wind) + 4} textAnchor="end" fill="#6D899D" fontSize="11">{wind}</text>
            </g>
          ))}
          {INTENSITY_THRESHOLDS.filter(threshold => threshold.wind <= topWind).map(threshold => (
            <g key={threshold.label}>
              <line
                x1={INTENSITY_CHART.left}
                y1={y(threshold.wind)}
                x2={INTENSITY_CHART.width - INTENSITY_CHART.right}
                y2={y(threshold.wind)}
                stroke={threshold.color}
                strokeWidth="1.2"
                strokeDasharray="5 4"
                opacity="0.9"
              />
              <text x={thresholdLabelX} y={y(threshold.wind) + 4} fill={threshold.color} fontSize="10" fontWeight="700">
                {threshold.label} · {threshold.wind} kt
              </text>
            </g>
          ))}
          <text x={thresholdLabelX} y={INTENSITY_CHART.height - INTENSITY_CHART.bottom - 5} fill="#7DD3FC" fontSize="10" fontWeight="700">
            Tropical Depression &lt;34 kt
          </text>
          <text x={12} y={INTENSITY_CHART.top + 4} fill="#6D899D" fontSize="11">kt</text>
          {modelsWithIntensity.map(model => {
            const points = model.points
              .filter((point): point is typeof point & { windKt: number } => point.windKt !== null)
              .map(point => ({ x: x(point.forecastHour), y: y(point.windKt) }));
            return (
              <path
                key={model.id}
                d={pathFromPoints(points)}
                fill="none"
                stroke={model.color}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.78"
              />
            );
          })}
          <text x={INTENSITY_CHART.width - INTENSITY_CHART.right} y={INTENSITY_CHART.top + 12} textAnchor="end" fill="#607D93" fontSize="11">Forecast guidance, not an official forecast</text>
        </svg>
      </div>
    </div>
  );
}

export function ModelGuidancePanel({ storm }: { storm: NhcModelGuidanceStorm }) {
  const models = useMemo(() => withColor(storm.models), [storm.models]);
  const initializedCycle = cycleLabel(storm.sourceCycle);
  const isInvest = storm.systemType === "invest";

  if (models.length === 0) {
    return (
      <div data-model-guidance-empty="WEATHERSTREAM_OFFICIAL_ADECK_EMPTY_V1" style={{ padding: "28px 0", textAlign: "center" }}>
        <div style={{ fontSize: "1rem", color: "#FFD166", letterSpacing: "0.08em", fontWeight: 700 }}>GUIDANCE UNAVAILABLE</div>
        <div style={{ color: "#7B9BB5", fontSize: "0.86rem", lineHeight: 1.5, marginTop: 8 }}>{storm.noDataReason ?? "No complete public model guidance is available for this current system."}</div>
      </div>
    );
  }

  return (
    <section data-model-guidance-panel="WEATHERSTREAM_OFFICIAL_ADECK_GUIDANCE_GEOGRAPHY_V2" aria-label={`${storm.name} model guidance`}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ color: "#00D4FF", fontSize: "0.92rem", fontWeight: 700, letterSpacing: "0.08em" }}>{storm.name.toUpperCase()}</div>
          <div style={{ color: "#607D93", fontSize: "0.72rem", marginTop: 3 }}>{initializedCycle ? `Model initialization ${initializedCycle}` : "Current published model cycle"}</div>
          {isInvest && (
            <div style={{ color: "#FFD166", fontSize: "0.7rem", marginTop: 5, letterSpacing: "0.05em" }}>
              INVEST GUIDANCE ONLY: NO OFFICIAL NHC ADVISORY OR FORECAST CONE
            </div>
          )}
        </div>
        <a href={storm.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#7B9BB5", fontSize: "0.72rem", textDecoration: "underline", textUnderlineOffset: 3 }}>
          Official NHC A-deck source
        </a>
      </div>

      <TrackPlot models={models} stormName={storm.name} />
      <IntensityPlot models={models} stormName={storm.name} />

      <div style={{ display: "flex", gap: "6px 10px", flexWrap: "wrap", marginTop: 12, padding: "8px 0", borderTop: "1px solid #19374D" }} aria-label="Model legend">
        {models.map(model => (
          <div key={model.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#AFC4D3", fontSize: "0.69rem" }}>
            <span aria-hidden="true" style={{ width: 10, height: 2, borderRadius: 3, background: model.color, display: "inline-block" }} />
            {model.label}
          </div>
        ))}
      </div>

      <p style={{ margin: "10px 0 0", color: "#7B9BB5", fontSize: "0.78rem", lineHeight: 1.5 }}>
        These are public computer-model guidance aids from the NOAA National Hurricane Center ATCF A-deck. They are not an official NHC forecast. {isInvest ? "This invest does not have an official NHC advisory or forecast cone. " : ""}Use official NHC forecasts and local NWS products for decisions.
      </p>
    </section>
  );
}
