<script>
  // One choice among a few: [{ value, label, title? }]
  let { options, value = $bindable() } = $props();
</script>

<div class="seg" role="group">
  {#each options as o (o.value)}
    <button class:on={value === o.value} title={o.title} aria-pressed={value === o.value}
      onclick={() => (value = o.value)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg { display: flex; background: var(--chip); border-radius: 8px; padding: 3px; }
  button { flex: 1; border: 0; background: none; color: var(--muted); padding: 6px 4px; border-radius: 6px;
    cursor: pointer; font: inherit; }
  button:hover { color: var(--text); }
  button.on { background: var(--accent); color: var(--on-accent); font-weight: 600; }
</style>
