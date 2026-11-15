<script>
  // Arc gauge: value 0–1, big label in the middle, title and caption below
  import { arc as d3arc } from 'd3';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  let { value, label, title, caption, onclick = null, on = false, hint = '' } = $props();

  const size = 110,
    r = 44,
    sw = 9,
    a0 = -Math.PI * 0.75,
    a1 = Math.PI * 0.75;
  const arc = d3arc()
    .innerRadius(r - sw / 2)
    .outerRadius(r + sw / 2)
    .cornerRadius(sw / 2);
  const v = new Tween(0, { duration: 700, easing: cubicOut });
  $effect(() => {
    v.target = Math.max(0, Math.min(1, value));
  });
</script>

<svelte:element
  this={onclick ? 'button' : 'div'}
  class="gauge"
  class:clickable={!!onclick}
  class:on
  title={hint || null}
  aria-pressed={onclick ? on : null}
  {onclick}
  role={onclick ? null : 'group'}
>
  <svg viewBox="0 0 {size} {size * 0.9}" aria-hidden="true">
    <g transform="translate({size / 2},{size / 2})">
      <path d={arc({ startAngle: a0, endAngle: a1 })} fill="rgba(255,255,255,.07)" />
      {#if v.current > 0}<path
          d={arc({ startAngle: a0, endAngle: a0 + (a1 - a0) * v.current })}
          fill="var(--g2)"
        />{/if}
      <text class="val" text-anchor="middle" y="6">{label}</text>
    </g>
  </svg>
  <span class="text">
    <span class="sub">{title}</span>
    <span class="cap">{caption}</span>
  </span>
</svelte:element>

<style>
  .gauge {
    display: block;
    width: 100%;
    text-align: center;
    padding: 4px 0;
    border-radius: 8px;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
  }
  svg {
    width: 100%;
    max-width: 110px;
    height: auto;
    display: block;
    margin: 0 auto;
  }
  .val {
    font-size: 20px;
    font-weight: 600;
    fill: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .text {
    display: block;
  }
  .sub {
    display: block;
    margin-top: 6px;
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .cap {
    display: block;
    font-size: 11px;
    color: var(--muted);
    margin-top: 4px;
    opacity: 0.8;
  }
  .clickable {
    cursor: pointer;
    transition: background 0.15s;
  }
  .clickable:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .clickable.on {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  /* Narrow card: small arc on the left, texts on the right */
  @container goals (max-width: 300px) {
    .gauge {
      display: grid;
      grid-template-columns: 76px 1fr;
      column-gap: 12px;
      align-items: center;
      text-align: left;
      padding: 2px 8px 2px 0;
    }
    svg {
      max-width: 76px;
      margin: 0;
    }
    .sub {
      margin-top: 0;
    }
    .cap {
      margin-top: 2px;
    }
  }
</style>
