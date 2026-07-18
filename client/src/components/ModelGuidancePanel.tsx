import { useMemo } from "react";

import type {
  NhcModelGuidanceModel,
  NhcModelGuidanceStorm,
} from "../lib/nhcTropicalData";

const MODEL_COLORS = [
  "#00D4FF", "#FF5D8F", "#FFD166", "#39FF14", "#B794F4", "#F97316",
  "#22D3EE", "#FB7185", "#FACC15", "#4ADE80", "#A78BFA", "#F59E0B",
  "#2DD4BF", "#E879F9", "#60A5FA", "#F87171", "#A3E635",
];

const CHART = {
  width: 720,
  height: 330,
  left: 52,
  right: 20,
  top: 22,
  bottom: 40,
};

type Coordinate = { lat: number; lon: number };
type ColoredModel = NhcModelGuidanceModel & { color: string };

function withColor(models: NhcModelGuidanceModel[]): ColoredModel[] {
  return models.map((model, index) => ({
    ...model,
    color: MODEL_COLORS[index % MODEL_COLORS.length],
  }));
}

function unwrapLongitudes(points: Coordinate[]): Coordinate[] {
  if (points.length === 0) return [];
  let previous = points[0].lon;
  return points.map((point, index) => {
    if (index === 0) return { ...point };
    let longitude = point.lon;
    while (longitude - previous > 180) longitude -= 360;
    while (longitude - previous < -180) longitude += 360;
    previous = longitude;
    return { ...point, lon: longitude };
  });
}

function latitudeLabel(latitude: number): string {
  return `${Math.abs(latitude).toFixed(0)}°${latitude < 0 ? "S" : "N"}`;
}

function longitudeLabel(longitude: number): string {
  const wrapped = ((longitude + 540) % 360) - 180;
  return `${Math.abs(wrapped).toFixed(0)}°${wrapped < 0 ? "W" : "E"}`;
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

function TrackPlot({ models, stormName }: { models: ColoredModel[]; stormName: string }) {
  const projectedModels = useMemo(() => models.map(model => ({
    ...model,
    track: unwrapLongitudes(model.points.map(point => ({ lat: point.lat, lon: point.lon }))),
  })), [models]);

  const allPoints = projectedModels.flatMap(model => model.track);
  if (allPoints.length === 0) return null;

  const minLat = Math.min(...allPoints.map(point => point.lat));
  const maxLat = Math.max(...allPoints.map(point => point.lat));
  const minLon = Math.min(...allPoints.map(point => point.lon));
  const maxLon = Math.max(...allPoints.map(point => point.lon));
  const latPadding = Math.max((maxLat - minLat) * 0.12, 1.2);
  const lonPadding = Math.max((maxLon - minLon) * 0.12, 1.8);
  const bounds = {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLon: minLon - lonPadding,
    maxLon: maxLon + lonPadding,
  };
  const innerWidth = CHART.width - CHART.left - CHART.right;
  const innerHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (longitude: number) => CHART.left + ((longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1)) * innerWidth;
  const y = (latitude: number) => CHART.top + ((bounds.maxLat - latitude) / (bounds.maxLat - bounds.minLat || 1)) * innerHeight;
  const gridSteps = [0, 1, 2, 3, 4];
  const initial = allPoints[0];

  return (
    <div data-model-guidance-track-plot="WEATHERSTREAM_OFFICIAL_ADECK_TRACK_V1">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: "0.76rem", color: "#9DB6C9", letterSpacing: "0.08em", fontWeight: 700 }}>
          TRACK GUIDANCE
        </div>
        <div style={{ fontSize: "0.7rem", color: "#607D93" }}>Each line is one public model aid</div>
      </div>
      <div style={{ border: "1px solid #19374D", background: "#08111A", overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label={`${stormName} model track guidance plot`}
          style={{ display: "block", width: "100%", height: "auto", minHeight: 190 }}
        >
          <rect x="0" y="0" width={CHART.width} height={CHART.height} fill="#08111A" />
          {gridSteps.map(step => {
            const longitude = bounds.minLon + ((bounds.maxLon - bounds.minLon) * step) / 4;
            const left = x(longitude);
            return (
              <g key={`lon-${step}`}>
                <line x1={left} y1={CHART.top} x2={left} y2={CHART.height - CHART.bottom} stroke="#1A3345" strokeWidth="1" />
                <text x={left} y={CHART.height - 16} textAnchor="middle" fill="#6D899D" fontSize="11">{longitudeLabel(longitude)}</text>
              </g>
            );
          })}
          {gridSteps.map(step => {
            const latitude = bounds.minLat + ((bounds.maxLat - bounds.minLat) * step) / 4;
            const top = y(latitude);
            return (
              <g key={`lat-${step}`}>
                <line x1={CHART.left} y1={top} x2={CHART.width - CHART.right} y2={top} stroke="#1A3345" strokeWidth="1" />
                <text x={CHART.left - 8} y={top + 4} textAnchor="end" fill="#6D899D" fontSize="11">{latitudeLabel(latitude)}</text>
              </g>
            );
          })}
          {projectedModels.map(model => (
            <path
              key={model.id}
              d={pathFromPoints(model.track.map(point => ({ x: x(point.lon), y: y(point.lat) })))}
              fill="none"
              stroke={model.color}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.88"
            />
          ))}
          <circle cx={x(initial.lon)} cy={y(initial.lat)} r="5" fill="#F4FBFF" stroke="#0B1017" strokeWidth="2" />
          <text x={x(initial.lon) + 9} y={y(initial.lat) - 8} fill="#DCECF6" fontSize="11" fontWeight="700">INITIAL</text>
          <text x={CHART.width - CHART.right} y={CHART.top + 12} textAnchor="end" fill="#607D93" fontSize="11">Forecast positions through 168 h</text>
        </svg>
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
        Intensity guidance is unavailable for this advisory cycle.
      </div>
    );
  }

  const highestWind = Math.max(...allWindPoints.map(point => point.windKt ?? 0));
  const topWind = Math.max(80, Math.ceil(highestWind / 20) * 20);
  const innerWidth = CHART.width - CHART.left - CHART.right;
  const innerHeight = CHART.height - CHART.top - CHART.bottom;
  const x = (hour: number) => CHART.left + (hour / 168) * innerWidth;
  const y = (wind: number) => CHART.top + ((topWind - wind) / topWind) * innerHeight;
  const xTicks = [0, 24, 48, 72, 96, 120, 144, 168];
  const yTicks = Array.from({ length: Math.floor(topWind / 20) + 1 }, (_, index) => index * 20);

  return (
    <div data-model-guidance-intensity-plot="WEATHERSTREAM_OFFICIAL_ADECK_INTENSITY_V1" style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: "0.76rem", color: "#9DB6C9", letterSpacing: "0.08em", fontWeight: 700 }}>
          INTENSITY GUIDANCE: MAX SUSTAINED WIND
        </div>
        <div style={{ fontSize: "0.7rem", color: "#607D93" }}>Knots · Forecast hours from model initialization</div>
      </div>
      <div style={{ border: "1px solid #19374D", background: "#08111A", overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label={`${stormName} model maximum sustained wind guidance plot`}
          style={{ display: "block", width: "100%", height: "auto", minHeight: 190 }}
        >
          <rect x="0" y="0" width={CHART.width} height={CHART.height} fill="#08111A" />
          {xTicks.map(hour => (
            <g key={`hour-${hour}`}>
              <line x1={x(hour)} y1={CHART.top} x2={x(hour)} y2={CHART.height - CHART.bottom} stroke="#1A3345" strokeWidth="1" />
              <text x={x(hour)} y={CHART.height - 16} textAnchor="middle" fill="#6D899D" fontSize="11">{hour}h</text>
            </g>
          ))}
          {yTicks.map(wind => (
            <g key={`wind-${wind}`}>
              <line x1={CHART.left} y1={y(wind)} x2={CHART.width - CHART.right} y2={y(wind)} stroke="#1A3345" strokeWidth="1" />
              <text x={CHART.left - 8} y={y(wind) + 4} textAnchor="end" fill="#6D899D" fontSize="11">{wind}</text>
            </g>
          ))}
          <text x={12} y={CHART.top + 4} fill="#6D899D" fontSize="11">kt</text>
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
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.88"
              />
            );
          })}
          <text x={CHART.width - CHART.right} y={CHART.top + 12} textAnchor="end" fill="#607D93" fontSize="11">Forecast guidance, not an official forecast</text>
        </svg>
      </div>
    </div>
  );
}

