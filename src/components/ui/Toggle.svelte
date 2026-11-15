<script>
  // Toggle button: a hidden checkbox, the label acts as the button (filled when checked)
  let { checked = $bindable(false), disabled = false, title = '', label = '', compact = false, shortcut, onchange, children } = $props();
</script>

<label class="toggle" class:compact {title} aria-keyshortcuts={shortcut}>
  <input type="checkbox" bind:checked {disabled} aria-label={label || title} {onchange}>
  {#if children}{@render children()}{:else}{label}{/if}
</label>

<style>
  .toggle { position: relative; flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 8px 10px; cursor: pointer; background: var(--chip); color: var(--muted);
    border-radius: 8px; user-select: none; transition: background .15s, color .15s; }
  .toggle.compact { padding: 6px 4px; }
  .toggle:hover { color: var(--text); }
  .toggle:has(input:checked) { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .toggle:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .toggle:has(input:disabled) { opacity: .3; cursor: default; }
  .toggle:has(input:disabled):hover { color: var(--muted); }
  input { position: absolute; opacity: 0; pointer-events: none; }
</style>
