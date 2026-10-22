import { route, ok, idParam, notFound } from '@/lib/server/api';
import { one } from '@/lib/server/db';

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const row = await one('DELETE FROM sp_budgets WHERE id = $1 AND user_id = $2 RETURNING id', [idParam(params.id), user.id]);
  if (!row) throw notFound('Budget not found.');
  return ok({ ok: true });
});
