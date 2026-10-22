import { route, ok } from '@/lib/server/api';
import { destroySession } from '@/lib/server/auth';

export const POST = route(async () => { await destroySession(); return ok({ ok: true }); }, { auth: false });
