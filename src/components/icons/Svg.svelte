<script>
  // Shared frame of the stroke icons (24×24 grid, drawn in currentColor)
  let { size = 16, stroke = 2, children } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {@render children()}
</svg>
