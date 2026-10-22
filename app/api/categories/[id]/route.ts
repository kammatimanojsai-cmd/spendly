import { route, body, ok, idParam, notFound } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { categorySchema } from '@/lib/schemas';

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const c = await body(req, categorySchema.omit({ kind: true }).partial());
  const row = await one(`UPDATE sp_categories SET name=COALESCE($3,name), glyph=COALESCE($4,glyph), color=COALESCE($5,color) WHERE id=$1 AND user_id=$2 RETURNING *`,
    [idParam(params.id), user.id, c.name ?? null, c.glyph ?? null, c.color ?? null]);
  if (!row) throw notFound('Category not found.');
  return ok({ category: row });
});
// Transactions keep their amounts; they simply become uncategorised.
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const row = await one('DELETE FROM sp_categories WHERE id = $1 AND user_id = $2 RETURNING id', [idParam(params.id), user.id]);
  if (!row) throw notFound('Category not found.');
  return ok({ ok: true });
});
