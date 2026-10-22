import 'server-only';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { query, one } from './db';

export const SESSION_COOKIE = 'sp_session';
const SESSION_DAYS = 30;
const DEMO_HOURS = 24;

export type User = { id: number; name: string; email: string; currency: string; timezone: string; is_demo: boolean; onboarded: boolean; email_verified: boolean; created_at: string };

export const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
export const normalizeEmail = (e: string) => String(e || '').trim().toLowerCase();

// Session ids are stored hashed, so a leaked database row cannot be replayed as a cookie.
const hashSession = (id: string) => crypto.createHash('sha256').update(id).digest('base64url');

export async function createSession(userId: number, hours = SESSION_DAYS * 24) {
  const id = token(32);
  const expires = new Date(Date.now() + hours * 36e5);
  await query('INSERT INTO sp_sessions (id, user_id, expires_at) VALUES ($1,$2,$3)', [hashSession(id), userId, expires]);
  (await cookies()).set(SESSION_COOKIE, id, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await query('DELETE FROM sp_sessions WHERE id = $1', [hashSession(id)]);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return one<User>(
    `SELECT u.id, u.name, u.email, u.currency, u.timezone, u.is_demo, u.onboarded, u.email_verified, u.created_at
       FROM sp_sessions s JOIN sp_users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > NOW()`,
    [hashSession(id)]
  );
}

/** Single-use emailed links. The raw token goes in the email; only its hash is stored. */
export async function issueEmailToken(userId: number, purpose: 'verify' | 'reset', hours: number) {
  const raw = token(32);
  await query('INSERT INTO sp_email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1,$2,$3,$4)',
    [hashSession(raw), userId, purpose, new Date(Date.now() + hours * 36e5)]);
  return raw;
}

/** Atomically consumes a valid, unused token and returns its user, or null. */
export async function consumeEmailToken(raw: string, purpose: 'verify' | 'reset') {
  if (!raw || raw.length > 100) return null;
  return one<{ user_id: number }>(
    `UPDATE sp_email_tokens SET used_at = NOW()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()
      RETURNING user_id`, [hashSession(raw), purpose]);
}

/** Fixed-window limiter backed by the database (works across serverless instances). */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const r = await one<{ count: number }>(
    `INSERT INTO sp_login_attempts (key, count, window_start) VALUES ($1, 1, NOW())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN sp_login_attempts.window_start < NOW() - ($2 || ' seconds')::interval THEN 1 ELSE sp_login_attempts.count + 1 END,
       window_start = CASE WHEN sp_login_attempts.window_start < NOW() - ($2 || ' seconds')::interval THEN NOW() ELSE sp_login_attempts.window_start END
     RETURNING count`,
    [key, String(windowSec)]
  );
  return (r?.count ?? 0) <= max;
}

export async function clearRateLimit(key: string) {
  await query('DELETE FROM sp_login_attempts WHERE key = $1', [key]);
}

/** Demo workspaces are throwaway: removed after 24 hours, along with all their data. */
export async function purgeExpiredDemos() {
  await query(`DELETE FROM sp_users WHERE is_demo AND created_at < NOW() - ($1 || ' hours')::interval`, [String(DEMO_HOURS)]);
  await query(`DELETE FROM sp_sessions WHERE expires_at < NOW()`);
}
export const DEMO_SESSION_HOURS = DEMO_HOURS;
