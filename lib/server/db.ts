import 'server-only';

// query() over two drivers: real Postgres via `pg` when a connection string is set (production),
// embedded PGlite otherwise (local development and tests). All tables are prefixed `sp_` so Spendly
// can share a database with other apps safely.

type Row = Record<string, any>;
type Driver = { kind: 'postgres' | 'pglite'; query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>; tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T> };
export type Q = <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]>;

const g = globalThis as unknown as { __spDriver?: Driver; __spReady?: Promise<Driver> | null };

function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_POSTGRES_URL || process.env.DATABASE_DATABASE_URL || '';
}

async function getDriver(): Promise<Driver> {
  if (g.__spDriver) return g.__spDriver;
  const url = connectionString();
  if (url) {
    const pg = await import('pg');
    const Pool = (pg as any).Pool || (pg as any).default.Pool;
    // BIGINT money columns come back as JS numbers (safe far beyond any personal balance)
    const types = (pg as any).types || (pg as any).default.types;
    types.setTypeParser(20, (v: string) => Number(v));
    types.setTypeParser(1700, (v: string) => parseFloat(v)); // NUMERIC (e.g. SUM of BIGINT)
    types.setTypeParser(1082, (v: string) => v); // DATE stays 'YYYY-MM-DD'
    const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false }, max: 3 });
    g.__spDriver = {
      kind: 'postgres',
      query: (t, p) => pool.query(t, p),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const r = await fn(async (t, p) => (await client.query(t, p)).rows);
          await client.query('COMMIT');
          return r;
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      },
    };
  } else {
    if (process.env.VERCEL) throw new Error('DATABASE_URL is not configured. Connect a Postgres database to this deployment.');
    const { PGlite, types } = await import('@electric-sql/pglite');
    const db = new PGlite(process.env.PGLITE_DIR || './.pglite', {
      parsers: { [types.INT8]: (v: string) => Number(v), [types.NUMERIC]: (v: string) => parseFloat(v), [types.DATE]: (v: string) => v },
    });
    await db.waitReady;
    g.__spDriver = {
      kind: 'pglite',
      query: (t, p) => db.query(t, p as any[]) as any,
      tx: (fn) => db.transaction(async (tx) => fn(async (t, p) => (await tx.query(t, p as any[])).rows as any)),
    };
  }
  return g.__spDriver;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sp_users (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE,
     password_hash TEXT,
     currency TEXT NOT NULL DEFAULT 'INR',
     timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
     is_demo BOOLEAN NOT NULL DEFAULT FALSE,
     onboarded BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS sp_sessions (
     id TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES sp_users(id) ON DELETE CASCADE,
     expires_at TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sp_login_attempts (
     key TEXT PRIMARY KEY,
     count INTEGER NOT NULL,
     window_start TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sp_accounts (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES sp_users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('cash','bank','card','wallet','savings')),
     color TEXT NOT NULL,
     opening_balance BIGINT NOT NULL DEFAULT 0,
     archived BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS sp_categories (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES sp_users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
     glyph TEXT NOT NULL,
     color TEXT NOT NULL,
     UNIQUE (user_id, kind, name))`,
  `CREATE TABLE IF NOT EXISTS sp_recurring (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES sp_users(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
     amount BIGINT NOT NULL CHECK (amount > 0),
     account_id INTEGER NOT NULL REFERENCES sp_accounts(id) ON DELETE CASCADE,
     category_id INTEGER REFERENCES sp_categories(id) ON DELETE SET NULL,
     freq TEXT NOT NULL CHECK (freq IN ('daily','weekly','monthly','yearly')),
     interval INTEGER NOT NULL DEFAULT 1 CHECK (interval BETWEEN 1 AND 52),
     start_date DATE NOT NULL,
     end_date DATE,
     next_index INTEGER NOT NULL DEFAULT 0,
     mode TEXT NOT NULL CHECK (mode IN ('auto','bill')),
     remind_days INTEGER NOT NULL DEFAULT 3 CHECK (remind_days BETWEEN 0 AND 30),
     active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS sp_transactions (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES sp_users(id) ON DELETE CASCADE,
     account_id INTEGER NOT NULL REFERENCES sp_accounts(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer')),
     amount BIGINT NOT NULL CHECK (amount > 0),
     category_id INTEGER REFERENCES sp_categories(id) ON DELETE SET NULL,
     to_account_id INTEGER REFERENCES sp_accounts(id) ON DELETE CASCADE,
     occurred_on DATE NOT NULL,
     merchant TEXT,
     note TEXT,
     source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','recurring','bill','receipt','goal')),
     recurring_id INTEGER REFERENCES sp_recurring(id) ON DELETE SET NULL,
     occurrence_index INTEGER,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CHECK ((kind = 'transfer') = (to_account_id IS NOT NULL)),
     CHECK (to_account_id IS NULL OR to_account_id <> account_id))`,
  // idempotent recurring posting: each occurrence of a rule can exist at most once
  `CREATE UNIQUE INDEX IF NOT EXISTS sp_tx_occurrence ON sp_transactions (recurring_id, occurrence_index) WHERE recurring_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS sp_tx_user_date ON sp_transactions (user_id, occurred_on DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS sp_budgets (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES sp_users(id) ON DELETE CASCADE,
     category_id INTEGER NOT NULL REFERENCES sp_categories(id) ON DELETE CASCADE,
     amount BIGINT NOT NULL CHECK (amount > 0),
     UNIQUE (user_id, category_id))`,
  `CREATE TABLE IF NOT EXISTS sp_goals (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES sp_users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     target BIGINT NOT NULL CHECK (target > 0),
     deadline DATE,
     color TEXT NOT NULL,
     glyph TEXT NOT NULL DEFAULT 'star',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS sp_goal_moves (
     id SERIAL PRIMARY KEY,
     goal_id INTEGER NOT NULL REFERENCES sp_goals(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES sp_users(id) ON DELETE CASCADE,
     amount BIGINT NOT NULL CHECK (amount <> 0),
     note TEXT,
     made_on DATE NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
];

async function ready(): Promise<Driver> {
  if (!g.__spReady) {
    g.__spReady = (async () => {
      const d = await getDriver();
      for (const s of SCHEMA) await d.query(s);
      return d;
    })().catch((e) => { g.__spReady = null; throw e; });
  }
  return g.__spReady;
}

export const query: Q = async (text, params = []) => (await (await ready()).query(text, params)).rows as any;
export async function one<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return ((await query<T>(text, params))[0] as T) ?? null;
}
export async function tx<T>(fn: (q: Q) => Promise<T>) { return (await ready()).tx(fn); }
export async function dbKind() { return (await ready()).kind; }
