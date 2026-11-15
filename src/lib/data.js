// Your runs live in this browser only (IndexedDB). Imported files are read by importer.js
// (a Web Worker): nothing is uploaded anywhere.
//
// IndexedDB 'runmap' / store 'kv':
//   imported : runs added by the importer (track + summary, without derived data)
//   built    : { sig, data } the full dataset (with new paths and places), rebuilt when the
//              imported runs or the build version change
// Demo mode (localStorage 'runmap-demo'): shows demo.json instead. Also used as long as
// nothing has been imported (first visit).
export const RunData = (() => {
  const BUILD_VERSION = 3;   // bump when the derived data format changes
  const KEEP = ['id', 'date', 'src', 'sp', 'km', 'segs', 't', 'ts', 'dur', 'dp', 'b5', 'b10'];
  const bare = r => {
    const o = Object.fromEntries(KEEP.filter(k => r[k] != null).map(k => [k, r[k]]));
    if (o.sp === 'hike') o.sp = 'walk';   // hikes are now counted as walks
    return o;
  };

  // ---- tiny IndexedDB key/value store ----
  let dbp;
  const db = () => dbp || (dbp = new Promise((ok, ko) => {
    const req = indexedDB.open('runmap', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  }));
  const tx = (mode, fn) => db().then(d => new Promise((ok, ko) => {
    const t = d.transaction('kv', mode), req = fn(t.objectStore('kv'));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => ko(t.error);
  }));
  const get = k => tx('readonly', s => s.get(k)).catch(() => undefined);
  const set = (k, v) => tx('readwrite', s => s.put(v, k));
  const del = k => tx('readwrite', s => s.delete(k));

  let imported = [];
  const signature = () => [BUILD_VERSION, imported.length, imported[0]?.id, imported.at(-1)?.id].join('|');

  function work(msg, onProgress) {
    return new Promise((ok, ko) => {
      const w = new Worker(new URL('../worker/importer.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => {
        if (data.type === 'progress') return onProgress && onProgress(data);
        w.terminate();
        data.type === 'error' ? ko(new Error(data.message)) : ok(data);
      };
      w.onerror = e => { w.terminate(); ko(new Error(e.message || 'Worker error')); };
      w.postMessage({ ...msg, placesUrl: new URL('places.tsv', document.baseURI).href });
    });
  }
  const allRuns = () => imported.map(bare);

  const fetchJson = async url => {
    try { const res = await fetch(new URL(url, document.baseURI), { cache: 'no-cache' }); return res.ok ? await res.json() : null; }
    catch (e) { return null; }
  };
  // The demo runs are moved forward by whole weeks so the latest one falls in the past 7 days:
  // the demo always looks recent, and weekdays (calendar, weekly streaks) stay the same.
  const DAY = 864e5;
  const utcDay = ymd => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
  const shiftYmd = (ymd, days) => new Date(utcDay(ymd) + days * DAY).toISOString().slice(0, 10);
  function redate(demo) {
    const last = demo.runs.reduce((m, r) => (r.date > m ? r.date : m), '');
    if (!last) return demo;
    const now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.floor((today - utcDay(last)) / DAY / 7) * 7;
    if (days <= 0) return demo;
    const move = v => v && shiftYmd(v, days) + v.slice(10);   // keeps the time part of 't'
    return { ...demo,
      runs: demo.runs.map(r => ({ ...r, date: move(r.date), t: move(r.t) })),
      zones: (demo.zones || []).map(z => ({ ...z, from: move(z.from), to: move(z.to) })) };
  }

  const DEMO_KEY = 'runmap-demo';
  const demoWanted = () => { try { return localStorage.getItem(DEMO_KEY) === '1'; } catch (e) { return false; } };
  function setDemo(on) {
    try { on ? localStorage.setItem(DEMO_KEY, '1') : localStorage.removeItem(DEMO_KEY); } catch (e) {}
  }

  // Dataset shown on the map. Extra fields: imported (count), own (your runs exist), demo
  async function load(onProgress) {
    imported = (await get('imported')) || [];
    const own = imported.length > 0;
    const info = { imported: imported.length, own, demo: false };
    if (demoWanted() || !own) {
      const demo = await fetchJson('demo.json');
      if (demo) return { ...redate(demo), ...info, demo: true };
    }
    if (!own) return { runs: [], zones: [], ...info };   // no demo.json either
    const sig = signature(), cached = await get('built');
    if (cached && cached.sig === sig) return { ...cached.data, ...info };
    const { data } = await work({ type: 'build', runs: allRuns() }, onProgress);
    await set('built', { sig, data });
    return { ...data, ...info };
  }

  // Imports files (GPX, TCX, FIT, Nike JSON, .gz, .zip): returns the import report.
  // replace: the new files replace your current activities (kept if nothing could be imported)
  async function importFiles(files, onProgress, replace = false) {
    const { added, data, report } = await work({ type: 'import', files: [...files], runs: replace ? [] : allRuns() }, onProgress);
    if (added.length) {
      setDemo(false);   // show your runs once there are some
      imported = replace ? added : [...imported, ...added];
      await set('imported', imported);
      await set('built', { sig: signature(), data });
    }
    return report;
  }

  async function reset() {
    imported = [];
    await del('imported');
    await del('built');
  }

  return { load, importFiles, reset, setDemo, get count() { return imported.length; } };
})();
