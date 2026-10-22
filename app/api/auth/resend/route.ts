import { route, ok, HttpError } from '@/lib/server/api';
import { rateLimit } from '@/lib/server/auth';
import { sendVerification, baseUrl, exposeDevLinks, emailProvider } from '@/lib/server/email';

export const POST = route(async ({ req, user }) => {
  if (user.is_demo) throw new HttpError(400, 'Demo workspaces don’t have an email address.');
  if (user.email_verified) return ok({ ok: true, alreadyVerified: true });
  if (!(await rateLimit(`verify:${user.id}`, 3, 600))) throw new HttpError(429, 'Three emails sent in 10 minutes. Check your inbox and spam folder, then try again later.');
  if (!emailProvider() && !exposeDevLinks()) throw new HttpError(503, 'Email isn’t set up on this site yet. Try again later.');
  const link = await sendVerification(user, baseUrl(req));
  return ok({ ok: true, devVerifyLink: exposeDevLinks() ? link : undefined });
});
