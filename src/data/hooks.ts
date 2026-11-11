import { useCallback } from 'react';

import type { Account, Category } from '../domain/models';
import { useDatabase } from './DatabaseProvider';
import type { SqlDriver } from './db/driver';
import { categoryMap, listAccounts } from './repos/core';
import { useQuery } from './useQuery';

/** The open database (screens render only after it is ready, see app/_layout). */
export function useDb(): SqlDriver {
  const state = useDatabase();
  if (state.status !== 'ready') throw new Error('Database is not ready');
  return state.db;
}

/**
 * Runs a read against SQLite and re-runs it after every local write or sync pull, and when `deps` change.
 * `deps` are the values the query closes over; keep them primitives (strings, numbers, booleans, null).
 */
export function useDbQuery<T>(
  query: (db: SqlDriver) => Promise<T>,
  deps: readonly (string | number | boolean | null | undefined)[],
  opts?: { keepPrevious?: boolean },
) {
  const key = JSON.stringify(deps);
  // The key stands in for deps (re-create the query only when they change).
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const q = useCallback(query, [key]);
  return useQuery(q, opts);
}

export interface Lookups {
  categories: Map<string, Category>;
  accounts: Map<string, Account>;
}

/** Categories (including deleted ones, for old rows) and accounts by id. */
export function useLookups() {
  return useDbQuery<Lookups>(async (db) => {
    const [categories, accounts] = await Promise.all([categoryMap(db), listAccounts(db, { includeArchived: true })]);
    return { categories, accounts: new Map(accounts.map((a) => [a.id, a])) };
  }, []);
}
