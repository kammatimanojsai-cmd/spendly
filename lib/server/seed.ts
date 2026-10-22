import 'server-only';
import { tx, type Q } from './db';
import { addDays, monthStart, shiftMonth, type ISODate } from '../dates.ts';
import { occurrence, type RuleShape } from '../recurrence.ts';

export const DEFAULT_CATEGORIES: [string, 'expense' | 'income', string, string][] = [
  ['Food & dining', 'expense', 'food', '#FF6159'],
  ['Groceries', 'expense', 'cart', '#14A44D'],
  ['Transport', 'expense', 'car', '#2E86FF'],
  ['Shopping', 'expense', 'bag', '#FF7AC6'],
  ['Bills & utilities', 'expense', 'bolt', '#FFB52E'],
  ['Rent', 'expense', 'home', '#8D6E63'],
  ['Health', 'expense', 'heart', '#00B8A9'],
  ['Entertainment', 'expense', 'film', '#7A5CFA'],
  ['Education', 'expense', 'book', '#2E86FF'],
  ['Other', 'expense', 'dots', '#16213E'],
  ['Salary', 'income', 'briefcase', '#14A44D'],
  ['Freelance', 'income', 'chart', '#7A5CFA'],
  ['Gifts', 'income', 'gift', '#FF7AC6'],
  ['Other income', 'income', 'coins', '#FFB52E'],
];

