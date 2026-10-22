import { route, ok, idParam } from '@/lib/server/api';
import { settleBill } from '@/lib/server/engine';
import { z } from 'zod';
import { isISODate } from '@/lib/dates';

const schema = z.object({
  account_id: z.number().int().positive().optional(),
  amount: z.number().int().positive().max(1e12).optional(),
  paid_on: z.string().refine(isISODate, 'Pick a valid date.').optional(),
});

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const b = schema.parse(await req.json().catch(() => ({})));
  return ok(await settleBill(user, idParam(params.id), 'pay', b), 201);
});
