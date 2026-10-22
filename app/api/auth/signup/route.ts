import { route, body, ok, HttpError } from '@/lib/server/api';
import { tx } from '@/lib/server/db';
import { createSession, hashPassword, rateLimit } from '@/lib/server/auth';
import { seedDefaults } from '@/lib/server/seed';
import { signupSchema } from '@/lib/schemas';

export const POST = route(async ({ req }) => {
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (!(await rateLimit(`signup:${ip}`, 10, 3600))) throw new HttpError(429, 'Too many sign-ups from this network. Try again in an hour.');
  const input = await body(req, signupSchema);
  const hash = await hashPassword(input.password);
  const user = await tx(async (q) => {
    const exists = await q('SELECT 1 FROM sp_users WHERE email = $1', [input.email]);
    if (exists.length) throw new HttpError(409, 'An account with this email already exists. Sign in instead.', { email: 'Already registered.' });
    const [u] = await q('INSERT INTO sp_users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id', [input.name, input.email, hash]);
    await seedDefaults(q, u.id);
    return u;
  });
  await createSession(user.id);
  return ok({ ok: true }, 201);
}, { auth: false });
