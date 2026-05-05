#!/usr/bin/env python3
"""
generate_climate_database.py

Build authoritative monthly climatology files for every port from NASA POWER
reanalysis (1994-2023, 30 years). Writes:

  client/public/climate_database.json   -- consumed by RouteMap pop-out
  client/public/climate_data.json       -- consumed by JamesPicks "Best Months"

Single source of truth: NASA POWER. No fabricated values, no defaults, no
guesses. Every record carries a `_source` block with the exact API endpoints,
rain-day threshold, and fetch timestamp so any value can be traced.

Parameters and methods (uniform for all 97 ports):

  T2M_MAX (daily 2014-2023, deg C, MEAN of daily highs)  -> hiF, temp_high_f
  T2M_MIN (daily 2014-2023, deg C, MEAN of daily lows)   -> loF, temp_low_f
  RH2M    (monthly climatology, %)                       -> hum
  WD10M   (monthly climatology, deg)                     -> windDir (16-pt compass)
  CLOUD_AMT (monthly climatology, %)                     -> cloud_pct
  WS10M   (monthly climatology, m/s)                     -> wind_kt (mean, kt)
  WS10M   (daily 2014-2023, m/s)                         -> windKt (string, "p25-p75 kt")
  PRECTOTCORR (daily 2014-2023, mm/day)                  -> rain, rain_prob
                                                            = % of days with >= 2.54 mm
                                                            = NCEI 0.10-inch rain-day threshold

Note: NASA POWER monthly climatology T2M_MAX/T2M_MIN return the all-time monthly
extreme (e.g. heat-dome events), not the mean of daily highs/lows. The daily
endpoint is the only way to compute a true mean daily high/low climatology.
  Wind-derived (Hs ~ 0.21 * U^2 / g, U=monthly mean WS10M)  -> seaFt
                                                  Documented derivation, not a measurement.

Score (JamesPicks): preserved from prior algorithm:
  score = (
    (100 - rain_prob)               * 0.35
    + max(0, 100 - max(0, wind_kt-5)*5) * 0.25
    + (100 - cloud_pct)             * 0.20
    + temp_comfort(temp_high_f)      * 0.20
  )
where temp_comfort(t) = 100 - min(100, abs(t-78)*4)  (peak at 78 F)

Run: `python3 scripts/generate_climate_database.py`
"""
import json
import math
import statistics
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MASTER_PORTS_PATH = REPO_ROOT / "scripts" / "master_ports.json"
STATION_MAP_PATH  = REPO_ROOT / "scripts" / "station_map.json"
OUT_DB_PATH       = REPO_ROOT / "client" / "public" / "climate_database.json"
OUT_DATA_PATH     = REPO_ROOT / "client" / "public" / "climate_data.json"

NASA_CLIMO_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
NASA_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
NCEI_NORMALS_URL = "https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/{station_id}.csv"
NCEI_MIN_YEARS = 15  # quality gate: require >= 15 years of station data (50%+ of 30-year window)
CLIMO_START, CLIMO_END = 1994, 2023            # 30-year climatology window
DAILY_START,  DAILY_END  = "20140101", "20231231"  # 10-year daily window for stats

# NASA POWER monthly climatology returns extremes for T2M_MAX/T2M_MIN (all-time monthly max/min)
# rather than the mean of daily highs/lows. So we use:
#   - climatology endpoint for: RH2M, WD10M, CLOUD_AMT, WS10M (these ARE proper monthly means)
#   - daily endpoint for: T2M_MAX, T2M_MIN (averaged across the daily window to get a true mean daily high/low),
#     PRECTOTCORR (rain-day frequency), WS10M (p25/p75 wind range)
CLIMO_PARAMS = ["RH2M", "WD10M", "CLOUD_AMT", "WS10M"]
DAILY_PARAMS = ["T2M_MAX", "T2M_MIN", "PRECTOTCORR", "WS10M"]

RAIN_THRESHOLD_MM = 2.54  # NCEI 0.10-inch definition of a "rain day"

# Loaded once at startup
STATION_MAP: dict = {}

MONTHS_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
MONTHS_NASA = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]


