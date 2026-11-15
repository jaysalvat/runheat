<script>
  import { tooltip } from '../../lib/tooltip.svelte.js';
</script>

{#if tooltip.show}
  <div class="tip" style:left="{tooltip.x}px" style:top="{tooltip.y}px">{@html tooltip.html}</div>
{/if}

<style>
  .tip { position: fixed; z-index: 10; pointer-events: none; padding: 6px 9px; border-radius: 7px;
    background: #000; color: #fff; font-size: 12px; line-height: 1.45; white-space: nowrap;
    box-shadow: 0 4px 14px rgba(0,0,0,.45); transform: translate(-50%, calc(-100% - 12px)); }
  .tip :global(b) { font-weight: 600; }
  .tip :global(.m) { color: #b9bec6; }
</style>
