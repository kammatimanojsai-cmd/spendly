import { route, body, ok, HttpError } from '@/lib/server/api';
import { one, query } from '@/lib/server/db';
import { destroySession } from '@/lib/server/auth';
import { settingsSchema } from '@/lib/schemas';

export const GET = route(async ({ user }) => ok({ user }));

export const PATCH = route(async ({ req, user }) => {
  const s = await body(req, settingsSchema);
  const u = await one(
    `UPDATE sp_users SET name = COALESCE($2, name), currency = COALESCE($3, currency), timezone = COALESCE($4, timezone), onboarded = COALESCE($5, onboarded)
      WHERE id = $1 RETURNING id, name, email, currency, timezone, is_demo, onboarded, email_verified, created_at`,
    [user.id, s.name ?? null, s.currency ?? null, s.timezone ?? null, s.onboarded ?? null]);
  return ok({ user: u });
});

// Permanently deletes the account and every row that belongs to it (ON DELETE CASCADE).
export const DELETE = route(async ({ req, user }) => {
  const b = await req.json().catch(() => ({}));
  if (b?.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.', { confirm: 'Type DELETE to confirm.' });
  await query('DELETE FROM sp_users WHERE id = $1', [user.id]);
  await destroySession();
  return ok({ ok: true });
});
