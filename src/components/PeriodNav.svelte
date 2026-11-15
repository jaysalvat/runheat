<script>
  // Period navigator: years → months → days. Click a bar to go down, ‹ to go back up,
  // the range slider works at every level.
  import { app } from '../lib/app.svelte.js';
  import { LOCALE } from '../lib/config.js';
  import { ymd, daysIn, monthName, periodLabel, plural, nf } from '../lib/format.js';
  import IconButton from './ui/IconButton.svelte';

  // Level that the current selection suggests: several years → years; one year → its
  // months; a period inside one month → its days
  function levelOf() {
    const [dA, dB] = app.range;
    if (app.dFrom && Math.floor(dA / 100) === Math.floor(dB / 100))
      return { level: 'day', y: Math.floor(dA / 10000), m: Math.floor(dA / 100) % 100 };
    if (app.yMin === app.yMax) return { level: 'month', y: app.yMin };
    if (app.dFrom && Math.floor(dA / 10000) === Math.floor(dB / 10000)) return { level: 'month', y: Math.floor(dA / 10000) };
    return { level: 'year' };
  }

  // Level shown. Kept as is while you use the navigator itself (so the slider never switches
  // level under your finger); re-derived when the selection changes elsewhere (stats drawer).
  let nav = $state({ level: 'year' });
  let own = false, lastKey = '';
  $effect.pre(() => {
    const key = [app.yMin, app.yMax, app.dFrom, app.dTo, app.dataVersion].join();
    if (key === lastKey) return;
    if (!own) nav = levelOf();
    own = false; lastKey = key;
  });
  const go = (next, change) => { own = true; if (next) nav = next; change(); };

  let anchor = null;   // last clicked year, for shift + click

  const pool = $derived(app.runs.filter(r => app.keep(r) && app.inZone(r)));
  const bins = $derived.by(() => {
    const [y0, y1] = app.yearSpan;
    let out;
    if (nav.level === 'year') {
      out = [];
      for (let y = y0; y <= y1; y++) out.push({ key: y, label: String(y).slice(2), title: String(y), a: ymd(y, 1, 1), b: ymd(y, 12, 31) });
    } else if (nav.level === 'month') {
      out = Array.from({ length: 12 }, (_, i) => ({ key: i + 1, label: monthName(i + 1, 'narrow'),
        title: `${monthName(i + 1)} ${nav.y}`, a: ymd(nav.y, i + 1, 1), b: ymd(nav.y, i + 1, 31) }));
    } else {
      out = Array.from({ length: daysIn(nav.y, nav.m) }, (_, i) => {
        const d = i + 1;
        return { key: d, label: d === 1 || d % 5 === 0 ? String(d) : '', a: ymd(nav.y, nav.m, d), b: ymd(nav.y, nav.m, d),
          title: new Date(nav.y, nav.m - 1, d).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) };
      });
    }
    for (const bn of out) {
      bn.runs = pool.filter(r => r.d >= bn.a && r.d <= bn.b);
      bn.km = bn.runs.reduce((s, r) => s + r.km, 0);
    }
    return out;
  });
  const max = $derived(Math.max(1, ...bins.map(b => b.km)));
  const inSel = bn => bn.b >= app.range[0] && bn.a <= app.range[1];
  const narrowed = $derived(nav.level === 'year'
    ? app.yMin !== app.yearSpan[0] || app.yMax !== app.yearSpan[1] : !!app.dFrom);

  const title = $derived(nav.level === 'year' ? 'Years' : nav.level === 'month' ? String(nav.y) : `${monthName(nav.m)} ${nav.y}`);
  // the right-hand label only says what the title doesn't (a range of years, a day…)
  const selLabel = $derived.by(() => {
    const t = app.dFrom ? periodLabel(app.dFrom, app.dTo) : app.yMin === app.yMax ? String(app.yMin) : `${app.yMin} – ${app.yMax}`;
    return t === title ? '' : t;
  });

  function click(e, bn) {
    tip = null;
    if (nav.level === 'year') {
      if (e.shiftKey && anchor !== null) {          // shift + click: range of years, stays on years
        go(null, () => { app.yMin = Math.min(anchor, bn.key); app.yMax = Math.max(anchor, bn.key); app.dFrom = app.dTo = null; });
      } else {                                       // click: that year → its months
        anchor = bn.key;
        go({ level: 'month', y: bn.key }, () => { app.yMin = app.yMax = bn.key; app.dFrom = app.dTo = null; });
      }
    } else if (nav.level === 'month') {              // a month → its days
      go({ level: 'day', y: nav.y, m: bn.key }, () => { app.dFrom = bn.a; app.dTo = ymd(nav.y, bn.key, daysIn(nav.y, bn.key)); });
    } else {                                         // a day: select it (again: whole month)
      const only = app.dFrom === bn.a && app.dTo === bn.b;
      go(null, () => {
        app.dFrom = only ? ymd(nav.y, nav.m, 1) : bn.a;
        app.dTo = only ? ymd(nav.y, nav.m, daysIn(nav.y, nav.m)) : bn.b;
      });
      app.highlighted = only ? null : bn.runs[0] || null;
    }
  }

  function back() {
    const nv = nav;
    go(nv.level === 'day' ? { level: 'month', y: nv.y } : { level: 'year' }, () => {
      app.dFrom = app.dTo = null;
      if (nv.level === 'day') app.yMin = app.yMax = nv.y;                     // → months of that year
      else { [app.yMin, app.yMax] = app.yearSpan; anchor = null; }            // → all years
    });
    app.highlighted = null;
  }

  // ---- Range slider (two thumbs on one track) ----
  let dragging = false;
  let lo = $state(1), hi = $state(1);
  $effect.pre(() => {
    const first = bins.findIndex(bn => inSel(bn)), last = bins.findLastIndex(bn => inSel(bn));
    if (dragging) return;   // don't fight the thumbs while they're being dragged
    lo = first < 0 ? 1 : first + 1;
    hi = last < 0 ? bins.length : last + 1;
  });
  function slide() {
    let i = +lo, j = +hi;
    if (i > j) [i, j] = [j, i];
    const A = bins[i - 1], B = bins[j - 1];
    go(null, () => {
      if (nav.level === 'year') { app.yMin = A.key; app.yMax = B.key; app.dFrom = app.dTo = null; }
      else if (nav.level === 'month') {
        if (i === 1 && j === 12) app.dFrom = app.dTo = null;   // whole year
        else { app.dFrom = A.a; app.dTo = ymd(nav.y, B.key, daysIn(nav.y, B.key)); }
      } else { app.dFrom = A.a; app.dTo = B.b; }
    });
  }

  // ---- Instant tooltip (the native title takes ~1 s to appear) ----
  let tip = $state(null);   // { html, x }
  let wrap;
  function showTip(e, bn) {
    const n = bn.runs.length;
    const r = e.currentTarget.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip = { key: bn.key, x: r.left + r.width / 2 - w.left, width: w.width,
      html: `<b>${bn.title}</b> · ` + (n ? `${plural(n, 'activity')} · ${nf(Math.round(bn.km))} km` : 'nothing') };
  }
  let tipEl = $state();
  const tipLeft = $derived.by(() => {
    if (!tip || !tipEl) return 0;
    const half = tipEl.offsetWidth / 2;
    return Math.min(Math.max(tip.x, half), tip.width - half);
  });
