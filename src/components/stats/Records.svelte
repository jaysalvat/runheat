<script>
  // Records, adapted to the activity type picked with the icons in the card header
  import { sum } from 'd3';
  import { app } from '../../lib/app.svelte.js';
  import { SPORTS, EVEREST_M, LOCALE } from '../../lib/config.js';
  import { nf, plural, toDate, fmtDur, fmtPace, fmtSpeed, fmtPer100 } from '../../lib/format.js';
  import IconButton from '../ui/IconButton.svelte';
  import SportIcon from '../ui/SportIcon.svelte';

  let picked = $state('run');
  const present = $derived(new Set(app.runs.map(r => r.sp)));
  const sport = $derived(present.has(picked) ? picked : Object.keys(SPORTS).find(sp => present.has(sp)) || 'run');

  // [label, value, activity (clickable) or null, caption]
  const items = $derived.by(() => {
    const sp = sport, word = SPORTS[sp].word;
    const P = app.statSel.filter(r => r.sp === sp);
    const best = (key, dir = 1) => P.filter(r => r[key]).sort((a, b) => dir * (a[key] - b[key]))[0];
    const fastest = minKm => P.filter(r => r.dur && r.km >= minKm).sort((a, b) => b.km / b.dur - a.km / a.dur)[0];
    const timed = P.filter(r => r.dur && r.km);
    const totDur = sum(timed, r => r.dur), totKm = sum(timed, r => r.km);
    const totDp = sum(P, r => r.dp || 0), allKm = sum(P, r => r.km);
    const longest = best('km', -1), longTime = best('dur', -1), dp = best('dp', -1);
    const dist = km => (sp === 'swim' && km < 10 ? nf(km * 1000) + ' m' : nf(km, 1) + ' km');
    const climbRec = ['Biggest climb', dp && nf(dp.dp) + ' m', dp];
    const climb = ['Total climb', totDp ? nf(totDp / EVEREST_M, 1) + ' × Everest' : null, null, totDp ? nf(totDp) + ' m' : ''];
    const total = ['Total distance', P.length ? dist(allKm) : null, null, P.length ? plural(P.length, word) : ''];
    const longTimeRec = ['Longest time', longTime && fmtDur(longTime.dur), longTime];
    if (sp === 'run') {
      const b5 = best('b5'), b10 = best('b10');
      return [
        ['Longest run', longest && dist(longest.km), longest],
        ['Best 5 km', b5 && fmtDur(b5.b5), b5],
        ['Best 10 km', b10 && fmtDur(b10.b10), b10],
        climbRec,
        ['Average pace', timed.length ? fmtPace(totDur, totKm) : null, null, timed.length ? fmtDur(totDur) + ' of running' : ''],
        climb,
      ];
    }
    if (sp === 'ride') {
      const fast = fastest(10);   // short rides are too noisy
      return [
        ['Longest ride', longest && dist(longest.km), longest],
        ['Fastest ride', fast && fmtSpeed(fast.dur, fast.km), fast],
        longTimeRec, climbRec,
        ['Average speed', timed.length ? fmtSpeed(totDur, totKm) : null, null, timed.length ? fmtDur(totDur) + ' riding' : ''],
        climb,
      ];
    }
    if (sp === 'swim') {
      const fast = fastest(.4);
      return [
        ['Longest swim', longest && dist(longest.km), longest],
        ['Best pace', fast && fmtPer100(fast.dur, fast.km), fast],
        longTimeRec,
        ['Average pace', timed.length ? fmtPer100(totDur, totKm) : null, null, timed.length ? fmtDur(totDur) + ' swimming' : ''],
        total,
        ['Time in the water', timed.length ? fmtDur(totDur) : null],
      ];
    }
    return [   // walk / hike, other
      [sp === 'walk' ? 'Longest walk' : 'Longest activity', longest && dist(longest.km), longest],
      longTimeRec, climbRec,
      [sp === 'walk' ? 'Average pace' : 'Average speed',
        timed.length ? (sp === 'walk' ? fmtPace(totDur, totKm) : fmtSpeed(totDur, totKm)) : null, null,
        timed.length ? fmtDur(totDur) + ' in total' : ''],
      total, climb,
    ];
  });
  const day = r => toDate(r.d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<article class="card records-card">
  <div class="card-h">
    <h3>Records</h3>
    <span class="sports" role="group" aria-label="Records for">
      {#each Object.keys(SPORTS) as sp (sp)}
        <IconButton size={24} on={sp === sport} disabled={!present.has(sp)} onclick={() => (picked = sp)}
          label={present.has(sp) ? `${SPORTS[sp].label} records` : `${SPORTS[sp].label} · none in your data`}>
          <SportIcon {sp} size={16} />
        </IconButton>
      {/each}
    </span>
  </div>
  <ul class="records">
    {#each items as [label, val, run, extra] (label)}
      <li>
        {#if run}
          <button class="rec" title="Show on the map" onclick={() => (app.highlighted = run)}>
            <span class="rv">{val || '–'}</span><span class="rl">{label}</span><span class="rd">{day(run)}</span>
          </button>
        {:else}
          <div class="rec"><span class="rv">{val || '–'}</span><span class="rl">{label}</span><span class="rd">{extra || ''}</span></div>
        {/if}
      </li>
    {/each}
  </ul>
</article>

<style>
  .card-h { align-items: center; }
  .sports { display: inline-flex; gap: 1px; margin: -6px -5px -6px auto; }
  .sports :global(button.on) { color: var(--accent); }
  .sports :global(button:disabled) { opacity: .25; }
  .records { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .rec { display: block; width: 100%; height: 100%; padding: 7px 9px; border-radius: 8px; background: rgba(255,255,255,.03);
    border: 0; color: inherit; font: inherit; text-align: left; }
  button.rec { cursor: pointer; }
  button.rec:hover { background: rgba(255,255,255,.07); }
  .rv { display: block; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--g2); }
  .rl { display: block; font-size: 11px; color: var(--muted); }
  .rd { display: block; font-size: 10px; color: var(--muted); opacity: .7; }
</style>