export function ModelGuidancePanel({ storm }: { storm: NhcModelGuidanceStorm }) {
  const models = useMemo(() => withColor(storm.models), [storm.models]);
  const initializedCycle = cycleLabel(storm.sourceCycle);

  if (models.length === 0) {
    return (
      <div data-model-guidance-empty="WEATHERSTREAM_OFFICIAL_ADECK_EMPTY_V1" style={{ padding: "28px 0", textAlign: "center" }}>
        <div style={{ fontSize: "1rem", color: "#FFD166", letterSpacing: "0.08em", fontWeight: 700 }}>GUIDANCE UNAVAILABLE</div>
        <div style={{ color: "#7B9BB5", fontSize: "0.86rem", lineHeight: 1.5, marginTop: 8 }}>{storm.noDataReason ?? "No complete public model guidance is available for this active storm."}</div>
      </div>
    );
  }

  return (
    <section data-model-guidance-panel="WEATHERSTREAM_OFFICIAL_ADECK_GUIDANCE_V1" aria-label={`${storm.name} model guidance`}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ color: "#00D4FF", fontSize: "0.92rem", fontWeight: 700, letterSpacing: "0.08em" }}>{storm.name.toUpperCase()}</div>
          <div style={{ color: "#607D93", fontSize: "0.72rem", marginTop: 3 }}>{initializedCycle ? `Model initialization ${initializedCycle}` : "Current published model cycle"}</div>
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
            <span aria-hidden="true" style={{ width: 10, height: 3, borderRadius: 3, background: model.color, display: "inline-block" }} />
            {model.label}
          </div>
        ))}
      </div>

      <p style={{ margin: "10px 0 0", color: "#7B9BB5", fontSize: "0.78rem", lineHeight: 1.5 }}>
        These are public computer-model guidance aids from the NOAA National Hurricane Center ATCF A-deck. They are not an official NHC forecast. Use the official NHC forecast cone and local NWS products for decisions.
      </p>
    </section>
  );
}
