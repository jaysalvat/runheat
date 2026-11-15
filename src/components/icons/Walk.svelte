<script>
  import Svg from './Svg.svelte';
  let { size = 22 } = $props();
</script>

<Svg {size} stroke={1.5}>
  <path d="m12.44 9.13-1.41 5.63 4.93 6.34" />
  <path d="m10.33 18.28-2.12 2.82" />
  <path d="M8.21 13.35c0-3.94 2.82-4.22 4.23-4.22h1.41c.23 1.17 1.27 3.66 3.52 4.22" />
  <circle cx="13" cy="5" r="2" />
</Svg>
