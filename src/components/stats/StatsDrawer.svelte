<script>
  // Stats drawer: volume + calendar on the left, goals + records on the right
  import { app } from '../../lib/app.svelte.js';
  import { fmtD, monthName } from '../../lib/format.js';
  import { scopeOf } from '../../lib/period.js';
  import { hideTip } from '../../lib/tooltip.svelte.js';
  import IconButton from '../ui/IconButton.svelte';
  import Volume from './Volume.svelte';
  import Calendar from './Calendar.svelte';
  import Goals from './Goals.svelte';
  import Records from './Records.svelte';

  // Closing the drawer (S key) while hovering a chart would leave its tooltip behind
  $effect(() => hideTip);

  // Context chips: the period (removable when narrowed) and the place
  const period = $derived.by(() => {
    const [dA, dB] = app.range,
      sc = scopeOf(dA, dB);
    if (!app.dFrom) return app.yMin === app.yMax ? String(app.yMin) : `${app.yMin} – ${app.yMax}`;
    return sc.level === 'day'
      ? `${monthName(sc.m)} ${sc.y}`
      : sc.level === 'month'
        ? String(sc.y)
        : `${fmtD(dA)} – ${fmtD(dB)}`;
  });
  const place = $derived(app.zone != null ? app.zones[app.zone]?.name : null);
</script>

<section class="floating drawer" id="statsDrawer" aria-label="Statistics">
  <header>
    <h2>Statistics</h2>
    <span class="ctx">
      <span class="chip" class:plain={!app.dFrom}
        >{period}
        {#if app.dFrom}<button aria-label="Remove this filter" onclick={() => (app.dFrom = app.dTo = null)}
            >✕</button
          >{/if}
      </span>
      {#if place}
        <span class="chip"
          >{place}<button aria-label="Remove this filter" onclick={() => (app.zone = null)}>✕</button></span
        >
      {/if}
    </span>
    <IconButton label="Close statistics" onclick={() => (app.settings.stats = false)}>✕</IconButton>
  </header>
  <div class="cols">
    <!-- left: Volume 2/3 of the height, Calendar 1/3 -->
    <div class="col main"><Volume /><Calendar /></div>
    <div class="col side"><Goals /><Records /></div>
  </div>
</section>

<style>
  .drawer {
    left: 372px;
    right: 16px;
    bottom: 16px;
    top: auto;
    max-height: min(560px, calc(100% - 32px));
    padding: 16px 18px 18px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0 !important;
  }
  .ctx {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 10px;
    border-radius: 999px;
    background: var(--chip);
    color: var(--text);
    font-size: 12px;
  }
  .chip.plain {
    padding-right: 10px;
  }
  .chip button {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    padding: 0 4px;
  }
  .chip button:hover {
    color: var(--text);
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 2.2fr) minmax(240px, 1fr);
    gap: 12px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .main {
    display: grid;
    grid-template-rows: minmax(0, 2fr) minmax(0, 1fr);
  }
  @media (max-width: 900px) {
    .drawer {
      left: 16px;
    }
    .cols {
      grid-template-columns: 1fr;
    }
  }

  /* Cards and chart axes, shared by the stats components */
  .drawer :global(.card) {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 12px 14px;
    min-width: 0;
  }
  .drawer :global(.card-h) {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .drawer :global(.card h3) {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .drawer :global(.hint) {
    font-size: 11px;
    color: var(--muted);
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .drawer :global(.axis text) {
    fill: var(--muted);
    font-size: 10px;
    font-family: inherit;
  }
  .drawer :global(.axis path),
  .drawer :global(.axis line) {
    stroke: rgba(255, 255, 255, 0.08);
  }
  .drawer :global(.grid line) {
    stroke: rgba(255, 255, 255, 0.05);
  }
  .drawer :global(.grid path) {
    display: none;
  }
</style>
