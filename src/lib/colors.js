// Colour helpers: interface shades derived from one picked colour, track halo shade.
import { DEFAULT_ACCENT } from './config.js';

const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgbHex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
// sRGB mix: t = 0 → a, t = 1 → b
export const mix = (a, b, t) => rgbHex(hexRgb(a).map((v, i) => v + (hexRgb(b)[i] - v) * t));

// Same hue, ~25% less lightness (Density's halo on the Dark basemap)
export function deeper(hex) {
  const rgb = hexRgb(hex).map(v => v / 255);
  const mx = Math.max(...rgb), mn = Math.min(...rgb), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return hex;
  const sat = d / (1 - Math.abs(2 * l - 1));
  const [r, g, b] = rgb;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const L = l * .75, C = (1 - Math.abs(2 * L - 1)) * sat, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = L - C / 2;
  const [R, G, B] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return rgbHex([R, G, B].map(v => (v + m) * 255));
}

// Interface colour → CSS variables. With the default orange, the stylesheet's hand-picked
// shades are kept (null = remove the override).
export function accentVars(a) {
  if (!a || a.toLowerCase() === DEFAULT_ACCENT)
    return { '--accent': null, '--on-accent': null, '--g0': null, '--g1': null, '--g2': null, '--g3': null };
  const [r, g, b] = hexRgb(a).map(v => v / 255), lum = .2126 * r + .7152 * g + .0722 * b;
  return {
    '--accent': a,
    '--on-accent': lum > .45 ? '#111' : '#fff',   // readable text on the colour
    '--g2': a,                                    // bars, gauges, records
    '--g1': mix(a, '#000000', .3),                // deeper shade
    '--g3': mix(a, '#ffffff', .45),               // light shade (calendar peak, breadcrumbs)
    '--g0': mix(a, '#0b0d10', .75),               // lowest calendar value
  };
}

// Reads a CSS variable (charts need actual colour values)
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
// Chart shade for the given interface colour, without waiting for the page variables to update
// (default orange: the hand-picked shades of app.css)
const DEFAULT_SHADES = { '--g0': '#4a2414', '--g1': '#b3441a', '--g2': '#ff6a2b', '--g3': '#ffb38a' };
export const shade = (accent, v) => accentVars(accent)[v] || DEFAULT_SHADES[v] || css(v);
