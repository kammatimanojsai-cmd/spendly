// Calendar dates are plain ISO strings (YYYY-MM-DD). Arithmetic is done in UTC so it is timezone-safe.

export type ISODate = string;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isISODate = (s: unknown): s is ISODate => {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
};

export function daysInMonth(year: number, month1: number) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function parts(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, d: day };
}

export function fromParts(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, d: day } = parts(d);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return fromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Add months keeping the requested day-of-month, clamped to the month length (Jan 31 + 1 -> Feb 28/29). */
export function addMonthsAnchored(d: ISODate, n: number, anchorDay?: number): ISODate {
  const { y, m, d: day } = parts(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fromParts(ny, nm, Math.min(anchorDay ?? day, daysInMonth(ny, nm)));
}

export function diffDays(a: ISODate, b: ISODate) {
  const pa = parts(a), pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 864e5);
}

export function todayIn(timeZone = 'Asia/Kolkata', now = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const monthStart = (d: ISODate) => d.slice(0, 8) + '01';
export function monthEnd(d: ISODate) {
  const { y, m } = parts(d);
  return fromParts(y, m, daysInMonth(y, m));
}
export const monthKey = (d: ISODate) => d.slice(0, 7);
export function shiftMonth(key: string, n: number) {
  return addMonthsAnchored(key + '-01', n, 1).slice(0, 7);
}

export function formatDay(d: ISODate, style: 'short' | 'long' = 'short') {
  const { y, m, d: day } = parts(d);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', {
    timeZone: 'UTC', day: 'numeric', month: 'short', ...(style === 'long' ? { year: 'numeric', weekday: 'short' } : {}),
  });
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short' });
}