export async function seedDefaults(q: Q, userId: number, withAccounts = true) {
  for (const [name, kind, glyph, color] of DEFAULT_CATEGORIES) {
    await q(`INSERT INTO sp_categories (user_id, name, kind, glyph, color) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [userId, name, kind, glyph, color]);
  }
  if (withAccounts) {
    await q(`INSERT INTO sp_accounts (user_id, name, kind, color, opening_balance) VALUES ($1,'Cash','cash','#FFB52E',0), ($1,'Bank','bank','#2E86FF',0)`, [userId]);
  }
}

// Small deterministic PRNG so the demo looks the same for everyone (and in tests).
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

/** Fills a demo workspace with ~3 months of realistic, clearly-labelled sample activity. */
export async function seedDemo(userId: number, today: ISODate) {
  await tx(async (q) => {
    await seedDefaults(q, userId, false);
    const cat = Object.fromEntries((await q(`SELECT id, name FROM sp_categories WHERE user_id = $1`, [userId])).map((c) => [c.name, c.id]));
    const acc = async (name: string, kind: string, color: string, opening: number) =>
      (await q(`INSERT INTO sp_accounts (user_id, name, kind, color, opening_balance) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [userId, name, kind, color, opening]))[0].id as number;
    const bank = await acc('HDFC Savings (demo)', 'bank', '#2E86FF', 4200000);
    const cash = await acc('Cash wallet', 'cash', '#FFB52E', 350000);
    const card = await acc('Credit card (demo)', 'card', '#7A5CFA', 0);
    const upi = await acc('UPI wallet', 'wallet', '#00B8A9', 120000);

    // Rows are collected and written in batches: a few round trips instead of ~600.
    type TxRow = { account_id: number; kind: string; amount: number; category_id?: number | null; to_account_id?: number | null; occurred_on: string; merchant?: string | null; note?: string | null; source?: string; recurring_id?: number | null; occurrence_index?: number | null };
    const rows: TxRow[] = [];
    const add = (t: TxRow) => rows.push(t);
    const flush = async () => {
      const cols = ['user_id', 'account_id', 'kind', 'amount', 'category_id', 'to_account_id', 'occurred_on', 'merchant', 'note', 'source', 'recurring_id', 'occurrence_index'];
      for (let i = 0; i < rows.length; i += 150) {
        const chunk = rows.slice(i, i + 150);
        const params: unknown[] = [];
        const values = chunk.map((t) => {
          const v = [userId, t.account_id, t.kind, t.amount, t.category_id ?? null, t.to_account_id ?? null, t.occurred_on, t.merchant ?? null, t.note ?? null, t.source ?? 'manual', t.recurring_id ?? null, t.occurrence_index ?? null];
          params.push(...v);
          return `(${v.map((_, k) => `$${params.length - v.length + k + 1}`).join(',')})`;
        });
        await q(`INSERT INTO sp_transactions (${cols.join(',')}) VALUES ${values.join(',')}`, params);
      }
      rows.length = 0;
    };

    const r = rng(42);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const between = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) / 100) * 100; // whole rupees

    const firstMonth = shiftMonth(today.slice(0, 7), -2) + '-01';
    const spend: [string, string[], [number, number], number, number[]][] = [
      // category, merchants, amount range (paise), avg per week, accounts
      ['Food & dining', ['Swiggy', 'Zomato', 'Chai Point', 'Paradise Biryani', 'Starbucks'], [15000, 85000], 3.2, [upi, card]],
      ['Groceries', ['BigBasket', 'DMart', 'Zepto', 'Ratnadeep'], [40000, 260000], 1.4, [upi, card, cash]],
      ['Transport', ['Uber', 'Rapido', 'Hyderabad Metro', 'Indian Oil'], [6000, 120000], 2.5, [upi, cash]],
      ['Shopping', ['Amazon', 'Myntra', 'Decathlon'], [50000, 450000], 0.6, [card]],
      ['Health', ['Apollo Pharmacy', 'MedPlus'], [20000, 150000], 0.3, [upi]],
      ['Entertainment', ['PVR Cinemas', 'BookMyShow', 'Steam'], [25000, 120000], 0.5, [card]],
    ];
    for (let d = firstMonth; d <= today; d = addDays(d, 1)) {
      for (const [c, merchants, [lo, hi], perWeek, accts] of spend) {
        if (r() < perWeek / 7) {
          const account_id = pick(accts), amount = between(lo, hi);
          add({ account_id, kind: 'expense', amount, category_id: cat[c], occurred_on: d, merchant: pick(merchants) });
        }
      }
      // top up everyday wallets from the bank, like a real month
      if (d.endsWith('-02') || d.endsWith('-17')) {
        add({ account_id: bank, kind: 'transfer', amount: 1200000, to_account_id: upi, occurred_on: d, note: 'UPI top-up' });
        add({ account_id: bank, kind: 'transfer', amount: 500000, to_account_id: cash, occurred_on: d, note: 'ATM withdrawal' });
      }
      if (d.endsWith('-15') && d < today) {
        add({ account_id: bank, kind: 'transfer', amount: between(800000, 1400000), to_account_id: card, occurred_on: d, note: 'Card bill payment' });
      }
    }
    add({ account_id: bank, kind: 'income', amount: 1800000, category_id: cat['Freelance'], occurred_on: addDays(monthStart(today), -12), merchant: 'Client project', note: 'Logo design' });

    // Recurring: salary posts itself; rent, phone and streaming are bills you mark as paid.
    const rule = (title: string, kind: string, amount: number, account: number, category: number, startDay: number, mode: string, freq = 'monthly') =>
      q(`INSERT INTO sp_recurring (user_id, title, kind, amount, account_id, category_id, freq, interval, start_date, mode, remind_days) VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9,3)`,
        [userId, title, kind, amount, account, category, freq, `${firstMonth.slice(0, 8)}${String(startDay).padStart(2, '0')}`, mode]);
    await rule('Salary — Acme Labs', 'income', 8500000, bank, cat['Salary'], 1, 'auto');
    await rule('Mutual fund SIP', 'expense', 500000, bank, cat['Other'], 5, 'auto');
    await rule('Flat rent', 'expense', 1800000, bank, cat['Rent'], 3, 'bill');
    await rule('Airtel postpaid', 'expense', 59900, card, cat['Bills & utilities'], 20, 'bill');
    await rule('Electricity — TSSPDCL', 'expense', 145000, upi, cat['Bills & utilities'], 12, 'bill');
    await rule('Netflix', 'expense', 64900, card, cat['Entertainment'], 26, 'bill');

    // bills whose due date has passed were paid on time, so only upcoming ones are outstanding
    const bills = await q<RuleShape & Record<string, any>>(`SELECT id, title, amount, account_id, category_id, start_date, freq, interval FROM sp_recurring WHERE user_id = $1 AND mode = 'bill'`, [userId]);
    for (const b of bills) {
      let i = 0;
      for (let date = occurrence(b, 0); date < today; date = occurrence(b, ++i)) {
        add({ account_id: b.account_id, kind: 'expense', amount: b.amount, category_id: b.category_id, occurred_on: date, merchant: b.title, source: 'bill', recurring_id: b.id, occurrence_index: i });
      }
      await q(`UPDATE sp_recurring SET next_index = $2 WHERE id = $1`, [b.id, i]);
    }
    await flush();

    for (const [c, amount] of [['Food & dining', 900000], ['Groceries', 1000000], ['Transport', 500000], ['Shopping', 600000], ['Entertainment', 300000]] as const) {
      await q(`INSERT INTO sp_budgets (user_id, category_id, amount) VALUES ($1,$2,$3)`, [userId, cat[c], amount]);
    }

    const goal = async (name: string, target: number, deadline: string, color: string, glyph: string, moves: number[]) => {
      const g = (await q(`INSERT INTO sp_goals (user_id, name, target, deadline, color, glyph) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [userId, name, target, deadline, color, glyph]))[0].id;
      for (const [i, a] of moves.entries()) {
        await q(`INSERT INTO sp_goal_moves (goal_id, user_id, amount, note, made_on) VALUES ($1,$2,$3,$4,$5)`, [g, userId, a, 'Monthly top-up', addDays(firstMonth, i * 30 + 2)]);
      }
    };
    await goal('Goa trip', 4500000, shiftMonth(today.slice(0, 7), 4) + '-15', '#00B8A9', 'plane', [800000, 800000, 600000]);
    await goal('Emergency fund', 30000000, shiftMonth(today.slice(0, 7), 14) + '-01', '#14A44D', 'shield', [2500000, 2500000, 2500000]);
    await goal('New laptop', 9000000, shiftMonth(today.slice(0, 7), 6) + '-28', '#7A5CFA', 'briefcase', [1000000]);
  });
}
