<script>
  import Svg from './Svg.svelte';
  let { size = 16 } = $props();
</script>

<Svg {size}>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  <path d="M17 8l-5-5-5 5" />
  <path d="M12 3v12" />
</Svg>
