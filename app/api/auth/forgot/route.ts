import { route, ok } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { issueEmailToken, normalizeEmail, rateLimit } from '@/lib/server/auth';
import { sendEmail, tpl, later, baseUrl, exposeDevLinks } from '@/lib/server/email';

// Same reply whether or not the email is registered, so this can't be used to discover accounts.
const GENERIC = 'If that email has a Spendly account, a reset link is on its way.';

export const POST = route(async ({ req }) => {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!email) return ok({ ok: true, message: GENERIC });
  if (!(await rateLimit(`reset:${email}`, 3, 900))) return ok({ ok: true, message: GENERIC });
  const u = await one<{ id: number; name: string; email: string }>('SELECT id, name, email FROM sp_users WHERE email = $1 AND NOT is_demo', [email]);
  if (!u) return ok({ ok: true, message: GENERIC });
  const raw = await issueEmailToken(u.id, 'reset', 1);
  const link = `${baseUrl(req)}/reset-password?token=${raw}`;
  later(() => sendEmail(u.id, 'reset', u.email, tpl.reset(u.name, link)));
  return ok({ ok: true, message: GENERIC, devResetLink: exposeDevLinks() ? link : undefined });
}, { auth: false });
