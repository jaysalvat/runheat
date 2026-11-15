<script>
  // The map: basemap, run layers, and their updates when settings or filters change.
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte.js';
  import { BASES, COLOR_GROUP, DEFAULT_COLORS, HEAT_COLORS, SOFT_COLORS, HEAT_W, SOFT_W, RAW_W } from '../lib/config.js';
  import { deeper } from '../lib/colors.js';
  import { mapCtl, freePadding } from '../lib/mapctl.js';

  let container;
  let map;
  let ready = $state(0);   // +1 each time our layers are (re)created on a style
  let styleReady = false;  // the basemap style has loaded (isStyleLoaded() is false while tiles load)

  const s = app.settings;

  // ---- Paint expressions ----
  // Track width: slider 0–100 → ×0.25 to ×4 (50 = ×1); heat: ×0.18 to ×5.7
  const lineMult = v => Math.pow(2, (v - 50) / 25);
  const heatMult = v => Math.pow(2, (v - 50) / 20);
  const lineWidth = () => { const k = lineMult(s.lineW); return ['interpolate', ['linear'], ['zoom'], 8, .5 * k, 14, 1.6 * k, 18, 3 * k]; };
  const glowWidth = () => { const k = lineMult(s.lineW); return ['interpolate', ['linear'], ['zoom'], 8, 3 * k, 14, 12 * k, 18, 20 * k]; };
  const heatIntensity = () => { const k = heatMult(s.heatK); return ['interpolate', ['linear'], ['zoom'], 8, .25 * k, 15, 1 * k]; };
  const softIntensity = () => { const k = heatMult(s.heatK); return ['interpolate', ['linear'], ['zoom'], 8, .12 * k, 15, .4 * k]; };

  // "Per place" scale: each run is weighted by its place's weight w (the most frequent
  // route in each place reaches the top of the scale)
  const byZone = () => s.scale === 'zone';
  const weight = base => (byZone() ? ['*', base, ['get', 'w']] : base);
  const scaled = a => (byZone() ? ['min', 1, ['*', a, ['get', 'w']]] : a);
  const op = a => ['*', s.layerOp / 100, scaled(a)];
  const lineOpacity = () => { const o = BASES[s.base].lineOpacity; return ['interpolate', ['linear'], ['zoom'], 8, op(o[0]), 14, op(o[1]), 18, op(o[2])]; };
  const glowOpacity = () => { const o = BASES[s.base].glowOpacity; return ['interpolate', ['linear'], ['zoom'], 8, op(o[0]), 14, op(o[1])]; };

  // Track colour (Settings) and Density's halo: on Dark, a deeper shade (the default keeps its tuned glow)
  const trackColor = () => s.colors[COLOR_GROUP[s.base]] || BASES[s.base].line;
  function glowColor() {
    const c = trackColor();
    if (s.base !== 'dark') return c;
    return c.toLowerCase() === DEFAULT_COLORS.dark ? BASES.dark.glow : deeper(c);
  }
  const empty = { type: 'FeatureCollection', features: [] };

  // (Re)creates sources + layers: on load and after every basemap change
  function addOverlay() {
    if (!map || map.getSource('runs') || !app.geo) return;
    const b = BASES[s.base];
    const before = b.before || map.getStyle().layers.find(l => l.type === 'symbol')?.id;
    const g = app.geo;
    map.addSource('runs', { type: 'geojson', data: g.lines });
    map.addSource('pts', { type: 'geojson', data: g.points });
    map.addSource('ptsRaw', { type: 'geojson', data: g.raw });
    map.addSource('explore', { type: 'geojson', data: g.explore });
    map.addSource('hl', { type: 'geojson', data: empty });
    const round = { 'line-join': 'round', 'line-cap': 'round' };
    const softRadius = ['interpolate', ['exponential', 1.6], ['zoom'], 6, 12, 10, 25, 13, 45, 16, 90, 18, 140];
    const layers = [
      // Black veil between the basemap and our layers: its opacity follows "Map opacity"
      { id: 'veil', type: 'background', paint: { 'background-color': '#000', 'background-opacity': 0 } },
      // Order: diffuse at the bottom, sharp heatmap, then tracks on top
      // Raw hotspots: built from the raw GPS points (to compare both methods)
      { id: 'raw', type: 'heatmap', source: 'ptsRaw', paint: { 'heatmap-weight': weight(RAW_W),
        'heatmap-intensity': softIntensity(), 'heatmap-radius': softRadius, 'heatmap-color': SOFT_COLORS } },
      { id: 'soft', type: 'heatmap', source: 'pts', paint: { 'heatmap-weight': weight(SOFT_W),
        'heatmap-intensity': softIntensity(), 'heatmap-radius': softRadius, 'heatmap-color': SOFT_COLORS } },
      { id: 'heat', type: 'heatmap', source: 'pts', paint: { 'heatmap-weight': weight(HEAT_W),
        'heatmap-intensity': heatIntensity(), 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 13, 10, 16, 22],
        'heatmap-color': HEAT_COLORS } },
      { id: 'glow', type: 'line', source: 'runs', layout: round, paint: { 'line-color': glowColor(), 'line-blur': 8,
        'line-width': glowWidth(), 'line-opacity': glowOpacity() } },
      { id: 'lines', type: 'line', source: 'runs', layout: round, paint: { 'line-color': trackColor(),
        'line-width': lineWidth(), 'line-opacity': lineOpacity() } },
      // Routes: uniform opaque line, a path run once = a path run 300 times
      { id: 'plain', type: 'line', source: 'runs', layout: round, paint: { 'line-color': trackColor(),
        'line-width': lineWidth(), 'line-opacity': .95 } },
      { id: 'ex-glow', type: 'line', source: 'explore', layout: round, paint: { 'line-color': trackColor(),
        'line-blur': 5, 'line-opacity': .25, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 10] } },
      // Casing under the dashes: the gaps stay visible even over the Routes layer
      { id: 'ex-case', type: 'line', source: 'explore', layout: round, paint: { 'line-color': b.casing,
        'line-opacity': .85, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5, 18, 7] } },
      // Dashed line: butt caps keep the dashes crisp (round caps would merge them)
      { id: 'ex', type: 'line', source: 'explore', layout: { 'line-join': 'round', 'line-cap': 'butt' },
        paint: { 'line-color': trackColor(), 'line-dasharray': [2, 1.5],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 2.5, 18, 4] } },
    ];
    for (const l of layers) map.addLayer(l, before);
    // Highlighted run: always on top
    map.addLayer({ id: 'hl-glow', type: 'line', source: 'hl', layout: round,
      paint: { 'line-color': '#ffd86f', 'line-width': 12, 'line-blur': 6, 'line-opacity': .6 } });
    map.addLayer({ id: 'hl', type: 'line', source: 'hl', layout: round, paint: { 'line-color': '#fff', 'line-width': 3 } });
    ready++;
  }

  onMount(() => {
    map = new maplibregl.Map({ container, style: BASES[s.base].style, center: [2.35, 48.85], zoom: 4,
      attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.on('style.load', () => { styleReady = true; addOverlay(); });
    mapCtl.map = map;
    return () => { map.remove(); mapCtl.map = null; };
  });

  // Basemap change: new style, 'style.load' recreates our layers
  let shownBase = s.base;
  $effect(() => {
    const base = s.base;
    if (!map || base === shownBase) return;
    shownBase = base;
    styleReady = false;
    map.setStyle(BASES[base].style, { diff: false });
  });

  // New dataset: update the sources (or create the layers) and show the main area
  let shownVersion = 0;
  $effect(() => {
    const v = app.dataVersion, geo = app.geo;
    if (!map || !geo || v === shownVersion) return;
    shownVersion = v;
    if (map.getSource('runs')) {
      map.getSource('runs').setData(geo.lines);
      map.getSource('pts').setData(geo.points);
      map.getSource('ptsRaw').setData(geo.raw);
      map.getSource('explore').setData(geo.explore);
    } else if (styleReady) addOverlay();
    if (app.area) map.fitBounds(app.area, { padding: 60, duration: 0 });
  });

  // Filters, visibility, opacity, colours
  $effect(() => {
    if (!ready || !map.getLayer('lines')) return;
    const [dA, dB] = app.range;
    const f = ['all', ['>=', ['get', 'd'], dA], ['<=', ['get', 'd'], dB],
      ['in', ['get', 'src'], ['literal', [...app.sources]]], ['in', ['get', 'sp'], ['literal', [...app.sports]]]];
    for (const id of ['glow', 'lines', 'heat', 'soft', 'raw', 'plain', 'ex', 'ex-glow', 'ex-case']) map.setFilter(id, f);
    const vis = (ids, on) => ids.forEach(id => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
    vis(['plain'], s.plain);
    vis(['ex', 'ex-glow', 'ex-case'], s.explore);
    vis(['heat'], s.heat);
    vis(['soft'], s.soft);
    vis(['raw'], s.raw);
    vis(['lines', 'glow'], s.lines);
    // With a heatmap shown, no halo so the heatmap stays readable
    const both = s.lines && (s.heat || s.soft || s.raw);
    map.setPaintProperty('glow', 'line-opacity', both ? 0 : glowOpacity());
    map.setPaintProperty('lines', 'line-opacity', lineOpacity());
    map.setPaintProperty('heat', 'heatmap-weight', weight(HEAT_W));
    map.setPaintProperty('soft', 'heatmap-weight', weight(SOFT_W));
    map.setPaintProperty('raw', 'heatmap-weight', weight(RAW_W));
    const lo = s.layerOp / 100;
    for (const id of ['heat', 'soft', 'raw']) map.setPaintProperty(id, 'heatmap-opacity', lo);
    map.setPaintProperty('plain', 'line-opacity', .95 * lo);
    map.setPaintProperty('ex', 'line-opacity', lo);
    map.setPaintProperty('ex-glow', 'line-opacity', .25 * lo);
    map.setPaintProperty('ex-case', 'line-opacity', .85 * lo);
    map.setPaintProperty('veil', 'background-opacity', 1 - s.mapOp / 100);
    for (const id of ['lines', 'plain', 'ex', 'ex-glow']) map.setPaintProperty(id, 'line-color', trackColor());
    map.setPaintProperty('glow', 'line-color', glowColor());
  });

  // Line width and heat intensity sliders
  $effect(() => {
    if (!ready || !map.getLayer('lines')) return;
    map.setPaintProperty('lines', 'line-width', lineWidth());
    map.setPaintProperty('plain', 'line-width', lineWidth());
    map.setPaintProperty('glow', 'line-width', glowWidth());
    map.setPaintProperty('heat', 'heatmap-intensity', heatIntensity());
    map.setPaintProperty('soft', 'heatmap-intensity', softIntensity());
    map.setPaintProperty('raw', 'heatmap-intensity', softIntensity());
  });

  // Highlighted run: outlined, and the map zooms to it (only when it changes, not on a basemap switch)
  let zoomedTo = null;
  $effect(() => {
    const r = app.highlighted;
    if (!ready || !map.getSource('hl')) return;
    map.getSource('hl').setData(r ? { type: 'Feature', properties: {},
      geometry: { type: 'MultiLineString', coordinates: r.segs } } : empty);
    if (!r || r === zoomedTo) { zoomedTo = r; return; }
    zoomedTo = r;
    const b = new maplibregl.LngLatBounds();
    r.segs.forEach(seg => seg.forEach(p => b.extend(p)));
    map.fitBounds(b, { padding: freePadding(), maxZoom: 15, duration: 1200 });
  });
</script>

<div id="map" bind:this={container}></div>

<style>
  #map { position: absolute; inset: 0; background: #000; }
</style>
