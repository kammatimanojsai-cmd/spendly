import { route } from '@/lib/server/api';
import { query } from '@/lib/server/db';
import { toCsv } from '@/lib/exporters';
import { toMajor } from '@/lib/money';

// All transactions as CSV (amounts in major units, expenses negative) for Excel/Sheets.
export const GET = route(async ({ user }) => {
  const rows = await query(
    `SELECT t.occurred_on, t.kind, t.amount, a.name AS account, ta.name AS to_account, c.name AS category, t.merchant, t.note, t.source
       FROM sp_transactions t JOIN sp_accounts a ON a.id = t.account_id LEFT JOIN sp_accounts ta ON ta.id = t.to_account_id
       LEFT JOIN sp_categories c ON c.id = t.category_id WHERE t.user_id = $1 ORDER BY t.occurred_on, t.id`, [user.id]);
  const csv = toCsv(['Date', 'Type', 'Amount', 'Currency', 'Account', 'To account', 'Category', 'Merchant', 'Note', 'Source'],
    rows.map((r) => [r.occurred_on, r.kind, (r.kind === 'expense' ? -1 : 1) * toMajor(r.amount, user.currency), user.currency, r.account, r.to_account, r.category, r.merchant, r.note, r.source]));
  return new Response('﻿' + csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="spendly-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store' } });
});
