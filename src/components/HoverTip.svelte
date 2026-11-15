<script>
  // Styled tooltips for every element with a `title` (buttons, toggles, map controls…), in place
  // of the browser's native ones. Delegated from the document: components keep using `title`.
  // On hover the title moves to data-tip (so the native tooltip never shows); if a component
  // changes its title later, the new one is picked up on the next hover.
  import { onMount } from 'svelte';

  const DELAY = 350, GAP = 8, EDGE = 8;
  let text = $state(''), show = $state(false), below = $state(false);
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
    await Promise.resolve();   // let the text render to measure it
    if (!tipEl) return;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    below = r.top - h - GAP < EDGE;   // no room above: under the element
    const cx = r.left + r.width / 2;
    x = Math.max(EDGE, Math.min(innerWidth - w - EDGE, cx - w / 2));
    y = below ? r.bottom + GAP : r.top - h - GAP;
    arrow = Math.max(10, Math.min(w - 10, cx - x));
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
      target = el; text = t;
      timer = setTimeout(place, DELAY);
    };
    const out = e => { if (target && !target.contains(e.relatedTarget)) hide(); };
    const focus = e => {
      const el = e.target.closest?.('[title], [data-tip]');
      if (!el || !e.target.matches(':focus-visible')) return;
      const t = tipText(el);
      if (t) { hide(); target = el; text = t; place(); }
    };
    const opts = { capture: true, passive: true };
    document.addEventListener('pointerover', over, opts);
    document.addEventListener('pointerout', out, opts);
    document.addEventListener('pointerdown', hide, opts);
    document.addEventListener('focusin', focus, opts);
    document.addEventListener('focusout', hide, opts);
    document.addEventListener('keydown', hide, opts);
    addEventListener('scroll', hide, opts);
    addEventListener('blur', hide);
    return () => {
      for (const [t, f] of [['pointerover', over], ['pointerout', out], ['pointerdown', hide],
        ['focusin', focus], ['focusout', hide], ['keydown', hide]]) document.removeEventListener(t, f, opts);
      removeEventListener('scroll', hide, opts);
      removeEventListener('blur', hide);
    };
  });
</script>

{#if show}
  <div class="hover-tip" class:below bind:this={tipEl} role="tooltip"
    style:left="{x}px" style:top="{y}px" style:--arrow="{arrow}px">{text}</div>
{/if}

<style>
  .hover-tip { position: fixed; z-index: 20; pointer-events: none; max-width: 240px; padding: 6px 10px;
    background: rgba(8,10,13,.96); color: var(--text); border: 1px solid var(--panel-border); border-radius: 8px;
    font-size: 12px; line-height: 1.4; text-align: center; box-shadow: 0 6px 18px rgba(0,0,0,.5);
    animation: tip-in .12s ease-out; }
  /* small arrow pointing at the element */
  .hover-tip::after { content: ''; position: absolute; left: var(--arrow); top: 100%; width: 8px; height: 8px;
    background: inherit; border: inherit; border-width: 0 1px 1px 0; transform: translate(-50%, -50%) rotate(45deg); }
  .hover-tip.below::after { top: 0; border-width: 1px 0 0 1px; }
  @keyframes tip-in { from { opacity: 0; transform: translateY(3px); } }
  .hover-tip.below { animation-name: tip-in-below; }
  @keyframes tip-in-below { from { opacity: 0; transform: translateY(-3px); } }
</style>
