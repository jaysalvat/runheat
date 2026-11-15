<script>
  // Volume: distance per year → per month → per day. Clicking a bar drills down.
  import { scaleBand, scaleLinear, axisLeft, axisBottom, select, sum, max as d3max, easeCubicOut } from 'd3';
  import { app } from '../../lib/app.svelte.js';
  import { LOCALE } from '../../lib/config.js';
  import { nf, daysIn, monthName, yearRange, monthRange, runTip } from '../../lib/format.js';
  import { scopeOf } from '../../lib/period.js';
  import { css, shade } from '../../lib/colors.js';
  import { showTip, hideTip } from '../../lib/tooltip.svelte.js';

  let el;
  let W = $state(0), H = $state(0);

  const setRange = (a, b) => { app.dFrom = a; app.dTo = b; };
  const sc = $derived(scopeOf(...app.range));

  // Breadcrumbs: 2011–2026 › 2024 › March
  const crumbs = $derived.by(() => {
    const items = [];
    const multi = app.yMin !== app.yMax;
    if (multi) items.push([`${app.yMin}–${app.yMax}`, () => setRange(null, null)]);
    if (sc.level !== 'year') items.push([String(sc.y), () => (multi ? setRange(...yearRange(sc.y)) : setRange(null, null))]);
    if (sc.level === 'day') items.push([monthName(sc.m), null]);
    return items;
  });
  const titles = { year: 'Distance per year', month: 'Distance per month', day: 'Distance per day' };

  $effect(() => {
    const sel = app.statSel, s = sc;
    app.settings.accent;   // redraw when the interface colour changes
    if (!el || !W || !H) return;
    // grouping by level
    let bins;
    if (s.level === 'year') {
      bins = [];
      for (let y = app.yMin; y <= app.yMax; y++) bins.push({ key: y, label: String(y), long: String(y), runs: [] });
      sel.forEach(r => bins[r.year - app.yMin]?.runs.push(r));
    } else if (s.level === 'month') {
      bins = Array.from({ length: 12 }, (_, i) => ({ key: i + 1, label: monthName(i + 1, 'short'), long: `${monthName(i + 1)} ${s.y}`, runs: [] }));
      sel.forEach(r => bins[Math.floor(r.d / 100) % 100 - 1].runs.push(r));
    } else {
      bins = Array.from({ length: daysIn(s.y, s.m) }, (_, i) => ({ key: i + 1, label: String(i + 1),
        long: new Date(s.y, s.m - 1, i + 1).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }), runs: [] }));
      sel.forEach(r => bins[r.d % 100 - 1].runs.push(r));
    }
    bins.forEach(b => { b.km = sum(b.runs, r => r.km); });
    draw(bins, s);
  });

  function draw(bins, s) {
    el.innerHTML = '';
    const m = { t: 14, r: 4, b: 18, l: 34 };
    const x = scaleBand().domain(bins.map(b => b.key)).range([m.l, W - m.r]).padding(s.level === 'day' ? .25 : .2);
    const y = scaleLinear().domain([0, d3max(bins, b => b.km) || 1]).nice(4).range([H - m.b, m.t]);
    const svg = select(el).append('svg').attr('width', W).attr('height', H);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`)
      .call(axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(axisLeft(y).ticks(4).tickSize(0).tickPadding(6).tickFormat(v => (v ? nf(v) : '')))
      .call(g => g.select('.domain').remove());
    svg.append('text').attr('x', m.l - 6).attr('y', m.t - 4).attr('text-anchor', 'end')
      .attr('fill', css('--muted')).attr('font-size', 9).text('km');
    // labels: all if space allows, otherwise one in n
    const every = Math.ceil(bins.length / Math.max(1, Math.floor((W - m.l) / 28)));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(axisBottom(x).tickSize(0).tickPadding(6)
        .tickFormat((k, i) => (i % every === 0 || s.level !== 'day' ? bins[i].label : '')))
      .call(g => g.select('.domain').remove());

    const bw = x.bandwidth();
    const g = svg.append('g');
    g.selectAll('rect.bar').data(bins.filter(b => b.km > 0)).join('rect').attr('class', 'bar')
      .attr('x', b => x(b.key)).attr('width', bw).attr('rx', Math.min(4, bw / 2))
      .attr('y', H - m.b).attr('height', 0).attr('fill', shade(app.settings.accent, '--g2'))
      .transition().duration(450).ease(easeCubicOut).delay((b, i) => i * 12)
      .attr('y', b => y(b.km)).attr('height', b => Math.max(1, y(0) - y(b.km)));
    // value above the bars when there is room
    const small = s.level === 'day';
    if (bw > (small ? 11 : 22)) {
      g.selectAll('text.v').data(bins.filter(b => b.km > 0)).join('text').attr('class', 'v')
        .attr('x', b => x(b.key) + bw / 2).attr('y', b => y(b.km) - 4).attr('text-anchor', 'middle')
        .attr('fill', css('--muted')).attr('font-size', small ? 9 : 10)
        .text(b => (small ? nf(b.km, b.km < 10 ? 1 : 0) : nf(b.km)));
    }
    // full-height click areas (even for short bars)
    g.selectAll('rect.hit').data(bins).join('rect').attr('class', 'hit')
      .attr('x', b => x(b.key) - x.step() * x.paddingInner() / 2).attr('width', x.step())
      .attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .style('cursor', b => (b.runs.length ? 'pointer' : 'default'))
      .on('mouseenter', function () { select(this).attr('fill', 'rgba(255,255,255,.04)'); })
      .on('mousemove', (ev, b) => {
        if (s.level === 'day' && b.runs.length) return showTip(ev, b.runs.map(runTip).join('<br>'));
        showTip(ev, `<b>${b.long}</b><br>${b.runs.length ? `${nf(b.km)} km · ${b.runs.length} run${b.runs.length > 1 ? 's' : ''}` : '<span class="m">No run</span>'}`);
      })
      .on('mouseleave', function () { select(this).attr('fill', 'transparent'); hideTip(); })
      .on('click', (ev, b) => {
        if (!b.runs.length) return;
        hideTip();
        if (s.level === 'year') setRange(...yearRange(b.key));
        else if (s.level === 'month') setRange(...monthRange(s.y, b.key));
        else app.highlighted = b.runs[0];
      });
  }
</script>

<article class="card volume">
  <div class="card-h">
    <h3>{titles[sc.level]}</h3>
    <span class="hint">{sc.level === 'day' ? 'Click a day to see the run' : 'Click a bar to drill down'}</span>
  </div>
  <nav class="crumbs" aria-label="Chart level">
    {#each crumbs as [label, go], i (label)}
      {#if i}<span class="sep">›</span>{/if}
      {#if i === crumbs.length - 1}<span class="cur">{label}</span>{:else}<button onclick={go}>{label}</button>{/if}
    {/each}
  </nav>
  <div class="chart" bind:this={el} bind:clientWidth={W} bind:clientHeight={H}></div>
</article>

<style>
  .volume { display: flex; flex-direction: column; min-height: 0; }
  .chart { position: relative; flex: 1; min-height: 150px; }
  .chart :global(svg) { position: absolute; top: 0; left: 0; overflow: visible; }
  .crumbs { display: flex; align-items: center; gap: 4px; min-height: 20px; margin: -2px 0 2px; font-size: 12px; }
  .crumbs button { background: none; border: 0; padding: 1px 4px; border-radius: 4px; color: var(--muted); font: inherit; cursor: pointer; }
  .crumbs button:hover { color: var(--text); background: var(--chip); }
  .crumbs .cur { color: var(--g3); font-weight: 600; padding: 1px 4px; text-transform: capitalize; }
  .crumbs .sep { color: var(--muted); opacity: .5; }
</style>
