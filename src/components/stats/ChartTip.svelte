<script>
  // Tooltip shared by the d3 charts, driven by showTip / hideTip from lib/tooltip.svelte.js
  import { tooltip } from '../../lib/tooltip.svelte.js';
  import TipLines from '../ui/TipLines.svelte';
</script>

{#if tooltip.show}
  <div class="tip" style:left="{tooltip.x}px" style:top="{tooltip.y}px">
    <TipLines lines={tooltip.lines} />
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 10;
    pointer-events: none;
    padding: 6px 9px;
    border-radius: 7px;
    background: #000;
    color: #fff;
    font-size: 12px;
    line-height: 1.45;
    white-space: nowrap;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    transform: translate(-50%, calc(-100% - 12px));
  }
</style>
