import { notifyDataChanged } from './changes';
import type { SqlDriver, SqlValue } from './db/driver';
import { getMeta, setMeta } from './repos/core';
import { SPECS, SYNC_TABLES, type SyncTable } from './tables';

/**
 * Offline-first sync with Supabase.
 * - Push: every local write queued a row in `outbox` (same transaction). Entries are pushed in order as upserts of
 *   the row's current state (soft deletes are tombstone upserts). The server re-checks everything with RLS and
 *   triggers; a row it rejects for good (constraint / permission) is dropped and counted, never retried forever.
 * - Pull: per table, rows with updated_at after the cursor (minus an overlap, because now() is the transaction start
 *   time) are written locally, except rows that still have unpushed local changes (local wins until pushed).
 * The remote side is an interface so tests can use a fake; src/services/supabaseRemote.ts wraps supabase-js.
 */
export type RemoteRow = Record<string, unknown>;

export interface RemoteError extends Error {
  /** Postgres SQLSTATE when the server rejected the data (e.g. 23514), undefined for network errors. */
  code?: string;
}

export interface Remote {
  upsert(table: SyncTable, rows: RemoteRow[]): Promise<void>;
  /** Rows with updated_at > since (all rows when null), oldest first, at most `limit`. */
  pull(table: SyncTable, since: string | null, limit: number): Promise<RemoteRow[]>;
  savePreferences(prefs: RemoteRow, displayName: string): Promise<void>;
  loadPreferences(): Promise<{ prefs: RemoteRow | null; displayName: string | null }>;
}

const PUSH_BATCH = 200;
const PULL_PAGE = 500;
const OVERLAP_MS = 2 * 60 * 1000;

const BOOL_COLUMNS = new Set(['archived', 'is_subscription', 'active']);
const PREF_BOOL_COLUMNS = ['notify_bills', 'notify_budgets', 'hide_balances'];

function isPermanent(error: unknown): boolean {
  const code = (error as RemoteError)?.code;
  return (
    typeof code === 'string' && (code.startsWith('22') || code.startsWith('23') || code === '42501' || code === 'P0001')
  );
}

async function localRow(db: SqlDriver, table: SyncTable, id: string): Promise<RemoteRow | null> {
  const row = await db.first<Record<string, SqlValue>>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!row) return null;
  const out: RemoteRow = {};
  for (const [k, v] of Object.entries(row)) out[k] = BOOL_COLUMNS.has(k) ? v === 1 : v;
  return out;
}

export interface PushResult {
  pushed: number;
  rejected: number;
}

export async function pushOutbox(db: SqlDriver, remote: Remote, userId: string): Promise<PushResult> {
  let pushed = 0;
  let rejected = 0;
  for (;;) {
    const entries = await db.all<{ seq: number; table_name: string; row_id: string }>(
      'SELECT seq, table_name, row_id FROM outbox ORDER BY seq ASC LIMIT ?',
      [PUSH_BATCH],
    );
    if (entries.length === 0) break;
    // Consecutive entries for the same table go in one request, keeping the overall order.
    let i = 0;
    while (i < entries.length) {
      const table = entries[i]!.table_name;
      let j = i;
      while (j < entries.length && entries[j]!.table_name === table) j++;
      const group = entries.slice(i, j);
      const lastSeq = group[group.length - 1]!.seq;

      if (table === 'preferences') {
        const p = await db.first<Record<string, SqlValue>>('SELECT * FROM preferences WHERE id = 1');
        if (p) {
          const prefs: RemoteRow = {
            user_id: userId,
            primary_currency: p.primary_currency,
            locale: p.locale,
            theme: p.theme,
            bill_reminder_days: p.bill_reminder_days,
          };
          for (const c of PREF_BOOL_COLUMNS) prefs[c] = p[c] === 1;
          await remote.savePreferences(prefs, String(p.display_name ?? ''));
        }
        pushed += group.length;
      } else {
        const ids = [...new Set(group.map((e) => e.row_id))];
        const rows: RemoteRow[] = [];
        for (const id of ids) {
          const row = await localRow(db, table as SyncTable, id);
          if (row) rows.push({ ...row, user_id: userId });
        }
        try {
          if (rows.length) await remote.upsert(table as SyncTable, rows);
          pushed += rows.length;
        } catch (error) {
          if (!isPermanent(error)) throw error;
          // Retry one by one so a single bad row does not block the others.
          for (const row of rows) {
            try {
              await remote.upsert(table as SyncTable, [row]);
              pushed += 1;
            } catch (e) {
              if (!isPermanent(e)) throw e;
              rejected += 1;
            }
          }
        }
      }
      await db.run('DELETE FROM outbox WHERE seq <= ?', [lastSeq]);
      i = j;
    }
  }
  if (rejected) {
    const prev = Number((await getMeta(db, 'sync:rejected')) ?? 0);
    await setMeta(db, 'sync:rejected', String(prev + rejected));
  }
  return { pushed, rejected };
}

