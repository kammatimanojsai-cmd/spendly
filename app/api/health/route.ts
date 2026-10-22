import { NextResponse } from 'next/server';
import { dbKind, one } from '@/lib/server/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const db = await dbKind();
    await one('SELECT 1 AS ok FROM sp_users LIMIT 1');
    return NextResponse.json({ ok: true, database: db, time: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
