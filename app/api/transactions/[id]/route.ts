import { route, body, ok, idParam, notFound } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { assertOwned, assertCategoryKind } from '@/lib/server/engine';
import { transactionSchema } from '@/lib/schemas';

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const id = idParam(params.id);
  const t = await body(req, transactionSchema);
  await assertOwned('sp_accounts', t.account_id, user.id, 'Account');
  if (t.kind === 'transfer') await assertOwned('sp_accounts', t.to_account_id, user.id, 'To account');
  else await assertCategoryKind(t.category_id, t.kind, user.id);
  const row = await one(
    `UPDATE sp_transactions SET account_id=$3, kind=$4, amount=$5, category_id=$6, to_account_id=$7, occurred_on=$8, merchant=$9, note=$10
      WHERE id=$1 AND user_id=$2 RETURNING id`,
    [id, user.id, t.account_id, t.kind, t.amount, t.kind === 'transfer' ? null : t.category_id ?? null, t.kind === 'transfer' ? t.to_account_id : null,
     t.occurred_on, t.merchant, t.note]);
  if (!row) throw notFound('Transaction not found.');
  return ok({ ok: true });
});

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const row = await one('DELETE FROM sp_transactions WHERE id = $1 AND user_id = $2 RETURNING id', [idParam(params.id), user.id]);
  if (!row) throw notFound('Transaction not found.');
  return ok({ ok: true });
});
