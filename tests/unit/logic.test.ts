import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrence, dueOccurrences, nextOnOrAfter, monthlyEquivalent, describeRule } from '../../lib/recurrence.ts';
import { addDays, addMonthsAnchored, diffDays, isISODate, monthEnd, shiftMonth, todayIn } from '../../lib/dates.ts';
import { parseAmount, formatMoney } from '../../lib/money.ts';
import { safeToSpend, goalMonthlyNeed, buildInsights } from '../../lib/insights.ts';
import { csvCell, toCsv, buildIcs } from '../../lib/exporters.ts';

test('dates: arithmetic, validation and month helpers', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addMonthsAnchored('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(addMonthsAnchored('2026-11-15', 2), '2027-01-15');
  assert.equal(diffDays('2026-10-01', '2026-10-31'), 30);
  assert.equal(isISODate('2026-02-29'), false);
  assert.equal(isISODate('2028-02-29'), true);
  assert.equal(monthEnd('2026-04-10'), '2026-04-30');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(todayIn('Asia/Kolkata', new Date('2026-10-22T20:00:00Z')), '2026-10-23');
});

test('recurrence: month-end anchors never drift', () => {
  const r = { freq: 'monthly' as const, interval: 1, start_date: '2026-01-31' };
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => occurrence(r, n)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});

test('recurrence: weekly, every-2-months, yearly leap day', () => {
  assert.equal(occurrence({ freq: 'weekly', interval: 2, start_date: '2026-10-01' }, 3), '2026-11-12');
  assert.equal(occurrence({ freq: 'monthly', interval: 2, start_date: '2026-11-10' }, 1), '2027-01-10');
  assert.equal(occurrence({ freq: 'yearly', interval: 1, start_date: '2028-02-29' }, 1), '2029-02-28');
  assert.equal(occurrence({ freq: 'yearly', interval: 1, start_date: '2028-02-29' }, 4), '2032-02-29');
});

