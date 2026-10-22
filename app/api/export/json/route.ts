import { route } from '@/lib/server/api';
import { query } from '@/lib/server/db';

// Full backup of everything the user owns. Amounts are integer minor units.
export const GET = route(async ({ user }) => {
  const t = (sql: string) => query(sql, [user.id]);
  const data = {
    exported_at: new Date().toISOString(),
    app: 'Spendly', version: 1,
    profile: { name: user.name, email: user.email, currency: user.currency, timezone: user.timezone },
    accounts: await t('SELECT id, name, kind, color, opening_balance, archived, created_at FROM sp_accounts WHERE user_id=$1 ORDER BY id'),
    categories: await t('SELECT id, name, kind, glyph, color FROM sp_categories WHERE user_id=$1 ORDER BY id'),
    transactions: await t('SELECT id, kind, amount, account_id, to_account_id, category_id, occurred_on, merchant, note, source, recurring_id FROM sp_transactions WHERE user_id=$1 ORDER BY occurred_on, id'),
    budgets: await t('SELECT category_id, amount FROM sp_budgets WHERE user_id=$1'),
    recurring: await t('SELECT id, title, kind, amount, account_id, category_id, freq, interval, start_date, end_date, next_index, mode, remind_days, active FROM sp_recurring WHERE user_id=$1 ORDER BY id'),
    goals: await t('SELECT id, name, target, deadline, color, glyph FROM sp_goals WHERE user_id=$1 ORDER BY id'),
    goal_moves: await t('SELECT goal_id, amount, note, made_on FROM sp_goal_moves WHERE user_id=$1 ORDER BY made_on, id'),
  };
  return new Response(JSON.stringify(data, null, 2), { headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="spendly-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    'Cache-Control': 'no-store' } });
});
