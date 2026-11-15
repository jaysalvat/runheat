// Tooltip shared by the charts (follows the mouse)
export const tooltip = $state({ lines: [], x: 0, y: 0, show: false });
export function showTip(ev, lines) {
  tooltip.lines = lines;
  tooltip.x = ev.clientX;
  tooltip.y = ev.clientY;
  tooltip.show = true;
}
export const hideTip = () => {
  tooltip.show = false;
};
