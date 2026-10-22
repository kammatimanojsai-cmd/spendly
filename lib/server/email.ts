import 'server-only';
import { after } from 'next/server';
import { query, one } from './db';
import { issueEmailToken } from './auth';

// Email over SMTP (e.g. Gmail with an App Password) or Resend. Every attempt is logged to sp_email_log
// (kind, status, provider reply) for diagnostics; message bodies, tokens and passwords are never stored or logged.

const env = (k: string) => (process.env[k] || '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
const smtpPass = () => env('SMTP_PASS').replace(/\s+/g, ''); // Gmail shows App Passwords with spaces

export function emailProvider(): 'smtp' | 'resend' | null {
  if (env('RESEND_API_KEY')) return 'resend';
  if (env('SMTP_HOST') && env('SMTP_USER') && smtpPass()) return 'smtp';
  return null;
}

export function adminEmail() {
  const v = env('ADMIN_EMAIL');
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}
export const loginNoticesEnabled = () => !/^(0|false|off|no)$/i.test(env('ADMIN_NOTIFY_LOGINS') || 'true');

const from = () => env('EMAIL_FROM') || (emailProvider() === 'smtp' ? `Spendly <${env('SMTP_USER')}>` : 'Spendly <onboarding@resend.dev>');

type Mail = { subject: string; html: string; text: string };

async function deliver(to: string, m: Mail): Promise<{ provider: string | null; id: string | null }> {
  const provider = emailProvider();
  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from(), to: [to], ...m }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message || 'error'}`);
    return { provider, id: body.id ?? null };
  }
  if (provider === 'smtp') {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(env('SMTP_PORT') || 465);
    const t = nodemailer.createTransport({
      host: env('SMTP_HOST'), port, secure: port === 465,
      auth: { user: env('SMTP_USER'), pass: smtpPass() },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    const info = await t.sendMail({ from: from(), to, ...m });
    return { provider, id: info.messageId };
  }
  return { provider: null, id: null };
}

export async function sendEmail(userId: number | null, kind: string, to: string, m: Mail) {
  try {
    const r = await deliver(to, m);
    await query('INSERT INTO sp_email_log (user_id, kind, status, provider, detail) VALUES ($1,$2,$3,$4,$5)',
      [userId, kind, r.provider ? 'sent' : 'skipped', r.provider, r.provider ? r.id : 'No email provider configured']);
    if (!r.provider) console.warn(`[email] ${kind} not sent: no email provider configured`);
    return { ok: !!r.provider, skipped: !r.provider };
  } catch (e: any) {
    console.error(`[email] ${kind} failed:`, e.code || '', e.responseCode || '', e.message);
    await query('INSERT INTO sp_email_log (user_id, kind, status, provider, detail) VALUES ($1,$2,$3,$4,$5)',
      [userId, kind, 'failed', emailProvider(), String(e.message).slice(0, 300)]).catch(() => {});
    return { ok: false, error: String(e.message) };
  }
}

/** Run after the response is sent, so email can never slow down or break sign-up/sign-in. */
export function later(task: () => Promise<unknown>) {
  const safe = async () => { try { await task(); } catch (e: any) { console.error('[email:later]', e.message); } };
  try { after(safe); } catch { void safe(); }
}

// ---------- templates (Spendly look: mint paper, ink outlines, mango button) ----------

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (s: string) => String(s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120);
export const istTime = (d: string | Date) =>
  new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' }) + ' IST';

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#E8F5EC;font-family:Arial,Helvetica,sans-serif;color:#16213E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #16213E;border-radius:16px">
<tr><td style="padding:18px 26px;border-bottom:2px solid #16213E;font-size:22px;font-weight:bold">Spendly</td></tr>
<tr><td style="padding:26px"><h1 style="margin:0 0 12px;font-size:21px">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:14px 26px;border-top:2px dashed #C9D3E6;color:#4A5372;font-size:12px">Spendly never asks for bank logins and never moves money.</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#FFB52E;color:#16213E;text-decoration:none;padding:12px 20px;border:2px solid #16213E;border-radius:12px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;
const linkNote = (href: string, valid: string) =>
  `<p style="color:#4A5372;font-size:13px;line-height:1.6">This link works once and expires in ${valid}. If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${esc(href)}</span></p>`;

export const tpl = {
  verify: (name: string, link: string): Mail => ({
    subject: 'Confirm your Spendly email',
    html: layout(`Hi ${oneLine(name)}, confirm your email`, `<p style="line-height:1.6">Tap below to confirm this address so we can send you password resets and important account emails.</p>${button(link, 'Confirm my email')}${linkNote(link, '24 hours')}<p style="color:#4A5372;font-size:13px">Didn't sign up? You can ignore this email.</p>`),
    text: `Hi ${oneLine(name)},\n\nConfirm your Spendly email (link valid 24 hours, works once):\n${link}\n\nDidn't sign up? Ignore this email.`,
  }),
  welcome: (name: string, link: string): Mail => ({
    subject: 'Welcome to Spendly',
    html: layout(`You're in, ${oneLine(name)}`, `<p style="line-height:1.6">Your email is confirmed. Three things that make the daily number useful:</p><ol style="line-height:1.8;padding-left:18px"><li>Set your account balances</li><li>Add salary and regular bills under Plan</li><li>Give a few categories a monthly budget</li></ol>${button(link, 'Open Spendly')}`),
    text: `You're in, ${oneLine(name)}!\n\n1. Set your account balances\n2. Add salary and regular bills under Plan\n3. Give a few categories a monthly budget\n\nOpen Spendly: ${link}`,
  }),
  reset: (name: string, link: string): Mail => ({
    subject: 'Reset your Spendly password',
    html: layout(`Hi ${oneLine(name)}, reset your password`, `<p style="line-height:1.6">Someone (hopefully you) asked to reset your Spendly password.</p>${button(link, 'Choose a new password')}${linkNote(link, '1 hour')}<p style="color:#4A5372;font-size:13px">Didn't ask? Ignore this email; your password stays the same.</p>`),
    text: `Hi ${oneLine(name)},\n\nReset your Spendly password (link valid 1 hour, works once):\n${link}\n\nDidn't ask? Ignore this email.`,
  }),
  adminSignup: (name: string, email: string, at: string): Mail => ({
    subject: `New Spendly registration: ${oneLine(name)}`,
    html: layout('New user registered', `<p>A new account was created on Spendly.</p><table style="font-size:14px">${[['Name', oneLine(name)], ['Email', email], ['Registered', istTime(at)]].map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#4A5372">${k}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table><p style="color:#4A5372;font-size:12px">Automated admin notice. Never contains passwords or links.</p>`),
    text: `New Spendly registration\n\nName: ${oneLine(name)}\nEmail: ${email}\nRegistered: ${istTime(at)}`,
  }),
  adminLogin: (name: string, email: string, at: string): Mail => ({
    subject: `Spendly login: ${oneLine(name)}`,
    html: layout('User signed in', `<p>An existing user signed in to Spendly.</p><table style="font-size:14px">${[['Name', oneLine(name)], ['Email', email], ['Signed in', istTime(at)]].map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#4A5372">${k}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table><p style="color:#4A5372;font-size:12px">Automated admin notice. Repeat sign-ins within 30 minutes aren't re-sent.</p>`),
    text: `Spendly login\n\nName: ${oneLine(name)}\nEmail: ${email}\nSigned in: ${istTime(at)}`,
  }),
};

