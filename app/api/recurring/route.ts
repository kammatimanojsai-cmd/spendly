import { route, body, ok } from '@/lib/server/api';
import { query, one } from '@/lib/server/db';
import { assertOwned, assertCategoryKind, postDueRecurring, upcomingBills, userToday } from '@/lib/server/engine';
import { recurringSchema } from '@/lib/schemas';
import { nextOnOrAfter, occurrence, monthlyEquivalent } from '@/lib/recurrence';
import { addDays } from '@/lib/dates';

export const GET = route(async ({ user }) => {
  await postDueRecurring(user);
  const today = userToday(user);
  const rules = await query(
    `SELECT r.*, a.name AS account_name, c.name AS category_name, c.color AS category_color, c.glyph AS category_glyph
       FROM sp_recurring r JOIN sp_accounts a ON a.id = r.account_id LEFT JOIN sp_categories c ON c.id = r.category_id
      WHERE r.user_id = $1 ORDER BY r.active DESC, r.mode, r.title`, [user.id]);
  const items = rules.map((r: any) => ({
    ...r,
    next_date: r.active ? occurrence(r, r.next_index) : null,
    monthly: monthlyEquivalent(r.amount, r),
  }));
  return ok({ rules: items, bills: await upcomingBills(user, addDays(today, 45)), today });
});

export const POST = route(async ({ req, user }) => {
  const r = await body(req, recurringSchema);
  await assertOwned('sp_accounts', r.account_id, user.id, 'Account');
  await assertCategoryKind(r.category_id, r.kind, user.id);
  // Bills start at their first due date on/after today; automatic rules may back-fill from a past start date.
  const today = userToday(user);
  const first = r.mode === 'bill' ? nextOnOrAfter(r, today)?.index ?? 0 : 0;
  const row = await one(
    `INSERT INTO sp_recurring (user_id, title, kind, amount, account_id, category_id, freq, interval, start_date, end_date, next_index, mode, remind_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [user.id, r.title, r.kind, r.amount, r.account_id, r.category_id ?? null, r.freq, r.interval, r.start_date, r.end_date ?? null, first, r.mode, r.remind_days]);
  const posted = await postDueRecurring(user);
  return ok({ rule: row, posted }, 201);
});
