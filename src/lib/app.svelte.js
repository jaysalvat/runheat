// Central state: settings (saved in the browser), filters, loaded data.
// Components read and write it directly; everything that depends on it updates by itself.
import { SvelteSet } from 'svelte/reactivity';
import { DEFAULT_COLORS, DEFAULT_ACCENT, BASES, SPORTS } from './config.js';
import { ymd } from './format.js';
import { buildGeo, mainArea } from './geo.js';
import { RunData } from './data.js';

const DEFAULT_RELIEF = Object.fromEntries(Object.keys(BASES).map((b) => [b, false]));

const STORAGE_KEY = 'runmap';
const DEFAULT_SETTINGS = {
  base: 'dark',
  // layers
  plain: false,
  lines: true,
  heat: false,
  soft: false,
  raw: false,
  explore: false,
  heatK: 50,
  lineW: 50,
  layerOp: 100,
  mapOp: 100,
  scale: 'global',
  // hillshade and contour lines, per basemap
  relief: { ...DEFAULT_RELIEF },
  contours: { ...DEFAULT_RELIEF },
  globe: false, // globe projection when zoomed out
  terrain: false, // 3D relief, map tilted
  outline: 'tint', // Routes outline: 'dark' | 'tint' | 'none'
  goal: 1000,
  stats: false,
  colors: { ...DEFAULT_COLORS },
  accent: DEFAULT_ACCENT,
};

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    /* private mode or corrupt value */
  }
  const obj = (v) => (v && typeof v === 'object' ? v : {}); // older saves stored booleans here
  const s = {
    ...DEFAULT_SETTINGS,
    ...saved,
    colors: { ...DEFAULT_COLORS, ...obj(saved.colors) },
    relief: { ...DEFAULT_RELIEF, ...obj(saved.relief) },
    contours: { ...DEFAULT_RELIEF, ...obj(saved.contours) },
  };
  for (const k of Object.keys(DEFAULT_COLORS)) if (!isHex(s.colors[k])) s.colors[k] = DEFAULT_COLORS[k];
  if (!isHex(s.accent)) s.accent = DEFAULT_ACCENT;
  // Migration: the former default Streets colour follows the new default
  if (s.colors.map?.toLowerCase() === '#fc4c02') s.colors.map = DEFAULT_COLORS.map;
  // Migration: saves from before the 'topo' basemap was dropped get Streets with hillshade and contours
  if (s.base === 'topo') {
    s.base = 'standard';
    s.relief.standard = s.contours.standard = true;
  }
  if (!Object.hasOwn(BASES, s.base)) s.base = 'dark';
  for (const k of Object.keys(s)) if (!(k in DEFAULT_SETTINGS)) delete s[k]; // keys from older versions
  return s;
}

class AppState {
  settings = $state(loadSettings());

  // ---- Filters (not saved) ----
  yMin = $state(0);
  yMax = $state(0);
  dFrom = $state(null); // finer period (YYYYMMDD), otherwise whole years yMin..yMax
  dTo = $state(null);
  zone = $state(null); // index of the selected place
  sources = new SvelteSet();
  sports = new SvelteSet();

  // ---- Data ----
  runs = $state.raw([]);
  zones = $state.raw([]);
  geo = $state.raw(null);
  yearSpan = $state.raw([0, 0]);
  info = $state.raw({ imported: 0, own: false, demo: false });
  area = $state.raw(null); // densest area, for the initial view
  dataVersion = $state(0); // +1 each time a dataset is loaded

  // ---- UI ----
  busy = $state(null); // full-screen message while (re)building the data
  panel = $state(null); // open popup: 'settings' | 'data' | null
  highlighted = $state.raw(null); // run outlined on the map
  toast = $state(null);

  // Active period (YYYYMMDD)
  range = $derived(this.dFrom ? [this.dFrom, this.dTo] : [ymd(this.yMin, 1, 1), ymd(this.yMax, 12, 31)]);

  // A run is shown if its source and activity type are selected (and it's in the place, for the charts)
  keep = (r) => this.sources.has(r.src) && this.sports.has(r.sp);
  inZone = (r) => this.zone == null || (r.zs || []).includes(this.zone);

  // Runs shown on the map (period + filters), and the same restricted to the place (stats)
  sel = $derived.by(() => {
    const [a, b] = this.range;
    return this.runs.filter((r) => r.d >= a && r.d <= b && this.keep(r));
  });
  statSel = $derived(this.zone == null ? this.sel : this.sel.filter(this.inZone));

  constructor() {
    $effect.root(() => {
      $effect(() => {
        const json = JSON.stringify(this.settings);
        try {
          localStorage.setItem(STORAGE_KEY, json);
        } catch {
          /* private mode */
        }
      });
    });
  }

  // Loads the dataset (your imported activities, or the demo)
  async load() {
    const data = await RunData.load((p) => {
      this.busy = p.text;
    });
    this.busy = null;
    const runs = data.runs || [];
    runs.forEach((r, i) => {
      r.year = +r.date.slice(0, 4);
      r.d = +r.date.replace(/-/g, '');
      r.i = i;
      // Older data may say "hike" (counted as a walk); Nike exports have no type (runs)
      r.sp = Object.hasOwn(SPORTS, r.sp) ? r.sp : r.sp === 'hike' ? 'walk' : r.sp ? 'other' : 'run';
    });
    const years = runs.map((r) => r.year);
    const y0 = runs.length ? Math.min(...years) : new Date().getFullYear();
    const y1 = runs.length ? Math.max(...years) : y0;
    this.yearSpan = [y0, y1];
    this.yMin = y0;
    this.yMax = y1;
    this.dFrom = this.dTo = null;
    this.zone = null;
    this.sources.clear();
    this.sports.clear();
    for (const r of runs) {
      this.sources.add(r.src);
      this.sports.add(r.sp);
    }
    this.zones = data.zones || [];
    this.geo = buildGeo(runs, this.zones);
    this.area = mainArea(runs);
    this.info = { imported: data.imported, own: data.own, demo: data.demo };
    this.highlighted = null;
    this.runs = runs;
    this.dataVersion++;
    if (!runs.length) this.panel = 'data'; // nothing yet: invite to import
  }
}

export const app = new AppState();
