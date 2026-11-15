<script>
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte.js';
  import { accentVars } from './lib/colors.js';
  import MapView from './components/MapView.svelte';
  import Panel from './components/Panel.svelte';
  import Settings from './components/Settings.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import StatsDrawer from './components/stats/StatsDrawer.svelte';
  import ChartTip from './components/stats/ChartTip.svelte';
  import Toast from './components/Toast.svelte';
  import HoverTip from './components/HoverTip.svelte';

  onMount(() => {
    app.load();
  });

  // Interface colour → CSS variables on the page
  $effect(() => {
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(accentVars(app.settings.accent)))
      v ? root.setProperty(k, v) : root.removeProperty(k);
  });
</script>

<MapView />
<Panel />
{#if app.panel === 'settings'}<Settings />{/if}
<ImportDialog />
{#if app.settings.stats && app.runs.length}<StatsDrawer />{/if}
<ChartTip />
<Toast />
<HoverTip />
{#if app.busy}<div class="busy">{app.busy}</div>{/if}

<style>
  .busy {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    color: var(--text);
    font-size: 14px;
  }
</style>
