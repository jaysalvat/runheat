<script>
  import Svg from './Svg.svelte';
  let { size = 22 } = $props();
</script>

<Svg {size} stroke={1.5}>
  <circle cx="15" cy="5" r="2" />
  <path d="M12.61 8.27 9.3 12.4l4.14 4.14-2.07 4.55" />
  <path d="M6.41 9.51 9.8 6.2l2.81 2.07 2.9 3.3h3.72" />
  <path d="m8.89 15.71-1.24.83H4.34" />
</Svg>
