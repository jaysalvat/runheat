<script>
  // Side panel: totals, basemap, layers, period, activities, places, sources
  import { app } from '../lib/app.svelte.js';
  import { BASES, LAYERS, SPORTS } from '../lib/config.js';
  import { nf, plural } from '../lib/format.js';
  import { mapCtl } from '../lib/mapctl.js';
  import IconButton from './ui/IconButton.svelte';
  import Icon from './ui/Icon.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Segmented from './ui/Segmented.svelte';
  import SportIcon from './ui/SportIcon.svelte';
  import PeriodNav from './PeriodNav.svelte';
  import Places from './Places.svelte';

  const s = app.settings;
  let collapsed = $state(false);

  const baseOptions = Object.entries(BASES).map(([value, b]) => ({ value, label: b.label }));
  const km = $derived(Math.round(app.sel.reduce((t, r) => t + r.km, 0)));
  const nBySport = $derived.by(() => {
    const c = {};
    for (const r of app.runs) c[r.sp] = (c[r.sp] || 0) + 1;
    return c;
  });
  const sources = $derived([...new Set(app.runs.map(r => r.src))]);

  // Set membership as a checkbox (function binding: get, set)
  const member = (set, key) => [() => set.has(key), on => (on ? set.add(key) : set.delete(key))];
  const togglePanel = name => (app.panel = app.panel === name ? null : name);
</script>

<div class="floating panel" class:collapsed id="panel">
  <h1>
    <span>My runs{#if app.info.demo}<span class="demo">Demo</span>{/if}</span>
    <span class="actions">
      <IconButton label="Import runs" on={app.panel === 'data'} onclick={() => togglePanel('data')}><Icon name="upload" /></IconButton>
      <IconButton label="Statistics" on={s.stats} onclick={() => (s.stats = !s.stats)}><Icon name="chart" /></IconButton>
      <IconButton label="Display settings" on={app.panel === 'settings'} onclick={() => togglePanel('settings')}><Icon name="gear" /></IconButton>
      <span class="collapse"><IconButton label="Collapse panel" onclick={() => (collapsed = !collapsed)}>▾</IconButton></span>
    </span>
  </h1>

  <div class="body">
    <div class="totals">
      <div><b>{nf(app.sel.length)}</b><span>runs</span></div>
      <div><b>{nf(km)}</b><span>km</span></div>
    </div>

    <div class="label"><span>Basemap</span></div>
    <Segmented options={baseOptions} bind:value={s.base} />

    <div class="label"><span>Layers</span></div>
    <div class="grid2">
      {#each LAYERS as l (l.key)}
        <Toggle bind:checked={s[l.key]} title={l.title} label={l.label} />
      {/each}
    </div>

    <PeriodNav />

    <div class="label"><span>Activities</span></div>
    <div class="row">
      <!-- every type is listed; the ones missing from your data are greyed out -->
      {#each Object.keys(SPORTS) as sp (sp)}
        {@const n = nBySport[sp] || 0}
        {@const [get, set] = member(app.sports, sp)}
        <Toggle compact bind:checked={get, set} disabled={!n} label={SPORTS[sp].label}
          title={n ? `${SPORTS[sp].label} · ${plural(n, 'activity')}` : `${SPORTS[sp].label} · none in your data`}>
          <SportIcon {sp} />
        </Toggle>
      {/each}
    </div>

    <Places />

    <div class="label"><span>Sources</span></div>
    <div class="row">
      {#each sources as src (src)}
        {@const [get, set] = member(app.sources, src)}
        <Toggle bind:checked={get, set} label={src[0].toUpperCase() + src.slice(1)} />
      {/each}
    </div>

    <button class="btn" onclick={() => app.area && mapCtl.fit(app.area, { maxZoom: 22, duration: 1000 })}>Back to my main area</button>
  </div>
</div>

<style>
  .panel { top: 16px; left: 16px; width: 340px; }
  h1 { font-size: 15px; margin: 0 0 12px; font-weight: 600; letter-spacing: .02em;
    display: flex; align-items: center; justify-content: space-between; }
  .actions { display: flex; gap: 4px; }
  .demo { margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: var(--accent); color: var(--on-accent);
    font-size: 11px; font-weight: 600; vertical-align: 2px; }
  .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 6px; }
  .totals b { display: block; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .totals span { color: var(--muted); font-size: 12px; }
  .collapse { display: none; }
  @media (max-width: 600px) {
    .panel { left: 16px; right: 16px; width: auto; top: auto; bottom: 16px; max-height: 60%; }
    .collapsed .body { display: none; }
    .collapse { display: inline-flex; }
  }
</style>
