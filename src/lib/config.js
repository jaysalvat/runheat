// Constants shared by the whole app: basemaps, layer palettes, activity types.

export const LOCALE = 'en-GB'; // dates "3 Aug 2022", numbers "1,346"
export const EVEREST_M = 8849;

// Heatmap sampling: one point every 20 m along the tracks; weights tuned for that density
export const HEAT_STEP_M = 20;
export const HEAT_W = 0.02,
  SOFT_W = 0.005;
export const RAW_W = 0.008; // Raw hotspots: weight tuned for the raw GPS points (one every ~60 m on average)

const SAT_ATTR = 'Imagery © Esri, Maxar, Earthstar Geographics';
// Satellite tiles are 256 px images. On a HiDPI screen, declaring them 128 px makes MapLibre load
// the next zoom level: twice the detail, the photo is no longer stretched ×2.
// globalThis: this file is also imported by the worker, which has no devicePixelRatio.
const RASTER_TILE = (globalThis.devicePixelRatio || 1) > 1 ? 128 : 256;

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// style: URL or object; transform (optional): passed to MapLibre as transformStyle to rework the fetched style
export const BASES = {
  dark: {
    label: 'Dark',
    style: DARK_STYLE,
    // one colour for every layer; Density stands out by its halo
    line: '#ffb38a',
    glow: '#ff6a2b',
    lineOpacity: [0.06, 0.12, 0.3],
    glowOpacity: [0.05, 0.08],
    casing: '#0b0d10',
    hlGlow: '#ffd86f', // selected run: white line with a golden glow (other maps: dark casing)
  },
  // CARTO Voyager: colourful vector street map (free, no key, same provider as Dark)
  standard: {
    label: 'Streets',
    style: VOYAGER_STYLE,
    // the app's orange on every layer; white casing under the dashes
    line: '#ff6a2b',
    glow: '#ff6a2b',
    lineOpacity: [0.15, 0.3, 0.55],
    glowOpacity: [0.04, 0.07],
    casing: '#ffffff',
  },
  // Esri imagery + the vector labels of Dark Matter (crisp text at any zoom, no key needed)
  satellite: {
    label: 'Satellite',
    style: DARK_STYLE,
    transform: (_prev, next) => ({
      ...next,
      sources: {
        ...next.sources,
        sat: {
          type: 'raster',
          tileSize: RASTER_TILE,
          maxzoom: 19,
          attribution: SAT_ATTR,
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
        },
      },
      layers: [
        { id: 'sat', type: 'raster', source: 'sat' },
        // white text, dark halo: readable over any photo
        ...next.layers
          .filter((l) => l.type === 'symbol' && l.id !== 'housenumber')
          .map((l) => ({
            ...l,
            paint: {
              ...l.paint,
              'text-color': 'rgba(255,255,255,.92)',
              'text-halo-color': 'rgba(0,0,0,.75)',
              'text-halo-width': 1.2,
            },
          })),
      ],
    }),
    // Strava-like bright orange, dark casing under the dashes
    line: '#fc4c02',
    glow: '#fc4c02',
    lineOpacity: [0.15, 0.3, 0.55],
    glowOpacity: [0.06, 0.1],
    casing: '#0b0d10',
  },
};

// Track colour: one per basemap family, editable in Settings
export const COLOR_GROUP = { dark: 'dark', standard: 'map', satellite: 'sat' };
export const DEFAULT_COLORS = { dark: BASES.dark.line, map: BASES.standard.line, sat: BASES.satellite.line };
export const DEFAULT_ACCENT = '#ff6a2b';

// "Classic" heatmap: green (rarely) → yellow → orange → red (often)
// Colours blend in Lab space (smoother than RGB) and red only shows at the very top.
// Transparency is left to the "Layers opacity" setting so the colours stay saturated.
export const HEAT_COLORS = [
  'interpolate-lab',
  ['linear'],
  ['heatmap-density'],
  0,
  'rgba(0,200,60,0)',
  0.08,
  'rgba(0,200,60,.55)',
  0.25,
  'rgba(80,220,40,.8)',
  0.45,
  'rgba(200,240,0,.9)',
  0.62,
  'rgba(255,220,0,.92)',
  0.78,
  'rgba(255,150,0,.94)',
  0.92,
  'rgba(255,80,0,.95)',
  1,
  'rgba(220,20,0,.95)',
];

// "Diffuse" eye-tracking-style heatmap: large radius, halo blue → cyan → green → yellow → red
export const SOFT_COLORS = [
  'interpolate-lab',
  ['linear'],
  ['heatmap-density'],
  0,
  'rgba(40,60,255,0)',
  0.05,
  'rgba(40,60,255,.4)',
  0.2,
  'rgba(20,110,255,.7)',
  0.38,
  'rgba(0,210,240,.82)',
  0.55,
  'rgba(80,240,80,.88)',
  0.7,
  'rgba(240,240,0,.9)',
  0.84,
  'rgba(255,160,0,.93)',
  0.95,
  'rgba(255,80,0,.95)',
  1,
  'rgba(240,30,0,.95)',
];

// Map layers shown as toggle buttons in the panel
export const LAYERS = [
  {
    key: 'plain',
    label: 'Routes',
    title: "Every route you've run, drawn the same — spot every path you've already taken",
  },
  { key: 'lines', label: 'Density', title: 'Brighter where you run more often' },
  { key: 'soft', label: 'Hotspots', title: 'Wide, soft view of your favourite areas' },
  {
    key: 'raw',
    label: 'Raw hotspots',
    title: 'Hotspots from the raw GPS points: pauses and bends show up as blobs',
  },
  { key: 'heat', label: 'Heatmap', title: 'Where you run most, as a heat gradient' },
  { key: 'explore', label: 'New paths', title: 'Paths run for the first time in the selected period' },
];

// Activity types: label and word for messages (icons: components/ui/SportIcon.svelte)
export const SPORTS = {
  run: {
    label: 'Run / trail',
    word: 'run',
  },
  ride: {
    label: 'Bike / MTB',
    word: 'ride',
  },
  walk: {
    label: 'Walk / hike',
    word: 'walk',
  },
  swim: {
    label: 'Swim',
    word: 'swim',
  },
  other: {
    label: 'Other',
    word: 'other activity',
  },
};
