<script>
  import Svg from './Svg.svelte';
  let { size = 22 } = $props();
</script>

<Svg {size} stroke={1.5}>
  <circle cx="5" cy="12" r="1.5" />
  <circle cx="12" cy="12" r="1.5" />
  <circle cx="19" cy="12" r="1.5" />
</Svg>
