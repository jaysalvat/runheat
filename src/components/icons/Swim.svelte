<script>
  import Svg from './Svg.svelte';
  let { size = 22 } = $props();
</script>

<Svg {size} stroke={1.5}>
  <path d="M3 15c2.48 0 4.34-3 4.34-3s1.87 3 4.35 3 4.97-3 4.97-3 2.48 3 4.34 3" />
  <path d="M3 20c2.48 0 4.34-3 4.34-3s1.87 3 4.35 3 4.97-3 4.97-3 2.48 3 4.34 3" />
  <path d="m5 10.5 4-2.5-1.19-1.48a1.27 1.27 0 0 1 1.95-1.6L14 10" />
  <circle cx="16.5" cy="5.5" r="2.5" />
</Svg>
