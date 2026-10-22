import { route, ok, HttpError } from '@/lib/server/api';
import { query } from '@/lib/server/db';
import { consumeEmailToken, createSession, hashPassword } from '@/lib/server/auth';
import { baseUrl, sendWelcomeOnce } from '@/lib/server/email';
import { signupSchema } from '@/lib/schemas';

export const POST = route(async ({ req }) => {
  const body = await req.json().catch(() => ({}));
  const pw = signupSchema.shape.password.safeParse(body?.password);
  if (!pw.success) throw new HttpError(400, pw.error.issues[0].message, { password: pw.error.issues[0].message });
  const t = await consumeEmailToken(String(body?.token || ''), 'reset');
  if (!t) throw new HttpError(400, 'This reset link has expired or was already used. Request a new one.', { token: 'expired' });
  // the link proved inbox ownership, so the email counts as verified; every old session is signed out
  await query('UPDATE sp_users SET password_hash = $1, email_verified = TRUE WHERE id = $2', [await hashPassword(pw.data), t.user_id]);
  await query('DELETE FROM sp_sessions WHERE user_id = $1', [t.user_id]);
  await query(`UPDATE sp_email_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = 'reset' AND used_at IS NULL`, [t.user_id]);
  await createSession(t.user_id);
  sendWelcomeOnce(t.user_id, baseUrl(req));
  return ok({ ok: true });
}, { auth: false });
