<script>
  // Place index: one row per town, click = filter + fly there, filter field on top
  import { app } from '../lib/app.svelte.js';
  import { nf } from '../lib/format.js';
  import { mapCtl } from '../lib/mapctl.js';

  let query = $state('');
  let list;

  // Ignores case, accents and hyphens ("st vallier" finds Saint-Vallier)
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\bsaint\b/g, 'st').replace(/[-'’\s]+/g, ' ').trim();

  const rows = $derived(app.zones.map((z, i) => {
    const from = z.from.slice(0, 4), to = z.to.slice(0, 4);
    const years = from === to ? from : `${from}–${to}`;
    const km = nf(Math.round(z.km));
    return { i, z, key: norm(z.name), sub: `${km} km · ${years}`,
      title: `${z.name}\n${z.n} runs through here · ${km} km inside · ${years}` };
  }));
  const shown = $derived.by(() => { const q = norm(query); return q ? rows.filter(r => r.key.includes(q)) : rows; });

  // Activities per place under the current filters (a run counts wherever it covered ≥ 1 km)
  const perZone = $derived.by(() => {
    const c = {};
    for (const r of app.sel) for (const z of r.zs || [r.z]) c[z] = (c[z] || 0) + 1;
    return c;
  });

  function pick(row) {
    if (app.zone === row.i) { app.zone = null; return; }
    app.zone = row.i;
    const b = row.z.bbox;
    mapCtl.fit([[b[0], b[1]], [b[2], b[3]]]);
  }
  $effect(() => { query; if (list) list.scrollTop = 0; });
</script>

<div class="label"><span>Places</span><span>{app.zones.length}</span></div>
<input type="search" class="filter" id="placeFilter" placeholder="Filter places…" autocomplete="off" aria-label="Filter places"
  title="Filter places" aria-keyshortcuts="F" bind:value={query}
  onkeydown={e => { if (e.key === 'Enter' && shown[0]) pick(shown[0]); if (e.key === 'Escape') e.currentTarget.blur(); }}>
<div class="zones" bind:this={list}>
  {#each shown as row (row.i)}
    {@const n = perZone[row.i] || 0}
    <button class:on={app.zone === row.i} class:dim={!n} title={row.title} onclick={() => pick(row)}>
      <span>{row.z.flag}</span>
      <span class="zn"><span class="name">{row.z.name}</span><span class="sub">{row.sub}</span></span>
      <small>{n}</small>
    </button>
  {/each}
</div>
{#if !shown.length}<div class="empty">No matching place</div>{/if}

<style>
  .filter { width: 100%; margin: 0 0 6px; padding: 7px 10px; background: var(--chip); color: var(--text);
    border: 1px solid transparent; border-radius: 8px; font: inherit; outline: none; }
  .filter::placeholder { color: var(--muted); }
  .filter:focus { border-color: var(--accent); }
  .empty { color: var(--muted); font-size: 12px; padding: 8px 0; text-align: center; }
  .zones { max-height: 240px; overflow-y: auto; margin: 0 -6px; }
  button { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 6px; min-height: 48px;
    width: 100%; padding: 6px; background: none; border: 0; border-radius: 6px; color: var(--text);
    font: inherit; text-align: left; cursor: pointer; }
  button:hover, button.on { background: var(--chip); }
  button.on .zn { color: var(--accent); }
  button.dim { opacity: .35; }
  .zn { min-width: 0; }
  .name, .sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--muted); font-size: 12px; }
  small { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
</style>
