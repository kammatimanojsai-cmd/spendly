import { route, body, ok, idParam, notFound, HttpError } from '@/lib/server/api';
import { one } from '@/lib/server/db';
import { goalMoveSchema } from '@/lib/schemas';

// Add money to a goal (positive) or take some out (negative). The saved total can't go below zero.
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const id = idParam(params.id);
  const m = await body(req, goalMoveSchema);
  const g = await one(`SELECT g.id, COALESCE((SELECT SUM(amount) FROM sp_goal_moves WHERE goal_id = g.id), 0) AS saved FROM sp_goals g WHERE g.id=$1 AND g.user_id=$2`, [id, user.id]);
  if (!g) throw notFound('Goal not found.');
  if (g.saved + m.amount < 0) throw new HttpError(400, 'You can’t withdraw more than you’ve saved.', { amount: 'More than the saved amount.' });
  const row = await one(`INSERT INTO sp_goal_moves (goal_id, user_id, amount, note, made_on) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [id, user.id, m.amount, m.note, m.made_on]);
  return ok({ move: row, saved: g.saved + m.amount }, 201);
});
