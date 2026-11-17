<script>
  // Settings popup: non-modal, the map stays visible and updates live
  import { app } from '../lib/app.svelte.js';
  import { sheet } from '../lib/sheet.js';
  import { BASES, COLOR_GROUP, DEFAULT_COLORS, DEFAULT_ACCENT } from '../lib/config.js';
  import { plural } from '../lib/format.js';
  import { RunData } from '../lib/data.js';
  import IconButton from './ui/IconButton.svelte';
  import Segmented from './ui/Segmented.svelte';
  import Slider from './ui/Slider.svelte';
  import ColorField from './ui/ColorField.svelte';
  import Toggle from './ui/Toggle.svelte';

  const s = app.settings;
  const mult = (v, d) => '×' + Math.pow(2, (v - 50) / d).toFixed(1);
  const group = $derived(COLOR_GROUP[s.base]);
  const TRACKS = [
    ['dark', 'Dark'],
    ['map', 'Streets'],
    ['sat', 'Satellite'],
  ];

  async function setDemo(on) {
    RunData.setDemo(on);
    await app.load();
    app.toast = on ? 'Showing the demo data' : 'Back to your runs';
  }

  // Removing all activities needs a second click within 4 s
  let armed = $state(false),
    timer;
  async function remove() {
    if (!armed) {
      armed = true;
      timer = setTimeout(() => (armed = false), 4000);
      return;
    }
    clearTimeout(timer);
    armed = false;
    await RunData.reset();
    RunData.setDemo(false);
    await app.load();
    app.toast = 'Imported activities removed';
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.panel = null)} />

<div
  class="floating popup sheet"
  role="dialog"
  aria-label="Display settings"
  use:sheet={{ onDown: () => (app.panel = null), onTap: () => (app.panel = null) }}
