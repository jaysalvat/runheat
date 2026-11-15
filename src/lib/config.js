// Constants shared by the whole app: basemaps, layer palettes, activity types.

export const LOCALE = 'en-GB';   // dates "3 Aug 2022", numbers "1,346"
export const EVEREST_M = 8849;

// Heatmap sampling: one point every 20 m along the tracks; weights tuned for that density
export const HEAT_STEP_M = 20;
export const HEAT_W = .02, SOFT_W = .005;
export const RAW_W = .008;   // Raw hotspots: weight tuned for the raw GPS points (one every ~60 m on average)

const SAT_ATTR = 'Imagery © Esri, Maxar, Earthstar Geographics';
function rasterStyle(url, attribution, maxzoom) {
  return { version: 8,
    sources: { base: { type: 'raster', tileSize: 256, maxzoom, attribution, tiles: [url] } },
    layers: [{ id: 'base', type: 'raster', source: 'base' }] };
}

export const BASES = {
  dark: {
    label: 'Dark',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    // one colour for every layer (Density's); Density stands out by its halo
    line: '#ffb38a', glow: '#ff6a2b', lineOpacity: [.06, .12, .3], glowOpacity: [.05, .08], casing: '#0b0d10',
  },
  // Classic OSM map ("OSM Carto" style, the most colorful). Personal use only:
  // the tile.openstreetmap.org policy forbids heavy/public use.
  standard: {
    label: 'Streets',
    style: rasterStyle('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', 19),
    // Strava-like bright orange on every layer; white casing under the dashes
    line: '#fc4c02', glow: '#fc4c02', lineOpacity: [.15, .3, .55], glowOpacity: [.04, .07], casing: '#ffffff',
  },
  // Terrain: contour lines + hillshading, handy for trail running
  topo: {
    label: 'Terrain',
    style: rasterStyle('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      'Tiles © Esri — Esri, HERE, Garmin, USGS, OpenStreetMap', 19),
    line: '#fc4c02', glow: '#fc4c02', lineOpacity: [.15, .3, .55], glowOpacity: [.04, .07], casing: '#ffffff',
  },
  satellite: {
    label: 'Satellite',
    style: {
      version: 8,
      glyphs: 'https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
      sources: {
        sat: { type: 'raster', tileSize: 256, maxzoom: 19, attribution: SAT_ATTR,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
        labels: { type: 'raster', tileSize: 256, maxzoom: 19,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'] },
      },
      layers: [
        { id: 'sat', type: 'raster', source: 'sat' },
        { id: 'sat-labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': .85 } },
      ],
    },
    // Strava-like bright orange, dark casing under the dashes
    line: '#fc4c02', glow: '#fc4c02', lineOpacity: [.15, .3, .55], glowOpacity: [.06, .1], casing: '#0b0d10',
    before: 'sat-labels',
  },
};

// Track colour: one per basemap family, editable in Settings
export const COLOR_GROUP = { dark: 'dark', standard: 'map', topo: 'map', satellite: 'sat' };
export const DEFAULT_COLORS = { dark: BASES.dark.line, map: BASES.standard.line, sat: BASES.satellite.line };
export const DEFAULT_ACCENT = '#ff6a2b';

// "Classic" heatmap: green (rarely) → yellow → orange → red (often)
// Colours blend in Lab space (smoother than RGB) and red only shows at the very top.
// Transparency is left to the "Layers opacity" setting so the colours stay saturated.
export const HEAT_COLORS = ['interpolate-lab', ['linear'], ['heatmap-density'],
  0, 'rgba(0,200,60,0)',
  .08, 'rgba(0,200,60,.55)',
  .25, 'rgba(80,220,40,.8)',
  .45, 'rgba(200,240,0,.9)',
  .62, 'rgba(255,220,0,.92)',
  .78, 'rgba(255,150,0,.94)',
  .92, 'rgba(255,80,0,.95)',
  1, 'rgba(220,20,0,.95)'];

// "Diffuse" eye-tracking-style heatmap: large radius, halo blue → cyan → green → yellow → red
export const SOFT_COLORS = ['interpolate-lab', ['linear'], ['heatmap-density'],
  0, 'rgba(40,60,255,0)',
  .05, 'rgba(40,60,255,.4)',
  .2, 'rgba(20,110,255,.7)',
  .38, 'rgba(0,210,240,.82)',
  .55, 'rgba(80,240,80,.88)',
  .7, 'rgba(240,240,0,.9)',
  .84, 'rgba(255,160,0,.93)',
  .95, 'rgba(255,80,0,.95)',
  1, 'rgba(240,30,0,.95)'];

// Map layers shown as toggle buttons in the panel
export const LAYERS = [
  { key: 'plain', label: 'Routes', title: "Every route you've run, drawn the same — spot every path you've already taken" },
  { key: 'lines', label: 'Density', title: 'Brighter where you run more often' },
  { key: 'heat', label: 'Heatmap', title: 'Where you run most, as a heat gradient' },
  { key: 'soft', label: 'Hotspots', title: 'Wide, soft view of your favourite areas' },
  { key: 'raw', label: 'Raw hotspots', title: 'Hotspots computed from the raw GPS points (previous method): pauses and bends show up as blobs' },
  { key: 'explore', label: 'New paths', title: 'Paths run for the first time in the selected period' },
];

// Activity types: label, word for messages, icon (24×24 stroke paths, drawn in currentColor)
export const SPORTS = {
  run: { label: 'Run / trail', word: 'run', icon: '<circle cx="15" cy="5" r="2"/><path d="M12.61 8.27 9.3 12.4l4.14 4.14-2.07 4.55"/><path d="M6.41 9.51 9.8 6.2l2.81 2.07 2.9 3.3h3.72"/><path d="m8.89 15.71-1.24.83H4.34"/>' },
  ride: { label: 'Bike / MTB', word: 'ride', icon: '<circle cx="14" cy="5" r="2"/><circle cx="18" cy="18" r="3"/><circle cx="6" cy="18" r="3"/><path d="m11.5 18 1.5-4-4.88-2 3-3.5 3 2.5h3.5"/>' },
  walk: { label: 'Walk / hike', word: 'walk', icon: '<path d="m12.44 9.13-1.41 5.63 4.93 6.34"/><path d="m10.33 18.28-2.12 2.82"/><path d="M8.21 13.35c0-3.94 2.82-4.22 4.23-4.22h1.41c.23 1.17 1.27 3.66 3.52 4.22"/><circle cx="13" cy="5" r="2"/>' },
  swim: { label: 'Swim', word: 'swim', icon: '<path d="M3 15c2.48 0 4.34-3 4.34-3s1.87 3 4.35 3 4.97-3 4.97-3 2.48 3 4.34 3"/><path d="M3 20c2.48 0 4.34-3 4.34-3s1.87 3 4.35 3 4.97-3 4.97-3 2.48 3 4.34 3"/><path d="m5 10.5 4-2.5-1.19-1.48a1.27 1.27 0 0 1 1.95-1.6L14 10"/><circle cx="16.5" cy="5.5" r="2.5"/>' },
  other: { label: 'Other', word: 'other activity', icon: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>' },
};
