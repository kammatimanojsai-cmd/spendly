import { NextResponse } from 'next/server';
import { one } from '@/lib/server/db';
import { consumeEmailToken } from '@/lib/server/auth';
import { baseUrl, sendWelcomeOnce } from '@/lib/server/email';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const base = baseUrl(req);
  const raw = new URL(req.url).searchParams.get('token') || '';
  const t = await consumeEmailToken(raw, 'verify');
  if (!t) return NextResponse.redirect(`${base}/app?verify=invalid`);
  await one('UPDATE sp_users SET email_verified = TRUE WHERE id = $1', [t.user_id]);
  sendWelcomeOnce(t.user_id, base);
  return NextResponse.redirect(`${base}/app?verify=success`);
}
