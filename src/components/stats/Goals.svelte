<script>
  // Goals: yearly (or monthly) goal, consistency, exploration
  import { sum, timeMonday } from 'd3';
  import { app } from '../../lib/app.svelte.js';
  import { nf, monthName, toDate, toInt } from '../../lib/format.js';
  import { scopeOf } from '../../lib/period.js';
  import Gauge from './Gauge.svelte';

  const s = app.settings;
  const pct = x => Math.round(100 * x) + '%';

  // 1. Goal: monthly (yearly goal / 12) if a month is selected, otherwise yearly
  const goal = $derived.by(() => {
    const [, dB] = app.range, sc = scopeOf(...app.range);
    if (sc.level === 'day') {
      const g = s.goal / 12, km = sum(app.statSel, r => r.km);
      return { value: km / g, title: monthName(sc.m) + ' goal', caption: `${nf(km)} / ${nf(g)} km` };
    }
    const yr = Math.floor(dB / 10000);
    const km = sum(app.runs.filter(r => r.year === yr && app.keep(r) && app.inZone(r)), r => r.km);
    return { value: km / s.goal, title: yr + ' goal', caption: `${nf(km)} / ${nf(s.goal)} km` };
  });

  // 2. Consistency: weeks with at least one activity
  const consistency = $derived.by(() => {
    const [dA, dB] = app.range;
    const from = toDate(dA), to = toDate(Math.min(dB, toInt(new Date())));
    const weeks = Math.max(1, timeMonday.count(timeMonday.floor(from), to) + 1);
    const active = new Set(app.statSel.map(r => +timeMonday.floor(toDate(r.d)))).size;
    return { value: active / weeks, caption: `${active} / ${weeks} weeks` };
  });

  // 3. Exploration: share of the period's km on paths never taken before
  //    (nk / gk are computed by the importer, in chronological order of all activities)
  const exploration = $derived.by(() => {
    const newKm = sum(app.statSel, r => r.nk || 0), gpsKm = sum(app.statSel, r => r.gk || 0);
    const share = gpsKm ? newKm / gpsKm : 0;
    return { value: share, label: (share < .1 && share > 0 ? nf(100 * share, 1) : Math.round(100 * share)) + '%',
      caption: `${nf(newKm, newKm < 10 ? 1 : 0)} km of new paths` };
  });
</script>

<article class="card goals">
  <div class="card-h"><h3>Goals</h3></div>
  <div class="gauges">
    <Gauge value={goal.value} label={pct(goal.value)} title={goal.title} caption={goal.caption} />
    <Gauge value={consistency.value} label={pct(consistency.value)} title="Consistency" caption={consistency.caption} />
    <!-- click: shows / hides these paths on the map -->
    <Gauge value={exploration.value} label={exploration.label} title="Exploration" caption={exploration.caption}
      on={s.explore} onclick={() => (s.explore = !s.explore)}
      hint={s.explore ? 'Hide new paths on the map' : 'Show these new paths on the map'} />
  </div>
</article>

<style>
  .goals { container: goals / inline-size; }
  /* equal columns whatever the text length; one gauge per row when the card is narrow */
  .gauges { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; align-items: start; }
  @container goals (max-width: 300px) { .gauges { grid-template-columns: 1fr; gap: 2px; } }
</style>
