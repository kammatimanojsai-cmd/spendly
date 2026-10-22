import { NextResponse } from 'next/server';
import { dbKind, one } from '@/lib/server/db';
import { emailProvider, adminEmail, loginNoticesEnabled } from '@/lib/server/email';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const db = await dbKind();
    await one('SELECT 1 AS ok FROM sp_users LIMIT 1');
    // last email attempt for delivery diagnostics: kind, status, provider reply; never an address or body
    const lastEmail = await one(`SELECT kind, status, provider, LEFT(COALESCE(detail,''), 160) AS detail, created_at FROM sp_email_log ORDER BY id DESC LIMIT 1`);
    return NextResponse.json({
      ok: true, database: db, emailProvider: emailProvider() || 'none',
      adminNotifications: adminEmail() ? { registrations: true, logins: loginNoticesEnabled() } : 'off',
      lastEmail, time: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
