import { isIsoDate } from '../../domain/dates';
import { MAX_AMOUNT_MINOR, type CurrencyCode } from '../../domain/money/currency';
import type { Account, AccountKind, Category, Preferences, TxKind } from '../../domain/models';
import type { SqlDriver } from '../db/driver';
import {
  accountsSpec,
  categoriesSpec,
  enqueue,
  fromRow,
  getRow,
  listRows,
  newId,
  nowIso,
  putRow,
  softDeleteRow,
  ValidationError,
  write,
} from '../tables';

// ---------------------------------------------------------------------------------------------------------------
// Validation helpers shared by every repository (same limits as the Postgres CHECK constraints)
// ---------------------------------------------------------------------------------------------------------------
export function requireAmount(amountMinor: number, { allowZero = false } = {}): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < (allowZero ? 0 : 1) || amountMinor > MAX_AMOUNT_MINOR) {
    throw new ValidationError('amount');
  }
}

export function requireDate(date: string, code = 'date'): void {
  if (!isIsoDate(date)) throw new ValidationError(code);
}

export function requireText(value: string, max: number, code: string, { min = 0 } = {}): string {
  const v = value.trim();
  if (v.length < min || v.length > max) throw new ValidationError(code);
  return v;
}

// ---------------------------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------------------------
export interface AccountInput {
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  openingBalanceMinor: number;
}

export interface AccountWithBalance extends Account {
  balanceMinor: number;
}

export function listAccounts(db: SqlDriver, { includeArchived = false } = {}): Promise<Account[]> {
  return listRows(db, accountsSpec, includeArchived ? '1 = 1' : 'archived = 0', [], 'created_at ASC');
}

export function getAccount(db: SqlDriver, id: string): Promise<Account | null> {
  return getRow(db, accountsSpec, id);
}

/** Opening balance + income - expenses, per account, in the account's own currency. */
export async function listAccountBalances(db: SqlDriver): Promise<AccountWithBalance[]> {
  const accounts = await listAccounts(db);
  const sums = await db.all<{ account_id: string; net: number }>(
    `SELECT account_id, SUM(CASE WHEN kind = 'income' THEN amount_minor ELSE -amount_minor END) AS net
     FROM transactions WHERE deleted_at IS NULL GROUP BY account_id`,
  );
  const net = new Map(sums.map((s) => [s.account_id, Number(s.net)]));
  return accounts.map((a) => ({ ...a, balanceMinor: a.openingBalanceMinor + (net.get(a.id) ?? 0) }));
}

export function createAccount(db: SqlDriver, input: AccountInput): Promise<Account> {
  const name = requireText(input.name, 60, 'name', { min: 1 });
  if (!Number.isSafeInteger(input.openingBalanceMinor) || Math.abs(input.openingBalanceMinor) > MAX_AMOUNT_MINOR) {
    throw new ValidationError('amount');
  }
  const now = nowIso();
  const account: Account = { id: newId(), createdAt: now, updatedAt: now, archived: false, ...input, name };
  return write(db, async () => {
    await putRow(db, accountsSpec, account);
    return account;
  });
}