// ---------- flows ----------

export function baseUrl(req: Request) {
  if (env('APP_URL')) return env('APP_URL').replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Issues a fresh verification link (returned so dev mode can show it) and emails it in the background. */
export async function sendVerification(user: { id: number; name: string; email: string }, base: string) {
  const raw = await issueEmailToken(user.id, 'verify', 24);
  const link = `${base}/verify?token=${raw}`;
  later(() => sendEmail(user.id, 'verification', user.email, tpl.verify(user.name, link)));
  return link;
}

/** Welcome email exactly once per account, claimed atomically. */
export function sendWelcomeOnce(userId: number, base: string) {
  later(async () => {
    const u = await one<{ name: string; email: string }>('UPDATE sp_users SET welcome_sent = TRUE WHERE id = $1 AND welcome_sent = FALSE AND NOT is_demo RETURNING name, email', [userId]);
    if (u) await sendEmail(userId, 'welcome', u.email, tpl.welcome(u.name, `${base}/app`));
  });
}

export function notifyAdminSignup(userId: number) {
  const to = adminEmail();
  if (!to) return;
  later(async () => {
    const u = await one<{ name: string; email: string; created_at: string }>(
      'UPDATE sp_users SET admin_signup_notified = TRUE WHERE id = $1 AND admin_signup_notified = FALSE AND NOT is_demo RETURNING name, email, created_at', [userId]);
    if (u) await sendEmail(userId, 'admin_signup', to, tpl.adminSignup(u.name, u.email, u.created_at));
  });
}

export function notifyAdminLogin(userId: number) {
  const to = adminEmail();
  if (!to || !loginNoticesEnabled()) return;
  later(async () => {
    const u = await one<{ name: string; email: string; at: string }>(
      `UPDATE sp_users SET last_login_notified_at = NOW()
        WHERE id = $1 AND NOT is_demo AND (last_login_notified_at IS NULL OR last_login_notified_at < NOW() - INTERVAL '30 minutes')
        RETURNING name, email, last_login_notified_at AS at`, [userId]);
    if (u) await sendEmail(userId, 'admin_login', to, tpl.adminLogin(u.name, u.email, u.at));
  });
}

export const exposeDevLinks = () => !emailProvider() && process.env.NODE_ENV !== 'production';
