// Relief: hillshading + contour lines, computed in the browser from free elevation tiles
// (AWS Terrarium, no key). maplibre-contour turns the elevation tiles into vector contours
// in a web worker; the hillshade shares the same cached tiles.
import maplibregl from 'maplibre-gl';
import mlcontour from 'maplibre-contour';

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const DEM_MAXZOOM = 13;   // finer tiles bring nothing more: deeper zooms reuse them

let dem = null;
function demSource() {
  if (!dem) {
    dem = new mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: DEM_MAXZOOM, worker: true });
    dem.setupMaplibre(maplibregl);
  }
  return dem;
}

// Colours per basemap: hillshade (null = none) and contours
export const RELIEF_LOOK = {
  dark: { shade: { shadow: '#000000', highlight: '#4a5260', k: .35 },
    line: 'rgba(200,215,230,.13)', major: 'rgba(200,215,230,.26)', text: 'rgba(200,215,230,.55)', halo: '#0b0d10' },
  standard: { shade: { shadow: '#6b5640', highlight: '#ffffff', k: .3 },
    line: 'rgba(150,105,60,.3)', major: 'rgba(150,105,60,.55)', text: '#8a6440', halo: 'rgba(255,255,255,.85)' },
  // the photo already shows the relief: contours only
  satellite: { shade: null,
    line: 'rgba(255,255,255,.22)', major: 'rgba(255,255,255,.45)', text: 'rgba(255,255,255,.85)', halo: 'rgba(0,0,0,.7)' },
};

const FONT = ['Montserrat Medium', 'Open Sans Regular', 'Noto Sans Regular'];
export const SHADE_LAYERS = ['relief-shade'];
export const CONTOUR_LAYERS = ['contours', 'contours-major', 'contour-labels'];

// Adds the relief sources and layers to the current style (hidden; MapView sets visibility).
// Hillshade and contours go above land and parks but under water, roads and buildings
// (first line layer of the style); labels go with the basemap's other labels.
export function addRelief(map, base) {
  const look = RELIEF_LOOK[base];
  const src = demSource();
  const layers = map.getStyle().layers;
  const under = layers.find(l => l.type === 'line')?.id || layers.find(l => l.type === 'symbol')?.id;
  const labelsAt = layers.find(l => l.type === 'symbol')?.id;
  const hidden = { visibility: 'none' };

  map.addSource('dem', { type: 'raster-dem', encoding: 'terrarium', tiles: [src.sharedDemProtocolUrl],
    maxzoom: DEM_MAXZOOM, tileSize: 256 });
  map.addSource('contour-src', { type: 'vector', maxzoom: 15, tiles: [src.contourProtocolUrl({
    // zoom: [minor, major] interval in metres
    thresholds: { 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 15: [10, 50] },
    contourLayer: 'contours', elevationKey: 'ele', levelKey: 'level' })] });

  if (look.shade) map.addLayer({ id: 'relief-shade', type: 'hillshade', source: 'dem', layout: hidden, paint: {
    'hillshade-shadow-color': look.shade.shadow, 'hillshade-highlight-color': look.shade.highlight,
    'hillshade-accent-color': look.shade.shadow, 'hillshade-exaggeration': look.shade.k } }, under);
  const contour = (id, filter, color, width) => ({ id, type: 'line', source: 'contour-src', 'source-layer': 'contours',
    filter, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': width } });
  map.addLayer(contour('contours', ['==', ['get', 'level'], 0], look.line,
    ['interpolate', ['linear'], ['zoom'], 11, .4, 15, .8]), under);
  map.addLayer(contour('contours-major', ['>', ['get', 'level'], 0], look.major,
    ['interpolate', ['linear'], ['zoom'], 11, .7, 15, 1.4]), under);
  map.addLayer({ id: 'contour-labels', type: 'symbol', source: 'contour-src', 'source-layer': 'contours',
    filter: ['>', ['get', 'level'], 0], minzoom: 12,
    layout: { ...hidden, 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
      'text-font': FONT, 'text-size': 10, 'text-max-angle': 25, 'symbol-spacing': 350 },
    paint: { 'text-color': look.text, 'text-halo-color': look.halo, 'text-halo-width': 1.2 } }, labelsAt);
}
