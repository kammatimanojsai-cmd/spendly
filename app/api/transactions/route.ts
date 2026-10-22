import { route, body, ok } from '@/lib/server/api';
import { query, one } from '@/lib/server/db';
import { assertOwned, assertCategoryKind, postDueRecurring } from '@/lib/server/engine';
import { transactionSchema } from '@/lib/schemas';
import { isISODate } from '@/lib/dates';

const SELECT = `SELECT t.id, t.kind, t.amount, t.occurred_on, t.merchant, t.note, t.source, t.account_id, t.to_account_id, t.category_id, t.recurring_id,
  a.name AS account_name, a.color AS account_color, ta.name AS to_account_name,
  c.name AS category_name, c.color AS category_color, c.glyph AS category_glyph
  FROM sp_transactions t JOIN sp_accounts a ON a.id = t.account_id
  LEFT JOIN sp_accounts ta ON ta.id = t.to_account_id LEFT JOIN sp_categories c ON c.id = t.category_id`;

// GET ?month=YYYY-MM&account=&category=&kind=&q=&before=<date>_<id>&limit=
export const GET = route(async ({ req, user }) => {
  await postDueRecurring(user);
  const p = new URL(req.url).searchParams;
  const where = ['t.user_id = $1'];
  const args: unknown[] = [user.id];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };
  const month = p.get('month');
  if (month && /^\d{4}-\d{2}$/.test(month)) { add("to_char(t.occurred_on,'YYYY-MM') = ?", month); }
  const account = Number(p.get('account'));
  if (account > 0) { args.push(account); where.push(`(t.account_id = $${args.length} OR t.to_account_id = $${args.length})`); }
  const category = p.get('category');
  if (category === 'none') where.push('t.category_id IS NULL AND t.kind <> \'transfer\'');
  else if (Number(category) > 0) add('t.category_id = ?', Number(category));
  const kind = p.get('kind');
  if (kind && ['expense', 'income', 'transfer'].includes(kind)) add('t.kind = ?', kind);
  const q = p.get('q')?.trim().slice(0, 60);
  if (q) { args.push(`%${q}%`); where.push(`(t.merchant ILIKE $${args.length} OR t.note ILIKE $${args.length} OR c.name ILIKE $${args.length})`); }
  const before = p.get('before');
  if (before && /^\d{4}-\d{2}-\d{2}_\d+$/.test(before)) {
    const [d, id] = before.split('_');
    if (isISODate(d)) { args.push(d, Number(id)); where.push(`(t.occurred_on, t.id) < ($${args.length - 1}::date, $${args.length})`); }
  }
  const limit = Math.min(Math.max(Number(p.get('limit')) || 50, 1), 200);
  const rows = await query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY t.occurred_on DESC, t.id DESC LIMIT ${limit + 1}`, args);
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return ok({ items, next: more && last ? `${last.occurred_on}_${last.id}` : null });
});

export const POST = route(async ({ req, user }) => {
  const t = await body(req, transactionSchema);
  await assertOwned('sp_accounts', t.account_id, user.id, 'Account');
  if (t.kind === 'transfer') await assertOwned('sp_accounts', t.to_account_id, user.id, 'To account');
  else await assertCategoryKind(t.category_id, t.kind, user.id);
  const row = await one(
    `INSERT INTO sp_transactions (user_id, account_id, kind, amount, category_id, to_account_id, occurred_on, merchant, note, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [user.id, t.account_id, t.kind, t.amount, t.kind === 'transfer' ? null : t.category_id ?? null, t.kind === 'transfer' ? t.to_account_id : null,
     t.occurred_on, t.merchant, t.note, t.source]);
  return ok({ transaction: await one(`${SELECT} WHERE t.id = $1`, [row!.id]) }, 201);
});