test('recurrence: due occurrences catch up and respect end date and cap', () => {
  const r = { freq: 'monthly' as const, interval: 1, start_date: '2026-06-05', end_date: '2026-09-30' };
  assert.deepEqual(dueOccurrences(r, 0, '2026-12-31').map((o) => o.date), ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']);
  assert.deepEqual(dueOccurrences(r, 2, '2026-12-31').map((o) => o.index), [2, 3]);
  assert.equal(dueOccurrences({ freq: 'daily', interval: 1, start_date: '2020-01-01' }, 0, '2026-01-01', 10).length, 10);
  assert.equal(dueOccurrences(r, 0, '2026-06-04').length, 0);
});

test('recurrence: next on or after, monthly equivalent, labels', () => {
  const r = { freq: 'monthly' as const, interval: 1, start_date: '2026-01-15' };
  assert.deepEqual(nextOnOrAfter(r, '2026-10-16'), { index: 10, date: '2026-11-15' });
  assert.equal(nextOnOrAfter({ ...r, end_date: '2026-03-01' }, '2026-10-01'), null);
  assert.equal(monthlyEquivalent(120000, { freq: 'yearly', interval: 1 }), 10000);
  assert.equal(monthlyEquivalent(1000, { freq: 'weekly', interval: 1 }), 4348);
  assert.equal(describeRule({ freq: 'weekly', interval: 2 }), 'Every 2 weeks');
});

test('money: parsing and formatting in minor units', () => {
  assert.equal(parseAmount('1,299.50'), 129950);
  assert.equal(parseAmount('₹ 450'), 45000);
  assert.equal(parseAmount('0.1'), 10);
  assert.equal(parseAmount('12.345'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(19.99), 1999);
  assert.equal(parseAmount('500', 'JPY'), 500);
  assert.equal(formatMoney(12345600), '₹1,23,456');
  assert.equal(formatMoney(-4550), '−₹45.5');
  assert.equal(formatMoney(2500, 'INR', { sign: true }), '+₹25');
  assert.equal(formatMoney(1999, 'USD'), '$19.99');
});

test('safe to spend: budget basis only counts budgeted categories', () => {
  // rent (unbudgeted, 18,000) must not reduce the budget pool
  const s = safeToSpend({ daysLeft: 10, budgetTotal: 3000000, spentBudgeted: 1800000, budgetedBills: 200000, spentThisMonth: 3600000, incomeThisMonth: 9000000, upcomingBills: 2000000, goalSetAside: 0 });
  assert.equal(s.basis, 'budget');
  assert.equal(s.pool, 1000000);
  assert.equal(s.perDay, 100000);
  assert.equal(s.breakdown.reduce((a, b) => a + b.amount, 0), s.pool);
  const odd = safeToSpend({ daysLeft: 3, budgetTotal: 100000, spentBudgeted: 0, budgetedBills: 0, spentThisMonth: 0, incomeThisMonth: 0, upcomingBills: 0, goalSetAside: 0 });
  assert.equal(odd.perDay, 33300, 'per-day rounds down to whole rupees');
  const noBills = safeToSpend({ daysLeft: 1, budgetTotal: 100, spentBudgeted: 0, budgetedBills: 0, spentThisMonth: 0, incomeThisMonth: 0, upcomingBills: 0, goalSetAside: 0 });
  assert.equal(noBills.breakdown.length, 2, 'no empty bills row');
});

test('safe to spend: income basis sets aside goals; never negative per day', () => {
  const s = safeToSpend({ daysLeft: 5, budgetTotal: 0, spentBudgeted: 0, budgetedBills: 0, spentThisMonth: 400000, incomeThisMonth: 1000000, upcomingBills: 100000, goalSetAside: 200000 });
  assert.equal(s.basis, 'income');
  assert.equal(s.perDay, 60000);
  const broke = safeToSpend({ daysLeft: 5, budgetTotal: 100, spentBudgeted: 500, budgetedBills: 0, spentThisMonth: 500, incomeThisMonth: 0, upcomingBills: 0, goalSetAside: 0 });
  assert.equal(broke.perDay, 0);
  assert.equal(safeToSpend({ daysLeft: 3, budgetTotal: 0, spentBudgeted: 0, budgetedBills: 0, spentThisMonth: 0, incomeThisMonth: 0, upcomingBills: 0, goalSetAside: 0 }).basis, 'none');
});

test('goal monthly need', () => {
  assert.equal(goalMonthlyNeed(1000000, 400000, 3), 200000);
  assert.equal(goalMonthlyNeed(1000000, 1200000, 3), 0);
  assert.equal(goalMonthlyNeed(1000, 0, 0), 1000);
  assert.equal(goalMonthlyNeed(8000000, 0, 7), 1142900, 'rounds up to whole rupees');
});

test('insights: over budget ranks first and figures are real', () => {
  const fmt = (m: number) => formatMoney(m);
  const out = buildInsights({
    dayOfMonth: 15, daysInMonth: 30,
    categories: [
      { name: 'Shopping', spent: 600000, avg3: 300000, budget: 500000 },
      { name: 'Food & dining', spent: 300000, avg3: 300000, budget: 350000 },
    ],
    topMerchant: { name: 'Swiggy', total: 240000, count: 6 },
    spentThisMonth: 900000, spentLastMonthSameDay: 600000, incomeThisMonth: 5000000,
  }, fmt);
  assert.equal(out[0].key, 'over-Shopping');
  assert.match(out[0].body, /₹1,000 over/);
  assert.ok(out.some((i) => i.key === 'pace-Food & dining'));
  assert.ok(out.some((i) => i.key === 'merchant' && /6 payments/.test(i.body)));
  assert.ok(out.every((i) => !/\.\d\d\b/.test(i.body)), 'no paise in insight projections');
  assert.ok(out.length <= 5);
});

test('insights: fixed monthly payments do not count as a spending spike', () => {
  const out = buildInsights({
    dayOfMonth: 10, daysInMonth: 30,
    categories: [{ name: 'Rent', spent: 1800000, avg3: 1800000, budget: null, flex: 0, flexAvg: 0 }],
    topMerchant: null, spentThisMonth: 1800000, spentLastMonthSameDay: 1800000, incomeThisMonth: 0,
  }, (m) => formatMoney(m));
  assert.equal(out.length, 0, JSON.stringify(out));
});

test('exporters: csv escaping and formula-injection guard', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-450.50'), '-450.50');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(toCsv(['a', 'b'], [[1, null]]), 'a,b\r\n1,\r\n');
});

test('exporters: ics has all-day events, rrule, alarm and folded lines', () => {
  const ics = buildIcs([{ uid: 'r1@spendly', date: '2026-11-05', summary: 'Rent, flat 4B; due', rrule: 'FREQ=MONTHLY;INTERVAL=1', alarmDaysBefore: 3, description: 'x'.repeat(200) }], new Date('2026-10-22T00:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261105/);
  assert.match(ics, /SUMMARY:Rent\\, flat 4B\\; due/);
  assert.match(ics, /TRIGGER:-P3D/);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
});
