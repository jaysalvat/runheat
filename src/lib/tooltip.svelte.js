// Tooltip shared by the charts (follows the mouse)
export const tooltip = $state({ html: '', x: 0, y: 0, show: false });
export function showTip(ev, html) {
  tooltip.html = html; tooltip.x = ev.clientX; tooltip.y = ev.clientY; tooltip.show = true;
}
export const hideTip = () => { tooltip.show = false; };
