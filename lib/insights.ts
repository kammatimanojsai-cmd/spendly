// Pure financial math behind the dashboard: safe-to-spend and plain-language insight cards.
// Every figure here is explainable: the UI shows the breakdown, not just the result.

export interface SafeToSpendInput {
  daysLeft: number;               // including today
  unit?: number;                  // minor units per whole currency unit (100 for INR); the daily figure is rounded down to it
  budgetTotal: number;            // sum of monthly category budgets (minor units), 0 if none set
  spentBudgeted: number;          // expenses this month in categories that have a budget
  budgetedBills: number;          // unpaid bills due this month in budgeted categories
  spentThisMonth: number;         // all expenses this month
  incomeThisMonth: number;
  upcomingBills: number;          // unpaid bills due from today until month end
  goalSetAside: number;           // what goals need this month to stay on track
}

export interface SafeToSpend {
  perDay: number;
  pool: number;
  basis: 'budget' | 'income' | 'none';
  breakdown: { label: string; amount: number }[];
}

export function safeToSpend(i: SafeToSpendInput): SafeToSpend {
  const days = Math.max(1, i.daysLeft);
  const unit = i.unit ?? 100;
  const perDay = (pool: number) => Math.max(0, Math.floor(pool / days / unit) * unit);
  if (i.budgetTotal > 0) {
    // Budgets only cover their own categories, so rent or SIPs without a budget don't eat into this pool.
    const pool = i.budgetTotal - i.spentBudgeted - i.budgetedBills;
    const breakdown = [
      { label: 'Monthly budgets', amount: i.budgetTotal },
      { label: 'Spent in those categories', amount: -i.spentBudgeted },
    ];
    if (i.budgetedBills) breakdown.push({ label: 'Their bills still due', amount: -i.budgetedBills });
    return { basis: 'budget', pool, perDay: perDay(pool), breakdown };
  }
  if (i.incomeThisMonth > 0) {
    const pool = i.incomeThisMonth - i.spentThisMonth - i.upcomingBills - i.goalSetAside;
    return {
      basis: 'income', pool, perDay: perDay(pool),
      breakdown: [
        { label: 'Income this month', amount: i.incomeThisMonth },
        { label: 'Spent so far', amount: -i.spentThisMonth },
        { label: 'Bills still due', amount: -i.upcomingBills },
        { label: 'Set aside for goals', amount: -i.goalSetAside },
      ],
    };
  }
  return { basis: 'none', pool: 0, perDay: 0, breakdown: [] };
}

/** How much to save each month from now to hit a goal by its deadline. */
export function goalMonthlyNeed(target: number, saved: number, monthsLeft: number, unit = 100) {
  const remaining = Math.max(0, target - saved);
  if (remaining === 0) return 0;
  // round up to a whole currency unit so following the plan never falls short
  return Math.ceil(remaining / Math.max(1, monthsLeft) / unit) * unit;
}

export interface InsightInput {
  dayOfMonth: number;
  daysInMonth: number;
  // spent/budget: everything this month. flex/flexAvg: day-to-day spending only (no recurring or bill payments),
  // so fixed costs paid in one go early in the month don't look like spikes.
  categories: { name: string; spent: number; avg3: number; budget: number | null; flex?: number; flexAvg?: number }[];
  topMerchant: { name: string; total: number; count: number } | null;
  spentThisMonth: number;
  spentLastMonthSameDay: number;
  incomeThisMonth: number;
}

export interface Insight {
  tone: 'good' | 'warn' | 'bad' | 'info';
  title: string;
  body: string;
  /** stable key so the UI can de-duplicate / animate */
  key: string;
}

type Fmt = (minor: number) => string;

export function buildInsights(i: InsightInput, fmt: Fmt): Insight[] {
  const out: Insight[] = [];
  const progress = i.dayOfMonth / i.daysInMonth;

  for (const c of i.categories) {
    const before = out.length;
    if (c.budget && c.budget > 0) {
      const used = c.spent / c.budget;
      if (used >= 1) {
        out.push({ key: `over-${c.name}`, tone: 'bad', title: `${c.name} is over budget`,
          body: `You've spent ${fmt(c.spent)} of ${fmt(c.budget)} — ${fmt(c.spent - c.budget)} over.` });
      } else if (used >= 0.8 && used > progress + 0.1) {
        out.push({ key: `pace-${c.name}`, tone: 'warn', title: `${c.name} is running hot`,
          body: `${Math.round(used * 100)}% of the budget used with ${i.daysInMonth - i.dayOfMonth} days to go.` });
      }
    }
    // one card per category: a budget warning already says enough
    const flex = c.flex ?? c.spent, flexAvg = c.flexAvg ?? c.avg3;
    if (out.length === before && flexAvg > 0 && flex > 0 && progress >= 0.25) {
      const projected = flex / progress;
      const change = (projected - flexAvg) / flexAvg;
      if (change >= 0.3 && flex >= 50000) {
        out.push({ key: `trend-${c.name}`, tone: 'warn', title: `${c.name} trending up`,
          body: `On pace for ${fmt(Math.round(projected / 100) * 100)} this month, ${Math.round(change * 100)}% above your 3-month average.` });
      } else if (change <= -0.25 && flexAvg >= 50000) {
        out.push({ key: `down-${c.name}`, tone: 'good', title: `Less on ${c.name}`,
          body: `On pace for ${fmt(Math.round(projected / 100) * 100)}, ${Math.round(-change * 100)}% below your usual.` });
      }
    }
  }

  if (i.spentLastMonthSameDay > 0) {
    const d = (i.spentThisMonth - i.spentLastMonthSameDay) / i.spentLastMonthSameDay;
    if (Math.abs(d) >= 0.15) {
      out.push({ key: 'mom', tone: d > 0 ? 'warn' : 'good',
        title: d > 0 ? 'Spending faster than last month' : 'Spending slower than last month',
        body: `${fmt(i.spentThisMonth)} so far vs ${fmt(i.spentLastMonthSameDay)} by this day last month.` });
    }
  }

  if (i.topMerchant && i.topMerchant.count >= 2) {
    out.push({ key: 'merchant', tone: 'info', title: `Most visited: ${i.topMerchant.name}`,
      body: `${i.topMerchant.count} payments totalling ${fmt(i.topMerchant.total)} this month.` });
  }

  if (i.incomeThisMonth > 0 && i.spentThisMonth < i.incomeThisMonth) {
    const rate = (i.incomeThisMonth - i.spentThisMonth) / i.incomeThisMonth;
    if (rate >= 0.2) {
      out.push({ key: 'savings', tone: 'good', title: `Saving ${Math.round(rate * 100)}% of income`,
        body: `${fmt(i.incomeThisMonth - i.spentThisMonth)} left over from this month's income so far.` });
    }
  }

  const rank = { bad: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 5);
}
