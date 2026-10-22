import { route, ok, HttpError } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { createSession, rateLimit, purgeExpiredDemos, token, DEMO_SESSION_HOURS } from '@/lib/server/auth';
import { seedDemo } from '@/lib/server/seed';
import { todayIn } from '@/lib/dates';

// A throwaway sandbox filled with sample data. No email or password; deleted after 24 hours.
export const POST = route(async ({ req }) => {
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (!(await rateLimit(`demo:${ip}`, 20, 3600))) throw new HttpError(429, 'Too many demo workspaces from this network. Try again later.');
  await purgeExpiredDemos();
  const u = await one<{ id: number }>(
    `INSERT INTO sp_users (name, email, is_demo, onboarded) VALUES ('Demo explorer', $1, TRUE, TRUE) RETURNING id`,
    [`demo-${token(9)}@demo.spendly.invalid`]);
  await seedDemo(u!.id, todayIn('Asia/Kolkata'));
  await createSession(u!.id, DEMO_SESSION_HOURS);
  return ok({ ok: true }, 201);
}, { auth: false });
