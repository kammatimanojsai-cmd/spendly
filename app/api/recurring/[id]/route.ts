import { route, body, ok, idParam, notFound } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { assertOwned, assertCategoryKind } from '@/lib/server/engine';
import { z } from 'zod';

// Editable without rewriting history: amount/title/account/category apply to future occurrences.
const patch = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  amount: z.number().int().positive().max(1e12).optional(),
  account_id: z.number().int().positive().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  remind_days: z.number().int().min(0).max(30).optional(),
  active: z.boolean().optional(),
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const id = idParam(params.id);
  const p = await body(req, patch);
  const cur = await one('SELECT kind FROM sp_recurring WHERE id=$1 AND user_id=$2', [id, user.id]);
  if (!cur) throw notFound('Recurring item not found.');
  if (p.account_id) await assertOwned('sp_accounts', p.account_id, user.id, 'Account');
  if (p.category_id) await assertCategoryKind(p.category_id, cur.kind, user.id);
  const row = await one(
    `UPDATE sp_recurring SET title=COALESCE($3,title), amount=COALESCE($4,amount), account_id=COALESCE($5,account_id),
       category_id=CASE WHEN $6::boolean THEN $7 ELSE category_id END, remind_days=COALESCE($8,remind_days), active=COALESCE($9,active)
     WHERE id=$1 AND user_id=$2 RETURNING *`,
    [id, user.id, p.title ?? null, p.amount ?? null, p.account_id ?? null, p.category_id !== undefined, p.category_id ?? null, p.remind_days ?? null, p.active ?? null]);
  return ok({ rule: row });
});

// Past transactions it created are kept (they become one-off entries).
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const row = await one('DELETE FROM sp_recurring WHERE id = $1 AND user_id = $2 RETURNING id', [idParam(params.id), user.id]);
  if (!row) throw notFound('Recurring item not found.');
  return ok({ ok: true });
});
