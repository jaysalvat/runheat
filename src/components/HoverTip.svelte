<script>
  // Styled tooltips for every element with a `title` (buttons, toggles, map controls…), in place
  // of the browser's native ones. Delegated from the document: components keep using `title`.
  // On hover the title moves to data-tip (so the native tooltip never shows); if a component
  // changes its title later, the new one is picked up on the next hover.
  // A keyboard shortcut declared with aria-keyshortcuts is shown as a small key badge.
  import { onMount, tick } from 'svelte';

  const DELAY = 350, GAP = 8, EDGE = 8;
  // "Alt+1" → "⌥1" on a Mac
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const keyLabel = k => (MAC ? k.replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : k);
  let text = $state(''), key = $state(''), show = $state(false), below = $state(false);
  let x = $state(0), y = $state(0), arrow = $state(0);
  let tipEl, target = null, timer;

  function tipText(el) {
    const t = el.getAttribute('title');
    if (t != null) {
      el.removeAttribute('title');
      if (t) el.dataset.tip = t; else delete el.dataset.tip;
      // icon-only elements keep an accessible name
      if (t && !el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', t);
    }
    return el.dataset.tip || '';
  }

  async function place() {
    if (!target?.isConnected) return hide();
    const r = target.getBoundingClientRect();
    show = true;
    await tick();   // let the text render to measure it
    if (!tipEl) return;
    fitText();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    below = r.top - h - GAP < EDGE;   // no room above: under the element
    const cx = r.left + r.width / 2;
    x = Math.max(EDGE, Math.min(innerWidth - w - EDGE, cx - w / 2));
    y = below ? r.bottom + GAP : r.top - h - GAP;
    arrow = Math.max(10, Math.min(w - 10, cx - x));
  }

  // Wrapped text keeps its box at max-width, even once the lines are balanced: shrink the
  // text box to its longest line so the bubble hugs the text.
  function fitText() {
    const span = tipEl.querySelector('span'), range = document.createRange();
    range.selectNodeContents(span);
    const rects = [...range.getClientRects()];
    if (rects.length < 2) return;
    const left = span.getBoundingClientRect().left;
    span.style.width = Math.ceil(Math.max(...rects.map(r => r.right)) - left) + 'px';
  }

  function hide() { clearTimeout(timer); show = false; target = null; }

  onMount(() => {
    const over = e => {
      if (e.pointerType === 'touch') return;
      const el = e.target.closest?.('[title], [data-tip]');
      if (el === target) return;
      hide();
      if (!el) return;
      const t = tipText(el);
      if (!t) return;
      target = el; text = t; key = el.getAttribute('aria-keyshortcuts') || '';
      timer = setTimeout(place, DELAY);
    };
    const out = e => { if (target && !target.contains(e.relatedTarget)) hide(); };
    const focus = e => {
      const el = e.target.closest?.('[title], [data-tip]');
      if (!el || !e.target.matches(':focus-visible')) return;
      const t = tipText(el);
      if (t) { hide(); target = el; text = t; key = el.getAttribute('aria-keyshortcuts') || ''; place(); }
    };
    const opts = { capture: true, passive: true };
    document.addEventListener('pointerover', over, opts);
    document.addEventListener('pointerout', out, opts);
    document.addEventListener('pointerdown', hide, opts);
    document.addEventListener('focusin', focus, opts);
    // focusout also fires when Svelte removes a focused element mid-update: hide afterwards
    const blurOut = () => queueMicrotask(hide);
    document.addEventListener('focusout', blurOut, opts);
    document.addEventListener('keydown', hide, opts);
    addEventListener('scroll', hide, opts);
    addEventListener('blur', hide);
    return () => {
      for (const [t, f] of [['pointerover', over], ['pointerout', out], ['pointerdown', hide],
        ['focusin', focus], ['focusout', blurOut], ['keydown', hide]]) document.removeEventListener(t, f, opts);
      removeEventListener('scroll', hide, opts);
      removeEventListener('blur', hide);
    };
  });
</script>

{#if show}
  <div class="hover-tip" class:below bind:this={tipEl} role="tooltip"
    style:left="{x}px" style:top="{y}px" style:--arrow="{arrow}px"><span>{text}</span>{#if key}<kbd>{keyLabel(key)}</kbd>{/if}</div>
{/if}

<style>
  .hover-tip { position: fixed; z-index: 20; pointer-events: none; max-width: 270px; padding: 6px 10px;
    background: rgba(8,10,13,.96); color: var(--text); border: 1px solid var(--panel-border); border-radius: 8px;
    font-size: 12px; line-height: 1.4; text-align: left; text-wrap: balance; box-shadow: 0 6px 18px rgba(0,0,0,.5);
    animation: tip-in .12s ease-out; display: flex; align-items: flex-start; gap: 8px; }
  kbd { flex: none; min-width: 18px; padding: 0 5px; border-radius: 4px;
    background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); border-bottom-width: 2px;
    color: var(--text); font: 600 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
  /* small arrow pointing at the element */
  .hover-tip::after { content: ''; position: absolute; left: var(--arrow); top: 100%; width: 8px; height: 8px;
    background: inherit; border: inherit; border-width: 0 1px 1px 0; transform: translate(-50%, -50%) rotate(45deg); }
  .hover-tip.below::after { top: 0; border-width: 1px 0 0 1px; }
  @keyframes tip-in { from { opacity: 0; transform: translateY(3px); } }
  .hover-tip.below { animation-name: tip-in-below; }
  @keyframes tip-in-below { from { opacity: 0; transform: translateY(-3px); } }
</style>
