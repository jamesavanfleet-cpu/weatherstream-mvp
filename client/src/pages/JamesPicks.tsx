import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

// ---- Types ----
interface MonthData {
  month: string;
  temp_high_f: number | null;
  temp_low_f: number | null;
  temp_high_c: number | null;
  temp_low_c: number | null;
  wind_kt: number | null;
  cloud_pct: number | null;
  rain_prob: number | null;
  score: number;
}

interface PortData {
  name: string;
  lat: number;
  lon: number;
  region: string;
  months: MonthData[];
  error?: string;
}

// ---- Constants ----
const MONTHS_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const REGIONS = ["US Homeport","Caribbean","Bahamas","Mediterranean","Pacific","Alaska","Bermuda"];

// ---- Score helpers ----
function scoreClass(s: number): string {
  if (s >= 70) return "excellent";
  if (s >= 50) return "good";
  if (s >= 30) return "fair";
  return "poor";
}
function scoreColor(s: number): string {
  if (s >= 70) return "#22c55e";
  if (s >= 50) return "#eab308";
  if (s >= 30) return "#f97316";
  return "#ef4444";
}
function heatColor(s: number): string {
  if (s >= 70) return "rgba(34,197,94,0.85)";
  if (s >= 60) return "rgba(134,239,172,0.75)";
  if (s >= 50) return "rgba(234,179,8,0.75)";
  if (s >= 30) return "rgba(249,115,22,0.75)";
  if (s >= 15) return "rgba(239,68,68,0.7)";
  return "rgba(127,29,29,0.7)";
}

// ---- Alaska port set (uses separate temperature-adjusted color scale) ----
const ALASKA_PORTS = new Set([
  "Juneau","Ketchikan","Sitka","Skagway","Tracy Arm Fjord","Haines",
  "Seattle","Vancouver","Victoria",
]);

function akScoreClass(s: number): string {
  if (s >= 60) return "excellent";
  if (s >= 40) return "good";
  if (s >= 20) return "fair";
  return "poor";
}
function akScoreColor(s: number): string {
  if (s >= 60) return "#22c55e";
  if (s >= 40) return "#eab308";
  if (s >= 20) return "#f97316";
  return "#ef4444";
}
function akHeatColor(s: number): string {
  if (s >= 60) return "rgba(34,197,94,0.85)";
  if (s >= 50) return "rgba(134,239,172,0.75)";
  if (s >= 40) return "rgba(234,179,8,0.75)";
  if (s >= 20) return "rgba(249,115,22,0.75)";
  if (s >= 10) return "rgba(239,68,68,0.7)";
  return "rgba(127,29,29,0.7)";
}
function getScoreColor(portName: string, s: number): string {
  return ALASKA_PORTS.has(portName) ? akScoreColor(s) : scoreColor(s);
}
function getHeatColor(portName: string, s: number): string {
  return ALASKA_PORTS.has(portName) ? akHeatColor(s) : heatColor(s);
}

