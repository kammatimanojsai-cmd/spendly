import { route, body, ok } from '@/lib/server/api';
import { query, one } from '@/lib/server/db';
import { assertCategoryKind, userToday } from '@/lib/server/engine';
import { budgetSchema } from '@/lib/schemas';
import { monthEnd } from '@/lib/dates';

// Budgets are monthly per expense category; "spent" is for the current month.
export const GET = route(async ({ user }) => {
  const today = userToday(user);
  const rows = await query(
    `SELECT b.id, b.category_id, b.amount, c.name, c.color, c.glyph,
            COALESCE((SELECT SUM(t.amount) FROM sp_transactions t WHERE t.user_id = b.user_id AND t.category_id = b.category_id
                       AND t.kind = 'expense' AND t.occurred_on BETWEEN $2 AND $3), 0) AS spent
       FROM sp_budgets b JOIN sp_categories c ON c.id = b.category_id WHERE b.user_id = $1 ORDER BY c.name`,
    [user.id, today.slice(0, 8) + '01', monthEnd(today)]);
  return ok({ budgets: rows, today });
});

// Upsert: one budget per category
export const PUT = route(async ({ req, user }) => {
  const b = await body(req, budgetSchema);
  await assertCategoryKind(b.category_id, 'expense', user.id);
  const row = await one(
    `INSERT INTO sp_budgets (user_id, category_id, amount) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, category_id) DO UPDATE SET amount = EXCLUDED.amount RETURNING *`, [user.id, b.category_id, b.amount]);
  return ok({ budget: row });
});
