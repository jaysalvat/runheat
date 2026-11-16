<script>
  // The map: basemap, run layers, and their updates when settings or filters change.
  import * as maplibregl from 'maplibre-gl';
  // MapLibre 6 loads its worker relative to its own module, which the bundler relocates: pass the URL explicitly
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte.js';
  import {
    BASES,
    COLOR_GROUP,
    DEFAULT_COLORS,
    HEAT_COLORS,
    SOFT_COLORS,
    HEAT_W,
    SOFT_W,
    RAW_W,
  } from '../lib/config.js';
  import { deeper, mix } from '../lib/colors.js';
  import { smooth } from '../lib/geo.js';
  import { mapCtl, freePadding } from '../lib/mapctl.js';
  import { addRelief, labelsAnchor, SHADE_LAYERS, CONTOUR_LAYERS } from '../lib/relief.js';

  let container;
  let map;
  let ready = $state(0); // +1 each time our layers are (re)created on a style
  let reliefReady = $state(0); // same for the relief layers
  let styleReady = false; // the basemap style has loaded (isStyleLoaded() is false while tiles load)

  const s = app.settings;

  // ---- Paint expressions ----
  // Track width: slider 0–100 → ×0.25 to ×4 (50 = ×1); heat: ×0.18 to ×5.7
  const lineMult = (v) => Math.pow(2, (v - 50) / 25);
  const heatMult = (v) => Math.pow(2, (v - 50) / 20);
  const lineWidth = () => {
    const k = lineMult(s.lineW);
    return ['interpolate', ['linear'], ['zoom'], 8, 0.5 * k, 14, 1.6 * k, 18, 3 * k];
  };
  // Routes: thicker, with an outline 1–3 px wider on each side (none: same width, hidden)
  const ROUTE_W = [
      [8, 1.2],
      [14, 3],
      [18, 5],
    ],
    OUTLINE_W = [1, 2, 3];
  const routeWidth = (pad = 0) => {
    const k = lineMult(s.lineW);
    return [
      'interpolate',
      ['linear'],
      ['zoom'],
      ...ROUTE_W.flatMap(([z, w], i) => [z, w * k + pad * OUTLINE_W[i] * 2]),
    ];
  };
  const glowWidth = () => {
    const k = lineMult(s.lineW);
    return ['interpolate', ['linear'], ['zoom'], 8, 3 * k, 14, 12 * k, 18, 20 * k];
  };
  const heatIntensity = () => {
    const k = heatMult(s.heatK);
    return ['interpolate', ['linear'], ['zoom'], 8, 0.25 * k, 15, 1 * k];
  };
  const softIntensity = () => {
    const k = heatMult(s.heatK);
    return ['interpolate', ['linear'], ['zoom'], 8, 0.12 * k, 15, 0.4 * k];
  };

  // "Per place" scale: each run is weighted by its place's weight w (the most frequent
  // route in each place reaches the top of the scale)
  const byZone = () => s.scale === 'zone';
  const weight = (base) => (byZone() ? ['*', base, ['get', 'w']] : base);
  const scaled = (a) => (byZone() ? ['min', 1, ['*', a, ['get', 'w']]] : a);
  const op = (a) => ['*', s.layerOp / 100, scaled(a)];
  const lineOpacity = () => {
    const o = BASES[s.base].lineOpacity;
    return ['interpolate', ['linear'], ['zoom'], 8, op(o[0]), 14, op(o[1]), 18, op(o[2])];
  };
  const glowOpacity = () => {
    const o = BASES[s.base].glowOpacity;
    return ['interpolate', ['linear'], ['zoom'], 8, op(o[0]), 14, op(o[1])];
  };

  // Track colour (Settings) and Density's halo: on Dark, a deeper shade (the default keeps its tuned glow)
  const trackColor = () => s.colors[COLOR_GROUP[s.base]] || BASES[s.base].line;
  const darkTrack = () => mix(trackColor(), '#000000', 0.2);
  function glowColor() {
    const c = trackColor();
    if (s.base !== 'dark') return c;
    return c.toLowerCase() === DEFAULT_COLORS.dark ? BASES.dark.glow : deeper(c);
  }
  // Routes outline: a darker shade of the track colour ('tint') or black
  const outlineColor = () => (s.outline === 'tint' ? darkTrack() : '#000000');
  const outlineOpacity = () => (s.outline === 'none' ? 0 : s.outline === 'tint' ? 0.9 : 0.85);
  const empty = { type: 'FeatureCollection', features: [] };
  const setVisible = (ids, on) =>
    ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
  const FILTERED = [
    'glow',
    'lines',
    'heat',
    'soft',
    'raw',
    'plain-case',
    'plain',
    'ex',
    'ex-glow',
    'ex-case',
  ];

  // Chevron pointing along the line (east = direction of travel), drawn once as an SDF icon
  function chevron() {
    const n = 28,
      c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    g.strokeStyle = '#000';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(10, 6);
    g.lineTo(18, 14);
    g.lineTo(10, 22);
    g.stroke();
    return g.getImageData(0, 0, n, n);
  }

  // (Re)creates sources + layers: on load and after every basemap change
  function addOverlay() {
    if (!map || map.getSource('runs') || !app.geo) return;
    const b = BASES[s.base];
    const before = labelsAnchor(map); // our layers go above roads and buildings, under the labels
    const g = app.geo;
    map.addSource('runs', { type: 'geojson', data: g.lines });
    map.addSource('pts', { type: 'geojson', data: g.points });
    map.addSource('ptsRaw', { type: 'geojson', data: g.raw });
    map.addSource('explore', { type: 'geojson', data: g.explore });
    map.addSource('hl', { type: 'geojson', data: empty });
    const round = { 'line-join': 'round', 'line-cap': 'round' };
    const softRadius = [
      'interpolate',
      ['exponential', 1.6],
      ['zoom'],
      6,
      12,
      10,
      25,
      13,
      45,
      16,
      90,
      18,
      140,
    ];
    const layers = [
      // Black veil between the basemap and our layers: its opacity follows "Map opacity"
      { id: 'veil', type: 'background', paint: { 'background-color': '#000', 'background-opacity': 0 } },
      // Order: diffuse at the bottom, sharp heatmap, then tracks on top
      // Raw hotspots: the raw GPS points, unresampled (pauses and bends weigh more)
      {
        id: 'raw',
        type: 'heatmap',
        source: 'ptsRaw',
        paint: {
          'heatmap-weight': weight(RAW_W),
          'heatmap-intensity': softIntensity(),
          'heatmap-radius': softRadius,
          'heatmap-color': SOFT_COLORS,
        },
      },
      {
        id: 'soft',
        type: 'heatmap',
        source: 'pts',
        paint: {
          'heatmap-weight': weight(SOFT_W),
          'heatmap-intensity': softIntensity(),
          'heatmap-radius': softRadius,
          'heatmap-color': SOFT_COLORS,
        },
      },
      {
        id: 'heat',
        type: 'heatmap',
        source: 'pts',
        paint: {
          'heatmap-weight': weight(HEAT_W),
          'heatmap-intensity': heatIntensity(),
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 13, 10, 16, 22],
          'heatmap-color': HEAT_COLORS,
        },
      },
      {
        id: 'glow',
        type: 'line',
        source: 'runs',
        layout: round,
        paint: {
          'line-color': glowColor(),
          'line-blur': 8,
          'line-width': glowWidth(),
          'line-opacity': glowOpacity(),
        },
      },
      {
        id: 'lines',
        type: 'line',
        source: 'runs',
        layout: round,
        paint: { 'line-color': trackColor(), 'line-width': lineWidth(), 'line-opacity': lineOpacity() },
      },
      // Routes: uniform opaque line, a path run once looks like a path run 300 times.
      // All outlines first, then all the lines: crossing routes merge into one outlined network
      {
        id: 'plain-case',
        type: 'line',
        source: 'runs',
        layout: round,
        paint: {
          'line-color': outlineColor(),
          'line-width': routeWidth(1),
          'line-opacity': outlineOpacity(),
        },
      },
      {
        id: 'plain',
        type: 'line',
        source: 'runs',
        layout: round,
        paint: { 'line-color': trackColor(), 'line-width': routeWidth(), 'line-opacity': 1 },
      },
      {
        id: 'ex-glow',
        type: 'line',
        source: 'explore',
        layout: round,
        paint: {
          'line-color': trackColor(),
          'line-blur': 5,
          'line-opacity': 0.25,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 10],
        },
      },
      // Casing under the dashes: the gaps stay visible even over the Routes layer
      {
        id: 'ex-case',
        type: 'line',
        source: 'explore',
        layout: round,
        paint: {
          'line-color': b.casing,
          'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5, 18, 7],
        },
      },
      // Dashed line: butt caps keep the dashes crisp (round caps would merge them)
      {
        id: 'ex',
        type: 'line',
        source: 'explore',
        layout: { 'line-join': 'round', 'line-cap': 'butt' },
        paint: {
          'line-color': trackColor(),
          'line-dasharray': [2, 1.5],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 2.5, 18, 4],
        },
      },
    ];
    for (const l of layers) map.addLayer(l, before);
    // Highlighted run, always on top: a soft golden glow on Dark, a crisp dark casing elsewhere
    map.addLayer({
      id: 'hl-glow',
      type: 'line',
      source: 'hl',
      layout: round,
      paint: b.hlGlow
        ? { 'line-color': b.hlGlow, 'line-width': 12, 'line-blur': 6, 'line-opacity': 0.6 }
        : { 'line-color': '#16181c', 'line-width': 7, 'line-opacity': 0.9 },
    });
    map.addLayer({
      id: 'hl',
      type: 'line',
      source: 'hl',
      layout: round,
      paint: { 'line-color': '#fff', 'line-width': 3 },
    });
    // Direction of the run: chevrons along the selected run only (never on the whole set)
    if (!map.hasImage('chevron')) map.addImage('chevron', chevron(), { sdf: true, pixelRatio: 2 });
    map.addLayer({
      id: 'hl-arrows',
      type: 'symbol',
      source: 'hl',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 90,
        'icon-image': 'chevron',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 16, 1],
      },
      paint: {
        'icon-color': darkTrack(),
        'icon-halo-color': '#fff',
        'icon-halo-width': 1.5,
      },
    });
    ready++;
  }

  onMount(() => {
    maplibregl.setWorkerUrl(workerUrl);
    map = new maplibregl.Map({
      container,
      center: [2.35, 48.85],
      zoom: 4,
      attributionControl: { compact: true },
    });
    setBase(s.base);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    // MapLibre opens the compact attribution until the first drag: keep it folded to its ⓘ button
    // from the start (the full credits are also listed in the settings)
    map.once('idle', () =>
      container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'),
    );
    map.on('style.load', () => {
      styleReady = true;
      addRelief(map, s.base);
      reliefReady++;
      view3d(); // projection and terrain belong to the style: set them again after each basemap change
      addOverlay();
    });
    mapCtl.map = map;
    return () => {
      map.remove();
      mapCtl.map = null;
    };
  });

  // Basemap change: new style, 'style.load' recreates our layers
  let shownBase = s.base;
  $effect(() => {
    const base = s.base;
    if (!map || base === shownBase) return;
    shownBase = base;
    styleReady = false;
    setBase(base);
  });

  function setBase(base) {
    const b = BASES[base];
    // No paint fade: settings apply at once, and the 3D draped cache (see redraw3d) never keeps a mid-fade frame
    const transformStyle = (prev, next) => ({
      ...(b.transform ? b.transform(prev, next) : next),
      transition: { duration: 0, delay: 0 },
    });
    map.setStyle(b.style, { diff: false, transformStyle });
  }

  // New dataset: update the sources (or create the layers) and show the main area
  let shownVersion = 0;
  $effect(() => {
    const v = app.dataVersion,
      geo = app.geo;
    if (!map || !geo || v === shownVersion) return;
    const first = !shownVersion;
    shownVersion = v;
    if (map.getSource('runs')) {
      map.getSource('runs').setData(geo.lines);
      map.getSource('pts').setData(geo.points);
      map.getSource('ptsRaw').setData(geo.raw);
      map.getSource('explore').setData(geo.explore);
    } else if (styleReady) addOverlay();
    if (app.area) showArea(app.area, first && s.globe);
  });

  // In 3D, MapLibre 6 caches what is draped on the terrain (lines, the veil…) and only redraws it when
  // source data or the visible layers change, not after a paint or filter change: drop that cache.
  // (Internal API, hence the guards: without it the map just updates one change late in 3D.)
  function redraw3d() {
    for (const tile of map.terrain?.tileManager?.getRenderableTiles?.() || []) tile.releaseRTT?.(map.painter);
    map.triggerRepaint();
  }

  // Filters, visibility, opacity, colours
  $effect(() => {
    if (!ready || !map.getLayer('lines')) return;
    const [dA, dB] = app.range;
    const f = [
      'all',
      ['>=', ['get', 'd'], dA],
      ['<=', ['get', 'd'], dB],
      ['in', ['get', 'src'], ['literal', [...app.sources]]],
      ['in', ['get', 'sp'], ['literal', [...app.sports]]],
    ];
    for (const id of FILTERED) map.setFilter(id, f);
    setVisible(['plain-case', 'plain'], s.plain);
    setVisible(['ex', 'ex-glow', 'ex-case'], s.explore);
    setVisible(['heat'], s.heat);
    setVisible(['soft'], s.soft);
    setVisible(['raw'], s.raw);
    setVisible(['lines', 'glow'], s.lines);
    // No Density halo over a heatmap, so the heatmap stays readable
    const both = s.lines && (s.heat || s.soft || s.raw);
    map.setPaintProperty('glow', 'line-opacity', both ? 0 : glowOpacity());
    map.setPaintProperty('lines', 'line-opacity', lineOpacity());
    map.setPaintProperty('heat', 'heatmap-weight', weight(HEAT_W));
    map.setPaintProperty('soft', 'heatmap-weight', weight(SOFT_W));
    map.setPaintProperty('raw', 'heatmap-weight', weight(RAW_W));
    const lo = s.layerOp / 100;
    for (const id of ['heat', 'soft', 'raw']) map.setPaintProperty(id, 'heatmap-opacity', lo);
    map.setPaintProperty('plain', 'line-opacity', lo);
    map.setPaintProperty('plain-case', 'line-opacity', outlineOpacity() * lo);
    map.setPaintProperty('plain-case', 'line-color', outlineColor());
    map.setPaintProperty('ex', 'line-opacity', lo);
    map.setPaintProperty('ex-glow', 'line-opacity', 0.25 * lo);
    map.setPaintProperty('ex-case', 'line-opacity', 0.85 * lo);
    map.setPaintProperty('veil', 'background-opacity', 1 - s.mapOp / 100);
    for (const id of ['lines', 'plain', 'ex', 'ex-glow'])
      map.setPaintProperty(id, 'line-color', trackColor());
    map.setPaintProperty('hl-arrows', 'icon-color', darkTrack());
    map.setPaintProperty('glow', 'line-color', glowColor());
    redraw3d();
  });

  // Opening on the globe: start from the whole Earth and fly down to the main area
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function showArea(area, fromSpace) {
    const cam = { ...map.cameraForBounds(area, { padding: 60 }), ...camera3d() };
    if (!fromSpace || reducedMotion) return map.jumpTo(cam);
    map.jumpTo({ center: cam.center, zoom: 1.5, pitch: 0, bearing: 0 });
    // wait for the globe tiles, but not forever ('idle' may never come while relief tiles stream in)
    let flown = false;
    const fly = () =>
      !flown && (flown = true) && map.flyTo({ ...cam, duration: 4500, curve: 1.6, essential: true });
    map.once('idle', fly);
    setTimeout(fly, 1500);
  }

  // 3D view: a slight tilt and rotation, so the relief reads at once
  const camera3d = () => (s.terrain ? { pitch: 50, bearing: -15 } : { pitch: 0, bearing: 0 });

  // Globe projection and 3D terrain
  function view3d() {
    map.setProjection({ type: s.globe ? 'globe' : 'mercator' });
    map.setTerrain(s.terrain ? { source: 'dem-terrain', exaggeration: 1.5 } : null);
  }
  let shownTerrain = s.terrain;
  $effect(() => {
    const terrain = s.terrain;
    s.globe; // re-run when the projection changes
    if (!reliefReady || !styleReady) return;
    view3d();
    if (terrain !== shownTerrain) {
      shownTerrain = terrain;
      map.easeTo({ ...camera3d(), duration: 800 });
    }
  });

  // Relief: hillshade and contours, set per basemap
  $effect(() => {
    if (!reliefReady) return;
    setVisible(SHADE_LAYERS, s.relief[s.base]);
    setVisible(CONTOUR_LAYERS, s.contours[s.base]);
  });

  // Line width and heat intensity sliders
  $effect(() => {
    if (!ready || !map.getLayer('lines')) return;
    map.setPaintProperty('lines', 'line-width', lineWidth());
    map.setPaintProperty('plain', 'line-width', routeWidth());
    map.setPaintProperty('plain-case', 'line-width', routeWidth(1));
    map.setPaintProperty('glow', 'line-width', glowWidth());
    map.setPaintProperty('heat', 'heatmap-intensity', heatIntensity());
    map.setPaintProperty('soft', 'heatmap-intensity', softIntensity());
    map.setPaintProperty('raw', 'heatmap-intensity', softIntensity());
    redraw3d();
  });

  // Highlighted run: outlined, and the map zooms to it (only when it changes, not on a basemap switch)
  let zoomedTo = null;
  $effect(() => {
    const r = app.highlighted;
    if (!ready || !map.getSource('hl')) return;
    map.getSource('hl').setData(
      r
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'MultiLineString', coordinates: r.segs.map(smooth) },
          }
        : empty,
    );
    if (!r || r === zoomedTo) {
      zoomedTo = r;
      return;
    }
    zoomedTo = r;
    const b = new maplibregl.LngLatBounds();
    r.segs.forEach((seg) => seg.forEach((p) => b.extend(p)));
    map.fitBounds(b, { padding: freePadding(), maxZoom: 15, duration: 1200 });
  });
</script>

<div id="map" bind:this={container}></div>

<style>
  #map {
    position: absolute;
    inset: 0;
    background: #000;
  }
</style>
