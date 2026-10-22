import { route, body, ok, HttpError } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { createSession, checkPassword, rateLimit, clearRateLimit } from '@/lib/server/auth';
import { loginSchema } from '@/lib/schemas';

// A real hash so unknown emails take as long as wrong passwords (no account enumeration by timing).
const DUMMY = '$2b$11$iMTSGg7hWr0N/Rdp7h6VPOxefNpUu47..1cS4RPVI1ZlPxwjWvCJu';

export const POST = route(async ({ req }) => {
  const input = await body(req, loginSchema);
  const key = `login:${input.email}`;
  if (!(await rateLimit(key, 8, 900))) throw new HttpError(429, 'Too many attempts. Wait 15 minutes or reset your password.');
  const u = await one<{ id: number; password_hash: string | null }>('SELECT id, password_hash FROM sp_users WHERE email = $1 AND NOT is_demo', [input.email]);
  const good = await checkPassword(input.password, u?.password_hash || DUMMY);
  if (!u || !good) throw new HttpError(401, 'That email and password don’t match.');
  await clearRateLimit(key);
  await createSession(u.id);
  return ok({ ok: true });
}, { auth: false });
