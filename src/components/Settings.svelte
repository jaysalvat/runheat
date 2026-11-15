<script>
  // Settings popup: non-modal, the map stays visible and updates live
  import { app } from '../lib/app.svelte.js';
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

<div class="floating popup" role="dialog" aria-label="Display settings">
  <h2><span>Settings</span><IconButton label="Close" onclick={() => (app.panel = null)}>✕</IconButton></h2>

  <div class="label first"><span>Colour scale</span></div>
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

  <Slider label="Line width" bind:value={s.lineW} display={mult(s.lineW, 25)} off={!s.lines && !s.plain} />
  <Slider
    label="Heat intensity"
    bind:value={s.heatK}
    display={mult(s.heatK, 20)}
    off={!s.heat && !s.soft && !s.raw}
  />

  <div class="label"><span>Interface colour</span></div>
  <ColorField
    label="Buttons, charts, calendar"
    bind:value={s.accent}
    fallback={DEFAULT_ACCENT}
    current={false}
  />

  <div class="label"><span>Track colour</span></div>
  <div class="colors">
    {#each TRACKS as [g, label] (g)}
      <!-- the basemap you're looking at is highlighted -->
      <ColorField {label} bind:value={s.colors[g]} fallback={DEFAULT_COLORS[g]} current={group === g} />
    {/each}
  </div>

  <div class="label"><span>Route outline</span></div>
  <Segmented
    bind:value={s.outline}
    options={[
      { value: 'tint', label: 'Tinted', title: 'A slightly darker shade of the track colour' },
      { value: 'dark', label: 'Dark', title: 'Black outline around the routes' },
      { value: 'none', label: 'None', title: 'No outline' },
    ]}
  />

  <Slider label="Layers opacity" bind:value={s.layerOp} min={10} display="{s.layerOp}%" />
  <Slider
    label="Map opacity"
    bind:value={s.mapOp}
    display="{s.mapOp}%"
    title="Fades the basemap to black so your runs stand out"
  />

  <div class="label"><span>Relief</span><span class="hint">{BASES[s.base].label} map</span></div>
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

  <div class="label"><span>Yearly goal</span></div>
  <label class="goal">
    <input
      type="number"
      min="50"
      max="10000"
      step="50"
      value={s.goal}
      onchange={(e) => {
        const v = Math.round(+e.currentTarget.value);
        if (v >= 50) s.goal = v;
      }}
    /> km / year
  </label>

  <div class="label"><span>Data</span></div>
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

<style>
  .first {
    margin-top: 0;
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
  .remove {
    margin-top: 6px;
  }
  .row {
    display: flex;
    gap: 4px;
  }
  .hint {
    color: var(--muted);
    font-weight: 400;
  }
</style>
