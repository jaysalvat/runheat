// Web Worker: reads GPX / TCX / FIT files and export archives (.zip, .gz), then rebuilds
// the derived data (new paths, places).
// Everything runs in the browser: no file or coordinate is sent anywhere.
//
// Messages in:
//   { type: 'import', files: File[], runs: run[] }  existing runs (for duplicates + rebuild)
//   { type: 'build', runs: run[] }                   rebuild only
// Messages out:
//   { type: 'progress', text, done, total }
//   { type: 'done', added: run[], data: { runs, zones }, report }
//   { type: 'error', message }
importScripts('https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js');

// ---------- Constants ----------
const MAX_JUMP_M = 300;          // > 300 m between two points: signal loss, split the track
const EPSILON_M = 4;             // Douglas-Peucker tolerance
const MIN_SEG_POINTS = 2;
const MIN_KM_IN_COMMUNE = 1.0;   // a run counts for a place if it covers ≥ 1 km there
const CELL_M = 25;               // cell size for measuring repetition
const SAMPLE_M = 20;             // sampling step along tracks
const MAX_ZONE_WEIGHT = 20;      // cap: a place with a single run shouldn't turn red
const MIN_PACE_S_PER_KM = 180;   // a km under 3:00 = GPS error, best-effort window ignored
const EXPLORE_CELL_M = 25;
const EXPLORE_TOL = 1;
const DUP_MS = 2 * 60 * 1000;    // same start time ±2 min = same run (e.g. Nike + Strava)
const MOVING_MAX_GAP_MS = 60000; // longer gap between two points = pause
const MOVING_MIN_SPEED = 0.8;    // m/s, below that we're standing still
const ELE_THRESHOLD_M = 3;       // hysteresis for the elevation gain
const FIT_EPOCH_S = 631065600;   // 1989-12-31T00:00:00Z

const RAD = Math.PI / 180;
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

function haversine(a, b) {
  const [lon1, lat1, lon2, lat2] = [a[0] * RAD, a[1] * RAD, b[0] * RAD, b[1] * RAD];
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// Iterative Douglas-Peucker, in a local equirectangular projection (metres)
function rdp(points, eps) {
  if (points.length < 3) return points;
  const kx = 111320 * Math.cos(points[0][1] * RAD), ky = 110540;
  const xy = points.map(p => [p[0] * kx, p[1] * ky]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = xy[s], [x2, y2] = xy[e];
    const dx = x2 - x1, dy = y2 - y1, norm = Math.hypot(dx, dy) || 1e-9;
    let dmax = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * (xy[i][0] - x1) - dx * (xy[i][1] - y1)) / norm;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

function splitJumps(pts) {
  const segs = [];
  let cur = [];
  for (const p of pts) {
    if (cur.length && haversine(cur[cur.length - 1], p) > MAX_JUMP_M) { segs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) segs.push(cur);
  return segs.filter(s => s.length >= MIN_SEG_POINTS);
}

// ---------- Places (GeoNames, loaded on first use) ----------
let places = null;   // { grid: Map("lon,lat" 1° cell → [[lon, lat, name, cc, tz]]) }
async function loadPlaces() {
  if (places) return places;
  post({ type: 'progress', text: 'Loading place names…' });
  const res = await fetch('places.tsv');
  if (!res.ok) throw new Error('places.tsv not found');
  const lines = (await res.text()).split('\n');
  const tzs = lines[0].split('\t');
  const grid = new Map();
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    if (c.length < 5) continue;
    const lat = +c[3], lon = +c[4];
    const k = Math.floor(lon) + ',' + Math.floor(lat);
    let cell = grid.get(k);
    if (!cell) grid.set(k, cell = []);
    cell.push([lon, lat, c[0], c[1], tzs[+c[2]]]);
  }
  return places = { grid };
}

// Nearest town (equirectangular distance, good enough at this scale)
function nearestCity(lon, lat) {
  const k = Math.cos(lat * RAD), fx = Math.floor(lon), fy = Math.floor(lat);
  let best = null, bd = 1e18;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const c of places.grid.get((fx + dx) + ',' + (fy + dy)) || []) {
      const d = ((c[0] - lon) * k) ** 2 + (c[1] - lat) ** 2;
      if (d < bd) { best = c; bd = d; }
    }
  }
  return best;
}