</script>

<div class="label nav-h">
  <span class="title">
    {#if nav.level !== 'year'}<IconButton label="Back" size={22} onclick={back}><span class="chev">‹</span></IconButton>{/if}
    <span class="t">{title}</span>
  </span>
  <span>{selLabel}</span>
</div>

<div class="wrap" bind:this={wrap}>
  <div class="bars">
    {#each bins as bn (nav.level + bn.key)}
      <div class="col" class:off={!inSel(bn)} role="button" tabindex="-1" aria-label={bn.title}
        onmouseenter={e => showTip(e, bn)} onmouseleave={() => (tip = null)}
        onmousedown={e => e.shiftKey && e.preventDefault()} onclick={e => click(e, bn)} onkeydown={() => {}}>
        <span class="fill" style:height="{(100 * bn.km) / max}%"></span>
      </div>
    {/each}
  </div>
  <div class="labels">
    {#each bins as bn (nav.level + bn.key)}
      <span class:on={narrowed && inSel(bn)} class:hover={tip?.key === bn.key}>{bn.label}</span>
    {/each}
  </div>
  {#if tip}<div class="tip" bind:this={tipEl} style:left="{tipLeft}px">{@html tip.html}</div>{/if}
</div>

<div class="range">
  <div class="track"></div>
  <input type="range" min="1" max={bins.length} step="1" bind:value={lo} aria-label="Start of the period"
    onpointerdown={() => (dragging = true)} onpointerup={() => (dragging = false)} oninput={slide}>
  <input type="range" min="1" max={bins.length} step="1" bind:value={hi} aria-label="End of the period"
    onpointerdown={() => (dragging = true)} onpointerup={() => (dragging = false)} oninput={slide}>
</div>

<style>
  .nav-h { align-items: center; min-height: 22px; }
  .title { display: inline-flex; align-items: center; gap: 2px; margin-left: -4px; }
  .title .t { text-transform: capitalize; padding-left: 4px; }
  .chev { font-size: 18px; line-height: 1; }
  .wrap { position: relative; }
  .bars { display: flex; align-items: flex-end; gap: 2px; height: 34px; margin-top: 4px; cursor: pointer; }
  /* Each column is full height (hover/click area), the coloured bar sits inside */
  .col { flex: 1; height: 100%; display: flex; align-items: flex-end; border-radius: 3px; }
  .col:hover { background: rgba(255,255,255,.06); }
  .fill { width: 100%; background: var(--accent); opacity: .85; border-radius: 2px 2px 0 0; min-height: 1px; }
  .col:hover .fill { opacity: 1; filter: brightness(1.25); }
  .col.off .fill { opacity: .18; }
  .labels { display: flex; gap: 2px; margin-top: 3px; }
  .labels span { flex: 1; text-align: center; font-size: 10px; color: var(--muted);
    font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
  .labels span.on { color: var(--text); font-weight: 600; }
  .labels span.hover { color: var(--accent); }
  .tip { position: absolute; bottom: calc(100% + 6px); transform: translateX(-50%); z-index: 4;
    padding: 5px 8px; border-radius: 6px; background: #000; color: #fff; font-size: 12px;
    white-space: nowrap; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,.4); }
  .tip :global(b) { font-weight: 600; }
  .range { position: relative; height: 24px; }
  .track { position: absolute; left: 0; right: 0; top: 11px; height: 3px; background: var(--line); border-radius: 2px; }
  .range input { position: absolute; left: 0; right: 0; width: 100%; margin: 0; pointer-events: none;
    -webkit-appearance: none; appearance: none; background: none; top: 6px; }
  .range input::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; width: 14px; height: 14px;
    border-radius: 50%; background: var(--accent); border: 2px solid #111; cursor: pointer; }
  .range input::-moz-range-thumb { pointer-events: auto; width: 12px; height: 12px; border-radius: 50%;
    background: var(--accent); border: 2px solid #111; cursor: pointer; }
</style>
