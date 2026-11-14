#!/usr/bin/env python3
"""
Builds web/runs.json from all GPX files found in data/*/gpx/.

- splits tracks at GPS jumps (> 300 m between two points: signal loss)
- simplifies each segment (Ramer-Douglas-Peucker, tolerance ~4 m)
- rounds coordinates to 5 decimals (~1 m)

Output format (compact):
  {"runs": [{"id", "date", "src", "km", "segs": [[[lon, lat], ...], ...]}, ...]}
"""
import glob
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "web" / "runs.json"
NS = "{http://www.topografix.com/GPX/1/1}"
MAX_JUMP_M = 300
EPSILON_M = 4
MIN_SEG_POINTS = 2


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def rdp(points, eps_m):
    """Iterative Douglas-Peucker, in a local equirectangular projection (meters)."""
    if len(points) < 3:
        return points
    lat0 = math.radians(points[0][1])
    kx, ky = 111320 * math.cos(lat0), 110540
    xy = [(p[0] * kx, p[1] * ky) for p in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        (x1, y1), (x2, y2) = xy[s], xy[e]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-9
        dmax, idx = 0.0, -1
        for i in range(s + 1, e):
            d = abs(dy * (xy[i][0] - x1) - dx * (xy[i][1] - y1)) / norm
            if d > dmax:
                dmax, idx = d, i
        if dmax > eps_m and idx > 0:
            keep[idx] = True
            stack.append((s, idx))
            stack.append((idx, e))
    return [p for p, k in zip(points, keep) if k]


def read_gpx(path):
    root = ET.parse(path).getroot()
    pts = []
    for tp in root.iter(f"{NS}trkpt"):
        lat, lon = float(tp.get("lat")), float(tp.get("lon"))
        if lat == 0 and lon == 0:
            continue
        pts.append((lon, lat))
    return pts


def split_jumps(pts):
    segs, cur = [], []
    for p in pts:
        if cur and haversine(cur[-1], p) > MAX_JUMP_M:
            segs.append(cur)
            cur = []
        cur.append(p)
    if cur:
        segs.append(cur)
    return [s for s in segs if len(s) >= MIN_SEG_POINTS]


GEONAMES = ROOT / "data" / "geonames" / "cities1000.txt"
# Excluded GeoNames codes: neighborhoods (PPLX), abandoned/historical/destroyed places
EXCLUDED_CODES = {"PPLX", "PPLQ", "PPLH", "PPLW", "PPLCH"}
MIN_KM_IN_COMMUNE = 1.0   # a run counts for a place if it covers ≥ 1 km there
CELL_M = 25               # cell size for measuring repetition
SAMPLE_M = 20             # sampling step along tracks
MAX_ZONE_WEIGHT = 20      # cap: a place with a single run shouldn't turn red


def load_cities():
    """GeoNames (localities > 1000 pop.) indexed by 1° cell for local lookup."""
    grid = {}
    if not GEONAMES.exists():
        return grid
    with open(GEONAMES, encoding="utf-8") as f:
        for line in f:
            c = line.split("\t")
            if c[7] in EXCLUDED_CODES:
                continue
            lat, lon = float(c[4]), float(c[5])
            grid.setdefault((math.floor(lon), math.floor(lat)), []).append((lon, lat, c[1], c[8]))
    return grid


def nearest_city_fast(grid, lon, lat):
    """Nearest town (equirectangular distance, good enough at this scale)."""
    k = math.cos(math.radians(lat))
    best, bd = None, 1e18
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for city in grid.get((math.floor(lon) + dx, math.floor(lat) + dy), []):
                d = ((city[0] - lon) * k) ** 2 + (city[1] - lat) ** 2
                if d < bd:
                    best, bd = city, d
    return best


def flag(cc):
    return "".join(chr(0x1F1E6 + ord(ch) - 65) for ch in cc.upper()) if len(cc) == 2 else ""


def percentile(sorted_vals, p):
    return sorted_vals[int(p * (len(sorted_vals) - 1))]


def build_zones(runs):
    """One place per town crossed.

    Each point (every ~20 m) is assigned to the nearest locality. A run belongs to
    every place where it covers ≥ 1 km (so it can be in several places).
    Adds to each run:
      zs : places it belongs to
      z  : main place (where it covers the most km) → track weight
      pz : place of each segment point → heatmap point weight
      w  : weight of the main place
    """
    grid = load_cities()
    cities = {}   # key "name|country" -> (name, country)
    cache = {}

    def commune(x, y):
        k = (round(x, 3), round(y, 3))  # cache per ~100 m cell
        if k not in cache:
            c = nearest_city_fast(grid, x, y)
            if c:
                key = f"{c[2]}|{c[3]}"
                cities[key] = (c[2], c[3])
                cache[k] = key
            else:
                cache[k] = f"{y:.1f}, {x:.1f}|"
                cities[cache[k]] = (cache[k][:-1], "")
        return cache[k]

    acc = {}  # key -> {runs, km, cells, dates}
    for ri, r in enumerate(runs):
        km_by, cells_by = {}, {}
        for s in r["segs"]:
            lat0 = math.radians(s[0][1])
            kx, ky = 111320 * math.cos(lat0), 110540
            for (x1, y1), (x2, y2) in zip(s, s[1:]):
                length = math.hypot((x2 - x1) * kx, (y2 - y1) * ky)
                n = max(1, int(length / SAMPLE_M))
                for i in range(n):
                    x, y = x1 + (x2 - x1) * (i + .5) / n, y1 + (y2 - y1) * (i + .5) / n
                    key = commune(x, y)
                    km_by[key] = km_by.get(key, 0) + length / n / 1000
                    cells_by.setdefault(key, set()).add((int(x * kx // CELL_M), int(y * ky // CELL_M)))
        r["_km"] = km_by
        r["_pk"] = [[commune(x, y) for x, y in s] for s in r["segs"]]
        for key, km in km_by.items():
            if km >= MIN_KM_IN_COMMUNE:
                a = acc.setdefault(key, {"runs": [], "km": 0.0, "cells": {}})
                a["runs"].append(ri)
                a["km"] += km
                for cell in cells_by[key]:
                    a["cells"][cell] = a["cells"].get(cell, 0) + 1

    keys = sorted(acc, key=lambda k: (-len(acc[k]["runs"]), -acc[k]["km"]))
    index = {k: i for i, k in enumerate(keys)}
    zones = []
    for key in keys:
        a = acc[key]
        name, cc = cities[key]
        member = [runs[i] for i in a["runs"]]
        # Bounds: only the points of these runs that lie within the place
        xs, ys = [], []
        for r in member:
            for s, ks in zip(r["segs"], r["_pk"]):
                for (x, y), k in zip(s, ks):
                    if k == key:
                        xs.append(x); ys.append(y)
        if len(xs) < 2:
            xs = [x for r in member for s in r["segs"] for x, _ in s]
            ys = [y for r in member for s in r["segs"] for _, y in s]
        xs.sort(); ys.sort()
        p0, p1 = (0.02, 0.98) if len(xs) >= 50 else (0, 1)
        dates = sorted(r["date"] for r in member)
        levels = sorted(a["cells"].values()) or [1]
        zones.append({
            "name": name, "label": name, "cc": cc, "flag": flag(cc),
            "n": len(member), "km": round(a["km"], 1),
            "from": dates[0], "to": dates[-1],
            "bbox": [percentile(xs, p0), percentile(ys, p0), percentile(xs, p1), percentile(ys, p1)],
            "level": max(1, percentile(levels, .99)),
        })

    # Weight: repetition level of the main place / level of this place (capped)
    ref = zones[0]["level"] if zones else 1
    for z in zones:
        z["w"] = round(min(MAX_ZONE_WEIGHT, max(1.0, ref / z["level"])), 2)

    for r in runs:
        km_by = r.pop("_km")
        pk = r.pop("_pk")
        r["zs"] = sorted(index[k] for k, km in km_by.items() if k in index and km >= MIN_KM_IN_COMMUNE)
        in_zone = [k for k in km_by if k in index]
        r["z"] = index[max(in_zone, key=lambda k: km_by[k])] if in_zone else -1
        r["w"] = zones[r["z"]]["w"] if r["z"] >= 0 else 1
        r["pz"] = [[index.get(k, r["z"]) for k in ks] for ks in pk]
    return zones


NIKE_RAW = ROOT / "data" / "nike" / "raw"
MIN_PACE_S_PER_KM = 180   # a km under 3:00 = GPS error (signal jump), window ignored


def local_tz(lon):
    from zoneinfo import ZoneInfo
    # Good enough for this data: Portugal west of -6°, otherwise Paris time
    return ZoneInfo("Europe/Lisbon" if lon < -6 else "Europe/Paris")


def best_window(split_ts, start_ms, n_km):
    """Best time (s) over n_km consecutive km, from the per-km split times."""
    ts = [start_ms] + split_ts
    laps = [(b - a) / 1000 for a, b in zip(ts, ts[1:])]
    best = None
    for i in range(len(laps) - n_km + 1):
        window = laps[i:i + n_km]
        if min(window) < MIN_PACE_S_PER_KM:   # impossible km in the window: bad GPS
            continue
        t = sum(window)
        if best is None or t < best:
            best = t
    return round(best) if best else None


def enrich_nike(run):
    """Adds local start time, duration, elevation gain, best 5/10 km from the raw Nike export."""
    from datetime import datetime
    f = NIKE_RAW / f"{run['id']}.json"
    if not f.exists():
        return
    d = json.loads(f.read_text())
    summ = {s["metric"] + ":" + s["summary"]: s["value"] for s in d.get("summaries", [])}
    lon = run["segs"][0][0][0]
    start = datetime.fromtimestamp(d["start_epoch_ms"] / 1000, tz=local_tz(lon))
    run["t"] = start.strftime("%Y-%m-%dT%H:%M")
    run["dur"] = round(d.get("active_duration_ms", 0) / 1000)
    if "distance:total" in summ:
        run["km"] = round(summ["distance:total"], 2)
    if "ascent:total" in summ:
        run["dp"] = round(summ["ascent:total"])
    splits = sorted(int(m["timestamp"]) for m in d.get("moments", []) if m.get("key") == "split_km")
    for n, k in ((5, "b5"), (10, "b10")):
        b = best_window(splits, d["start_epoch_ms"], n)
        if b:
            run[k] = b


EXPLORE_CELL_M = 25   # ~25 m cells for spotting paths already run
EXPLORE_TOL = 1       # tolerance: ±1 cell around each pass (GPS drift ~10–20 m)


def explore(runs):
    """"New" km of each run: covered in cells never visited before.

    Runs are processed in chronological order. Each point (every ~20 m) falls in a
    cell; if that cell was never visited, the distance counts as new.
    A pass also marks neighboring cells as known, so that GPS drift along the same
    path isn't mistaken for exploration.
    Adds nk (new km) and gk (km measured on the track, base for the percentage).
    """
    seen = set()
    ky = 110540
    for r in sorted(runs, key=lambda r: r.get("t", r["date"])):
        new_m = tot_m = 0.0
        mine = set()   # cells of this run: marked as known only at the end
        ranges = []    # new stretches: [segment index, first point, last point]
        for si, s in enumerate(r["segs"]):
            band = round(s[0][1])                      # fixed projection per 1° latitude band
            kx = 111320 * math.cos(math.radians(band))
            for pi, ((x1, y1), (x2, y2)) in enumerate(zip(s, s[1:])):
                length = math.hypot((x2 - x1) * kx, (y2 - y1) * ky)
                n = max(1, int(length / SAMPLE_M))
                seg_new = 0.0
                for i in range(n):
                    x, y = x1 + (x2 - x1) * (i + .5) / n, y1 + (y2 - y1) * (i + .5) / n
                    cx, cy = int(x * kx // EXPLORE_CELL_M), int(y * ky // EXPLORE_CELL_M)
                    step = length / n
                    tot_m += step
                    key = (band, cx, cy)
                    # new if never seen before this run (an out-and-back counts only once)
                    if key not in seen and key not in mine:
                        new_m += step
                        seg_new += step
                    mine.add(key)
                # stretch pi → pi+1 is new if at least half of its length is
                if length and seg_new / length >= .5:
                    if ranges and ranges[-1][0] == si and ranges[-1][2] == pi:
                        ranges[-1][2] = pi + 1
                    else:
                        ranges.append([si, pi, pi + 1])
        for band, cx, cy in mine:
            for dx in range(-EXPLORE_TOL, EXPLORE_TOL + 1):
                for dy in range(-EXPLORE_TOL, EXPLORE_TOL + 1):
                    seen.add((band, cx + dx, cy + dy))
        r["nk"] = round(new_m / 1000, 2)
        if ranges:
            r["ex"] = ranges
        r["gk"] = round(tot_m / 1000, 2)


def main():
    files = sorted(glob.glob(str(ROOT / "data" / "*" / "gpx" / "*.gpx")))
    runs, n_in, n_out = [], 0, 0
    for f in files:
        p = Path(f)
        src = p.parent.parent.name  # nike / strava
        date, _, rid = p.stem.partition("_")
        pts = read_gpx(f)
        n_in += len(pts)
        if len(pts) < 2:
            continue
        km = sum(haversine(a, b) for a, b in zip(pts, pts[1:]) if haversine(a, b) <= MAX_JUMP_M) / 1000
        segs = []
        for seg in split_jumps(pts):
            s = rdp(seg, EPSILON_M)
            segs.append([[round(x, 5), round(y, 5)] for x, y in s])
            n_out += len(s)
        if segs:
            runs.append({"id": rid, "date": date, "src": src, "km": round(km, 2), "segs": segs})

    runs.sort(key=lambda r: r["date"])
    for r in runs:
        if r["src"] == "nike":
            enrich_nike(r)
    explore(runs)
    zones = build_zones(runs)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"runs": runs, "zones": zones}, separators=(",", ":"), ensure_ascii=False))
    print(f"{len(runs)} runs, {n_in} → {n_out} points, {OUT.stat().st_size / 1e6:.1f} MB → {OUT}")
    print(f"{len(zones)} places:")
    for z in zones[:30]:
        print(f"  {z['flag']} {z['name']:<28} {z['n']:>4} runs  {z['km']:>7.0f} km  {z['from'][:4]}–{z['to'][:4]}"
              f"  repetition {z['level']:>4}  weight ×{z['w']}")


if __name__ == "__main__":
    main()
