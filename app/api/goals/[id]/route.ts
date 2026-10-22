import { route, body, ok, idParam, notFound } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { goalSchema } from '@/lib/schemas';

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const g = await body(req, goalSchema.partial());
  const row = await one(
    `UPDATE sp_goals SET name=COALESCE($3,name), target=COALESCE($4,target), deadline=CASE WHEN $5::boolean THEN $6::date ELSE deadline END,
       color=COALESCE($7,color), glyph=COALESCE($8,glyph) WHERE id=$1 AND user_id=$2 RETURNING *`,
    [idParam(params.id), user.id, g.name ?? null, g.target ?? null, g.deadline !== undefined, g.deadline ?? null, g.color ?? null, g.glyph ?? null]);
  if (!row) throw notFound('Goal not found.');
  return ok({ goal: row });
});
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const row = await one('DELETE FROM sp_goals WHERE id = $1 AND user_id = $2 RETURNING id', [idParam(params.id), user.id]);
  if (!row) throw notFound('Goal not found.');
  return ok({ ok: true });
});
