import type { IsoDate } from '../../domain/dates';
import type { CurrencyCode } from '../../domain/money/currency';
import type { Transaction, TxKind } from '../../domain/models';
import type { SqlDriver, SqlValue } from '../db/driver';
import {
  getRow,
  listRows,
  newId,
  nowIso,
  putRow,
  softDeleteRow,
  transactionsSpec,
  ValidationError,
  write,
} from '../tables';
import { getAccount, getCategory, requireAmount, requireDate, requireText } from './core';

export interface TransactionInput {
  accountId: string;
  categoryId: string | null;
  kind: TxKind;
  amountMinor: number;
  occurredOn: IsoDate;
  description: string;
  note: string;
}

export interface TransactionFilter {
  kind?: TxKind;
  currency?: CurrencyCode;
  accountId?: string;
  categoryId?: string;
  from?: IsoDate;
  to?: IsoDate;
  /** Matches description and note, case-insensitive. */
  search?: string;
  limit?: number;
}

/** Same checks as the Postgres trigger transactions_check_consistency: currency from the account, kinds match. */
async function validate(
  db: SqlDriver,
  input: TransactionInput,
): Promise<{ currency: CurrencyCode; clean: TransactionInput }> {
  requireAmount(input.amountMinor);
  requireDate(input.occurredOn);
  const account = await getAccount(db, input.accountId);
  if (!account) throw new ValidationError('account');
  if (input.categoryId) {
    const category = await getCategory(db, input.categoryId);
    if (!category || category.kind !== input.kind) throw new ValidationError('category');
  }
  return {
    currency: account.currency,
    clean: {
      ...input,
      description: requireText(input.description, 120, 'description'),
      note: requireText(input.note, 1000, 'note'),
    },
  };
}

export function createTransaction(
  db: SqlDriver,
  input: TransactionInput,
  extra: { recurringBillId?: string | null } = {},
): Promise<Transaction> {
  return write(db, async () => {
    const { currency, clean } = await validate(db, input);
    const now = nowIso();
    const tx: Transaction = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      ...clean,
      currency,
      recurringBillId: extra.recurringBillId ?? null,
    };
    await putRow(db, transactionsSpec, tx);
    return tx;
  });
}

export function updateTransaction(db: SqlDriver, id: string, input: TransactionInput): Promise<Transaction> {
  return write(db, async () => {
    const current = await getRow(db, transactionsSpec, id);
    if (!current) throw new ValidationError('notFound');
    const { currency, clean } = await validate(db, input);
    const next: Transaction = { ...current, ...clean, currency, updatedAt: nowIso() };
    await putRow(db, transactionsSpec, next);
    return next;
  });
}

export function deleteTransaction(db: SqlDriver, id: string): Promise<void> {
  return write(db, () => softDeleteRow(db, transactionsSpec, id));
}

/** Undo for a delete: brings the row back (and pushes it again). */
export function restoreTransaction(db: SqlDriver, tx: Transaction): Promise<void> {
  return write(db, async () => {
    await db.run('UPDATE transactions SET deleted_at = NULL WHERE id = ?', [tx.id]);
    await putRow(db, transactionsSpec, { ...tx, updatedAt: nowIso() });
  });
}

export function getTransaction(db: SqlDriver, id: string): Promise<Transaction | null> {
  return getRow(db, transactionsSpec, id);
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Newest first. All filters are bound parameters. */
export function listTransactions(db: SqlDriver, f: TransactionFilter = {}): Promise<Transaction[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  const add = (sql: string, ...values: SqlValue[]) => {
    where.push(sql);
    params.push(...values);
  };
  if (f.kind) add('kind = ?', f.kind);
  if (f.currency) add('currency = ?', f.currency);
  if (f.accountId) add('account_id = ?', f.accountId);
  if (f.categoryId) add('category_id = ?', f.categoryId);
  if (f.from) add('occurred_on >= ?', f.from);
  if (f.to) add('occurred_on <= ?', f.to);
  const q = f.search?.trim();
  if (q) {
    const pattern = `%${escapeLike(q.toLowerCase())}%`;
    add("(lower(description) LIKE ? ESCAPE '\\' OR lower(note) LIKE ? ESCAPE '\\')", pattern, pattern);
  }
  const limit = f.limit && Number.isInteger(f.limit) && f.limit > 0 ? ` LIMIT ${Math.min(f.limit, 5000)}` : '';
  return listRows(
    db,
    transactionsSpec,
    where.length ? where.join(' AND ') : '1 = 1',
    params,
    `occurred_on DESC, created_at DESC${limit}`,
  );
}

/** Currencies the user actually uses (accounts), primary first. */
export async function usedCurrencies(db: SqlDriver, primary: CurrencyCode): Promise<CurrencyCode[]> {
  const rows = await db.all<{ currency: CurrencyCode }>(
    'SELECT DISTINCT currency FROM accounts WHERE deleted_at IS NULL AND archived = 0',
  );
  const list = rows.map((r) => r.currency);
  return [primary, ...list.filter((c) => c !== primary)];
}
