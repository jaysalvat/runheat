// Stats: volume, runs, calendar, gauges and records.
// Relies on index.html globals: runs, state, apply, save, dateRange, highlightRun, fmtD.
(() => {
  const EVEREST_M = 8849;
  const $ = id => document.getElementById(id);
  const drawer = $('statsDrawer');
  const tip = $('chartTip');
  let calYear = null, calAuto = null;

  // ---------- Utilities ----------
  const toDate = d => new Date(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100);
  const toInt = dt => dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
  const nf = (v, digits = 0) => v.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const fmtDur = s => {
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };
  const fmtPace = (dur, km) => {
    if (!dur || !km) return '–';
    const s = Math.round(dur / km);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
  };
  const dateLong = r => toDate(r.d).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  function showTip(ev, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    tip.style.left = ev.clientX + 'px';
    tip.style.top = ev.clientY + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  const runTip = r => `<b>${dateLong(r)}</b><br>${nf(r.km, 1)} km` +
    (r.dur ? ` · ${fmtDur(r.dur)} · <span class="m">${fmtPace(r.dur, r.km)}</span>` : '') +
    (r.dp ? `<br><span class="m">+${nf(r.dp)} m climb</span>` : '');

  // Reusable SVG gradient
  function gradient(svg, id, x2, y2, stops) {
    const g = svg.append('defs').append('linearGradient').attr('id', id)
      .attr('x1', 0).attr('y1', y2 ? 1 : 0).attr('x2', x2).attr('y2', 0);
    stops.forEach(([o, c, a = 1]) => g.append('stop').attr('offset', o).attr('stop-color', c).attr('stop-opacity', a));
  }
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // ---------- Filtered data ----------
  // base : years + sources + place (without brushing) — context for the time charts
  // sel  : base + brushing — used by gauges and records
  function datasets() {
    const base = runs.filter(r => r.year >= state.yMin && r.year <= state.yMax && state.sources.has(r.src) &&
      (state.zone == null || (r.zs || []).includes(state.zone)));
    const [dA, dB] = dateRange();
    const sel = base.filter(r => r.d >= dA && r.d <= dB);
    return { base, sel, dA, dB };
  }

  // ---------- Volume: years → months → days ----------
  // The level follows the filtered period: several years → bars per year,
  // a whole year → per month, a whole month → per day. Clicking a bar "drills down".
  const daysIn = (y, m) => new Date(y, m, 0).getDate();
  const MONTHS = d3.range(12).map(i => new Date(2000, i, 1).toLocaleDateString(LOCALE, { month: 'short' }));
  const MONTHS_LONG = d3.range(12).map(i => new Date(2000, i, 1).toLocaleDateString(LOCALE, { month: 'long' }));
  const setRange = (a, b) => { state.dFrom = a; state.dTo = b; apply(); };
  const yearRange = y => [y * 10000 + 101, y * 10000 + 1231];
  const monthRange = (y, m) => [y * 10000 + m * 100 + 1, y * 10000 + m * 100 + daysIn(y, m)];

  function volScope(dA, dB) {
    const yA = Math.floor(dA / 10000), yB = Math.floor(dB / 10000);
    const mA = Math.floor(dA / 100) % 100, mB = Math.floor(dB / 100) % 100;
    if (yA === yB && mA === mB && dA % 100 === 1 && dB % 100 === daysIn(yA, mA)) return { level: 'day', y: yA, m: mA };
    if (yA === yB && dA % 10000 === 101 && dB % 10000 === 1231) return { level: 'month', y: yA };
    return { level: 'year' };
  }

  function renderCrumbs(sc) {
    const el = $('volCrumbs');
    el.innerHTML = '';
    const items = [];
    const multi = state.yMin !== state.yMax;
    if (multi) items.push([`${state.yMin}–${state.yMax}`, () => setRange(null, null)]);
    if (sc.level !== 'year') items.push([String(sc.y), () => (multi ? setRange(...yearRange(sc.y)) : setRange(null, null))]);
    if (sc.level === 'day') items.push([MONTHS_LONG[sc.m - 1], null]);
    items.forEach(([label, go], i) => {
      if (i) el.insertAdjacentHTML('beforeend', '<span class="sep">›</span>');
      const last = i === items.length - 1;
      const b = document.createElement(last ? 'span' : 'button');
      b.textContent = label;
      if (last) b.className = 'cur';
      else b.onclick = go;
      el.appendChild(b);
    });
    $('volTitle').textContent = { year: 'Distance per year', month: 'Distance per month', day: 'Distance per day' }[sc.level];
    $('volHint').textContent = sc.level === 'day' ? 'Click a day to see the run' : 'Click a bar to drill down';
  }

  function renderVolume(sel, dA, dB) {
    const el = $('chVolume');
    el.innerHTML = '';
    const sc = volScope(dA, dB);
    renderCrumbs(sc);

    // Grouping by level
    let bins;
    if (sc.level === 'year') {
      bins = d3.range(state.yMin, state.yMax + 1).map(y => ({ key: y, label: String(y), long: String(y), runs: [] }));
      sel.forEach(r => bins[r.year - state.yMin]?.runs.push(r));
    } else if (sc.level === 'month') {
      bins = d3.range(1, 13).map(m => ({ key: m, label: MONTHS[m - 1], long: `${MONTHS_LONG[m - 1]} ${sc.y}`, runs: [] }));
      sel.forEach(r => bins[Math.floor(r.d / 100) % 100 - 1].runs.push(r));
    } else {
      bins = d3.range(1, daysIn(sc.y, sc.m) + 1).map(d => ({ key: d, label: String(d),
        long: new Date(sc.y, sc.m - 1, d).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }), runs: [] }));
      sel.forEach(r => bins[r.d % 100 - 1].runs.push(r));
    }
    bins.forEach(b => { b.km = d3.sum(b.runs, r => r.km); });

    const W = el.clientWidth, H = el.clientHeight, m = { t: 14, r: 4, b: 18, l: 34 };
    const x = d3.scaleBand().domain(bins.map(b => b.key)).range([m.l, W - m.r]).padding(sc.level === 'day' ? .25 : .2);
    const y = d3.scaleLinear().domain([0, d3.max(bins, b => b.km) || 1]).nice(4).range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(6).tickFormat(v => v ? nf(v) : ''))
      .call(g => g.select('.domain').remove());
    svg.append('text').attr('x', m.l - 6).attr('y', m.t - 4).attr('text-anchor', 'end')
      .attr('fill', css('--muted')).attr('font-size', 9).text('km');
    // Labels: all if space allows, otherwise one in n
    const every = Math.ceil(bins.length / Math.max(1, Math.floor((W - m.l) / 28)));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(6)
        .tickFormat((k, i) => (i % every === 0 || sc.level !== 'day' ? bins[i].label : '')))
      .call(g => g.select('.domain').remove());

    const bw = x.bandwidth();
    const g = svg.append('g');
    g.selectAll('rect.bar').data(bins.filter(b => b.km > 0)).join('rect').attr('class', 'bar')
      .attr('x', b => x(b.key)).attr('width', bw).attr('rx', Math.min(4, bw / 2))
      .attr('y', H - m.b).attr('height', 0).attr('fill', css('--g2'))
      .transition().duration(450).ease(d3.easeCubicOut).delay((b, i) => i * 12)
      .attr('y', b => y(b.km)).attr('height', b => Math.max(1, y(0) - y(b.km)));
    // value above the bars when there is room (years, months)
    const small = sc.level === 'day';
    if (bw > (small ? 11 : 22)) {
      g.selectAll('text.v').data(bins.filter(b => b.km > 0)).join('text').attr('class', 'v')
        .attr('x', b => x(b.key) + bw / 2).attr('y', b => y(b.km) - 4).attr('text-anchor', 'middle')
        .attr('fill', css('--muted')).attr('font-size', small ? 9 : 10)
        .text(b => (small ? nf(b.km, b.km < 10 ? 1 : 0) : nf(b.km)));
    }

    // Full-height click areas (even for short bars)
    g.selectAll('rect.hit').data(bins).join('rect').attr('class', 'hit')
      .attr('x', b => x(b.key) - x.step() * x.paddingInner() / 2).attr('width', x.step())
      .attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .style('cursor', b => (b.runs.length ? 'pointer' : 'default'))
      .on('mouseenter', function () { d3.select(this).attr('fill', 'rgba(255,255,255,.04)'); })
      .on('mousemove', (ev, b) => {
        if (sc.level === 'day' && b.runs.length) return showTip(ev, b.runs.map(runTip).join('<br>'));
        showTip(ev, `<b>${b.long}</b><br>${b.runs.length ? `${nf(b.km)} km · ${b.runs.length} run${b.runs.length > 1 ? 's' : ''}` : '<span class="m">No run</span>'}`);
      })
      .on('mouseleave', function () { d3.select(this).attr('fill', 'transparent'); hideTip(); })
      .on('click', (ev, b) => {
        if (!b.runs.length) return;
        hideTip();
        if (sc.level === 'year') setRange(...yearRange(b.key));
        else if (sc.level === 'month') setRange(...monthRange(sc.y, b.key));
        else highlightRun(b.runs[0]);
      });
  }

  // ---------- Calendar (one cell per day) ----------
  function renderCalendar() {
    const el = $('chCal');
    el.innerHTML = '';
    const pool = runs.filter(r => state.sources.has(r.src) && (state.zone == null || (r.zs || []).includes(state.zone)));
    const years = [...new Set(pool.map(r => r.year))].sort();
    if (!years.length) return;
    // The calendar follows the end of the filtered period, unless navigated manually
    const endYear = Math.floor(dateRange()[1] / 10000);
    if (calYear == null || endYear !== calAuto || !years.includes(calYear)) {
      calYear = years.includes(endYear) ? endYear : years[years.length - 1];
      calAuto = endYear;
    }
    $('calYear').textContent = calYear;
    $('calPrev').disabled = calYear <= years[0];
    $('calNext').disabled = calYear >= years[years.length - 1];

    const byDay = d3.rollup(pool.filter(r => r.year === calYear), v => v, r => r.d);
    const start = new Date(calYear, 0, 1), end = new Date(calYear + 1, 0, 1);
    const days = d3.timeDays(start, end);
    const W = el.clientWidth, m = { t: 14, l: 22 };
    const weeks = d3.timeMonday.count(d3.timeMonday.floor(start), end) + 1;
    const cs = Math.max(6, Math.min(22, Math.floor((W - m.l) / weeks)));
    const H = m.t + cs * 7;
    el.style.height = H + 'px';
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const maxKm = Math.max(10, d3.max([...byDay.values()], v => d3.sum(v, r => r.km)) || 0);
    const color = d3.scaleSequential(d3.interpolateRgbBasis([css('--g0'), css('--g2'), css('--g3')])).domain([0, maxKm]);
    const wk = d => d3.timeMonday.count(d3.timeMonday.floor(start), d);
    const dow = d => (d.getDay() + 6) % 7;

    ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].forEach((t, i) => t && svg.append('text').attr('class', 'axis')
      .attr('x', 0).attr('y', m.t + i * cs + cs * .75).attr('fill', css('--muted')).attr('font-size', 9).text(t));
    const [dA, dB] = dateRange();
    const sc = volScope(dA, dB);
    const selMonth = sc.level === 'day' && sc.y === calYear ? sc.m : null;
    d3.timeMonths(start, end).forEach(mo => {
      const mi = mo.getMonth() + 1;
      svg.append('text').attr('class', 'cal-month' + (mi === selMonth ? ' on' : ''))
        .attr('x', m.l + wk(mo) * cs).attr('y', 9).attr('font-size', 10)
        .text(mo.toLocaleDateString(LOCALE, { month: 'short' }))
        .on('click', () => setRange(...(mi === selMonth ? yearRange(calYear) : monthRange(calYear, mi))));
    });
    // Outside the selected month, cells fade out
    const dim = d => selMonth && d.getMonth() + 1 !== selMonth;

    svg.append('g').selectAll('rect').data(days).join('rect')
      .attr('class', d => 'day' + (byDay.has(toInt(d)) ? ' has' : ''))
      .attr('x', d => m.l + wk(d) * cs).attr('y', d => m.t + dow(d) * cs)
      .attr('width', cs - 2).attr('height', cs - 2)
      .attr('opacity', d => (dim(d) ? .3 : 1))
      .attr('fill', d => {
        const v = byDay.get(toInt(d));
        return v ? color(d3.sum(v, r => r.km)) : 'rgba(255,255,255,.05)';
      })
      .on('mousemove', (ev, d) => {
        const v = byDay.get(toInt(d));
        const label = d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
        showTip(ev, v ? v.map(runTip).join('<br>') : `<b>${label}</b><br><span class="m">Rest day</span>`);
      })
      .on('mouseleave', hideTip)
      .on('click', (ev, d) => {
        // Volume and stats switch to that day's month; the day's track shows on the map
        hideTip();
        const mi = d.getMonth() + 1;
        if (mi !== selMonth) setRange(...monthRange(calYear, mi));
        const v = byDay.get(toInt(d));
        highlightRun(v ? v[0] : null);
      });
  }

  // ---------- Gauges ----------
  function gauge(value, label, sub, cap, colorVar = '--g2') {
    const size = 110, r = 44, sw = 9, a0 = -Math.PI * .75, a1 = Math.PI * .75;
    const v = Math.max(0, Math.min(1, value));
    const div = document.createElement('div');
    div.className = 'gauge';
    const svg = d3.select(div).append('svg').attr('viewBox', `0 0 ${size} ${size * .9}`);
    const g = svg.append('g').attr('transform', `translate(${size / 2},${size / 2})`);
    const arc = d3.arc().innerRadius(r - sw / 2).outerRadius(r + sw / 2).cornerRadius(sw / 2);
    g.append('path').attr('d', arc({ startAngle: a0, endAngle: a1 })).attr('fill', 'rgba(255,255,255,.07)');
    if (v > 0) {
      g.append('path').attr('fill', css(colorVar))
        .transition().duration(700).ease(d3.easeCubicOut)
        .attrTween('d', () => t => arc({ startAngle: a0, endAngle: a0 + (a1 - a0) * v * t }));
    }
    g.append('text').attr('class', 'val').attr('text-anchor', 'middle').attr('y', 6).text(label);
    div.appendChild(subLabel(sub));
    const c = document.createElement('div');
    c.className = 'cap';
    c.textContent = cap;
    div.appendChild(c);
    return div;
  }

  // Gauge title, below the arc (outside the SVG so it never overlaps its ends)
  function subLabel(text) {
    const el = document.createElement('div');
    el.className = 'sub';
    el.textContent = text;
    return el;
  }

  function renderGauges(sel, dA, dB) {
    const el = $('chGauges');
    el.innerHTML = '';
    // 1. Goal: monthly (yearly goal / 12) if a month is selected, otherwise yearly
    const sc = volScope(dA, dB);
    const pool = runs.filter(r => state.sources.has(r.src) && (state.zone == null || (r.zs || []).includes(state.zone)));
    if (sc.level === 'day') {
      const goal = state.goal / 12;
      const km = d3.sum(sel, r => r.km);
      el.appendChild(gauge(km / goal, Math.round(100 * km / goal) + '%',
        MONTHS_LONG[sc.m - 1] + ' goal', `${nf(km)} / ${nf(goal)} km`));
    } else {
      const yr = Math.floor(dB / 10000);
      const km = d3.sum(pool.filter(r => r.year === yr), r => r.km);
      el.appendChild(gauge(km / state.goal, Math.round(100 * km / state.goal) + '%',
        yr + ' goal', `${nf(km)} / ${nf(state.goal)} km`));
    }
    // 2. Consistency: weeks with at least one run
    const today = toInt(new Date());
    const from = toDate(dA), to = toDate(Math.min(dB, today));
    const nWeeks = Math.max(1, d3.timeMonday.count(d3.timeMonday.floor(from), to) + 1);
    const active = new Set(sel.map(r => +d3.timeMonday.floor(toDate(r.d)))).size;
    el.appendChild(gauge(active / nWeeks, Math.round(100 * active / nWeeks) + '%', 'Consistency',
      `${active} / ${nWeeks} weeks`));
    // 3. Exploration: share of the period's km run on paths never taken before
    //    (nk / gk computed by build_data.py, in chronological order of all runs)
    const newKm = d3.sum(sel, r => r.nk || 0), gpsKm = d3.sum(sel, r => r.gk || 0);
    const share = gpsKm ? newKm / gpsKm : 0;
    const ex = gauge(share, (share < .1 && share > 0 ? nf(100 * share, 1) : Math.round(100 * share)) + '%',
      'Exploration', `${nf(newKm, newKm < 10 ? 1 : 0)} km of new paths`, '--explore');
    // Click: shows / hides these paths on the map
    ex.classList.add('clickable');
    ex.classList.toggle('on', state.explore);
    ex.title = state.explore ? 'Hide new paths on the map' : 'Show these new paths on the map';
    ex.onclick = () => { state.explore = !state.explore; save(); apply(); };
    el.appendChild(ex);
  }

  // ---------- Records ----------
  function renderRecords(sel) {
    const el = $('chRecords');
    el.innerHTML = '';
    const best = (arr, key, dir = 1) => arr.filter(r => r[key]).sort((a, b) => dir * (a[key] - b[key]))[0];
    const longest = best(sel, 'km', -1), b5 = best(sel, 'b5'), b10 = best(sel, 'b10'), dp = best(sel, 'dp', -1);
    const timed = sel.filter(r => r.dur && r.km);
    const totDp = d3.sum(sel, r => r.dp || 0);
    const items = [
      ['Longest run', longest && nf(longest.km, 1) + ' km', longest],
      ['Best 5 km', b5 && fmtDur(b5.b5), b5],
      ['Best 10 km', b10 && fmtDur(b10.b10), b10],
      ['Biggest climb', dp && nf(dp.dp) + ' m', dp],
      ['Average pace', timed.length ? fmtPace(d3.sum(timed, r => r.dur), d3.sum(timed, r => r.km)) : null, null,
        timed.length ? fmtDur(d3.sum(timed, r => r.dur)) + ' of running' : ''],
      ['Total climb', totDp ? nf(totDp / EVEREST_M, 1) + ' × Everest' : null, null, totDp ? nf(totDp) + ' m' : ''],
    ];
    items.forEach(([label, val, run, extra]) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rv"></span><span class="rl"></span><span class="rd"></span>`;
      li.querySelector('.rv').textContent = val || '–';
      li.querySelector('.rl').textContent = label;
      li.querySelector('.rd').textContent = run ? toDate(run.d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : (extra || '');
      if (run) {
        li.className = 'clickable';
        li.title = 'Show on the map';
        li.onclick = () => highlightRun(run);
      }
      el.appendChild(li);
    });
  }

  // ---------- Context (period, place) ----------
  function renderContext(dA, dB) {
    const el = $('statsCtx');
    el.innerHTML = '';
    const chip = (text, onClear) => {
      const c = document.createElement('span');
      c.className = 'chip' + (onClear ? '' : ' plain');
      c.textContent = text;
      if (onClear) {
        const b = document.createElement('button');
        b.textContent = '✕';
        b.setAttribute('aria-label', 'Remove this filter');
        b.onclick = onClear;
        c.appendChild(b);
      }
      el.appendChild(c);
    };
    const sc = volScope(dA, dB);
    const period = sc.level === 'day' ? `${MONTHS_LONG[sc.m - 1]} ${sc.y}` : sc.level === 'month' ? String(sc.y) : `${fmtD(dA)} – ${fmtD(dB)}`;
    if (state.dFrom) chip(period, () => { state.dFrom = state.dTo = null; apply(); });
    else chip(state.yMin === state.yMax ? String(state.yMin) : `${state.yMin} – ${state.yMax}`);
    const zonesData = window.ZONES || [];
    if (state.zone != null && zonesData[state.zone]) chip(zonesData[state.zone].name, () => { state.zone = null; apply(); });
  }

  // ---------- Overall render ----------
  function render() {
    if (drawer.hidden || !runs) return;
    const { base, sel, dA, dB } = datasets();
    renderContext(dA, dB);
    renderCalendar();
    renderGauges(sel, dA, dB);
    renderRecords(sel);
    renderVolume(sel, dA, dB);   // last: it takes the height left free by the others
  }
  window.renderStats = render;

  // ---------- Open / close ----------
  const openBtn = $('openStats');
  function setOpen(open) {
    drawer.hidden = !open;
    openBtn.classList.toggle('on', open);
    openBtn.setAttribute('aria-expanded', open);
    state.stats = open;
    save();
    if (open) render();
  }
  openBtn.onclick = () => setOpen(drawer.hidden);
  $('closeStats').onclick = () => setOpen(false);
  $('calPrev').onclick = () => { calYear--; renderCalendar(); };
  $('calNext').onclick = () => { calYear++; renderCalendar(); };
  $('goal').onchange = e => {
    const v = Math.round(+e.target.value);
    if (v >= 50) { state.goal = v; save(); render(); }
  };

  // Redraw when the size changes (window, drawer opening)
  let rt;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(render, 120); }).observe(drawer);

  if (state.stats) setOpen(true);
})();