>
  <div class="grabber" aria-hidden="true"></div>
  <h2><span>Settings</span><IconButton label="Close" onclick={() => (app.panel = null)}>✕</IconButton></h2>

  <h3 class="group first">Goal</h3>
  <div class="label"><span>Yearly distance</span></div>
  <label class="goal">
    <input
      type="number"
      min="50"
      max="10000"
      step="50"
      value={s.goal}
      aria-label="Yearly distance goal"
      onchange={(e) => {
        const v = Math.round(+e.currentTarget.value);
        if (v >= 50) s.goal = v;
      }}
    /> km / year
  </label>

  <h3 class="group">Map</h3>
  <div class="label"><span>View</span></div>
  <div class="row">
    <Toggle bind:checked={s.globe} label="Globe" title="Round Earth when zoomed out" />
    <Toggle
      bind:checked={s.terrain}
      label="3D"
      title="Tilted map with the relief in 3D. Right-drag (or Ctrl + drag) to rotate and tilt"
    />
  </div>
  <div class="label"><span>Relief</span><span>{BASES[s.base].label} map</span></div>
  <div class="row">
    <Toggle
      bind:checked={s.relief[s.base]}
      label="Hillshade"
      disabled={s.base === 'satellite'}
      title={s.base === 'satellite' ? 'The photo already shows the relief' : 'Shades the slopes'}
    />
    <Toggle
      bind:checked={s.contours[s.base]}
      label="Contours"
      title="Contour lines, with elevation labels when zoomed in"
    />
  </div>
  <Slider
    label="Basemap brightness"
    bind:value={s.mapOp}
    display="{s.mapOp}%"
    title="Darkens the basemap so your runs stand out"
  />
  <div class="label"><span>Intensity scale</span></div>
  <Segmented
    bind:value={s.scale}
    options={[
      { value: 'global', label: 'Global', title: 'Same scale everywhere: compare places with each other' },
      {
        value: 'zone',
        label: 'Per place',
        title: 'Each place gets its own scale: its most-run path hits the top',
      },
    ]}
  />

  <h3 class="group">Style</h3>
  <div class="label"><span>Track colour</span><span>per basemap</span></div>
  <div class="colors">
    {#each TRACKS as [g, label] (g)}
      <!-- the basemap you're looking at is highlighted -->
      <ColorField {label} bind:value={s.colors[g]} fallback={DEFAULT_COLORS[g]} current={group === g} />
    {/each}
  </div>
  <div class="label"><span>Track outline</span><span>Routes layer</span></div>
  <Segmented
    bind:value={s.outline}
    options={[
      { value: 'tint', label: 'Tinted', title: 'A slightly darker shade of the track colour' },
      { value: 'dark', label: 'Dark', title: 'Black outline around the tracks' },
      { value: 'none', label: 'None', title: 'No outline' },
    ]}
  />
  <Slider label="Track width" bind:value={s.lineW} display={mult(s.lineW, 25)} off={!s.lines && !s.plain} />
  <Slider
    label="Heat intensity"
    bind:value={s.heatK}
    display={mult(s.heatK, 20)}
    off={!s.heat && !s.soft && !s.raw}
  />
  <Slider
    label="Layers opacity"
    bind:value={s.layerOp}
    min={10}
    display="{s.layerOp}%"
    title="Transparency of every layer drawn over the basemap"
  />
  <div class="label"><span>Accent colour</span></div>
  <ColorField
    label="Buttons, charts, calendar"
    bind:value={s.accent}
    fallback={DEFAULT_ACCENT}
    current={false}
  />

  <h3 class="group">Data</h3>
  <div class="data">
    <Toggle
      checked={app.info.demo}
      disabled={!app.info.own}
      label="Demo data"
      title={app.info.own
        ? 'Show the demo runs (French Riviera) instead of yours'
        : 'Import your runs to leave the demo'}
      onchange={(e) => setDemo(e.currentTarget.checked)}
    />
    <button
      class="btn danger remove"
      class:armed
      disabled={!app.info.imported}
      onclick={remove}
      title={app.info.imported
        ? `Removes your ${plural(app.info.imported, 'activity')} from this browser`
        : 'Nothing imported yet'}
    >
      {armed ? 'Click again to confirm' : 'Remove all activities'}
    </button>
  </div>

  <p class="credits">
    Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
      >OpenStreetMap</a
    >
    contributors · Basemaps ©
    <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> · Satellite © Esri,
    Maxar, Earthstar Geographics · Elevation:
    <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a>
    · Places:
    <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a>
  </p>

  <p class="version">
    <a href="https://github.com/jaysalvat/runheat" target="_blank" rel="noopener"
      >RunHeat v{__APP_VERSION__}</a
    >
    · By <a class="author" href="https://jaysalvat.com" target="_blank" rel="noopener">Jay Salvat</a>
  </p>
</div>

<style>
  /* group titles, like the stats cards; a hairline separates the groups */
  .group {
    margin: 18px -18px 0;
    padding: 14px 18px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .group.first {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .group + .label {
    margin-top: 8px;
  }
  .data {
    display: grid;
    gap: 6px;
    margin-top: 10px;
  }
  .colors {
    display: grid;
    gap: 4px;
  }
  .goal {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
  }
  .goal input {
    width: 90px;
    padding: 6px 8px;
    background: var(--chip);
    color: var(--text);
    border: 1px solid transparent;
    border-radius: 8px;
    font: inherit;
    outline: none;
  }
  .goal input:focus {
    border-color: var(--accent);
  }
  .credits {
    margin: 16px 0 0;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.5;
    text-align: center;
  }
  .credits a {
    color: inherit;
  }
  .credits a:hover {
    color: var(--text);
  }
  .version {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 11px;
    text-align: center;
  }
  .version a {
    color: inherit;
    text-decoration: none;
  }
  .version a:hover {
    color: var(--text);
  }
  /* the author's name reads as a link */
  .version .author {
    color: var(--text);
    text-decoration: underline;
    text-decoration-color: rgba(255, 255, 255, 0.3);
    text-underline-offset: 2px;
  }
  .version .author:hover {
    color: var(--accent);
    text-decoration-color: currentColor;
  }
  .remove {
    margin-top: 0;
  }
  .row {
    display: flex;
    gap: 4px;
  }
</style>
