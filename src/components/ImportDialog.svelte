<script>
  // Import dialog: files, folders or archives, read in the browser (nothing is uploaded)
  import { app } from '../lib/app.svelte.js';
  import { SPORTS } from '../lib/config.js';
  import { nf, plural } from '../lib/format.js';
  import { RunData } from '../lib/data.js';
  import IconButton from './ui/IconButton.svelte';
  import Upload from './icons/Upload.svelte';

  let busy = $state(false);
  let over = $state(false);
  let progress = $state(null); // { text, done, total }
  let result = $state(null); // { head, lines: [{ text, err }] }
  let choice = $state(null); // { n, files, resolve }
  let dirInput = $state();

  const summary = $derived.by(() => {
    const runs = app.runs;
    if (app.info.demo) return { demo: true, n: runs.length };
    const bySrc = {};
    for (const r of runs) bySrc[r.src] = (bySrc[r.src] || 0) + 1;
    const parts = Object.entries(bySrc)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s[0].toUpperCase() + s.slice(1)} ${nf(n)}`);
    return { n: runs.length, parts };
  });

  // Asked when activities already exist: resolves to 'add', 'replace' or 'cancel'
  const askMode = (nFiles) =>
    new Promise((resolve) => {
      choice = { n: RunData.count, files: nFiles, resolve };
    });
  function answer(mode) {
    const c = choice;
    choice = null;
    c.resolve(mode);
  }

  async function run(files) {
    if (!files.length || busy) return;
    app.panel = 'data';
    busy = true;
    result = null;
    const mode = RunData.count ? await askMode(files.length) : 'add';
    if (mode === 'cancel') {
      busy = false;
      return;
    }
    progress = { text: 'Reading files…' };
    try {
      const rep = await RunData.importFiles(files, (p) => (progress = p), mode === 'replace');
      if (rep.added) {
        const what = Object.entries(rep.bySport)
          .sort((a, b) => b[1] - a[1])
          .map(([sp, n]) => plural(n, (SPORTS[sp] || SPORTS.other).word))
          .join(', ');
        progress = { text: 'Updating the map…' };
        await app.load();
        app.toast = `${mode === 'replace' ? 'Replaced by' : 'Imported'}: ${what}`;
        app.panel = null;
        return;
      }
      const lines = [];
      if (rep.duplicates) lines.push({ text: `${nf(rep.duplicates)} already on the map (duplicates)` });
      if (rep.noGps) lines.push({ text: `${nf(rep.noGps)} without GPS or date (treadmill…)` });
      rep.errors.slice(0, 5).forEach((e) => lines.push({ text: e, err: true }));
      if (rep.errors.length > 5) lines.push({ text: `…and ${rep.errors.length - 5} more errors`, err: true });
      result = { head: 'No new activity added', lines };
    } catch (err) {
      result = { head: 'Import failed', lines: [{ text: err.message, err: true }] };
    } finally {
      busy = false;
      progress = null;
    }
  }

  // Dropped folders are walked recursively
  async function droppedFiles(dt) {
    const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return [...dt.files];
    const out = [];
    const walk = async (entry) => {
      if (entry.isFile) {
        out.push(await new Promise((ok, ko) => entry.file(ok, ko)));
        return;
      }
      const reader = entry.createReader();
      for (;;) {
        // readEntries returns at most ~100 entries per call
        const batch = await new Promise((ok, ko) => reader.readEntries(ok, ko));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    };
    for (const e of entries) await walk(e);
    return out;
  }

  // Files can be dropped anywhere on the page. dragenter/dragleave also fire for every child
  // element crossed, hence the depth counter.
  let depth = 0;
  function onDragEnter(e) {
    if (![...e.dataTransfer.types].includes('Files')) return;
    depth++;
    app.panel = 'data';
    over = true;
  }
  function onDragLeave() {
    if (--depth <= 0) {
      depth = 0;
      over = false;
    }
  }
  function onDrop(e) {
    e.preventDefault();
    depth = 0;
    over = false;
    droppedFiles(e.dataTransfer).then(run);
  }
  function pick(e) {
    const files = [...e.currentTarget.files];
    e.currentTarget.value = '';
    run(files);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.panel === 'data' && (app.panel = null)} />
<svelte:document
  ondragenter={onDragEnter}
  ondragleave={onDragLeave}
  ondragover={(e) => e.preventDefault()}
  ondrop={onDrop}
/>

{#if app.panel === 'data'}
  <div class="floating popup dlg" role="dialog" aria-label="Import runs">
    <h2><span>Your runs</span><IconButton label="Close" onclick={() => (app.panel = null)}>✕</IconButton></h2>
    <p class="sum">
      {#if summary.demo}
        You're looking at the <b>demo</b> ({plural(summary.n, 'activity')} on the French Riviera). Import your files
        to see yours.
      {:else if summary.n}
        <b>{plural(summary.n, 'activity')}</b> on the map · {summary.parts.join(' · ')}
      {:else}
        No activities yet: import your files to see them on the map.
      {/if}
    </p>

    <label class="drop" class:over class:busy>
      <input type="file" multiple accept=".gpx,.tcx,.fit,.json,.gz,.zip" hidden onchange={pick} />
      <span class="ico"><Upload size={26} /></span>
      <b>Drop files here</b>
      <span>or click to choose files</span>
      <small>GPX, TCX, FIT, Nike export, or a Strava / Garmin export (.zip)</small>
    </label>
    <input type="file" webkitdirectory hidden bind:this={dirInput} onchange={pick} />
    <button class="link-btn" onclick={() => dirInput.click()}>Choose a folder instead</button>

    {#if choice}
      <div class="box">
        You already have <b>{plural(choice.n, 'activity')}</b> here. What should {choice.files > 1
          ? `these ${nf(choice.files)} files`
          : 'this file'} do?
        <div class="row choice">
          <button class="btn primary" onclick={() => answer('add')}>Add to them</button>
          <button class="btn" onclick={() => answer('replace')}>Replace them</button>
        </div>
        <button class="link-btn" onclick={() => answer('cancel')}>Cancel</button>
      </div>
    {/if}

    {#if progress}
      <div class="prog">
        <div class="bar" class:indet={!progress.total}>
          <span style:width={progress.total ? `${(100 * progress.done) / progress.total}%` : null}></span>
        </div>
        {progress.text}
      </div>
    {/if}

    {#if result}
      <div class="box">
        <b>{result.head}</b>
        {#if result.lines.length}
          <ul>
            {#each result.lines as l, i (i)}<li class:err={l.err}>{l.text}</li>{/each}
          </ul>
        {/if}
      </div>
    {/if}

    <details>
      <summary>Where do I find my files?</summary>
      <p>
        <b>Strava</b>: Settings → My Account → Download or Delete Your Account → Request your archive. You get
        an email with a .zip: drop it here as is.
      </p>
      <p><b>Garmin</b>: Account → Data Management → Export Your Data. Drop the .zip you receive.</p>
      <p>
        <b>Nike Run Club</b>: Nike has no export button. Its app data can be fetched with a small script (e.g.
        nrc-exporter); drop the folder of .json or .gpx files it creates.
      </p>
      <p>
        <b>Other apps</b>: export your runs as GPX, TCX or FIT files and drop them here (several at once is
        fine).
      </p>
    </details>
    <p class="note">
      Files are read in your browser: nothing is uploaded. A run starting within 2 minutes of one already on
      the map is skipped as a duplicate. Place names:
      <a href="https://www.geonames.org" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0).
    </p>
  </div>
{/if}

<style>
  .dlg {
    width: 340px;
  }
  .sum {
    margin: 0 0 12px;
    color: var(--muted);
    font-size: 13px;
  }
  .sum b {
    color: var(--text);
    font-weight: 600;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 22px 14px;
    text-align: center;
    border: 1.5px dashed var(--line);
    border-radius: 10px;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .drop:hover,
  .drop.over {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .drop .ico {
    color: var(--accent);
    margin-bottom: 4px;
    display: flex;
  }
  .drop b {
    font-weight: 600;
  }
  .drop span,
  .drop small {
    color: var(--muted);
    font-size: 12px;
  }
  .drop.busy {
    pointer-events: none;
    opacity: 0.5;
  }
  .box {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--chip);
    font-size: 13px;
  }
  .box ul {
    margin: 6px 0 0;
    padding-left: 18px;
    color: var(--muted);
    font-size: 12px;
  }
  .box .err {
    color: #ff8a80;
  }
  .choice {
    margin-top: 10px;
  }
  .choice .btn {
    margin: 0;
    flex: 1;
  }
  .prog {
    margin-top: 12px;
    font-size: 12px;
    color: var(--muted);
  }
  .bar {
    height: 3px;
    background: var(--line);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 6px;
  }
  .bar span {
    display: block;
    height: 100%;
    width: 30%;
    background: var(--accent);
    transition: width 0.2s;
  }
  .bar.indet span {
    animation: indet 1.1s ease-in-out infinite;
  }
  @keyframes indet {
    from {
      margin-left: -30%;
    }
    to {
      margin-left: 100%;
    }
  }
  details {
    margin-top: 14px;
    font-size: 12px;
    color: var(--muted);
  }
  summary {
    cursor: pointer;
    color: var(--text);
  }
  details p {
    margin: 6px 0 0;
  }
  .note {
    margin: 14px 0 0;
    font-size: 11px;
    color: var(--muted);
    opacity: 0.8;
  }
  .note a {
    color: inherit;
  }
</style>
