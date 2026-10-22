// Money is always stored and computed as integer minor units (paise, cents) to avoid float errors.

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY'] as const;
export type Currency = (typeof CURRENCIES)[number];

const ZERO_DECIMAL = new Set(['JPY']);
export const minorFactor = (c: string) => (ZERO_DECIMAL.has(c) ? 1 : 100);

/** "1,299.50" | "₹ 1299.5" | "1299" -> 129950 (minor units). Returns null for invalid input. */
export function parseAmount(input: string | number, currency = 'INR'): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * minorFactor(currency));
  }
  const cleaned = String(input).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const v = Math.round(parseFloat(cleaned) * minorFactor(currency));
  return Number.isFinite(v) ? v : null;
}

export function formatMoney(minor: number, currency = 'INR', opts: { sign?: boolean; compact?: boolean } = {}) {
  const f = minorFactor(currency);
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const abs = Math.abs(minor) / f;
  const s = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: opts.compact && abs >= 100000 ? 'compact' : 'standard',
    maximumFractionDigits: f === 1 ? 0 : abs % 1 === 0 ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(abs);
  if (minor < 0) return '−' + s;
  return opts.sign ? '+' + s : s;
}

export const toMajor = (minor: number, currency = 'INR') => minor / minorFactor(currency);