export async function updateAccount(
  db: SqlDriver,
  id: string,
  patch: Partial<Pick<Account, 'name' | 'kind' | 'archived' | 'openingBalanceMinor'>>,
): Promise<Account> {
  return write(db, async () => {
    const current = await getAccount(db, id);
    if (!current) throw new ValidationError('notFound');
    const next: Account = {
      ...current,
      ...patch,
      name: patch.name !== undefined ? requireText(patch.name, 60, 'name', { min: 1 }) : current.name,
      updatedAt: nowIso(),
    };
    await putRow(db, accountsSpec, next);
    return next;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------------------------------------------
export function listCategories(db: SqlDriver, kind?: TxKind): Promise<Category[]> {
  return kind
    ? listRows(db, categoriesSpec, 'kind = ?', [kind], 'name COLLATE NOCASE ASC')
    : listRows(db, categoriesSpec, '1 = 1', [], 'kind DESC, name COLLATE NOCASE ASC');
}

export function getCategory(db: SqlDriver, id: string): Promise<Category | null> {
  return getRow(db, categoriesSpec, id);
}

export async function categoryMap(db: SqlDriver): Promise<Map<string, Category>> {
  // Include deleted categories so old transactions still show their name.
  const rows = await db.all<Record<string, string>>('SELECT * FROM categories');
  return new Map(rows.map((r) => [r.id!, fromRow(categoriesSpec, r)]));
}

export function createCategory(
  db: SqlDriver,
  input: Pick<Category, 'name' | 'kind' | 'icon' | 'color'>,
): Promise<Category> {
  const name = requireText(input.name, 40, 'name', { min: 1 });
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.color)) throw new ValidationError('color');
  const now = nowIso();
  const category: Category = { id: newId(), createdAt: now, updatedAt: now, ...input, name };
  return write(db, async () => {
    await putRow(db, categoriesSpec, category);
    return category;
  });
}

export function deleteCategory(db: SqlDriver, id: string): Promise<void> {
  return write(db, () => softDeleteRow(db, categoriesSpec, id));
}

// ---------------------------------------------------------------------------------------------------------------
// Preferences (one local row, synced to profiles + user_preferences) and meta key/values
// ---------------------------------------------------------------------------------------------------------------
type PrefRow = {
  display_name: string;
  primary_currency: CurrencyCode;
  locale: 'en' | 'fr';
  theme: Preferences['theme'];
  notify_bills: number;
  notify_budgets: number;
  bill_reminder_days: number;
  hide_balances: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  displayName: '',
  primaryCurrency: 'CAD',
  locale: 'en',
  theme: 'system',
  notifyBills: true,
  notifyBudgets: true,
  billReminderDays: 2,
  hideBalances: false,
};

export async function getPreferences(db: SqlDriver): Promise<Preferences> {
  const r = await db.first<PrefRow>('SELECT * FROM preferences WHERE id = 1');
  if (!r) return DEFAULT_PREFERENCES;
  return {
    displayName: r.display_name,
    primaryCurrency: r.primary_currency,
    locale: r.locale,
    theme: r.theme,
    notifyBills: r.notify_bills === 1,
    notifyBudgets: r.notify_budgets === 1,
    billReminderDays: r.bill_reminder_days,
    hideBalances: r.hide_balances === 1,
  };
}

export async function updatePreferences(db: SqlDriver, patch: Partial<Preferences>): Promise<Preferences> {
  return write(db, async () => {
    const next = { ...(await getPreferences(db)), ...patch };
    next.displayName = requireText(next.displayName, 80, 'name');
    if (!Number.isInteger(next.billReminderDays) || next.billReminderDays < 0 || next.billReminderDays > 14) {
      throw new ValidationError('reminderDays');
    }
    await db.run(
      `INSERT INTO preferences (id, display_name, primary_currency, locale, theme, notify_bills, notify_budgets,
         bill_reminder_days, hide_balances, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, primary_currency = excluded.primary_currency,
         locale = excluded.locale, theme = excluded.theme, notify_bills = excluded.notify_bills,
         notify_budgets = excluded.notify_budgets, bill_reminder_days = excluded.bill_reminder_days,
         hide_balances = excluded.hide_balances, updated_at = excluded.updated_at`,
      [
        next.displayName,
        next.primaryCurrency,
        next.locale,
        next.theme,
        next.notifyBills ? 1 : 0,
        next.notifyBudgets ? 1 : 0,
        next.billReminderDays,
        next.hideBalances ? 1 : 0,
        nowIso(),
      ],
    );
    await enqueue(db, 'preferences', 'me');
    return next;
  });
}

export async function getMeta(db: SqlDriver, key: string): Promise<string | null> {
  const r = await db.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return r?.value ?? null;
}

export async function setMeta(db: SqlDriver, key: string, value: string | null): Promise<void> {
  if (value === null) await db.run('DELETE FROM meta WHERE key = ?', [key]);
  else
    await db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      value,
    ]);
}

/** Removes every local row (sign-out, account switch, "reset demo data"). */
export async function wipeLocalData(db: SqlDriver, { keepMeta = [] as string[] } = {}): Promise<void> {
  await write(db, async () => {
    for (const t of [
      'outbox',
      'import_batch_items',
      'import_batches',
      'import_profiles',
      'category_rules',
      'notifications',
      'savings_contributions',
      'savings_goals',
      'budget_allocations',
      'budgets',
      'transactions',
      'recurring_bills',
      'categories',
      'accounts',
      'preferences',
    ]) {
      await db.run(`DELETE FROM ${t}`);
    }
    if (keepMeta.length) {
      await db.run(`DELETE FROM meta WHERE key NOT IN (${keepMeta.map(() => '?').join(', ')})`, keepMeta);
    } else {
      await db.run('DELETE FROM meta');
    }
  });
}
