// Formatting and date helpers. Dates are handled as YYYYMMDD integers (e.g. 20240306).
import { LOCALE } from './config.js';

export const nf = (v, digits = 0) =>
  v.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits });
// "1 run", "3 runs", "2 activities"
export const plural = (n, word) => `${nf(n)} ${word}${n > 1 ? 's' : ''}`.replace('activitys', 'activities');

export const ymd = (y, m, d) => y * 10000 + m * 100 + d;
export const daysIn = (y, m) => new Date(y, m, 0).getDate();
export const toDate = d => new Date(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100);
export const toInt = dt => dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
export const yearRange = y => [ymd(y, 1, 1), ymd(y, 12, 31)];
export const monthRange = (y, m) => [ymd(y, m, 1), ymd(y, m, daysIn(y, m))];

export const monthName = (m, style = 'long') => new Date(2000, m - 1, 1).toLocaleDateString(LOCALE, { month: style });
export const fmtD = d => toDate(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
export const dateLong = d => toDate(d).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

// "2022", "March 2022", "6 Mar 2024" or "3 Mar 2022 – 5 Jun 2023"
export function periodLabel(a, b) {
  const y = Math.floor(a / 10000), m = Math.floor(a / 100) % 100;
  if (Math.floor(b / 10000) === y && a % 10000 === 101 && b % 10000 === 1231) return String(y);
  if (Math.floor(b / 100) === Math.floor(a / 100) && a % 100 === 1 && b % 100 === daysIn(y, m))
    return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
  return a === b ? fmtD(a) : `${fmtD(a)} – ${fmtD(b)}`;
}

// 754 → "12:34", 4000 → "1h06"
export function fmtDur(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
export function fmtPace(dur, km) {
  if (!dur || !km) return '–';
  const s = Math.round(dur / km);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
}
export const fmtSpeed = (dur, km) => nf(km / (dur / 3600), 1) + ' km/h';
export function fmtPer100(dur, km) {
  const t = Math.round(dur / (km * 10));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} /100 m`;
}

// Tooltip text for one activity
export const runTip = r => `<b>${dateLong(r.d)}</b><br>${nf(r.km, 1)} km` +
  (r.dur ? ` · ${fmtDur(r.dur)} · <span class="m">${fmtPace(r.dur, r.km)}</span>` : '') +
  (r.dp ? `<br><span class="m">+${nf(r.dp)} m climb</span>` : '');

export const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