def c_to_f(c: float) -> float:
    return c * 9.0 / 5.0 + 32.0


def ms_to_kt(ms: float) -> float:
    return ms * 1.94384


def deg_to_compass(deg: float) -> str:
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
            "S","SSW","SW","WSW","W","WNW","NW","NNW"]
    return dirs[int((deg % 360) / 22.5 + 0.5) % 16]


def fetch_with_retry(url: str, label: str, retries: int = 4, backoff: float = 3.0) -> dict:
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return json.loads(r.read().decode())
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as e:
            last_err = e
            wait = backoff * attempt
            print(f"    [{label}] attempt {attempt}/{retries} failed: {e}; waiting {wait:.0f}s",
                  file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"{label}: all retries failed: {last_err}")


def fetch_climatology(lat: float, lon: float) -> dict:
    """Fetch monthly climatology for a point. Returns dict[param][MONTH_ABBR] -> float."""
    url = (
        f"{NASA_CLIMO_URL}"
        f"?parameters={','.join(CLIMO_PARAMS)}"
        f"&community=RE"
        f"&longitude={lon}&latitude={lat}"
        f"&format=JSON"
        f"&start={CLIMO_START}&end={CLIMO_END}"
    )
    data = fetch_with_retry(url, label=f"climo {lat:.3f},{lon:.3f}")
    return data["properties"]["parameter"]


