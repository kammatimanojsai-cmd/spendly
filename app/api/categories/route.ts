import { route, body, ok } from '@/lib/server/api';
import { query, one } from '@/lib/server/db';
import { categorySchema } from '@/lib/schemas';

export const GET = route(async ({ user }) => ok({
  categories: await query(`SELECT c.*, (SELECT COUNT(*) FROM sp_transactions t WHERE t.category_id = c.id)::int AS tx_count
                             FROM sp_categories c WHERE user_id = $1 ORDER BY kind DESC, name`, [user.id]),
}));
export const POST = route(async ({ req, user }) => {
  const c = await body(req, categorySchema);
  const row = await one(`INSERT INTO sp_categories (user_id, name, kind, glyph, color) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [user.id, c.name, c.kind, c.glyph, c.color]);
  return ok({ category: row }, 201);
});
