import { addDays, addMonthsAnchored, parts, type ISODate } from './dates.ts';

// A recurring rule is defined by its start date, frequency and interval. Occurrence n is always computed
// from the start date (never from the previous occurrence), so month-end anchors never drift:
// a rule starting Jan 31 yields Feb 28, Mar 31, Apr 30, ...

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export const FREQS: Freq[] = ['daily', 'weekly', 'monthly', 'yearly'];

export interface RuleShape {
  freq: Freq;
  interval: number; // every N periods, >= 1
  start_date: ISODate;
  end_date?: ISODate | null;
}

export function occurrence(rule: RuleShape, n: number): ISODate {
  const k = n * Math.max(1, Math.floor(rule.interval));
  switch (rule.freq) {
    case 'daily': return addDays(rule.start_date, k);
    case 'weekly': return addDays(rule.start_date, 7 * k);
    case 'monthly': return addMonthsAnchored(rule.start_date, k, parts(rule.start_date).d);
    case 'yearly': return addMonthsAnchored(rule.start_date, 12 * k, parts(rule.start_date).d);
  }
}

export const isEnded = (rule: RuleShape, d: ISODate) => !!rule.end_date && d > rule.end_date;

/**
 * Occurrences with index >= fromIndex and date <= until (inclusive), stopping at end_date.
 * `cap` bounds work if a rule was dormant for a long time.
 */
export function dueOccurrences(rule: RuleShape, fromIndex: number, until: ISODate, cap = 400) {
  const out: { index: number; date: ISODate }[] = [];
  for (let i = fromIndex; out.length < cap; i++) {
    const d = occurrence(rule, i);
    if (d > until || isEnded(rule, d)) break;
    out.push({ index: i, date: d });
  }
  return out;
}

/** Next occurrence on or after `from`, or null if the rule has ended. */
export function nextOnOrAfter(rule: RuleShape, from: ISODate, startIndex = 0): { index: number; date: ISODate } | null {
  for (let i = startIndex; i < startIndex + 5000; i++) {
    const d = occurrence(rule, i);
    if (isEnded(rule, d)) return null;
    if (d >= from) return { index: i, date: d };
  }
  return null;
}

/** Approximate monthly cost of a rule, used for budgeting projections. */
export function monthlyEquivalent(amount: number, rule: Pick<RuleShape, 'freq' | 'interval'>) {
  const per = { daily: 30.4375, weekly: 30.4375 / 7, monthly: 1, yearly: 1 / 12 }[rule.freq];
  return Math.round((amount * per) / Math.max(1, rule.interval));
}

export function describeRule(rule: Pick<RuleShape, 'freq' | 'interval'>) {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq];
  return rule.interval <= 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
}
