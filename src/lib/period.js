// Shape of a period, used by the stats charts
import { daysIn } from './format.js';

// whole month → 'day' (bars per day), whole year → 'month', otherwise 'year'
export function scopeOf(dA, dB) {
  const yA = Math.floor(dA / 10000),
    yB = Math.floor(dB / 10000);
  const mA = Math.floor(dA / 100) % 100,
    mB = Math.floor(dB / 100) % 100;
  if (yA === yB && mA === mB && dA % 100 === 1 && dB % 100 === daysIn(yA, mA))
    return { level: 'day', y: yA, m: mA };
  if (yA === yB && dA % 10000 === 101 && dB % 10000 === 1231) return { level: 'month', y: yA };
  return { level: 'year' };
}