export async function pullChanges(db: SqlDriver, remote: Remote): Promise<number> {
  let applied = 0;
  for (const table of SYNC_TABLES) {
    const cursorKey = `pull:${table}`;
    let cursor = await getMeta(db, cursorKey);
    for (;;) {
      const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
      const rows = await remote.pull(table, since, PULL_PAGE);
      if (rows.length === 0) break;
      const columns = Object.values(SPECS[table].columns)
        .map(([c]) => c)
        .concat('deleted_at');
      let maxUpdated = cursor;
      await db.transaction(async () => {
        for (const r of rows) {
          const id = String(r.id);
          const pending = await db.first('SELECT 1 AS x FROM outbox WHERE table_name = ? AND row_id = ? LIMIT 1', [
            table,
            id,
          ]);
          const updated = String(r.updated_at);
          if (!maxUpdated || updated > maxUpdated) maxUpdated = updated;
          if (pending) continue;
          const values = columns.map((c) => {
            const v = r[c];
            if (typeof v === 'boolean') return v ? 1 : 0;
            return v === undefined ? null : (v as SqlValue);
          });
          await db.run(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
             ON CONFLICT(id) DO UPDATE SET ${columns
               .filter((c) => c !== 'id')
               .map((c) => `${c} = excluded.${c}`)
               .join(', ')}`,
            values,
          );
          applied += 1;
        }
        if (maxUpdated) await setMeta(db, cursorKey, maxUpdated);
      });
      // A full page with no newer cursor would loop forever; the overlap makes progress only when time moves on.
      if (rows.length < PULL_PAGE || maxUpdated === cursor) break;
      cursor = maxUpdated;
    }
  }
  if (applied) notifyDataChanged('sync');
  return applied;
}

/** Applies the server's preferences unless local ones are waiting to be pushed. */
export async function pullPreferences(db: SqlDriver, remote: Remote): Promise<void> {
  const pending = await db.first("SELECT 1 AS x FROM outbox WHERE table_name = 'preferences' LIMIT 1");
  if (pending) return;
  const { prefs, displayName } = await remote.loadPreferences();
  if (!prefs) return;
  await db.run(
    `INSERT INTO preferences (id, display_name, primary_currency, locale, theme, notify_bills, notify_budgets,
       bill_reminder_days, hide_balances, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, primary_currency = excluded.primary_currency,
       locale = excluded.locale, theme = excluded.theme, notify_bills = excluded.notify_bills,
       notify_budgets = excluded.notify_budgets, bill_reminder_days = excluded.bill_reminder_days,
       hide_balances = excluded.hide_balances, updated_at = excluded.updated_at`,
    [
      displayName ?? '',
      String(prefs.primary_currency ?? 'CAD'),
      String(prefs.locale ?? 'en'),
      String(prefs.theme ?? 'system'),
      prefs.notify_bills === false ? 0 : 1,
      prefs.notify_budgets === false ? 0 : 1,
      Number(prefs.bill_reminder_days ?? 2),
      prefs.hide_balances === true ? 1 : 0,
      String(prefs.updated_at ?? new Date().toISOString()),
    ],
  );
  notifyDataChanged('sync');
}

export async function syncOnce(
  db: SqlDriver,
  remote: Remote,
  userId: string,
): Promise<PushResult & { pulled: number }> {
  const push = await pushOutbox(db, remote, userId);
  await pullPreferences(db, remote);
  const pulled = await pullChanges(db, remote);
  await setMeta(db, 'sync:last', new Date().toISOString());
  return { ...push, pulled };
}