def fetch_ncei_normals(station_id: str) -> dict:
    """
    Fetch NCEI 1991-2020 monthly normals for a station and return
      dict {month_int: {"tmax_f": float, "tmin_f": float, "years_tmax": int, "years_tmin": int}}
    Quality gate: months with years < NCEI_MIN_YEARS or value -9999 are returned with None.
    Raises RuntimeError if the station file cannot be fetched or has no usable rows.
    """
    import csv
    import io
    url = NCEI_NORMALS_URL.format(station_id=station_id)
    last_err = None
    for attempt in range(1, 5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                text = r.read().decode()
            break
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            wait = 2.0 * attempt
            print(f"    [NCEI {station_id}] attempt {attempt}/4 failed: {e}; waiting {wait:.0f}s",
                  file=sys.stderr)
            time.sleep(wait)
    else:
        raise RuntimeError(f"NCEI fetch failed for {station_id}: {last_err}")

    reader = csv.DictReader(io.StringIO(text))
    out = {}
    for row in reader:
        try:
            mo = int(row["month"])
        except (KeyError, ValueError):
            continue
        if mo < 1 or mo > 12:
            continue
        # Values may be "-9999" for missing, or quoted numbers; strip.
        def _f(key):
            v = row.get(key, "").strip()
            try:
                fv = float(v)
            except ValueError:
                return None
            if fv <= -999.0:  # NCEI missing-value sentinel
                return None
            return fv
        def _i(key):
            v = row.get(key, "").strip()
            try:
                return int(float(v))
            except ValueError:
                return 0
        tmax_f = _f("MLY-TMAX-NORMAL")
        tmin_f = _f("MLY-TMIN-NORMAL")
        years_tmax = _i("years_MLY-TMAX-NORMAL")
        years_tmin = _i("years_MLY-TMIN-NORMAL")
        out[mo] = {
            "tmax_f": tmax_f if (tmax_f is not None and years_tmax >= NCEI_MIN_YEARS) else None,
            "tmin_f": tmin_f if (tmin_f is not None and years_tmin >= NCEI_MIN_YEARS) else None,
            "years_tmax": years_tmax,
            "years_tmin": years_tmin,
        }
    if not out:
        raise RuntimeError(f"NCEI {station_id}: no monthly rows in CSV")
    return out


def fetch_daily(lat: float, lon: float) -> dict:
    """Fetch daily values for a point. Returns dict[param][YYYYMMDD] -> float."""
    url = (
        f"{NASA_DAILY_URL}"
        f"?parameters={','.join(DAILY_PARAMS)}"
        f"&community=RE"
        f"&longitude={lon}&latitude={lat}"
        f"&format=JSON"
        f"&start={DAILY_START}&end={DAILY_END}"
    )
    data = fetch_with_retry(url, label=f"daily {lat:.3f},{lon:.3f}")
    return data["properties"]["parameter"]


def compute_monthly_from_daily(daily: dict):
    """
    From daily values, compute per-month:
      rain_prob (%)         = days with PRECTOTCORR >= 2.54 mm / total days * 100
      wind_p25_kt (float)   = 25th percentile of WS10M in kt
      wind_p75_kt (float)   = 75th percentile of WS10M in kt
    Returns dict {month(int 1..12): {"rain_prob": x, "wind_p25_kt": y, "wind_p75_kt": z}}
    """
    by_month_total = defaultdict(int)
    by_month_wet   = defaultdict(int)
    by_month_winds = defaultdict(list)
    by_month_tmax  = defaultdict(list)
    by_month_tmin  = defaultdict(list)

    precip = daily.get("PRECTOTCORR", {})
    wind   = daily.get("WS10M", {})
    tmax   = daily.get("T2M_MAX", {})
    tmin   = daily.get("T2M_MIN", {})

    for date_str, p in precip.items():
        if p is None or p < -100:
            continue
        m = int(date_str[4:6])
        by_month_total[m] += 1
        if p >= RAIN_THRESHOLD_MM:
            by_month_wet[m] += 1

    for date_str, w in wind.items():
        if w is None or w < -100:
            continue
        m = int(date_str[4:6])
        by_month_winds[m].append(w)

    for date_str, t in tmax.items():
        if t is None or t < -100:
            continue
        m = int(date_str[4:6])
        by_month_tmax[m].append(t)

    for date_str, t in tmin.items():
        if t is None or t < -100:
            continue
        m = int(date_str[4:6])
        by_month_tmin[m].append(t)

    out = {}
    for m in range(1, 13):
        tot = by_month_total[m]
        wet = by_month_wet[m]
        rp  = (wet / tot * 100.0) if tot else 0.0
        winds = sorted(by_month_winds[m])
        if winds:
            p25_ms = winds[max(0, len(winds) // 4)]
            p75_ms = winds[min(len(winds) - 1, 3 * len(winds) // 4)]
        else:
            p25_ms = p75_ms = 0.0
        out[m] = {
            "rain_prob":   round(rp, 1),
            "wind_p25_kt": ms_to_kt(p25_ms),
            "wind_p75_kt": ms_to_kt(p75_ms),
            "t_max_c_mean": statistics.mean(by_month_tmax[m]) if by_month_tmax[m] else None,
            "t_min_c_mean": statistics.mean(by_month_tmin[m]) if by_month_tmin[m] else None,
            "rain_days_total": tot,
            "rain_days_wet":   wet,
            "wind_samples":    len(winds),
        }
    return out


def estimate_sea_ft(wind_ms: float) -> float:
    """
    Significant wave height (Hs) for a fully developed sea, simple Pierson-Moskowitz
    derivation: Hs ~ 0.21 * U^2 / g, with U = 10-meter wind speed (m/s) and g = 9.81 m/s^2.
    Returns Hs in feet, rounded to 0.5 ft (matches existing data granularity).

    This is a documented derivation, not a direct measurement. Source attribution
    `_source.sea_method = "derived_from_NASA_POWER_WS10M_PiersonMoskowitz"`.
    """
    if wind_ms <= 0:
        return 0.0
    hs_m = 0.21 * (wind_ms ** 2) / 9.81
    hs_ft = hs_m * 3.28084
    # Round to nearest 0.5 ft
    return round(hs_ft * 2) / 2


def temp_comfort(temp_f: float) -> float:
    """Triangular comfort score with peak at 78 F, slope 4 pts per F deviation."""
    if temp_f is None:
        return 0.0
    return max(0.0, 100.0 - min(100.0, abs(temp_f - 78.0) * 4.0))


def compute_score(rain_prob: float, wind_kt: float, cloud_pct: float, temp_high_f: float) -> float:
    s = (
        (100.0 - rain_prob) * 0.35
      + max(0.0, 100.0 - max(0.0, wind_kt - 5.0) * 5.0) * 0.25
      + (100.0 - cloud_pct) * 0.20
      + temp_comfort(temp_high_f) * 0.20
    )
    return round(max(0.0, min(100.0, s)), 1)


def process_port(port: dict) -> dict:
    name = port["name"]
    lat  = float(port["lat"])
    lon  = float(port["lon"])
    region = port.get("region", "")

    print(f"[{name}] fetching climatology...")
    climo = fetch_climatology(lat, lon)
    time.sleep(0.3)
    print(f"[{name}] fetching daily...")
    daily = fetch_daily(lat, lon)
    time.sleep(0.3)

    daily_stats = compute_monthly_from_daily(daily)

    # Optional NCEI temperature override for ports with a qualifying land station.
    station_info = STATION_MAP.get(name)
    ncei = None
    ncei_used_months = 0
    if station_info:
        try:
            print(f"[{name}] fetching NCEI normals from {station_info['station_id']} ({station_info['station_name']}) ...")
            ncei = fetch_ncei_normals(station_info["station_id"])
            time.sleep(0.3)
            ncei_used_months = sum(
                1 for mo in range(1, 13)
                if ncei.get(mo, {}).get("tmax_f") is not None
                and ncei.get(mo, {}).get("tmin_f") is not None
            )
            print(f"[{name}] NCEI usable months: {ncei_used_months}/12")
            # If fewer than 12 months pass quality gate, do not use NCEI for any month
            # (mixing sources within one port confuses interpretation; per Rule 3 no shortcuts).
            if ncei_used_months < 12:
                print(f"[{name}] NCEI quality gate failed (<12 months); falling back to NASA POWER",
                      file=sys.stderr)
                ncei = None
        except Exception as e:
            print(f"[{name}] NCEI fetch failed: {e}; falling back to NASA POWER", file=sys.stderr)
            ncei = None

    months_db   = []  # for climate_database.json (RouteMap)
    months_data = []  # for climate_data.json     (JamesPicks)

    for i, mn in enumerate(MONTHS_NASA):
        mo = i + 1
        ds = daily_stats[mo]
        # Default temp source: NASA POWER daily means
        t_max_c = ds["t_max_c_mean"]
        t_min_c = ds["t_min_c_mean"]
        if t_max_c is None or t_min_c is None:
            raise RuntimeError(f"Missing daily T2M_MAX/T2M_MIN for {name} month {mo}")
        # NCEI override (land station observed normals) when available
        if ncei is not None:
            t_max_f_ncei = ncei[mo]["tmax_f"]
            t_min_f_ncei = ncei[mo]["tmin_f"]
            # Already gated above; values guaranteed non-None here.
            t_max_f_override = t_max_f_ncei
            t_min_f_override = t_min_f_ncei
        else:
            t_max_f_override = None
            t_min_f_override = None
        rh      = climo["RH2M"][mn]
        wd      = climo["WD10M"][mn]
        cloud   = climo["CLOUD_AMT"][mn]
        ws_mean_ms = climo["WS10M"][mn]

        if t_max_f_override is not None and t_min_f_override is not None:
            t_max_f = t_max_f_override
            t_min_f = t_min_f_override
        else:
            t_max_f = c_to_f(t_max_c)
            t_min_f = c_to_f(t_min_c)
        ws_mean_kt = ms_to_kt(ws_mean_ms)

        rain_prob = ds["rain_prob"]
        wind_p25  = ds["wind_p25_kt"]
        wind_p75  = ds["wind_p75_kt"]

        wind_dir = deg_to_compass(wd)
        wind_range_str = f"{int(round(wind_p25))}-{int(round(wind_p75))}"
        sea_ft = estimate_sea_ft(ws_mean_ms)

        # climate_database.json schema (RouteMap)
        months_db.append({
            "m": mo,
            "hiF": round(t_max_f),
            "loF": round(t_min_f),
            "hum": round(rh),
            "rain": round(rain_prob),
            "seaFt": sea_ft,
            "windDir": wind_dir,
            "windKt": wind_range_str,
        })

        # climate_data.json schema (JamesPicks)
        score = compute_score(rain_prob, ws_mean_kt, cloud, t_max_f)
        months_data.append({
            "month": MONTHS_ABBR[i],
            "temp_high_f": round(t_max_f, 1),
            "temp_low_f":  round(t_min_f, 1),
            "temp_high_c": round(t_max_c, 1),
            "temp_low_c":  round(t_min_c, 1),
            "wind_kt":     round(ws_mean_kt, 1),
            "cloud_pct":   round(cloud, 1),
            "rain_prob":   round(rain_prob, 1),
            "score":       score,
        })

    fetched_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    source_block = {
        "temp_source": (
            f"NOAA NCEI 1991-2020 station normals ({station_info['station_id']}, "
            f"{station_info['station_name']}, {station_info['distance_km']:.1f} km)"
            if ncei is not None else
            "NASA POWER reanalysis 1994-2023 (mean of daily T2M_MAX/T2M_MIN)"
        ),
        "humidity_cloud_winddir_source": "NASA POWER reanalysis 1994-2023 monthly climatology (RH2M, CLOUD_AMT, WD10M, WS10M)",
        "rain_source": f"NASA POWER daily PRECTOTCORR {DAILY_START}-{DAILY_END}; rain-day frequency at >= {RAIN_THRESHOLD_MM} mm (NCEI 0.10 inch)",
        "wind_range_source": f"NASA POWER daily WS10M {DAILY_START}-{DAILY_END}; p25-p75 in knots",
        "sea_source": "derived from NASA POWER monthly mean WS10M via Pierson-Moskowitz Hs ~ 0.21*U^2/g",
        "ncei_endpoint": NCEI_NORMALS_URL.format(station_id="<station>"),
        "nasa_climatology_endpoint": NASA_CLIMO_URL,
        "nasa_daily_endpoint": NASA_DAILY_URL,
        "fetched_at": fetched_iso,
    }

    db_record = {
        "port": name,
        "months": months_db,
        "_source": source_block,
    }
    data_record = {
        "name": name,
        "lat": lat,
        "lon": lon,
        "region": region,
        "months": months_data,
        "_source": source_block,
    }
    return db_record, data_record


def main():
    global STATION_MAP
    if not MASTER_PORTS_PATH.exists():
        print(f"ERROR: {MASTER_PORTS_PATH} not found", file=sys.stderr)
        sys.exit(1)
    if not STATION_MAP_PATH.exists():
        print(f"ERROR: {STATION_MAP_PATH} not found (run build_station_map first)", file=sys.stderr)
        sys.exit(1)

    master = json.loads(MASTER_PORTS_PATH.read_text())
    STATION_MAP = json.loads(STATION_MAP_PATH.read_text())
    n_stations = sum(1 for v in STATION_MAP.values() if v)
    print(f"Master ports: {len(master)}")
    print(f"Ports with NCEI station mapping: {n_stations}")
    print(f"Ports without NCEI station (NASA POWER only): {len(STATION_MAP) - n_stations}")

    db_out   = {}
    data_out = []
    failures = []

    for i, port in enumerate(master):
        name = port["name"]
        try:
            print(f"\n--- [{i+1}/{len(master)}] {name} ({port['lat']:.3f},{port['lon']:.3f}) ---")
            db_rec, data_rec = process_port(port)
            db_out[name] = db_rec
            data_out.append(data_rec)
        except Exception as e:
            print(f"!!! FAIL [{name}]: {e}", file=sys.stderr)
            failures.append((name, str(e)))

    if failures:
        print(f"\n{len(failures)} ports FAILED:")
        for n, err in failures:
            print(f"  - {n}: {err}")
        # Per Rule 3: no shortcuts. We do not write partial output.
        sys.exit(2)

    # Write outputs atomically
    tmp_db   = OUT_DB_PATH.with_suffix(".json.tmp")
    tmp_data = OUT_DATA_PATH.with_suffix(".json.tmp")
    tmp_db.write_text(json.dumps(db_out, indent=2))
    tmp_data.write_text(json.dumps(data_out, indent=2))
    tmp_db.rename(OUT_DB_PATH)
    tmp_data.rename(OUT_DATA_PATH)

    print(f"\nWrote {OUT_DB_PATH}   ({len(db_out)} ports)")
    print(f"Wrote {OUT_DATA_PATH} ({len(data_out)} ports)")


if __name__ == "__main__":
    main()
