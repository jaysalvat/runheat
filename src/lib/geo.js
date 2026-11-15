// GeoJSON for the map layers, built once per dataset.
import { HEAT_STEP_M } from './config.js';

const props = (r) => ({ year: r.year, d: r.d, src: r.src, sp: r.sp });

// Rounded corners for display. The stored tracks are simplified (Douglas-Peucker, 4 m), which
// leaves a sharp angle at every kept point. Chaikin's corner cutting, applied twice: each corner
// is replaced by two points a quarter of the way along its segments, but at most SMOOTH_CUT_M
// metres so long straight stretches stay put. Nearly straight corners are kept as is.
const SMOOTH_CUT_M = 6,
  SMOOTH_MIN_TURN = 0.06; // radians, ~3.5°
function chaikin(s) {
  if (s.length < 3) return s;
  const kx = 111320 * Math.cos((s[0][1] * Math.PI) / 180),
    ky = 110540;
  const out = [s[0]];
  for (let i = 1; i < s.length - 1; i++) {
    const [ax, ay] = s[i - 1],
      [bx, by] = s[i],
      [cx, cy] = s[i + 1];
    const ux = (bx - ax) * kx,
      uy = (by - ay) * ky,
      vx = (cx - bx) * kx,
      vy = (cy - by) * ky;
    const l1 = Math.hypot(ux, uy),
      l2 = Math.hypot(vx, vy);
    const turn = l1 && l2 ? Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (l1 * l2)))) : 0;
    if (turn < SMOOTH_MIN_TURN) {
      out.push(s[i]);
      continue;
    }
    const t1 = Math.min(0.25, SMOOTH_CUT_M / l1),
      t2 = Math.min(0.25, SMOOTH_CUT_M / l2);
    out.push([bx + (ax - bx) * t1, by + (ay - by) * t1], [bx + (cx - bx) * t2, by + (cy - by) * t2]);
  }
  out.push(s[s.length - 1]);
  return out;
}
export const smooth = (s) => chaikin(chaikin(s));

export function buildGeo(runs, zones) {
  const lines = {
    type: 'FeatureCollection',
    features: runs.map((r) => ({
      type: 'Feature',
      properties: { ...props(r), km: r.km, w: r.w || 1 },
      geometry: { type: 'MultiLineString', coordinates: r.segs.map(smooth) },
    })),
  };

  // New paths: stretches covered for the first time (r.ex, computed by the importer)
  const explore = { type: 'FeatureCollection', features: [] };
  for (const r of runs)
    for (const [si, a, b] of r.ex || [])
      explore.features.push({
        type: 'Feature',
        properties: props(r),
        geometry: { type: 'LineString', coordinates: smooth(r.segs[si].slice(a, b + 1)) },
      });

  // Each heat point takes the weight of the place it lies in (r.pz, else the run's main place)
  const zoneW = zones.map((z) => z.w);
  const w = (r, si, pi) => zoneW[r.pz ? r.pz[si][pi] : r.z] ?? r.w ?? 1;

  // Raw hotspots: one heat point per stored track point
  const raw = { type: 'FeatureCollection', features: [] };
  for (const r of runs)
    r.segs.forEach((s, si) =>
      s.forEach((c, pi) => {
        raw.features.push({
          type: 'Feature',
          properties: { ...props(r), w: w(r, si, pi) },
          geometry: { type: 'Point', coordinates: c },
        });
      }),
    );

  // Heatmap points, resampled every HEAT_STEP_M metres along each track: simplified tracks are
  // dense in bends and pauses and sparse on straights. A run counts at most once per cell, so
  // the heat measures how many runs went through a spot, not how many points were recorded.
  const points = { type: 'FeatureCollection', features: [] };
  for (const r of runs) {
    const seen = new Set();
    r.segs.forEach((s, si) => {
      const kx = 111320 * Math.cos((s[0][1] * Math.PI) / 180),
        ky = 110540;
      let carry = 0; // distance left before the next point
      for (let pi = 0; pi < s.length - 1; pi++) {
        const [x1, y1] = s[pi],
          [x2, y2] = s[pi + 1];
        const len = Math.hypot((x2 - x1) * kx, (y2 - y1) * ky);
        for (let dist = carry; dist < len; dist += HEAT_STEP_M) {
          const t = dist / len,
            x = x1 + (x2 - x1) * t,
            y = y1 + (y2 - y1) * t;
          const cell = Math.round((x * kx) / HEAT_STEP_M) + ',' + Math.round((y * ky) / HEAT_STEP_M);
          if (seen.has(cell)) continue; // same run, same spot: count once
          seen.add(cell);
          points.features.push({
            type: 'Feature',
            properties: { ...props(r), w: w(r, si, pi) },
            geometry: { type: 'Point', coordinates: [x, y] },
          });
        }
        carry = (carry - len) % HEAT_STEP_M;
        if (carry < 0) carry += HEAT_STEP_M;
      }
    });
  }
  return { lines, explore, raw, points };
}

// Densest area (~5 km grid) for the initial view → [[west, south], [east, north]]
export function mainArea(runs) {
  if (!runs.length) return null;
  const cells = new Map();
  for (const r of runs) {
    const [lon, lat] = r.segs[0][0];
    const k = Math.round(lon / 0.05) + ',' + Math.round(lat / 0.05);
    const c = cells.get(k) || { n: 0, pts: [] };
    c.n++;
    c.pts.push([lon, lat]);
    cells.set(k, c);
  }
  const best = [...cells.values()].sort((a, b) => b.n - a.n)[0];
  const ids = new Set(best.pts.map((p) => p.join()));
  const xs = [],
    ys = [];
  for (const r of runs)
    if (ids.has(r.segs[0][0].join()))
      for (const s of r.segs)
        for (const [x, y] of s) {
          xs.push(x);
          ys.push(y);
        }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))];
  // 2–98% percentiles: ignores the few outlier tracks
  return [
    [q(xs, 0.02), q(ys, 0.02)],
    [q(xs, 0.98), q(ys, 0.98)],
  ];
}
