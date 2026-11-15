<script>
  // Colour picker + label + reset button (shown only when changed); `current` = highlighted label
  let { label, value = $bindable(), fallback, current = true } = $props();
  const changed = $derived(value.toLowerCase() !== fallback.toLowerCase());
</script>

<label class="color" class:current>
  <input type="color" bind:value>
  <span>{label}</span>
  <button class="reset" title="Back to the default colour" aria-label="Reset {label} colour"
    style:visibility={changed ? 'visible' : 'hidden'}
    onclick={e => { e.preventDefault(); value = fallback; }}>↺</button>
</label>

<style>
  .color { display: flex; align-items: center; gap: 10px; padding: 2px 0; cursor: pointer; }
  span { flex: 1; color: var(--muted); }
  .current span { color: var(--text); font-weight: 600; }
  input { width: 30px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 6px;
    background: none; cursor: pointer; }
  input::-webkit-color-swatch-wrapper { padding: 2px; }
  input::-webkit-color-swatch { border: 0; border-radius: 4px; }
  .reset { width: 24px; height: 24px; border: 0; border-radius: 6px; background: none; color: var(--muted);
    cursor: pointer; font: inherit; }
  .reset:hover { background: var(--chip); color: var(--text); }
</style>
