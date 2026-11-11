import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { PGlite } from '@electric-sql/pglite';

const root = join(__dirname, '..', '..');

/** Fresh Postgres with the Supabase stub and every migration applied, in file-name order. */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(__dirname, 'supabase-stub.sql'), 'utf8'));
  const dir = join(root, 'supabase', 'migrations');
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
  return db;
}

/** Creates an auth user as the platform would (fires handle_new_user). Runs as the superuser. */
export async function createUser(db: PGlite, id: string, displayName = ''): Promise<void> {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${id.slice(0, 8)}@example.test`,
    JSON.stringify({ display_name: displayName }),
  ]);
}

type Role = 'anon' | 'authenticated';

/**
 * Runs `fn` as an API caller: `authenticated` with the given user id as the JWT subject, or `anon` with no user.
 * Everything runs in a transaction that is rolled back afterwards unless `commit` is set, so tests stay isolated.
 */
export async function as<T>(
  db: PGlite,
  role: Role,
  userId: string | null,
  fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
  { commit = false } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    await tx.exec(`set local role ${role}`);
    const q = async <R>(sql: string, params: unknown[] = []) => (await tx.query<R>(sql, params)).rows;
    const result = await fn(q);
    if (!commit) await tx.rollback();
    return result;
  });
}

/** Expects `promise` to reject with a Postgres error; returns its message. */
export async function pgError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Expected a database error');
}
