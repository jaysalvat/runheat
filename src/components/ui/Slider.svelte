<script>
  // Labelled slider with its value on the right; `off` greys it out (setting not in use)
  let { label, value = $bindable(), min = 0, display = '', off = false, title = '' } = $props();
</script>

<div class:off>
  <div class="label"><span>{label}</span><span>{display}</span></div>
  <input type="range" bind:value {min} {title} aria-label={label} />
</div>

<style>
  .off {
    opacity: 0.35;
    pointer-events: none;
  }
  input {
    width: 100%;
    margin: 0;
    accent-color: var(--accent);
  }
</style>