const flag = cc => cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '';
const percentile = (sorted, p) => sorted[Math.floor(p * (sorted.length - 1))];

// ---------- Local time ----------
const fmts = new Map();
function localTime(ms, tz) {
  let f = fmts.get(tz);
  if (!f) {
    const opts = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    try { f = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: tz || 'UTC' }); }
    catch (e) { f = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: 'UTC' }); }   // unknown zone name
    fmts.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// ---------- File formats ----------
const tag = (s, name) => { const m = s.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`)); return m ? m[1] : null; };
const num = v => (v == null || v === '' ? null : +v);
const time = v => { if (!v) return null; const t = Date.parse(v); return isNaN(t) ? null : t; };

function parseGpx(text) {
  const pts = [];
  const re = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  let m;
  while ((m = re.exec(text))) {
    const lat = m[1].match(/\blat\s*=\s*["']([^"']+)/), lon = m[1].match(/\blon\s*=\s*["']([^"']+)/);
    if (!lat || !lon) continue;
    const body = m[2] || '';
    pts.push({ lat: +lat[1], lon: +lon[1], ele: num(tag(body, 'ele')), t: time(tag(body, 'time')) });
  }
  const trk = text.indexOf('<trk');
  const type = trk >= 0 ? tag(text.slice(trk, trk + 2000), 'type') : null;
  const creator = (text.match(/<gpx\b[^>]*\bcreator\s*=\s*["']([^"']*)/) || [])[1] || '';
  return { pts, sport: type, creator, start: time(tag(text.slice(0, 2000), 'time')) };
}

function parseTcx(text) {
  const pts = [];
  const re = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g;
  let m;
  while ((m = re.exec(text))) {
    const b = m[1];
    const lat = num(tag(b, 'LatitudeDegrees')), lon = num(tag(b, 'LongitudeDegrees'));
    if (lat == null || lon == null) continue;
    pts.push({ lat, lon, ele: num(tag(b, 'AltitudeMeters')), t: time(tag(b, 'Time')), dist: num(tag(b, 'DistanceMeters')) });
  }
  let timer = 0;
  for (const x of text.matchAll(/<TotalTimeSeconds>([^<]+)<\/TotalTimeSeconds>/g)) timer += +x[1];
  const sport = (text.match(/<Activity\s+Sport\s*=\s*"([^"]*)"/) || [])[1] || null;
  const creator = (text.match(/<Creator[\s\S]*?<Name>([^<]*)<\/Name>/) || [])[1] || '';
  return { pts, sport, creator, timer: timer || null };
}

// Nike Run Club activity, as returned by Nike's API (the "raw" JSON of the Nike export)
function parseNike(d) {
  if (!d || !d.start_epoch_ms || !Array.isArray(d.summaries) || !('metrics' in d || 'metric_types' in d)) return null;
  const metric = type => (d.metrics || []).find(m => m.type === type);
  const byTime = m => new Map((m ? m.values : []).map(v => [v.start_epoch_ms, v.value]));
  const lats = byTime(metric('latitude')), lons = byTime(metric('longitude'));
  const pts = [...lats.keys()].filter(t => lons.has(t)).sort((a, b) => a - b)
    .map(t => ({ t, lat: lats.get(t), lon: lons.get(t), ele: null }));
  const summ = Object.fromEntries(d.summaries.map(x => [x.metric + ':' + x.summary, x.value]));
  const splits = (d.moments || []).filter(m => m.key === 'split_km').map(m => +m.timestamp).sort((a, b) => a - b);
  return { pts, start: d.start_epoch_ms, deleted: !!d.delete_indicator, sport: d.type, creator: 'nike',
    timer: d.active_duration_ms ? d.active_duration_ms / 1000 : null,
    dist: summ['distance:total'] != null ? summ['distance:total'] * 1000 : null,
    ascent: summ['ascent:total'] ?? null, splits: splits.length ? splits : null };
}

// Minimal FIT decoder: only reads file_id, sport, session and record messages
const FIT_SPORTS = { 1: 'running', 2: 'cycling', 5: 'swimming', 11: 'walking', 17: 'hiking' };
const FIT_MAKERS = { 1: 'garmin', 23: 'suunto', 123: 'polar', 265: 'strava', 294: 'coros', 255: 'fit' };
function parseFit(buf) {
  if (buf.length < 12 || String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) !== '.FIT') throw new Error('not a FIT file');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hs = buf[0], end = Math.min(buf.length, hs + dv.getUint32(4, true));
  const defs = [], pts = [], out = { pts, sport: null, maker: null, start: null, timer: null, dist: null, ascent: null };
  let p = hs, lastTs = 0;
  const read = (q, f, le) => {
    const t = f.base & 0x1f;
    if (f.size === 1) { const v = t === 1 ? dv.getInt8(q) : buf[q]; return v === (t === 1 ? 0x7f : 0xff) ? null : v; }
    if (f.size === 2) { const v = t === 3 ? dv.getInt16(q, le) : dv.getUint16(q, le); return v === (t === 3 ? 0x7fff : 0xffff) ? null : v; }
    if (f.size === 4) {
      if (t === 8) return dv.getFloat32(q, le);
      const v = t === 5 ? dv.getInt32(q, le) : dv.getUint32(q, le);
      return v === (t === 5 ? 0x7fffffff : 0xffffffff) ? null : v;
    }
    return null;
  };
  while (p < end) {
    const h = buf[p++];
    let def, cts = null;
    if (h & 0x80) {                               // compressed timestamp header
      def = defs[(h >> 5) & 3];
      const off = h & 0x1f;
      cts = (lastTs - (lastTs & 0x1f)) + off + (off < (lastTs & 0x1f) ? 0x20 : 0);
      lastTs = cts;
    } else if (h & 0x40) {                        // definition message
      const le = buf[p + 1] === 0, gnum = dv.getUint16(p + 2, le), n = buf[p + 4];
      p += 5;
      const fields = [];
      let len = 0;
      for (let i = 0; i < n; i++, p += 3) { fields.push({ num: buf[p], size: buf[p + 1], base: buf[p + 2] }); len += buf[p + 1]; }
      if (h & 0x20) { const nd = buf[p++]; for (let i = 0; i < nd; i++, p += 3) len += buf[p + 1]; }
      defs[h & 0x0f] = { le, gnum, fields, len };
      continue;
    } else def = defs[h & 0x0f];
    if (!def) throw new Error('corrupt FIT file');
    const v = {};
    let q = p;
    for (const f of def.fields) { v[f.num] = read(q, f, def.le); q += f.size; }
    p += def.len;
    if (v[253] != null) lastTs = v[253];
    const ts = v[253] ?? cts;
    if (def.gnum === 20) {                        // record
      if (v[0] == null || v[1] == null) continue;
      const alt = v[78] ?? v[2];
      pts.push({ lat: v[0] * 180 / 2 ** 31, lon: v[1] * 180 / 2 ** 31, t: ts != null ? (ts + FIT_EPOCH_S) * 1000 : null,
        ele: alt != null ? alt / 5 - 500 : null, dist: v[5] != null ? v[5] / 100 : null });
    } else if (def.gnum === 18) {                 // session
      if (out.sport == null) out.sport = v[5];
      if (v[2] != null && out.start == null) out.start = (v[2] + FIT_EPOCH_S) * 1000;
      if (v[8] != null) out.timer = (out.timer || 0) + v[8] / 1000;
      if (v[9] != null) out.dist = (out.dist || 0) + v[9] / 100;
      if (v[22] != null) out.ascent = (out.ascent || 0) + v[22];
    } else if (def.gnum === 12 && out.sport == null) out.sport = v[0];
    else if (def.gnum === 0 && v[1] != null) out.maker = v[1];
  }
  out.creator = FIT_MAKERS[out.maker] || '';
  out.sport = out.sport == null || out.sport === 0 ? null : (FIT_SPORTS[out.sport] || 'other');
  return out;
}

// Activity type: 'run' | 'ride' | 'walk' (walks and hikes) | 'swim' | 'other' (unknown type = run)
// Accepts Strava / GPX / TCX names in a few languages and Strava's old numeric GPX types.
function sportOf(type) {
  if (type == null || type === '') return 'run';
  const s = String(type).toLowerCase().trim();
  // Grouped by family: run + trail, bike + MTB / gravel / e-bike / virtual, walk + hike / snowshoe
  if (/swim|natation|nage|schwimm|nuoto|nataci|open.?water/.test(s)) return 'swim';
  if (/bik|ride|cycl|vélo|velo|vtt|mtb|gravel|rad|bici|^1$/.test(s)) return 'ride';
  if (/run|jog|trail|course|lauf|carrera|corsa|corrida|hardloop|löp|bieg|^9$/.test(s)) return 'run';
  if (/hik|rando|trek|wander|escurs|senderi|snowshoe|raquette|walk|marche|gehen|spazier|camin|passeg/.test(s)) return 'walk';
  return 'other';
}

function sourceOf(creator, fallback) {
  const c = (creator || '').toLowerCase();
  for (const s of ['strava', 'garmin', 'polar', 'suunto', 'coros', 'wahoo']) if (c.includes(s)) return s;
  if (/nike|nrc/.test(c)) return 'nike';
  return fallback;
}

// ---------- Track → run ----------
function makeRun(r, src) {
  const pts = r.pts.filter(p => isFinite(p.lat) && isFinite(p.lon) && !(p.lat === 0 && p.lon === 0) &&
    Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
  if (pts.length < 2) return { skip: 'noGps' };
  const start = r.start ?? pts.find(p => p.t != null)?.t;
  if (start == null) return { skip: 'noTime' };
  const coords = pts.map(p => [p.lon, p.lat]);

  // Distance, moving time and per-km split times, ignoring GPS jumps
  let m = 0, moving = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const d = haversine(coords[i - 1], coords[i]);
    const step = d <= MAX_JUMP_M ? d : 0;
    m += step;
    cum.push(m);
    const dt = pts[i].t != null && pts[i - 1].t != null ? pts[i].t - pts[i - 1].t : 0;
    if (dt > 0 && dt <= MOVING_MAX_GAP_MS && step / (dt / 1000) >= MOVING_MIN_SPEED) moving += dt;
  }
  const useDist = pts.every(p => p.dist != null);   // device distance (FIT/TCX) is more accurate
  const dist = useDist ? pts.map(p => p.dist - pts[0].dist) : cum;
  const splits = r.splits || [];   // Nike gives its own per-km split times
  if (!r.splits) for (let i = 1, k = 1; i < pts.length; i++) {
    while (dist[i] >= k * 1000 && pts[i].t != null && pts[i - 1].t != null) {
      const f = (k * 1000 - dist[i - 1]) / ((dist[i] - dist[i - 1]) || 1);
      splits.push(pts[i - 1].t + f * (pts[i].t - pts[i - 1].t));
      k++;
    }
  }

  const segs = splitJumps(coords).map(s => rdp(s, EPSILON_M).map(([x, y]) => [round(x, 5), round(y, 5)]));
  if (!segs.length) return { skip: 'noGps' };
  const city = nearestCity(coords[0][0], coords[0][1]);
  const t = localTime(start, city && city[4]);
  const run = { id: `${src}-${start}`, date: t.slice(0, 10), src, sp: r.sp,
    km: round(r.dist ? r.dist / 1000 : m / 1000, 2), segs, t, ts: start };
  const dur = r.timer || moving / 1000;
  if (dur) run.dur = Math.round(dur);
  const dp = r.ascent ?? elevationGain(pts);
  if (dp != null) run.dp = Math.round(dp);
  if (r.sp === 'run') for (const [n, k] of [[5, 'b5'], [10, 'b10']]) {
    const b = bestWindow(splits, start, n);
    if (b) run[k] = b;
  }
  return { run };
}

function elevationGain(pts) {
  const e = pts.map(p => p.ele).filter(v => v != null && isFinite(v));
  if (e.length < 10) return null;
  // light smoothing (5 points), then hysteresis to ignore GPS altitude noise
  const s = e.map((_, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(e.length - 1, i + 2); j++) { a += e[j]; n++; } return a / n; });
  let gain = 0, ref = s[0];
  for (const v of s) {
    if (v > ref + ELE_THRESHOLD_M) { gain += v - ref; ref = v; } else if (v < ref) ref = v;
  }
  return gain;
}

// Best time (s) over n consecutive km, from the per-km split times
function bestWindow(splits, start, n) {
  const ts = [start, ...splits];
  const laps = ts.slice(1).map((b, i) => (b - ts[i]) / 1000);
  let best = null;
  for (let i = 0; i + n <= laps.length; i++) {
    const w = laps.slice(i, i + n);
    if (Math.min(...w) < MIN_PACE_S_PER_KM) continue;   // impossible km in the window: bad GPS
    const t = w.reduce((a, b) => a + b, 0);
    if (best == null || t < best) best = t;
  }
  return best ? Math.round(best) : null;
}

// ---------- Files and archives ----------
const TRACK_RE = /\.(gpx|tcx|fit|json)(\.gz)?$/i;   // .json: Nike export (other JSON files are ignored)
const base = name => name.split('/').pop();

// Strava's activities.csv: file name → activity type
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function stravaTypes(text) {
  const rows = parseCsv(text);
  const head = (rows[0] || []).map(h => h.toLowerCase());
  const ti = head.findIndex(h => h.includes('activity type') || h === 'type');
  const fi = head.findIndex(h => h.includes('filename'));
  const map = new Map();
  if (ti < 0 || fi < 0) return map;
  for (const r of rows.slice(1)) if (r[fi]) map.set(base(r[fi]).toLowerCase(), r[ti]);
  return map;
}

function unzipEntries(bytes, prefix = '') {
  const want = f => !f.name.startsWith('__MACOSX') && !(/\.json$/i.test(f.name) && /DI_CONNECT/i.test(f.name)) && (TRACK_RE.test(f.name) || /\.zip$/i.test(f.name) || /(^|\/)activities\.csv$/i.test(f.name));
  const files = fflate.unzipSync(bytes, { filter: want });
  const out = [];
  for (const [name, data] of Object.entries(files)) {
    if (/\.zip$/i.test(name)) out.push(...unzipEntries(data, prefix + name + '/'));   // Garmin: zips inside the zip
    else out.push({ name: prefix + name, data });
  }
  return out;
}

// Large archives (with photos/videos) are streamed so they don't have to fit in memory
async function streamZip(file) {
  const out = [], pending = [];
  const uz = new fflate.Unzip(f => {
    if (f.name.startsWith('__MACOSX') || (/\.json$/i.test(f.name) && /DI_CONNECT/i.test(f.name)) || !(TRACK_RE.test(f.name) || /\.zip$/i.test(f.name) || /(^|\/)activities\.csv$/i.test(f.name))) return;
    const chunks = [];
    pending.push(new Promise((ok, ko) => {
      f.ondata = (err, d, final) => {
        if (err) return ko(err);
        chunks.push(d);
        if (final) {
          const data = chunks.length === 1 ? chunks[0] : concat(chunks);
          if (/\.zip$/i.test(f.name)) out.push(...unzipEntries(data, f.name + '/')); else out.push({ name: f.name, data });
          ok();
        }
      };
    }));
    f.start();
  });
  uz.register(fflate.UnzipInflate);
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) { uz.push(new Uint8Array(0), true); break; }
    uz.push(value);
  }
  await Promise.all(pending);
  return out;
}
function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

const STREAM_ABOVE = 500e6;   // bytes

async function expand(files) {
  const entries = [];   // { name, data: Uint8Array | file: File, archive }
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      post({ type: 'progress', text: `Opening ${f.name}…` });
      const list = f.size > STREAM_ABOVE ? await streamZip(f) : unzipEntries(new Uint8Array(await f.arrayBuffer()));
      list.forEach(e => entries.push({ ...e, archive: f.name }));
    } else entries.push({ name: f.path || f.name, file: f, archive: null });   // read later, one at a time
  }
  return entries;
}

function readTrack(name, data) {
  let bytes = data;
  if (/\.gz$/i.test(name)) bytes = fflate.gunzipSync(bytes);
  const ext = name.replace(/\.gz$/i, '').split('.').pop().toLowerCase();
  if (ext === 'fit') return { ...parseFit(bytes), fmt: 'fit' };
  const text = new TextDecoder().decode(bytes);
  if (ext === 'json') {
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON we know */ }
    const nike = parseNike(json);
    return nike ? { ...nike, fmt: 'nike' } : null;
  }
  return ext === 'tcx' ? { ...parseTcx(text), fmt: 'tcx' } : { ...parseGpx(text), fmt: 'gpx' };
}

async function importFiles(files, existing) {
  await loadPlaces();
  const entries = await expand(files);
  // Per archive: Strava's activities.csv gives the sport of each file
  const types = new Map(), archSrc = new Map();
  for (const e of entries) {
    if (/(^|\/)activities\.csv$/i.test(e.name)) {
      const bytes = e.data || new Uint8Array(await e.file.arrayBuffer());
      for (const [k, v] of stravaTypes(new TextDecoder().decode(bytes))) types.set(e.archive + '|' + k, v);
      archSrc.set(e.archive, 'strava');
    } else if (e.archive && /DI_CONNECT/i.test(e.name)) archSrc.set(e.archive, 'garmin');
  }

  const known = existing.map(r => r.ts).filter(Boolean).sort((a, b) => a - b);
  const isDup = ts => {
    let lo = 0, hi = known.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (known[mid] < ts) lo = mid + 1; else hi = mid; }
    return (lo < known.length && known[lo] - ts <= DUP_MS) || (lo > 0 && ts - known[lo - 1] <= DUP_MS);
  };
  const addKnown = ts => { let i = known.findIndex(k => k > ts); if (i < 0) i = known.length; known.splice(i, 0, ts); };

  const tracks = entries.filter(e => TRACK_RE.test(e.name));
  const report = { files: tracks.length, ignored: 0, added: 0, bySport: {}, duplicates: 0, noGps: 0, errors: [] };
  const added = [];
  for (let i = 0; i < tracks.length; i++) {
    const e = tracks[i];
    if (i % 20 === 0) post({ type: 'progress', text: `Reading tracks… ${i} / ${tracks.length}`, done: i, total: tracks.length });
    try {
      const csvType = types.get(e.archive + '|' + base(e.name).toLowerCase());
      const tr = readTrack(e.name, e.data || new Uint8Array(await e.file.arrayBuffer()));
      if (!tr) { report.ignored++; continue; }       // a JSON file that isn't a Nike activity
      if (tr.deleted) { report.ignored++; continue; }
      tr.sp = sportOf(csvType ?? tr.sport);
      const src = archSrc.get(e.archive) || sourceOf(tr.creator, tr.fmt);
      const res = makeRun(tr, src);
      if (res.run && tr.fmt === 'nike') res.run.id = 'nike-' + base(e.name).replace(/\.json(\.gz)?$/i, '');
      if (res.skip) { report.noGps++; continue; }
      if (isDup(res.run.ts)) { report.duplicates++; continue; }
      addKnown(res.run.ts);
      added.push(res.run);
      report.added++;
      report.bySport[tr.sp] = (report.bySport[tr.sp] || 0) + 1;
    } catch (err) {
      report.errors.push(`${base(e.name)}: ${err.message}`);
    }
  }
  if (!tracks.length || report.ignored === tracks.length) report.errors.push('No GPX, TCX, FIT or Nike file found');
  return { added, report };
}

// ---------- Derived data ----------
// "New" km of each run: covered in cells never visited before (chronological order)
// Paths are "new" per family: a bike ride doesn't make a running path known
const family = r => (r.sp === 'run' || r.sp === 'walk' ? 'foot' : r.sp);
function explore(runs) {
  const seens = new Map(), ky = 110540;
  const order = [...runs].sort((a, b) => (a.t || a.date) < (b.t || b.date) ? -1 : (a.t || a.date) > (b.t || b.date) ? 1 : 0);
  for (const r of order) {
    let newM = 0, totM = 0;
    let seen = seens.get(family(r));
    if (!seen) seens.set(family(r), seen = new Set());
    const mine = new Set(), ranges = [];
    r.segs.forEach((s, si) => {
      const band = Math.round(s[0][1]);
      const kx = 111320 * Math.cos(band * RAD);
      for (let pi = 0; pi < s.length - 1; pi++) {
        const [x1, y1] = s[pi], [x2, y2] = s[pi + 1];
        const len = Math.hypot((x2 - x1) * kx, (y2 - y1) * ky);
        const n = Math.max(1, Math.floor(len / SAMPLE_M));
        let segNew = 0;
        for (let i = 0; i < n; i++) {
          const x = x1 + (x2 - x1) * (i + .5) / n, y = y1 + (y2 - y1) * (i + .5) / n;
          const key = band + ',' + Math.floor(x * kx / EXPLORE_CELL_M) + ',' + Math.floor(y * ky / EXPLORE_CELL_M);
          const step = len / n;
          totM += step;
          if (!seen.has(key) && !mine.has(key)) { newM += step; segNew += step; }
          mine.add(key);
        }
        if (len && segNew / len >= .5) {
          const last = ranges[ranges.length - 1];
          if (last && last[0] === si && last[2] === pi) last[2] = pi + 1; else ranges.push([si, pi, pi + 1]);
        }
      }
    });
    for (const key of mine) {
      const [band, cx, cy] = key.split(',').map(Number);
      for (let dx = -EXPLORE_TOL; dx <= EXPLORE_TOL; dx++)
        for (let dy = -EXPLORE_TOL; dy <= EXPLORE_TOL; dy++) seen.add(band + ',' + (cx + dx) + ',' + (cy + dy));
    }
    r.nk = round(newM / 1000, 2);
    if (ranges.length) r.ex = ranges; else delete r.ex;
    r.gk = round(totM / 1000, 2);
  }
}

// One place per town crossed: a run belongs to every town where it covers ≥ 1 km
function buildZones(runs) {
  const cities = new Map(), cache = new Map();
  const commune = (x, y) => {
    const k = Math.round(x * 1000) + ',' + Math.round(y * 1000);
    let key = cache.get(k);
    if (key === undefined) {
      const c = nearestCity(x, y);
      if (c) { key = c[2] + '|' + c[3]; cities.set(key, [c[2], c[3]]); }
      else { key = `${y.toFixed(1)}, ${x.toFixed(1)}|`; cities.set(key, [key.slice(0, -1), '']); }
      cache.set(k, key);
    }
    return key;
  };

  const acc = new Map();
  const kmBy = [], pkBy = [];
  runs.forEach((r, ri) => {
    const km = new Map(), cells = new Map();
    for (const s of r.segs) {
      const kx = 111320 * Math.cos(s[0][1] * RAD), ky = 110540;
      for (let pi = 0; pi < s.length - 1; pi++) {
        const [x1, y1] = s[pi], [x2, y2] = s[pi + 1];
        const len = Math.hypot((x2 - x1) * kx, (y2 - y1) * ky);
        const n = Math.max(1, Math.floor(len / SAMPLE_M));
        for (let i = 0; i < n; i++) {
          const x = x1 + (x2 - x1) * (i + .5) / n, y = y1 + (y2 - y1) * (i + .5) / n;
          const key = commune(x, y);
          km.set(key, (km.get(key) || 0) + len / n / 1000);
          let c = cells.get(key);
          if (!c) cells.set(key, c = new Set());
          c.add(Math.floor(x * kx / CELL_M) + ',' + Math.floor(y * ky / CELL_M));
        }
      }
    }
    kmBy[ri] = km;
    pkBy[ri] = r.segs.map(s => s.map(([x, y]) => commune(x, y)));
    for (const [key, k] of km) {
      if (k < MIN_KM_IN_COMMUNE) continue;
      let a = acc.get(key);
      if (!a) acc.set(key, a = { runs: [], km: 0, cells: new Map() });
      a.runs.push(ri);
      a.km += k;
      for (const cell of cells.get(key)) a.cells.set(cell, (a.cells.get(cell) || 0) + 1);
    }
  });

  const keys = [...acc.keys()].sort((a, b) => (acc.get(b).runs.length - acc.get(a).runs.length) || (acc.get(b).km - acc.get(a).km));
  const index = new Map(keys.map((k, i) => [k, i]));
  const zones = keys.map(key => {
    const a = acc.get(key), [name, cc] = cities.get(key);
    let xs = [], ys = [];
    for (const ri of a.runs) runs[ri].segs.forEach((s, si) => s.forEach(([x, y], pi) => {
      if (pkBy[ri][si][pi] === key) { xs.push(x); ys.push(y); }
    }));
    if (xs.length < 2) {
      xs = []; ys = [];
      for (const ri of a.runs) for (const s of runs[ri].segs) for (const [x, y] of s) { xs.push(x); ys.push(y); }
    }
    xs.sort((p, q) => p - q); ys.sort((p, q) => p - q);
    const [p0, p1] = xs.length >= 50 ? [.02, .98] : [0, 1];
    const dates = a.runs.map(ri => runs[ri].date).sort();
    const levels = [...a.cells.values()].sort((p, q) => p - q);
    return { name, label: name, cc, flag: flag(cc), n: a.runs.length, km: round(a.km, 1),
      from: dates[0], to: dates[dates.length - 1],
      bbox: [percentile(xs, p0), percentile(ys, p0), percentile(xs, p1), percentile(ys, p1)],
      level: Math.max(1, levels.length ? percentile(levels, .99) : 1) };
  });
  const ref = zones.length ? zones[0].level : 1;
  for (const z of zones) z.w = round(Math.min(MAX_ZONE_WEIGHT, Math.max(1, ref / z.level)), 2);

  runs.forEach((r, ri) => {
    const km = kmBy[ri];
    r.zs = [...km].filter(([k, v]) => index.has(k) && v >= MIN_KM_IN_COMMUNE).map(([k]) => index.get(k)).sort((a, b) => a - b);
    const inZone = [...km.keys()].filter(k => index.has(k));
    r.z = inZone.length ? index.get(inZone.reduce((a, b) => (km.get(b) > km.get(a) ? b : a))) : -1;
    r.w = r.z >= 0 ? zones[r.z].w : 1;
    r.pz = pkBy[ri].map(ks => ks.map(k => index.has(k) ? index.get(k) : r.z));
  });
  return zones;
}

async function build(runs) {
  await loadPlaces();
  post({ type: 'progress', text: 'Computing new paths…' });
  runs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0)));
  explore(runs);
  post({ type: 'progress', text: 'Finding places…' });
  const zones = buildZones(runs);
  return { runs, zones };
}

function post(msg) { self.postMessage(msg); }

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'import') {
      const { added, report } = await importFiles(msg.files, msg.runs);
      const data = added.length ? await build([...msg.runs, ...added.map(r => ({ ...r }))]) : null;
      post({ type: 'done', added, data, report });
    } else if (msg.type === 'build') {
      post({ type: 'done', added: [], data: await build(msg.runs), report: null });
    }
  } catch (err) {
    post({ type: 'error', message: err.message || String(err) });
  }
};
