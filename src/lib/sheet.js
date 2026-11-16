// Bottom sheets on phones: panels slide from the bottom of the screen. Dragging the grabber or the
// header down calls onDown (collapse or close), up calls onUp (expand); a tap on them calls onTap.
// A collapsed sheet (isCollapsed) is expanded as soon as it's dragged up, then follows the finger.
// Desktop is untouched: the action does nothing above the phone breakpoint.
import { flushSync } from 'svelte';

export const PHONE = '(max-width: 600px)';
export const isPhone = () => matchMedia(PHONE).matches;

const DRAG_START = 6; // px of movement before a press becomes a drag
const DRAG_ACT = 50; // px dragged to collapse / expand

export function sheet(node, handlers) {
  let opts = handlers,
    startY = 0,
    dy = 0,
    dragging = false,
    pressed = false,
    opening = 0; // while opening a collapsed sheet: how far its top was below the expanded top

  const handleOf = (target) =>
    target.closest('.grabber') ||
    (!target.closest('button, input, a, label') && target.closest('h1, h2, header'));

  function down(e) {
    if (!isPhone() || e.button > 0 || !handleOf(e.target)) return;
    pressed = true;
    dragging = false;
    startY = e.clientY;
    dy = 0;
  }
  function move(e) {
    if (!pressed) return;
    dy = e.clientY - startY;
    if (!dragging && Math.abs(dy) < DRAG_START) return;
    if (!dragging) {
      dragging = true;
      node.setPointerCapture?.(e.pointerId);
      node.style.transition = 'none';
      if (dy < 0 && opts.isCollapsed?.()) {
        // expand now, then pull the full sheet back down to where the finger started
        const top = node.getBoundingClientRect().top;
        flushSync(() => opts.onUp?.());
        opening = Math.max(0, top - node.getBoundingClientRect().top);
      }
    }
    // follows the finger (upwards only a little when there's nothing to open, as a hint)
    node.style.transform = `translateY(${opening ? Math.max(opening + dy, 0) : Math.max(dy, -30)}px)`;
  }
  function up() {
    if (!pressed) return;
    pressed = false;
    node.style.transition = '';
    if (opening) {
      const back = dy > -DRAG_ACT / 2; // not pulled far enough: slide back down and collapse again
      node.style.transform = back ? `translateY(${opening}px)` : '';
      if (back)
        setTimeout(() => {
          node.style.transition = 'none';
          node.style.transform = '';
          opts.onDown?.();
          requestAnimationFrame(() => (node.style.transition = ''));
        }, 250);
      opening = 0;
      return;
    }
    node.style.transform = '';
    if (!dragging) return opts.onTap?.();
    if (dy > DRAG_ACT) opts.onDown?.();
    else if (dy < -DRAG_ACT / 2) opts.onUp?.();
  }

  // iOS scrolls the whole page under a drag unless touchmove is cancelled (touch-action alone isn't enough)
  const touchMove = (e) => pressed && e.cancelable && e.preventDefault();

  node.addEventListener('pointerdown', down);
  node.addEventListener('touchmove', touchMove, { passive: false });
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  return {
    update(h) {
      opts = h;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('touchmove', touchMove);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    },
  };
}
