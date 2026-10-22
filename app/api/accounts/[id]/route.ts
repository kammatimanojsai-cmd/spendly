import { route, body, ok, idParam, notFound, HttpError } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { accountPatchSchema } from '@/lib/schemas';

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const id = idParam(params.id);
  const a = await body(req, accountPatchSchema);
  const row = await one(
    `UPDATE sp_accounts SET name = COALESCE($3,name), kind = COALESCE($4,kind), color = COALESCE($5,color),
       opening_balance = COALESCE($6,opening_balance), archived = COALESCE($7,archived)
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user.id, a.name ?? null, a.kind ?? null, a.color ?? null, a.opening_balance ?? null, a.archived ?? null]);
  if (!row) throw notFound('Account not found.');
  return ok({ account: row });
});

// Accounts with history are archived instead of deleted so past reports stay correct.
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const id = idParam(params.id);
  const used = await one(`SELECT (SELECT COUNT(*) FROM sp_transactions WHERE user_id=$2 AND (account_id=$1 OR to_account_id=$1))::int +
                                 (SELECT COUNT(*) FROM sp_recurring WHERE user_id=$2 AND account_id=$1)::int AS n`, [id, user.id]);
  if (Number(used?.n) > 0) throw new HttpError(409, 'This account has history. Archive it instead to keep your reports accurate.');
  const row = await one('DELETE FROM sp_accounts WHERE id = $1 AND user_id = $2 RETURNING id', [id, user.id]);
  if (!row) throw notFound('Account not found.');
  return ok({ ok: true });
});
