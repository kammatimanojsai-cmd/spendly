import { route, body, ok } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { accountBalances } from '@/lib/server/engine';
import { accountSchema } from '@/lib/schemas';

export const GET = route(async ({ user }) => ok({ accounts: await accountBalances(user.id) }));
export const POST = route(async ({ req, user }) => {
  const a = await body(req, accountSchema);
  const row = await one(`INSERT INTO sp_accounts (user_id, name, kind, color, opening_balance) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [user.id, a.name, a.kind, a.color, a.opening_balance]);
  return ok({ account: row }, 201);
});
