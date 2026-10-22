import 'server-only';
import { query, one, tx, type Q } from './db';
import { HttpError, notFound } from './api';
import { dueOccurrences, occurrence, isEnded, type RuleShape } from '../recurrence.ts';
import { todayIn, addDays, type ISODate } from '../dates.ts';
import type { User } from './auth';

type Owned = 'sp_accounts' | 'sp_categories' | 'sp_recurring' | 'sp_goals' | 'sp_transactions' | 'sp_budgets';

/** Every id coming from a client is checked against the signed-in user before use. */
export async function assertOwned(table: Owned, id: number | null | undefined, userId: number, label = 'Item', q: Q = query) {
  if (id == null) return;
  const r = await q(`SELECT 1 FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!r.length) throw new HttpError(400, `${label} not found.`, { [label.toLowerCase().replace(/\s/g, '_') + '_id']: `${label} not found.` });
}

export async function assertCategoryKind(categoryId: number | null | undefined, kind: string, userId: number) {
  if (categoryId == null) return;
  const c = await one('SELECT kind FROM sp_categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
  if (!c) throw new HttpError(400, 'Category not found.', { category_id: 'Category not found.' });
  if (c.kind !== kind) throw new HttpError(400, `Pick an ${kind} category.`, { category_id: `Pick an ${kind} category.` });
}

export const userToday = (u: Pick<User, 'timezone'>) => todayIn(u.timezone || 'Asia/Kolkata');

type RuleRow = RuleShape & { id: number; user_id: number; title: string; kind: string; amount: number; account_id: number; category_id: number | null; next_index: number; mode: 'auto' | 'bill'; remind_days: number; active: boolean };

/**
 * Posts every due occurrence of the user's automatic rules (salary, SIPs, subscriptions).
 * Safe to call on every request: the unique (recurring_id, occurrence_index) index makes it idempotent,
 * and next_index only moves forward inside the same transaction.
 */
export async function postDueRecurring(user: Pick<User, 'id' | 'timezone'>) {
  const today = userToday(user);
  const rules = await query<RuleRow>(
    `SELECT * FROM sp_recurring WHERE user_id = $1 AND active AND mode = 'auto' AND start_date <= $2`, [user.id, today]);
  let posted = 0;
  for (const r of rules) {
    const due = dueOccurrences(r, r.next_index, today, 400);
    const ended = isEnded(r, occurrence(r, (due.at(-1)?.index ?? r.next_index - 1) + 1));
    if (!due.length && !ended) continue;
    posted += await tx(async (q) => {
      // lock the rule row so concurrent requests serialise; re-read next_index under the lock
      const [fresh] = await q<RuleRow>('SELECT next_index FROM sp_recurring WHERE id = $1 FOR UPDATE', [r.id]);
      let n = 0;
      for (const o of due) {
        if (o.index < fresh.next_index) continue;
        const ins = await q(
          `INSERT INTO sp_transactions (user_id, account_id, kind, amount, category_id, occurred_on, merchant, source, recurring_id, occurrence_index)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'recurring',$8,$9) ON CONFLICT DO NOTHING RETURNING id`,
          [r.user_id, r.account_id, r.kind, r.amount, r.category_id, o.date, r.title, r.id, o.index]);
        n += ins.length;
      }
      const nextIndex = Math.max(fresh.next_index, (due.at(-1)?.index ?? fresh.next_index - 1) + 1);
      await q('UPDATE sp_recurring SET next_index = $1, active = $2 WHERE id = $3', [nextIndex, !ended, r.id]);
      return n;
    });
  }
  return posted;
}

export interface UpcomingBill { rule_id: number; title: string; amount: number; kind: string; date: ISODate; index: number; overdue: boolean; days_until: number; account_id: number; category_id: number | null; remind_days: number; freq: string; interval: number }

/** Unpaid bill occurrences up to `until` (overdue ones included), oldest first. */
export async function upcomingBills(user: Pick<User, 'id' | 'timezone'>, until: ISODate, perRule = 6): Promise<UpcomingBill[]> {
  const today = userToday(user);
  const rules = await query<RuleRow>(`SELECT * FROM sp_recurring WHERE user_id = $1 AND active AND mode = 'bill' ORDER BY id`, [user.id]);
  const out: UpcomingBill[] = [];
  for (const r of rules) {
    for (const o of dueOccurrences(r, r.next_index, until, perRule)) {
      const days = Math.round((Date.parse(o.date) - Date.parse(today)) / 864e5);
      out.push({ rule_id: r.id, title: r.title, amount: r.amount, kind: r.kind, date: o.date, index: o.index, overdue: o.date < today, days_until: days,
        account_id: r.account_id, category_id: r.category_id, remind_days: r.remind_days, freq: r.freq, interval: r.interval });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.rule_id - b.rule_id);
}

/** Marks the oldest unpaid occurrence of a bill as paid (posts the transaction) or skips it. */
export async function settleBill(user: Pick<User, 'id' | 'timezone'>, ruleId: number, action: 'pay' | 'skip', opts: { account_id?: number; paid_on?: ISODate; amount?: number } = {}) {
  return tx(async (q) => {
    const [r] = await q<RuleRow>(`SELECT * FROM sp_recurring WHERE id = $1 AND user_id = $2 AND mode = 'bill' FOR UPDATE`, [ruleId, user.id]);
    if (!r) throw notFound('Bill not found.');
    if (!r.active) throw new HttpError(409, 'This bill has ended.');
    const date = occurrence(r, r.next_index);
    if (isEnded(r, date)) throw new HttpError(409, 'This bill has ended.');
    let txId: number | null = null;
    if (action === 'pay') {
      const accountId = opts.account_id ?? r.account_id;
      await assertOwned('sp_accounts', accountId, user.id, 'Account', q);
      const [t] = await q(
        `INSERT INTO sp_transactions (user_id, account_id, kind, amount, category_id, occurred_on, merchant, source, recurring_id, occurrence_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'bill',$8,$9) RETURNING id`,
        [user.id, accountId, r.kind, opts.amount ?? r.amount, r.category_id, opts.paid_on ?? userToday(user), r.title, r.id, r.next_index]);
      txId = t.id;
    }
    const nextEnded = isEnded(r, occurrence(r, r.next_index + 1));
    await q('UPDATE sp_recurring SET next_index = next_index + 1, active = $2 WHERE id = $1', [r.id, !nextEnded]);
    return { transaction_id: txId, occurrence_date: date, index: r.next_index };
  });
}

export async function accountBalances(userId: number) {
  return query<{ id: number; name: string; kind: string; color: string; opening_balance: number; archived: boolean; balance: number; tx_count: number }>(
    `SELECT a.id, a.name, a.kind, a.color, a.opening_balance, a.archived,
            a.opening_balance
              + COALESCE(SUM(CASE WHEN t.account_id = a.id AND t.kind = 'income' THEN t.amount END), 0)
              - COALESCE(SUM(CASE WHEN t.account_id = a.id AND t.kind IN ('expense','transfer') THEN t.amount END), 0)
              + COALESCE(SUM(CASE WHEN t.to_account_id = a.id THEN t.amount END), 0) AS balance,
            COUNT(t.id)::int AS tx_count
       FROM sp_accounts a
       LEFT JOIN sp_transactions t ON t.user_id = a.user_id AND (t.account_id = a.id OR t.to_account_id = a.id)
      WHERE a.user_id = $1
      GROUP BY a.id ORDER BY a.archived, a.id`, [userId]);
}

export async function goalsWithProgress(userId: number) {
  return query<{ id: number; name: string; target: number; deadline: string | null; color: string; glyph: string; saved: number; created_at: string }>(
    `SELECT g.*, COALESCE(SUM(m.amount), 0) AS saved
       FROM sp_goals g LEFT JOIN sp_goal_moves m ON m.goal_id = g.id
      WHERE g.user_id = $1 GROUP BY g.id ORDER BY g.deadline NULLS LAST, g.id`, [userId]);
}

export const monthRange = (today: ISODate) => ({ start: today.slice(0, 8) + '01', next: addDays(today.slice(0, 8) + '28', 4).slice(0, 8) + '01' });
