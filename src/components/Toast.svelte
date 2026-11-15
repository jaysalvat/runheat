<script>
  // Short message at the bottom of the map (after an import, a reset…)
  import { app } from '../lib/app.svelte.js';
  let fading = $state(false);
  $effect(() => {
    if (!app.toast) return;
    fading = false;
    const t1 = setTimeout(() => (fading = true), 3500);
    const t2 = setTimeout(() => (app.toast = null), 3900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  });
</script>

{#if app.toast}<div class="toast" class:fading role="status">{app.toast}</div>{/if}

<style>
  .toast {
    position: absolute;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 6;
    padding: 10px 16px;
    border-radius: 10px;
    background: #000;
    color: #fff;
    font-size: 13px;
    box-shadow: var(--shadow);
    transition: opacity 0.4s;
  }
  .fading {
    opacity: 0;
  }
</style>
