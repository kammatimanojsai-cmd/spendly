import { route, ok, idParam } from '@/lib/server/api';
import { settleBill } from '@/lib/server/engine';

export const POST = route<{ id: string }>(async ({ user, params }) => ok(await settleBill(user, idParam(params.id), 'skip')));
