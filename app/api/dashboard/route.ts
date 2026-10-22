import { route, ok } from '@/lib/server/api';
import { dashboard } from '@/lib/server/dashboard';

export const GET = route(async ({ user }) => ok(await dashboard(user)));
