import * as Crypto from 'expo-crypto';

import { isCurrencyCode, type CurrencyCode } from '../domain/money/currency';
import type {
  Account,
  AppNotification,
  Budget,
  BudgetAllocation,
  Category,
  RecurringBill,
  SavingsContribution,
  SavingsGoal,
  Transaction,
} from '../domain/models';
import { notifyDataChanged } from './changes';
import type { SqlDriver, SqlValue } from './db/driver';

/**
 * Column mapping between camelCase entities and the snake_case SQLite / Postgres rows. One spec per synced table;
 * the sync service uses the same specs, so a column added here is pushed and pulled automatically.
 */
type ColType = 'text' | 'textNull' | 'int' | 'bool' | 'currency' | 'month';
type Columns<T> = { [K in keyof T]-?: readonly [column: string, type: ColType] };

export interface TableSpec<T extends { id: string }> {
  /** Same name locally and in Postgres. */
  name: SyncTable;
  columns: Columns<T>;
}

export const SYNC_TABLES = [
  'accounts',
  'categories',
  'recurring_bills',
  'transactions',
  'budgets',
  'budget_allocations',
  'savings_goals',
  'savings_contributions',
  'notifications',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

const base = {
  id: ['id', 'text'],
  createdAt: ['created_at', 'text'],
  updatedAt: ['updated_at', 'text'],
} as const;

export const accountsSpec: TableSpec<Account> = {
  name: 'accounts',
  columns: {
    ...base,
    name: ['name', 'text'],
    kind: ['kind', 'text'],
    currency: ['currency', 'currency'],
    openingBalanceMinor: ['opening_balance_minor', 'int'],
    archived: ['archived', 'bool'],
  },
};

export const categoriesSpec: TableSpec<Category> = {
  name: 'categories',
  columns: {
    ...base,
    name: ['name', 'text'],
    kind: ['kind', 'text'],
    icon: ['icon', 'text'],
    color: ['color', 'text'],
  },
};

export const transactionsSpec: TableSpec<Transaction> = {
  name: 'transactions',
  columns: {
    ...base,
    accountId: ['account_id', 'text'],
    categoryId: ['category_id', 'textNull'],
    kind: ['kind', 'text'],
    amountMinor: ['amount_minor', 'int'],
    currency: ['currency', 'currency'],
    occurredOn: ['occurred_on', 'text'],
    description: ['description', 'text'],
    note: ['note', 'text'],
    recurringBillId: ['recurring_bill_id', 'textNull'],
  },
};

export const budgetsSpec: TableSpec<Budget> = {
  name: 'budgets',
  columns: { ...base, month: ['month', 'month'], currency: ['currency', 'currency'], name: ['name', 'text'] },
};

export const allocationsSpec: TableSpec<BudgetAllocation> = {
  name: 'budget_allocations',
  columns: {
    ...base,
    budgetId: ['budget_id', 'text'],
    categoryId: ['category_id', 'text'],
    limitMinor: ['limit_minor', 'int'],
  },
};

export const goalsSpec: TableSpec<SavingsGoal> = {
  name: 'savings_goals',
  columns: {
    ...base,
    name: ['name', 'text'],
    targetMinor: ['target_minor', 'int'],
    currency: ['currency', 'currency'],
    targetDate: ['target_date', 'textNull'],
    icon: ['icon', 'text'],
    color: ['color', 'text'],
    archived: ['archived', 'bool'],
  },
};

export const contributionsSpec: TableSpec<SavingsContribution> = {
  name: 'savings_contributions',
  columns: {
    ...base,
    goalId: ['goal_id', 'text'],
    amountMinor: ['amount_minor', 'int'],
    contributedOn: ['contributed_on', 'text'],
    note: ['note', 'text'],
  },
};

export const billsSpec: TableSpec<RecurringBill> = {
  name: 'recurring_bills',
  columns: {
    ...base,
    name: ['name', 'text'],
    amountMinor: ['amount_minor', 'int'],
    currency: ['currency', 'currency'],
    accountId: ['account_id', 'textNull'],
    categoryId: ['category_id', 'textNull'],
    frequency: ['frequency', 'text'],
    interval: ['interval', 'int'],
    anchorDate: ['anchor_date', 'text'],
    nextDueOn: ['next_due_on', 'text'],
    endOn: ['end_on', 'textNull'],
    remindDaysBefore: ['remind_days_before', 'int'],
    isSubscription: ['is_subscription', 'bool'],
    active: ['active', 'bool'],
  },
};

export const notificationsSpec: TableSpec<AppNotification> = {
  name: 'notifications',
  columns: {
    ...base,
    kind: ['kind', 'text'],
    title: ['title', 'text'],
    body: ['body', 'text'],
    relatedId: ['related_id', 'textNull'],
    scheduledFor: ['scheduled_for', 'text'],
    readAt: ['read_at', 'textNull'],
  },
};

export const SPECS: Record<SyncTable, TableSpec<{ id: string }>> = {
  accounts: accountsSpec,
  categories: categoriesSpec,
  recurring_bills: billsSpec,
  transactions: transactionsSpec,
  budgets: budgetsSpec,
  budget_allocations: allocationsSpec,
  savings_goals: goalsSpec,
  savings_contributions: contributionsSpec,
  notifications: notificationsSpec,
} as unknown as Record<SyncTable, TableSpec<{ id: string }>>;

type Row = Record<string, SqlValue>;

function decode(type: ColType, value: SqlValue): unknown {
  switch (type) {
    case 'text':
      return value === null ? '' : String(value);
    case 'textNull':
      return value === null ? null : String(value);
    case 'int':
      return Number(value);
    case 'bool':
      return value === 1 || value === '1' || (value as unknown) === true;
    case 'currency': {
      const s = String(value);
      if (!isCurrencyCode(s)) throw new Error(`Unknown currency in row: ${s}`);
      return s as CurrencyCode;
    }
    case 'month':
      return String(value).slice(0, 7);
  }
}

function encode(type: ColType, value: unknown): SqlValue {
  switch (type) {
    case 'bool':
      return value ? 1 : 0;
    case 'int':
      return Number(value);
    case 'month':
      return `${String(value).slice(0, 7)}-01`;
    case 'textNull':
      return value === null || value === undefined ? null : String(value);
    default:
      return String(value);
  }
}

export function fromRow<T extends { id: string }>(spec: TableSpec<T>, row: Row): T {
  const out: Record<string, unknown> = {};
  for (const [field, [col, type]] of Object.entries(spec.columns) as [string, readonly [string, ColType]][]) {
    out[field] = decode(type, row[col] ?? null);
  }
  return out as T;
}

export function toRow<T extends { id: string }>(spec: TableSpec<T>, entity: T): Row {
  const out: Row = {};
  for (const [field, [col, type]] of Object.entries(spec.columns) as [string, readonly [string, ColType]][]) {
    out[col] = encode(type, (entity as Record<string, unknown>)[field]);
  }
  return out;
}

export function newId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Queues a row for push. Called inside the same transaction as the write. */
export async function enqueue(db: SqlDriver, table: SyncTable | 'preferences', id: string): Promise<void> {
  await db.run('INSERT INTO outbox (table_name, row_id, created_at) VALUES (?, ?, ?)', [table, id, nowIso()]);
}

/** Inserts or replaces a full row and queues it. */
export async function putRow<T extends { id: string }>(db: SqlDriver, spec: TableSpec<T>, entity: T): Promise<void> {
  const row = toRow(spec, entity);
  const cols = Object.keys(row);
  // Column names come from our own specs, never from input.
  await db.run(
    `INSERT INTO ${spec.name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${cols
       .filter((c) => c !== 'id' && c !== 'created_at')
       .map((c) => `${c} = excluded.${c}`)
       .join(', ')}`,
    cols.map((c) => row[c]!),
  );
  await enqueue(db, spec.name, entity.id);
}

export async function softDeleteRow(db: SqlDriver, spec: TableSpec<{ id: string }>, id: string): Promise<void> {
  const now = nowIso();
  await db.run(`UPDATE ${spec.name} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, [
    now,
    now,
    id,
  ]);
  await enqueue(db, spec.name, id);
}

export async function getRow<T extends { id: string }>(
  db: SqlDriver,
  spec: TableSpec<T>,
  id: string,
): Promise<T | null> {
  const row = await db.first<Row>(`SELECT * FROM ${spec.name} WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? fromRow(spec, row) : null;
}

export async function listRows<T extends { id: string }>(
  db: SqlDriver,
  spec: TableSpec<T>,
  where = '1 = 1',
  params: readonly SqlValue[] = [],
  order = 'created_at ASC',
): Promise<T[]> {
  const rows = await db.all<Row>(
    `SELECT * FROM ${spec.name} WHERE deleted_at IS NULL AND (${where}) ORDER BY ${order}`,
    params,
  );
  return rows.map((r) => fromRow(spec, r));
}

/** Runs a write in one transaction, then tells screens to refresh. */
export async function write<T>(db: SqlDriver, fn: () => Promise<T>): Promise<T> {
  const result = await db.transaction(fn);
  notifyDataChanged('local');
  return result;
}

/** Thrown for input the user can fix; `code` maps to an i18n key under `errors.*`. */
export class ValidationError extends Error {
  constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
