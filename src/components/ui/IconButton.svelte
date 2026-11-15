<script>
  // Small square button with an icon (or a character); `on` = pressed look, `accent` = call to action (coloured icon)
  let {
    label,
    on = false,
    accent = false,
    disabled = false,
    size = 28,
    onclick,
    children,
    ...rest
  } = $props();
</script>

<button
  class="icon-btn"
  class:on
  class:accent
  {disabled}
  title={label}
  aria-label={label}
  aria-pressed={on}
  style:width="{size}px"
  style:height="{size}px"
  {onclick}
  {...rest}
>
  {@render children()}
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    background: none;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .icon-btn:hover:not(:disabled),
  .icon-btn.on {
    background: var(--chip);
    color: var(--text);
  }
  .icon-btn:disabled {
    cursor: default;
  }
  /* call to action: only the icon is coloured, hover included */
  .icon-btn.accent,
  .icon-btn.accent:hover:not(:disabled) {
    color: var(--accent);
  }
</style>
