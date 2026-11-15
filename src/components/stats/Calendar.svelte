<script>
  // Calendar: one cell per day of a year, colour = distance.
  // Click a day: its route on the map, its month in the stats.
  import {
    select,
    rollup,
    sum,
    max as d3max,
    scaleSequential,
    interpolateRgbBasis,
    timeDays,
    timeMonday,
    timeMonths,
  } from 'd3';
  import { app } from '../../lib/app.svelte.js';
  import { LOCALE } from '../../lib/config.js';
  import { toInt, yearRange, monthRange, runTip } from '../../lib/format.js';
  import { scopeOf } from '../../lib/period.js';
  import { css, shade } from '../../lib/colors.js';
  import { showTip, hideTip } from '../../lib/tooltip.svelte.js';
  import IconButton from '../ui/IconButton.svelte';

  let el;
  let W = $state(0),
    H = $state(0);

  const pool = $derived(app.runs.filter((r) => app.keep(r) && app.inZone(r)));
  const years = $derived([...new Set(pool.map((r) => r.year))].sort());

  // The calendar follows the end of the filtered period, unless navigated with ‹ ›
  let picked = $state(null); // { year, forEnd }
  const endYear = $derived(Math.floor(app.range[1] / 10000));
  const year = $derived.by(() => {
    if (picked && picked.forEnd === endYear && years.includes(picked.year)) return picked.year;
    return years.includes(endYear) ? endYear : years[years.length - 1];
  });
  const step = (d) => (picked = { year: year + d, forEnd: endYear });

  const setRange = (a, b) => {
    app.dFrom = a;
    app.dTo = b;
  };

  $effect(() => {
    const y = year,
      data = pool,
      [dA, dB] = app.range;
    app.settings.accent; // redraw when the interface colour changes
    if (!el || !W || !H || y == null) return;
    draw(y, data, scopeOf(dA, dB));
  });

  function draw(calYear, data, sc) {
    select(el).selectAll('*').remove();
    const byDay = rollup(
      data.filter((r) => r.year === calYear),
      (v) => v,
      (r) => r.d,
    );
    const start = new Date(calYear, 0, 1),
      end = new Date(calYear + 1, 0, 1);
    const days = timeDays(start, end);
    // The calendar fills its card: cells follow the width (cw) and the height (ch);
    // rows may be up to 1.6× taller than wide (beyond that cells look like bars: centred instead)
    const m = { t: 14, l: 22 };
    const weeks = timeMonday.count(timeMonday.floor(start), end) + 1;
    const cw = Math.max(6, Math.floor((W - m.l) / weeks));
    const ch = Math.max(6, Math.min(Math.round(cw * 1.6), Math.floor((H - m.t) / 7)));
    const h = m.t + ch * 7;
    const svg = select(el)
      .append('svg')
      .attr('width', W)
      .attr('height', h)
      .style('top', Math.max(0, (H - h) / 2) + 'px');
    const maxKm = Math.max(10, d3max([...byDay.values()], (v) => sum(v, (r) => r.km)) || 0);
    const color = scaleSequential(
      interpolateRgbBasis([
        shade(app.settings.accent, '--g0'),
        shade(app.settings.accent, '--g2'),
        shade(app.settings.accent, '--g3'),
      ]),
    ).domain([0, maxKm]);
    const wk = (d) => timeMonday.count(timeMonday.floor(start), d);
    const dow = (d) => (d.getDay() + 6) % 7;

    ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].forEach(
      (t, i) =>
        t &&
        svg
          .append('text')
          .attr('class', 'axis')
          .attr('x', 0)
          .attr('y', m.t + i * ch + ch / 2 + 3)
          .attr('fill', css('--muted'))
          .attr('font-size', 9)
          .text(t),
    );
    const selMonth = sc.level === 'day' && sc.y === calYear ? sc.m : null;
    timeMonths(start, end).forEach((mo) => {
      const mi = mo.getMonth() + 1;
      svg
        .append('text')
        .attr('class', 'month' + (mi === selMonth ? ' on' : ''))
        .attr('x', m.l + wk(mo) * cw)
        .attr('y', 9)
        .attr('font-size', 10)
        .text(mo.toLocaleDateString(LOCALE, { month: 'short' }))
        .on('click', () => setRange(...(mi === selMonth ? yearRange(calYear) : monthRange(calYear, mi))));
    });
    // outside the selected month, cells fade out
    const dim = (d) => selMonth && d.getMonth() + 1 !== selMonth;

    svg
      .append('g')
      .selectAll('rect')
      .data(days)
      .join('rect')
      .attr('class', 'day')
      .attr('x', (d) => m.l + wk(d) * cw)
      .attr('y', (d) => m.t + dow(d) * ch)
      .attr('width', cw - 2)
      .attr('height', ch - 2)
      .attr('rx', 2)
      .attr('opacity', (d) => (dim(d) ? 0.3 : 1))
      .attr('fill', (d) => {
        const v = byDay.get(toInt(d));
        return v ? color(sum(v, (r) => r.km)) : 'rgba(255,255,255,.05)';
      })
      .on('mousemove', (ev, d) => {
        const v = byDay.get(toInt(d));
        const label = d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
        showTip(ev, v ? v.flatMap(runTip) : [[{ b: label }], [{ m: 'Rest day' }]]);
      })
      .on('mouseleave', hideTip)
      .on('click', (ev, d) => {
        hideTip();
        const mi = d.getMonth() + 1;
        if (mi !== selMonth) setRange(...monthRange(calYear, mi));
        const v = byDay.get(toInt(d));
        app.highlighted = v ? v[0] : null;
      });
  }
</script>

<article class="card cal">
  <div class="card-h">
    <h3>Calendar</h3>
    <span class="hint">Click a day: its route on the map, its month in the stats</span>
    <span class="nav">
      <IconButton label="Previous year" size={22} disabled={year <= years[0]} onclick={() => step(-1)}
        >‹</IconButton
      >
      <b>{year ?? ''}</b>
      <IconButton
        label="Next year"
        size={22}
        disabled={year >= years[years.length - 1]}
        onclick={() => step(1)}>›</IconButton
      >
    </span>
  </div>
  <div class="chart" bind:this={el} bind:clientWidth={W} bind:clientHeight={H}></div>
</article>

<style>
  .cal {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .chart {
    position: relative;
    flex: 1;
    min-height: 100px;
  }
  .chart :global(svg) {
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
  }
  .nav {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 13px;
  }
  .nav :global(button) {
    font-size: 16px;
  }
  .nav :global(button:disabled) {
    opacity: 0.25;
  }
  .chart :global(rect.day) {
    cursor: pointer;
  }
  .chart :global(rect.day:hover) {
    stroke: #fff;
    stroke-width: 1;
  }
  .chart :global(.month) {
    fill: var(--muted);
    cursor: pointer;
  }
  .chart :global(.month:hover) {
    fill: var(--text);
  }
  .chart :global(.month.on) {
    fill: var(--g2);
    font-weight: 600;
  }
</style>
