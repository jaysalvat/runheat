<script>
  // Tooltip content as data rather than HTML: lines of parts, each a string, { b } (bold) or { m } (muted)
  let { lines } = $props();
</script>

{#each lines as line, i (i)}
  {#if i}<br />{/if}
  {#each line as part, j (j)}
    {#if typeof part === 'string'}{part}{:else if part.b}<b>{part.b}</b>{:else}<span class="m">{part.m}</span
      >{/if}
  {/each}
{/each}

<style>
  b {
    font-weight: 600;
  }
  .m {
    color: #b9bec6;
  }
</style>
