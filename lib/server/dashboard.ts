import 'server-only';
import { query, one } from './db';
import { accountBalances, goalsWithProgress, postDueRecurring, upcomingBills, userToday } from './engine';
import { safeToSpend, goalMonthlyNeed, buildInsights } from '../insights.ts';
import { addDays, daysInMonth, monthEnd, monthKey, parts, shiftMonth, diffDays } from '../dates.ts';
import { formatMoney, minorFactor } from '../money.ts';
import type { User } from './auth';

const monthsBetween = (from: string, to: string) => {
  const a = parts(from), b = parts(to);
  return Math.max(1, (b.y - a.y) * 12 + (b.m - a.m) + (b.d >= a.d ? 1 : 0));
};

export async function dashboard(user: User) {
  await postDueRecurring(user);
  const today = userToday(user);
  const { y, m, d } = parts(today);
  const dim = daysInMonth(y, m);
  const mStart = today.slice(0, 8) + '01';
  const mEnd = monthEnd(today);
  const prevKey = shiftMonth(monthKey(today), -1);
  const prevSameDay = `${prevKey}-${String(Math.min(d, daysInMonth(+prevKey.slice(0, 4), +prevKey.slice(5)))).padStart(2, '0')}`;
  const sixAgo = shiftMonth(monthKey(today), -5) + '-01';
  const threeAgo = shiftMonth(monthKey(today), -3) + '-01';

  const [totals, prev, byCat, flow, merchant, budgets, accounts, goals, bills, txCount] = await Promise.all([
    one<{ income: number; expense: number }>(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE kind='income'),0) AS income, COALESCE(SUM(amount) FILTER (WHERE kind='expense'),0) AS expense
         FROM sp_transactions WHERE user_id=$1 AND occurred_on BETWEEN $2 AND $3`, [user.id, mStart, today]),
    one<{ expense: number }>(
      `SELECT COALESCE(SUM(amount),0) AS expense FROM sp_transactions WHERE user_id=$1 AND kind='expense' AND occurred_on BETWEEN $2 AND $3`,
      [user.id, prevKey + '-01', prevSameDay]),
    query<{ id: number; name: string; color: string; glyph: string; spent: number; prior: number; flex: number; flex_prior: number }>(
      `SELECT c.id, c.name, c.color, c.glyph,
              COALESCE(SUM(t.amount) FILTER (WHERE t.occurred_on >= $2 AND t.occurred_on <= $3), 0) AS spent,
              COALESCE(SUM(t.amount) FILTER (WHERE t.occurred_on >= $4 AND t.occurred_on < $2), 0) AS prior,
              COALESCE(SUM(t.amount) FILTER (WHERE t.occurred_on >= $2 AND t.occurred_on <= $3 AND t.source NOT IN ('recurring','bill')), 0) AS flex,
              COALESCE(SUM(t.amount) FILTER (WHERE t.occurred_on >= $4 AND t.occurred_on < $2 AND t.source NOT IN ('recurring','bill')), 0) AS flex_prior
         FROM sp_categories c LEFT JOIN sp_transactions t ON t.category_id = c.id AND t.kind = 'expense' AND t.user_id = c.user_id
        WHERE c.user_id = $1 AND c.kind = 'expense' GROUP BY c.id ORDER BY spent DESC, c.name`,
      [user.id, mStart, today, threeAgo]),
    query<{ month: string; income: number; expense: number }>(
      `SELECT to_char(occurred_on, 'YYYY-MM') AS month,
              COALESCE(SUM(amount) FILTER (WHERE kind='income'),0) AS income, COALESCE(SUM(amount) FILTER (WHERE kind='expense'),0) AS expense
         FROM sp_transactions WHERE user_id=$1 AND occurred_on >= $2 AND occurred_on <= $3 GROUP BY 1 ORDER BY 1`, [user.id, sixAgo, today]),
    one<{ name: string; total: number; count: number }>(
      `SELECT merchant AS name, SUM(amount) AS total, COUNT(*)::int AS count FROM sp_transactions
        WHERE user_id=$1 AND kind='expense' AND merchant IS NOT NULL AND source <> 'bill' AND source <> 'recurring' AND occurred_on BETWEEN $2 AND $3
        GROUP BY merchant ORDER BY COUNT(*) DESC, SUM(amount) DESC LIMIT 1`, [user.id, mStart, today]),
    query<{ id: number; category_id: number; amount: number }>(`SELECT id, category_id, amount FROM sp_budgets WHERE user_id=$1`, [user.id]),
    accountBalances(user.id),
    goalsWithProgress(user.id),
    upcomingBills(user, addDays(today, 30)),
    one<{ n: number; first: string | null }>(`SELECT COUNT(*)::int AS n, MIN(occurred_on) AS first FROM sp_transactions WHERE user_id=$1`, [user.id]),
  ]);
  // Average over the prior months that actually have history (up to 3), not a blind /3.
  const priorMonths = (() => {
    if (!txCount?.first || txCount.first >= mStart) return 0;
    const f = parts(txCount.first);
    return Math.min(3, (y - f.y) * 12 + (m - f.m));
  })();
  const avg = (v: number) => (priorMonths ? Math.round(v / priorMonths) : 0);

  const budgetBy = new Map(budgets.map((b) => [b.category_id, b.amount]));
  const budgetTotal = budgets.reduce((s, b) => s + b.amount, 0);
  const billsThisMonth = bills.filter((b) => b.kind === 'expense' && b.date <= mEnd).reduce((s, b) => s + b.amount, 0);
  const goalNeed = goals.reduce((s, g) => s + (g.deadline && g.saved < g.target && g.deadline >= today ? goalMonthlyNeed(g.target, g.saved, monthsBetween(today, g.deadline), minorFactor(user.currency)) : 0), 0);

  const spentBudgeted = byCat.filter((c) => budgetBy.has(c.id)).reduce((s, c) => s + c.spent, 0);
  const budgetedBills = bills.filter((b) => b.kind === 'expense' && b.date <= mEnd && b.category_id !== null && budgetBy.has(b.category_id)).reduce((s, b) => s + b.amount, 0);
  const sts = safeToSpend({
    unit: minorFactor(user.currency),
    daysLeft: dim - d + 1,
    budgetTotal,
    spentBudgeted,
    budgetedBills,
    spentThisMonth: totals!.expense,
    incomeThisMonth: totals!.income,
    upcomingBills: billsThisMonth,
    goalSetAside: goalNeed,
  });

  const fmt = (v: number) => formatMoney(v, user.currency);
  const insights = buildInsights({
    dayOfMonth: d, daysInMonth: dim,
    categories: byCat.map((c) => ({ name: c.name, spent: c.spent, avg3: avg(c.prior), budget: budgetBy.get(c.id) ?? null, flex: c.flex, flexAvg: avg(c.flex_prior) })),
    topMerchant: merchant ?? null,
    spentThisMonth: totals!.expense,
    spentLastMonthSameDay: prev!.expense,
    incomeThisMonth: totals!.income,
  }, fmt);

  // fill missing months with zeros so the chart always has 6 bars
  const flowMap = new Map(flow.map((f) => [f.month, f]));
  const cashflow = Array.from({ length: 6 }, (_, i) => {
    const k = shiftMonth(monthKey(today), i - 5);
    return { month: k, income: flowMap.get(k)?.income ?? 0, expense: flowMap.get(k)?.expense ?? 0 };
  });

  const active = accounts.filter((a) => !a.archived);
  return {
    today,
    month: { key: monthKey(today), income: totals!.income, expense: totals!.expense, net: totals!.income - totals!.expense, prevSameDayExpense: prev!.expense, day: d, daysInMonth: dim },
    safeToSpend: { ...sts, daysLeft: dim - d + 1 },
    categories: byCat.filter((c) => c.spent > 0 || budgetBy.has(c.id)).map((c) => ({ id: c.id, name: c.name, color: c.color, glyph: c.glyph, spent: c.spent, avg3: avg(c.prior), budget: budgetBy.get(c.id) ?? null })),
    cashflow,
    netWorth: active.reduce((s, a) => s + a.balance, 0),
    accounts: active,
    goals: goals.map((g) => ({ ...g, monthlyNeed: g.deadline && g.deadline >= today ? goalMonthlyNeed(g.target, g.saved, monthsBetween(today, g.deadline), minorFactor(user.currency)) : 0, daysLeft: g.deadline ? diffDays(today, g.deadline) : null })),
    bills: bills.slice(0, 8),
    insights,
    isEmpty: (txCount?.n ?? 0) === 0,
  };
}

export type Dashboard = Awaited<ReturnType<typeof dashboard>>;
