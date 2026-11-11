import { addDays } from '../../domain/dates';
import { detectDuplicates, type DuplicateKind, type ExistingTx } from '../../domain/import/duplicates';
import { parseMapping } from '../../domain/import/layout';
import { MAX_IMPORT_ROWS, type ImportDraft, type ImportMapping } from '../../domain/import/types';
import type { CurrencyCode } from '../../domain/money/currency';
import type { Category, Transaction, TxKind } from '../../domain/models';
import type { SqlDriver } from '../db/driver';
import { newId, nowIso, putRow, softDeleteRow, transactionsSpec, ValidationError, write } from '../tables';
import { getAccount, getCategory, requireAmount, requireDate, requireText } from './core';

/**
 * Bank-file import. Layouts, rules and batches live only on this device (never synced); the imported transactions
 * are ordinary rows written with putRow, so they sync like manual ones.
 */

// ---------------------------------------------------------------------------------------------------------------
// Saved layouts
// ---------------------------------------------------------------------------------------------------------------
export interface ImportProfile {
  id: string;
  accountId: string;
  name: string;
  mapping: ImportMapping;
  updatedAt: string;
}

interface ProfileRow {
  id: string;
  account_id: string;
  name: string;
  mapping: string;
  updated_at: string;
}

function toProfile(r: ProfileRow): ImportProfile | null {
  const mapping = parseMapping(r.mapping);
  return mapping ? { id: r.id, accountId: r.account_id, name: r.name, mapping, updatedAt: r.updated_at } : null;
}

export async function listImportProfiles(db: SqlDriver, accountId: string): Promise<ImportProfile[]> {
  const rows = await db.all<ProfileRow>('SELECT * FROM import_profiles WHERE account_id = ? ORDER BY updated_at DESC', [
    accountId,
  ]);
  return rows.flatMap((r) => toProfile(r) ?? []);
}

/** The layout saved for this account with the same header layout (signature), if any. */
export async function findImportProfile(
  db: SqlDriver,
  accountId: string,
  signature: string,
): Promise<ImportProfile | null> {
  const profiles = await listImportProfiles(db, accountId);
  return profiles.find((p) => p.mapping.signature === signature && signature !== '') ?? null;
}

/** Saves a layout for the account; the same header layout replaces its earlier version. */
export function saveImportProfile(
  db: SqlDriver,
  accountId: string,
  mapping: ImportMapping,
  name = '',
): Promise<ImportProfile> {
  return write(db, async () => {
    if (!(await getAccount(db, accountId))) throw new ValidationError('account');
    if (mapping.signature === '') throw new ValidationError('mapping');
    const label = (name.trim() || mapping.signature.replace(/\|/g, ', ')).slice(0, 60);
    const now = nowIso();
    const existing = await findImportProfile(db, accountId, mapping.signature);
    const id = existing?.id ?? newId();
    if (existing) {
      await db.run('UPDATE import_profiles SET mapping = ?, name = ?, updated_at = ? WHERE id = ?', [
        JSON.stringify(mapping),
        label || existing.name,
        now,
        id,
      ]);
    } else {
      await db.run(
        'INSERT INTO import_profiles (id, account_id, name, mapping, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, accountId, label || 'Layout', JSON.stringify(mapping), now, now],
      );
    }
    return { id, accountId, name: label, mapping, updatedAt: now };
  });
}

