// Access to the MapLibre map for components other than the map itself (fly to a place…)
export const mapCtl = {
  map: null,
  fit(bounds, opts = {}) {
    this.map?.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 1800, ...opts });
  },
};

// Padding that keeps a run visible next to the panel and above the stats drawer
export function freePadding() {
  const map = mapCtl.map;
  if (!map) return 40;
  const W = map.getContainer().clientWidth,
    H = map.getContainer().clientHeight;
  const drawer = document.getElementById('statsDrawer');
  const panel = document.getElementById('panel');
  const drawerH = drawer ? drawer.offsetHeight + 32 : 40;
  const panelW = panel ? panel.offsetWidth + 40 : 40;
  return { top: 40, right: 40, bottom: Math.min(drawerH, H * 0.7), left: Math.min(panelW, W * 0.5) };
}
