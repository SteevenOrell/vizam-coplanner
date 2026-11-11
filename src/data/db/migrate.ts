import type { SqlDriver } from './driver';
import { migration001 } from './migrations/001_initial';
import { migration002 } from './migrations/002_currencies_import';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  /**
   * Table rebuilds (SQLite cannot alter CHECK constraints) must run with foreign keys off, which only takes effect
   * outside a transaction. The runner turns them off around the migration and verifies with foreign_key_check.
   */
  rebuildsTables?: boolean;
}

/** Ordered list; versions must be 1, 2, 3, ... with no gaps. */
export const migrations: readonly Migration[] = [
  { version: 1, name: '001_initial', sql: migration001 },
  { version: 2, name: '002_currencies_import', sql: migration002, rebuildsTables: true },
];

export async function getSchemaVersion(db: SqlDriver): Promise<number> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applies pending migrations in order, each in its own transaction together with the `user_version` bump, so a
 * failed migration leaves the database at the previous version. Returns the versions that were applied.
 */
export async function migrate(db: SqlDriver, list: readonly Migration[] = migrations): Promise<number[]> {
  list.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migration list is not contiguous at ${m.name}`);
  });

  const current = await getSchemaVersion(db);
  if (current > list.length) {
    throw new Error(`Database schema ${current} is newer than this app (${list.length})`);
  }

  const applied: number[] = [];
  for (const m of list) {
    if (m.version <= current) continue;
    if (m.rebuildsTables) await db.exec('PRAGMA foreign_keys = OFF');
    try {
      await db.transaction(async () => {
        await db.exec(m.sql);
        if (m.rebuildsTables) {
          const broken = await db.all('PRAGMA foreign_key_check');
          if (broken.length) throw new Error(`Migration ${m.name} broke ${broken.length} foreign keys`);
        }
        // PRAGMA cannot take bound parameters; the value is an integer from our own constant list.
        await db.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
      });
    } finally {
      if (m.rebuildsTables) await db.exec('PRAGMA foreign_keys = ON');
    }
    applied.push(m.version);
  }
  return applied;
}