// ---- Sub-components ----
function MonthStrip({ months, selectedMonth, onSelect, portName }: {
  months: MonthData[];
  selectedMonth: number | null;
  onSelect: (i: number) => void;
  portName: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(12,1fr)", gap: 3 }}>
      {months.map((m, i) => (
        <div
          key={m.month}
          onClick={(e) => { e.stopPropagation(); onSelect(i); }}
          title={`${m.month}: Score ${m.score}`}
          style={{
            background: getHeatColor(portName, m.score),
            borderRadius: 4,
            padding: "4px 2px",
            textAlign: "center",
            cursor: "pointer",
            outline: selectedMonth === i ? "2px solid #fff" : undefined,
            outlineOffset: selectedMonth === i ? 1 : undefined,
          }}
        >
          <span style={{ display: "block", fontSize: 9, color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>
            {m.month.slice(0, 1)}
          </span>
          <span style={{ display: "block", fontSize: 8, color: "#fff", fontWeight: 700 }}>
            {Math.round(m.score)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PortCard({ port, selectedMonth, onOpen, onSelectMonth }: {
  port: PortData;
  selectedMonth: number | null;
  onOpen: (name: string) => void;
  onSelectMonth: (i: number) => void;
}) {
  const displayMonth = selectedMonth !== null ? port.months[selectedMonth] : port.months.reduce((a, b) => b.score > a.score ? b : a);
  const best = port.months.reduce((a, b) => b.score > a.score ? b : a);
  const sc = ALASKA_PORTS.has(port.name) ? akScoreClass(displayMonth.score) : scoreClass(displayMonth.score);
  const col = getScoreColor(port.name, displayMonth.score);

  const badgeStyle: React.CSSProperties = {
    width: 52, height: 52, borderRadius: "50%",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: 18, lineHeight: 1, flexShrink: 0,
    background: `${col}33`, border: `2px solid ${col}`, color: col,
  };

  return (
    <div
      onClick={() => onOpen(port.name)}
      style={{
        background: "#1a2235", border: "1px solid #1e3a5f", borderRadius: 12,
        overflow: "hidden", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#38bdf8";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#1e3a5f";
      }}
    >
      {/* Header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{port.name}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>{port.region}</div>
        </div>
        <div style={badgeStyle}>
          {Math.round(displayMonth.score)}
          <span style={{ fontSize: 9, fontWeight: 600, marginTop: 2, opacity: 0.8 }}>/ 100</span>
        </div>
      </div>

      {/* Month strip */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e3a5f" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Weather Score by Month</div>
        <MonthStrip months={port.months} selectedMonth={selectedMonth} onSelect={onSelectMonth} portName={port.name} />
      </div>

      {/* Stats */}
      <div style={{ padding: "14px 20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { val: displayMonth.temp_high_f != null ? `${displayMonth.temp_high_f}\u00b0F` : "--", label: "Avg High" },
          { val: displayMonth.wind_kt != null ? `${displayMonth.wind_kt} kt` : "--", label: "Wind" },
          { val: displayMonth.rain_prob != null ? `${displayMonth.rain_prob}%` : "--", label: "Rain Days" },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{s.val}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Best month */}
      <div style={{ padding: "0 20px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>Best month:</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 6, padding: "3px 10px" }}>
          {best.month} ({Math.round(best.score)})
        </span>
      </div>
    </div>
  );
}

function PortModal({ port, onClose }: { port: PortData; onClose: () => void }) {
  const best = port.months.reduce((a, b) => b.score > a.score ? b : a);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#1a2235", border: "1px solid #1e3a5f", borderRadius: 16, maxWidth: 760, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Modal header */}
        <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid #1e3a5f", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, position: "sticky", top: 0, background: "#1a2235", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{port.name}</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{port.region} -- 30-Year Climate Analysis (NASA POWER 1994-2023)</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 24, lineHeight: 1, padding: 0, flexShrink: 0 }}>&#x2715;</button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "24px 28px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Monthly Weather Score</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
            {port.months.map(m => {
              const isBest = m.month === best.month;
              const col = getScoreColor(port.name, m.score);
              return (
                <div key={m.month} style={{ background: isBest ? "rgba(245,158,11,0.08)" : "#111827", border: `1px solid ${isBest ? "#f59e0b" : "#1e3a5f"}`, borderRadius: 10, padding: 14, textAlign: "center" } as React.CSSProperties}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{m.month}{isBest ? " \u2605" : ""}</div>
                  <div style={{ height: 6, borderRadius: 3, background: "#1e3a5f", marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${m.score}%`, background: col }} />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: col, marginBottom: 8 }}>{Math.round(m.score)}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[
                      { val: m.temp_high_f != null ? `${m.temp_high_f}\u00b0F` : "--", label: "High" },
                      { val: m.temp_low_f  != null ? `${m.temp_low_f}\u00b0F`  : "--", label: "Low" },
                      { val: m.wind_kt    != null ? `${m.wind_kt}kt`           : "--", label: "Wind" },
                      { val: m.rain_prob  != null ? `${m.rain_prob}%`          : "--", label: "Rain" },
                    ].map(s => (
                      <div key={s.label} style={{ fontSize: 11, color: "#94a3b8" }}>
                        <strong style={{ display: "block", fontSize: 13, color: "#e2e8f0" }}>{s.val}</strong>
                        {s.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Best month param bars */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Best Month Breakdown ({best.month})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {[
              { label: "Rain Days",   val: best.rain_prob  || 0, max: 100, unit: "%",   invert: true },
              { label: "Wind",        val: best.wind_kt    || 0, max: 35,  unit: " kt", invert: true },
              { label: "Cloud Cover", val: best.cloud_pct  || 0, max: 100, unit: "%",   invert: true },
              { label: "Temp High",   val: best.temp_high_f|| 0, max: 110, unit: "\u00b0F", invert: false },
            ].map(p => {
              const pct = Math.min(100, (p.val / p.max) * 100);
              const col = p.invert ? getScoreColor(port.name, 100 - pct) : getScoreColor(port.name, 100 - Math.abs(pct - 72));
              return (
                <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 12, color: "#94a3b8", width: 100, flexShrink: 0 }}>{p.label}</div>
                  <div style={{ flex: 1, height: 8, background: "#1e3a5f", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: col }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, width: 60, textAlign: "right", flexShrink: 0, color: col }}>{p.val}{p.unit}</div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
            Score methodology: Rain probability (30%), Wind speed (25%), Cloud cover (20%), Temperature comfort (25%).
            Scores are based on 30 years of NASA POWER reanalysis data (1994-2023). Higher scores indicate better cruising weather conditions.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function JamesPicks() {
  const [, navigate] = useLocation();
  const [ports, setPorts] = useState<PortData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRegion, setActiveRegion] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"cards" | "table" | "heatmap">("cards");
  const [sortCol, setSortCol] = useState<string>("name");
  const [sortDir, setSortDir] = useState<-1 | 1>(1);
  const [modalPort, setModalPort] = useState<PortData | null>(null);

  // Fetch data
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}climate_data.json?v=20260503c`)
      .then(r => { if (!r.ok) throw new Error("Failed to load climate data"); return r.json(); })
      .then((data: PortData[]) => { setPorts(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Filter
  const filtered = ports.filter(p => {
    if (!p.months || !p.months.length) return false;
    if (activeRegion !== "all" && p.region !== activeRegion) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Get display month data for a port
  const getDisplay = useCallback((port: PortData): MonthData => {
    if (selectedMonth !== null) return port.months[selectedMonth];
    return port.months.reduce((a, b) => b.score > a.score ? b : a);
  }, [selectedMonth]);

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const da = getDisplay(a), db = getDisplay(b);
    if (sortCol === "name")   return sortDir * a.name.localeCompare(b.name);
    if (sortCol === "region") return sortDir * a.region.localeCompare(b.region);
    if (sortCol === "score")  return sortDir * (db.score - da.score);
    if (sortCol === "best")   return sortDir * (MONTHS_ABBR.indexOf((b.months.reduce((x,y)=>y.score>x.score?y:x)).month) - MONTHS_ABBR.indexOf((a.months.reduce((x,y)=>y.score>x.score?y:x)).month));
    if (sortCol === "high")   return sortDir * ((db.temp_high_f||0) - (da.temp_high_f||0));
    if (sortCol === "low")    return sortDir * ((db.temp_low_f||0)  - (da.temp_low_f||0));
    if (sortCol === "wind")   return sortDir * ((db.wind_kt||0)     - (da.wind_kt||0));
    if (sortCol === "rain")   return sortDir * ((db.rain_prob||0)   - (da.rain_prob||0));
    if (sortCol === "cloud")  return sortDir * ((db.cloud_pct||0)   - (da.cloud_pct||0));
    return 0;
  });

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === -1 ? 1 : -1);
    else { setSortCol(col); setSortDir(-1); }
  }

  const monthLabel = selectedMonth !== null ? MONTHS_FULL[selectedMonth] : "Best Month";

  // ---- Styles ----
  const S = {
    page: { minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" } as React.CSSProperties,
    hero: { background: "linear-gradient(160deg,#0c1a3a 0%,#0a0f1e 60%)", borderBottom: "1px solid #1e3a5f", padding: "48px 24px 40px", textAlign: "center" as const, position: "relative" as const, overflow: "hidden" as const },
    controls: { background: "#111827", borderBottom: "1px solid #1e3a5f", padding: "16px 24px", display: "flex", flexWrap: "wrap" as const, gap: 12, alignItems: "center", position: "sticky" as const, top: 0, zIndex: 100 },
    colorKey: { background: "#111827", borderBottom: "1px solid #1e3a5f", padding: "10px 24px", display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 16 },
    main: { maxWidth: 1400, margin: "0 auto", padding: "32px 24px" },
    filterBtn: (active: boolean): React.CSSProperties => ({
      background: active ? "rgba(56,189,248,0.15)" : "#1a2235",
      border: `1px solid ${active ? "#38bdf8" : "#1e3a5f"}`,
      borderRadius: 8, color: active ? "#38bdf8" : "#94a3b8",
      cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 500,
      padding: "7px 14px", whiteSpace: "nowrap" as const,
    }),
    viewBtn: (active: boolean): React.CSSProperties => ({
      background: active ? "#0ea5e9" : "none",
      border: "none", borderRadius: 6,
      color: active ? "#fff" : "#94a3b8",
      cursor: "pointer", fontSize: 13,
      fontWeight: active ? 600 : 400,
      padding: "5px 12px",
    }),
    select: { background: "#1a2235", border: "1px solid #1e3a5f", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", fontSize: 13, padding: "7px 12px" } as React.CSSProperties,
    input: { background: "#1a2235", border: "1px solid #1e3a5f", borderRadius: 8, color: "#e2e8f0", fontSize: 13, padding: "7px 12px", outline: "none", minWidth: 180 } as React.CSSProperties,
    backBtn: { background: "none", border: "1px solid #1e3a5f", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 13, padding: "7px 14px", marginRight: 12 } as React.CSSProperties,
  };

  return (
    <div style={S.page}>
      {/* Hero */}
      <div style={S.hero}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%,rgba(56,189,248,0.08) 0%,transparent 70%)", pointerEvents: "none" }} />
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 600, color: "#38bdf8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Weather Intelligence by James Van Fleet
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 10 }}>
          James' Picks for <span style={{ color: "#38bdf8" }}>Best Weather</span>
        </h1>
        <p style={{ fontSize: 15, color: "#e2e8f0", maxWidth: 580, margin: "0 auto 10px", lineHeight: 1.5 }}>
          For planning what time of year and where to go on your next Cruise
        </p>
        <p style={{ fontSize: 16, color: "#94a3b8", maxWidth: 580, margin: "0 auto 28px", lineHeight: 1.6 }}>
          30 years of NASA POWER reanalysis data (1994-2023) analyzed across every cruise port. Scored on rain probability, wind, cloud cover, and temperature comfort -- so you know exactly when to go where.
        </p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "8px 16px", fontSize: 13, color: "#f59e0b" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Based on NASA POWER reanalysis -- 30 years of observed climate data
        </div>
      </div>

      {/* Controls */}
      <div style={S.controls}>
        <button style={S.backBtn} onClick={() => navigate("/")}>&#8592; Back</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Filter:</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: 1 }}>
          <button style={S.filterBtn(activeRegion === "all")} onClick={() => setActiveRegion("all")}>All Regions</button>
          {REGIONS.map(r => (
            <button key={r} style={S.filterBtn(activeRegion === r)} onClick={() => setActiveRegion(r)}>{r === "US Homeport" ? "US Homeports" : r}</button>
          ))}
        </div>
        <select style={S.select} value={selectedMonth ?? "best"} onChange={e => setSelectedMonth(e.target.value === "best" ? null : parseInt(e.target.value))}>
          <option value="best">Best Month</option>
          {MONTHS_FULL.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <input style={S.input} type="text" placeholder="Search port..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", gap: 4, background: "#1a2235", border: "1px solid #1e3a5f", borderRadius: 8, padding: 3 }}>
          {(["cards","table","heatmap"] as const).map(v => (
            <button key={v} style={S.viewBtn(view === v)} onClick={() => setView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Color Key */}
      <div style={S.colorKey}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>Score Key:</span>
        {[
          { color: "#22c55e", label: "70-100 Excellent" },
          { color: "#eab308", label: "50-69 Good" },
          { color: "#f97316", label: "30-49 Fair" },
          { color: "#ef4444", label: "0-29 Poor" },
        ].map(k => (
          <span key={k.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: k.color, flexShrink: 0, display: "inline-block" }} />
            {k.label}
          </span>
        ))}

        <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", marginLeft: "auto" }}>Scored on rain, wind, cloud cover &amp; temperature comfort</span>
      </div>

      {/* Main */}
      <div style={S.main}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 14, color: "#94a3b8" }}>
            Showing <strong style={{ color: "#e2e8f0" }}>{sorted.length}</strong> ports -- {monthLabel}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Click any port for full monthly breakdown</div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "80px 24px", color: "#94a3b8" }}>Loading climate data...</div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: "80px 24px", color: "#f97316" }}>Error: {error}</div>
        )}

        {/* CARDS VIEW */}
        {!loading && !error && view === "cards" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 20 }}>
            {sorted.map(port => (
              <PortCard
                key={port.name}
                port={port}
                selectedMonth={selectedMonth}
                onOpen={name => setModalPort(ports.find(p => p.name === name) || null)}
                onSelectMonth={i => setSelectedMonth(i)}
              />
            ))}
          </div>
        )}

        {/* TABLE VIEW */}
        {!loading && !error && view === "table" && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {[
                    { col: "name", label: "Port" }, { col: "region", label: "Region" },
                    { col: "score", label: "Score" }, { col: "best", label: "Best Month" },
                    { col: "high", label: "Avg High" }, { col: "low", label: "Avg Low" },
                    { col: "wind", label: "Wind (kt)" }, { col: "rain", label: "Rain %" },
                    { col: "cloud", label: "Cloud %" },
                  ].map(h => (
                    <th key={h.col} onClick={() => handleSort(h.col)} style={{ background: "#111827", borderBottom: "2px solid #1e3a5f", color: "#94a3b8", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "10px 12px", textAlign: "left", textTransform: "uppercase", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                      {h.label} {sortCol === h.col ? (sortDir === -1 ? "v" : "^") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(port => {
                  const d = getDisplay(port);
                  const best = port.months.reduce((a, b) => b.score > a.score ? b : a);
                  const col = getScoreColor(port.name, d.score);
                  return (
                    <tr key={port.name} onClick={() => setModalPort(port)} style={{ cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(56,189,248,0.04)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                    >
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px" }}><strong>{port.name}</strong></td>
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px", color: "#94a3b8" }}>{port.region}</td>
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px" }}>
                        <span style={{ display: "inline-block", borderRadius: 6, fontSize: 12, fontWeight: 700, padding: "3px 10px", minWidth: 44, textAlign: "center", background: `${col}22`, color: col, border: `1px solid ${col}44` }}>{Math.round(d.score)}</span>
                      </td>
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px", color: "#f59e0b", fontWeight: 600 }}>{best.month}</td>
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px" }}>{d.temp_high_f != null ? `${d.temp_high_f}\u00b0F` : "--"}</td>
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px" }}>{d.temp_low_f  != null ? `${d.temp_low_f}\u00b0F`  : "--"}</td>
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px" }}>{d.wind_kt    != null ? `${d.wind_kt} kt`   : "--"}</td>
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px" }}>{d.rain_prob  != null ? `${d.rain_prob}%`   : "--"}</td>
                      <td style={{ borderBottom: "1px solid rgba(30,58,95,0.5)", padding: "10px 12px" }}>{d.cloud_pct  != null ? `${Math.round(d.cloud_pct)}%` : "--"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* HEATMAP VIEW */}
        {!loading && !error && view === "heatmap" && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 900, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ background: "#111827", border: "1px solid #1e3a5f", color: "#94a3b8", fontSize: 11, fontWeight: 600, padding: "8px 12px", textAlign: "left", minWidth: 160 }}>Port</th>
                  {MONTHS_ABBR.map(m => (
                    <th key={m} style={{ background: "#111827", border: "1px solid #1e3a5f", color: "#94a3b8", fontSize: 11, fontWeight: 600, padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(port => (
                  <tr key={port.name}>
                    <td onClick={() => setModalPort(port)} style={{ border: "1px solid rgba(30,58,95,0.4)", padding: "6px 12px", fontWeight: 500, fontSize: 12, color: "#e2e8f0", whiteSpace: "nowrap", background: "#111827", cursor: "pointer" }}>
                      {port.name}<br /><span style={{ fontSize: 10, color: "#94a3b8" }}>{port.region}</span>
                    </td>
                    {port.months.map((m, i) => (
                      <td key={m.month} style={{ border: "1px solid rgba(30,58,95,0.4)", padding: "6px 4px", textAlign: "center", fontWeight: 700, fontSize: 11, background: getHeatColor(port.name, m.score), color: "#fff", outline: selectedMonth === i ? "2px solid #fff" : undefined, outlineOffset: selectedMonth === i ? -2 : undefined, cursor: "default" }} title={`${port.name} ${m.month}: Score ${m.score}, Rain ${m.rain_prob}%, Wind ${m.wind_kt}kt`}>
                        {Math.round(m.score)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalPort && <PortModal port={modalPort} onClose={() => setModalPort(null)} />}
    </div>
  );
}
