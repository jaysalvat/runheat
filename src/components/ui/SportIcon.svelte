<script>
  import { SPORTS } from '../../lib/config.js';
  let { sp, size = 22 } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html SPORTS[sp].icon}</svg>
