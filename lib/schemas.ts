import { z } from 'zod';
import { isISODate } from './dates.ts';
import { CURRENCIES } from './money.ts';

// Shared by API routes (authoritative validation) and forms (instant feedback).

export const GLYPHS = ['food', 'cart', 'car', 'bag', 'heart', 'film', 'bolt', 'home', 'book', 'gift', 'plane', 'paw', 'briefcase', 'coins', 'chart', 'star', 'piggy', 'phone', 'shield', 'dots'] as const;
export const PALETTE = ['#FF6159', '#FFB52E', '#14A44D', '#2E86FF', '#7A5CFA', '#FF7AC6', '#00B8A9', '#8D6E63', '#16213E'] as const;
export const ACCOUNT_KINDS = ['cash', 'bank', 'card', 'wallet', 'savings'] as const;

const money = z.number({ error: 'Enter an amount.' }).int('Use a whole amount in minor units.').positive('Amount must be more than zero.').max(1e12, 'That amount is too large.');
const signedMoney = z.number().int().min(-1e12).max(1e12);
const isoDate = z.string().refine(isISODate, 'Pick a valid date.');
const name = (max = 60) => z.string().trim().min(1, 'This can’t be empty.').max(max, `Keep it under ${max} characters.`);
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const id = z.number().int().positive();

export const signupSchema = z.object({
  name: name(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(120),
  password: z.string().min(8, 'Use at least 8 characters.').max(200)
    .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use at least one letter and one number.'),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().min(1, 'Enter your email.'), password: z.string().min(1, 'Enter your password.') });

export const settingsSchema = z.object({
  name: name(60).optional(),
  currency: z.enum(CURRENCIES).optional(),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Unknown time zone.').optional(),
  onboarded: z.boolean().optional(),
});

export const accountSchema = z.object({
  name: name(40),
  kind: z.enum(ACCOUNT_KINDS),
  color: z.enum(PALETTE),
  opening_balance: signedMoney.default(0),
});
export const accountPatchSchema = accountSchema.partial().extend({ archived: z.boolean().optional() });

export const categorySchema = z.object({
  name: name(32),
  kind: z.enum(['expense', 'income']),
  glyph: z.enum(GLYPHS),
  color: z.enum(PALETTE),
});

export const transactionSchema = z.object({
  kind: z.enum(['expense', 'income', 'transfer']),
  amount: money,
  account_id: id,
  to_account_id: id.optional().nullable(),
  category_id: id.optional().nullable(),
  occurred_on: isoDate,
  merchant: optText(80),
  note: optText(280),
  source: z.enum(['manual', 'receipt']).default('manual'),
}).superRefine((t, ctx) => {
  if (t.kind === 'transfer') {
    if (!t.to_account_id) ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: 'Pick the account to move money into.' });
    else if (t.to_account_id === t.account_id) ctx.addIssue({ code: 'custom', path: ['to_account_id'], message: 'Choose two different accounts.' });
  }
});

export const budgetSchema = z.object({ category_id: id, amount: money });

export const recurringSchema = z.object({
  title: name(60),
  kind: z.enum(['expense', 'income']),
  amount: money,
  account_id: id,
  category_id: id.optional().nullable(),
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(52).default(1),
  start_date: isoDate,
  end_date: isoDate.optional().nullable(),
  mode: z.enum(['auto', 'bill']),
  remind_days: z.number().int().min(0).max(30).default(3),
}).refine((r) => !r.end_date || r.end_date >= r.start_date, { path: ['end_date'], message: 'End date must be after the start date.' });

export const goalSchema = z.object({
  name: name(40),
  target: money,
  deadline: isoDate.optional().nullable(),
  color: z.enum(PALETTE),
  glyph: z.enum(GLYPHS).default('star'),
});
export const goalMoveSchema = z.object({ amount: signedMoney.refine((v) => v !== 0, 'Enter an amount.'), note: optText(120), made_on: isoDate });

export type TransactionInput = z.infer<typeof transactionSchema>;
export type RecurringInput = z.infer<typeof recurringSchema>;
