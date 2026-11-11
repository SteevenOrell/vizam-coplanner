import { minorToDecimalString } from './money/format';
import type { Category, Transaction, Account } from './models';

/**
 * RFC 4180 CSV. Text cells that start with = + - @ (or tab / CR) get a leading apostrophe so spreadsheet apps never
 * run them as formulas (CSV injection). Numeric amount cells are produced by us, never from user text.
 */
export function csvCell(value: string | number | null | undefined, { numeric = false } = {}): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (!numeric && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header.map((h) => csvCell(h)), ...rows].map((r) => r.join(',')).join('\r\n') + '\r\n';
}

export const TRANSACTION_CSV_HEADER = [
  'date',
  'type',
  'amount',
  'currency',
  'category',
  'account',
  'description',
  'note',
] as const;

/**
 * One row per transaction. Amounts are exact decimal strings in the transaction's own currency; expenses are
 * negative. There is no converted total column (no exchange-rate policy).
 */
export function transactionsToCsv(
  transactions: readonly Transaction[],
  categories: ReadonlyMap<string, Pick<Category, 'name'>>,
  accounts: ReadonlyMap<string, Pick<Account, 'name'>>,
): string {
  const rows = [...transactions]
    .sort((a, b) =>
      a.occurredOn === b.occurredOn ? a.createdAt.localeCompare(b.createdAt) : a.occurredOn < b.occurredOn ? -1 : 1,
    )
    .map((t) => [
      csvCell(t.occurredOn, { numeric: true }),
      csvCell(t.kind),
      csvCell(minorToDecimalString(t.kind === 'expense' ? -t.amountMinor : t.amountMinor, t.currency), {
        numeric: true,
      }),
      csvCell(t.currency),
      csvCell(t.categoryId ? (categories.get(t.categoryId)?.name ?? '') : ''),
      csvCell(accounts.get(t.accountId)?.name ?? ''),
      csvCell(t.description),
      csvCell(t.note),
    ]);
  return toCsv(TRANSACTION_CSV_HEADER, rows);
}
