import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { currentUser, type User } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message); }
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export const notFound = (what = 'Not found') => new HttpError(404, what);

function zodFields(e: ZodError) {
  const fields: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.join('.') || 'form';
    if (!fields[k]) fields[k] = i.message;
  }
  return fields;
}

type Ctx<P> = { req: Request; params: P; user: User };

/** Authenticated JSON route with uniform errors. Same-origin check blocks cross-site form posts (CSRF). */
export function route<P = Record<string, string>>(fn: (ctx: Ctx<P>) => Promise<Response>, opts: { auth?: boolean } = {}) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const origin = req.headers.get('origin');
        const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
        if (origin && host && new URL(origin).host !== host) throw new HttpError(403, 'Cross-site request blocked.');
      }
      const user = await currentUser();
      if (opts.auth !== false && !user) throw new HttpError(401, 'Please sign in to continue.');
      return await fn({ req, params: (await ctx.params) as P, user: user as User });
    } catch (e: any) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, fields: e.fields }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: 'Please check the highlighted fields.', fields: zodFields(e) }, { status: 400 });
      if (e?.code === '23505') return NextResponse.json({ error: 'That already exists.' }, { status: 409 });
      if (e?.code === '23514' || e?.code === '23503') return NextResponse.json({ error: 'That change is not allowed.' }, { status: 400 });
      console.error('[api]', e);
      return NextResponse.json({ error: 'Something went wrong on our side. Try again in a moment.' }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown = {};
  try { raw = await req.json(); } catch { throw new HttpError(400, 'Send a JSON body.'); }
  return schema.parse(raw);
}

export function idParam(v: string | undefined) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}
