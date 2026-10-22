import { route, body, ok } from '@/lib/server/api';
import { query, one } from '@/lib/server/db';
import { goalsWithProgress, userToday } from '@/lib/server/engine';
import { goalSchema } from '@/lib/schemas';
import { goalMonthlyNeed } from '@/lib/insights';
import { diffDays } from '@/lib/dates';
import { minorFactor } from '@/lib/money';

export const GET = route(async ({ user }) => {
  const today = userToday(user);
  const goals = await goalsWithProgress(user.id);
  const moves = await query(`SELECT id, goal_id, amount, note, made_on FROM sp_goal_moves WHERE user_id = $1 ORDER BY made_on DESC, id DESC LIMIT 200`, [user.id]);
  return ok({
    today,
    goals: goals.map((g) => {
      const days = g.deadline ? diffDays(today, g.deadline) : null;
      const months = days !== null ? Math.max(1, Math.ceil(days / 30.44)) : null;
      return { ...g, daysLeft: days, monthlyNeed: months && days! >= 0 ? goalMonthlyNeed(g.target, g.saved, months, minorFactor(user.currency)) : 0, moves: moves.filter((m) => m.goal_id === g.id).slice(0, 10) };
    }),
  });
});

export const POST = route(async ({ req, user }) => {
  const g = await body(req, goalSchema);
  const row = await one(`INSERT INTO sp_goals (user_id, name, target, deadline, color, glyph) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [user.id, g.name, g.target, g.deadline ?? null, g.color, g.glyph]);
  return ok({ goal: row }, 201);
});