export function deleteImportProfile(db: SqlDriver, id: string): Promise<void> {
  return write(db, async () => {
    await db.run('DELETE FROM import_profiles WHERE id = ?', [id]);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Category rules
// ---------------------------------------------------------------------------------------------------------------
export interface CategoryRule {
  id: string;
  pattern: string;
  kind: TxKind;
  categoryId: string;
}

interface RuleRow {
  id: string;
  pattern: string;
  kind: TxKind;
  category_id: string;
}

export async function listCategoryRules(db: SqlDriver): Promise<CategoryRule[]> {
  // Rules pointing at a deleted category are ignored.
  const rows = await db.all<RuleRow>(
    `SELECT r.id, r.pattern, r.kind, r.category_id FROM category_rules r
     JOIN categories c ON c.id = r.category_id AND c.deleted_at IS NULL
     ORDER BY lower(r.pattern) ASC`,
  );
  return rows.map((r) => ({ id: r.id, pattern: r.pattern, kind: r.kind, categoryId: r.category_id }));
}

/** Creates the rule, or re-points the existing rule with the same pattern (case-insensitive) and kind. */
export function upsertCategoryRule(
  db: SqlDriver,
  input: { pattern: string; kind: TxKind; categoryId: string },
): Promise<CategoryRule> {
  return write(db, async () => {
    const pattern = requireText(input.pattern, 60, 'pattern', { min: 2 });
    const category = await getCategory(db, input.categoryId);
    if (!category || category.kind !== input.kind) throw new ValidationError('category');
    const now = nowIso();
    const existing = await db.first<{ id: string }>('SELECT id FROM category_rules WHERE lower(pattern) = ? AND kind = ?', [
      pattern.toLowerCase(),
      input.kind,
    ]);
    const id = existing?.id ?? newId();
    if (existing) {
      await db.run('UPDATE category_rules SET category_id = ?, updated_at = ? WHERE id = ?', [
        input.categoryId,
        now,
        id,
      ]);
    } else {
      await db.run(
        'INSERT INTO category_rules (id, pattern, kind, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, pattern, input.kind, input.categoryId, now, now],
      );
    }
    return { id, pattern, kind: input.kind, categoryId: input.categoryId };
  });
}

export function deleteCategoryRule(db: SqlDriver, id: string): Promise<void> {
  return write(db, async () => {
    await db.run('DELETE FROM category_rules WHERE id = ?', [id]);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------------------------------------------
/** Likely duplicates by draft line: already in this account (same kind and amount, +-1 day, similar text) or in the file. */
export async function findDuplicates(
  db: SqlDriver,
  accountId: string,
  drafts: readonly ImportDraft[],
): Promise<Map<number, DuplicateKind>> {
  const dates = drafts.flatMap((d) => (d.occurredOn && !d.error ? [d.occurredOn] : [])).sort();
  let existing: ExistingTx[] = [];
  if (dates.length > 0) {
    const rows = await db.all<{ kind: TxKind; amount_minor: number; occurred_on: string; description: string }>(
      `SELECT kind, amount_minor, occurred_on, description FROM transactions
       WHERE account_id = ? AND deleted_at IS NULL AND occurred_on >= ? AND occurred_on <= ?`,
      [accountId, addDays(dates[0]!, -1), addDays(dates[dates.length - 1]!, 1)],
    );
    existing = rows.map((r) => ({
      kind: r.kind,
      amountMinor: r.amount_minor,
      occurredOn: r.occurred_on,
      description: r.description,
    }));
  }
  return detectDuplicates(drafts, existing);
}

// ---------------------------------------------------------------------------------------------------------------
// Importing and undoing
// ---------------------------------------------------------------------------------------------------------------
export interface ImportRow {
  occurredOn: string;
  description: string;
  amountMinor: number;
  kind: TxKind;
  categoryId: string | null;
}

/** A ValidationError that says which row (0-based index in the submitted list) is wrong. */
export class ImportRowError extends ValidationError {
  constructor(
    code: string,
    public readonly index: number,
  ) {
    super(code);
    this.name = 'ImportRowError';
  }
}

export interface ImportBatch {
  id: string;
  accountId: string;
  sourceName: string;
  rowCount: number;
  createdAt: string;
}

/**
 * Inserts all rows in one transaction: if any row is invalid nothing is written. Same checks as createTransaction
 * (account exists, currency comes from the account, category kind matches, amount and date valid), but it does not
 * call it: write() transactions must not nest. Records a batch so the whole import can be undone.
 */
export function importTransactions(
  db: SqlDriver,
  accountId: string,
  rows: readonly ImportRow[],
  sourceName: string,
): Promise<{ batchId: string; count: number; currency: CurrencyCode }> {
  return write(db, async () => {
    if (rows.length === 0) throw new ValidationError('empty');
    if (rows.length > MAX_IMPORT_ROWS) throw new ValidationError('tooManyRows');
    const account = await getAccount(db, accountId);
    if (!account) throw new ValidationError('account');

    const categories = new Map<string, Category | null>();
    const batchId = newId();
    const now = nowIso();
    await db.run(
      'INSERT INTO import_batches (id, account_id, source_name, row_count, created_at) VALUES (?, ?, ?, ?, ?)',
      [batchId, accountId, sourceName.trim().slice(0, 120), rows.length, now],
    );
    for (const [index, row] of rows.entries()) {
      try {
        requireAmount(row.amountMinor);
        requireDate(row.occurredOn);
        if (row.kind !== 'income' && row.kind !== 'expense') throw new ValidationError('kind');
        if (row.categoryId) {
          if (!categories.has(row.categoryId)) categories.set(row.categoryId, await getCategory(db, row.categoryId));
          const category = categories.get(row.categoryId);
          if (!category || category.kind !== row.kind) throw new ValidationError('category');
        }
        const tx: Transaction = {
          id: newId(),
          createdAt: now,
          updatedAt: now,
          accountId,
          categoryId: row.categoryId,
          kind: row.kind,
          amountMinor: row.amountMinor,
          currency: account.currency,
          occurredOn: row.occurredOn,
          description: requireText(row.description, 120, 'description'),
          note: '',
          recurringBillId: null,
        };
        await putRow(db, transactionsSpec, tx);
        await db.run('INSERT INTO import_batch_items (batch_id, transaction_id) VALUES (?, ?)', [batchId, tx.id]);
      } catch (e) {
        throw e instanceof ValidationError ? new ImportRowError(e.code, index) : e;
      }
    }
    return { batchId, count: rows.length, currency: account.currency };
  });
}

interface BatchRow {
  id: string;
  account_id: string;
  source_name: string;
  row_count: number;
  created_at: string;
}

/** Newest first. */
export async function listImportBatches(db: SqlDriver, { limit = 10 } = {}): Promise<ImportBatch[]> {
  const rows = await db.all<BatchRow>('SELECT * FROM import_batches ORDER BY created_at DESC, rowid DESC LIMIT ?', [
    Math.max(1, Math.min(100, limit)),
  ]);
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    sourceName: r.source_name,
    rowCount: r.row_count,
    createdAt: r.created_at,
  }));
}

/**
 * Removes everything one import added: the transactions are soft-deleted (so the deletion syncs), then the batch
 * rows are dropped. One transaction. Returns how many transactions were removed.
 */
export function undoImport(db: SqlDriver, batchId: string): Promise<number> {
  return write(db, async () => {
    const batch = await db.first<{ id: string }>('SELECT id FROM import_batches WHERE id = ?', [batchId]);
    if (!batch) throw new ValidationError('notFound');
    const items = await db.all<{ transaction_id: string }>(
      `SELECT i.transaction_id FROM import_batch_items i
       JOIN transactions t ON t.id = i.transaction_id AND t.deleted_at IS NULL
       WHERE i.batch_id = ?`,
      [batchId],
    );
    for (const item of items) await softDeleteRow(db, transactionsSpec, item.transaction_id);
    await db.run('DELETE FROM import_batch_items WHERE batch_id = ?', [batchId]);
    await db.run('DELETE FROM import_batches WHERE id = ?', [batchId]);
    return items.length;
  });
}
