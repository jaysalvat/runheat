<script>
  import Svg from './Svg.svelte';
  let { size = 22 } = $props();
</script>

<Svg {size} stroke={1.5}>
  <circle cx="14" cy="5" r="2" />
  <circle cx="18" cy="18" r="3" />
  <circle cx="6" cy="18" r="3" />
  <path d="m11.5 18 1.5-4-4.88-2 3-3.5 3 2.5h3.5" />
</Svg>
