<script>
  import Svg from './Svg.svelte';
  let { size = 16 } = $props();
</script>

<Svg {size}>
  <path d="M3 3v18h18" />
  <path d="M7 15l4-5 4 3 5-7" />
</Svg>
