import type { TxKind } from '../models';
import type { CurrencyCode } from '../money/currency';
import { parseImportAmount } from './amount';
import { parseDateWith } from './dates';
import { dataRowIndexes } from './layout';
import {
  ImportLimitError,
  MAX_DESCRIPTION,
  MAX_IMPORT_ROWS,
  type DraftError,
  type DraftsResult,
  type ImportDraft,
  type ImportMapping,
  type ParsedFile,
} from './types';

/** Trims, replaces control characters and runs of whitespace, caps at 120 characters. */
export function cleanDescription(raw: string): string {
  const s = raw
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.length > MAX_DESCRIPTION ? s.slice(0, MAX_DESCRIPTION).trimEnd() : s;
}

type Money = { kind: TxKind; minor: number } | { error: Exclude<DraftError, 'date'> } | 'zero';

/**
 * Turns the amount cell(s) into a kind and a positive amount.
 * Signed: negative = expense. Split: debit = expense, credit = income. `invertSign` flips both.
 */
function readMoney(
  cells: { amount?: string; debit?: string; credit?: string },
  m: ImportMapping,
  cur: CurrencyCode,
): Money {
  const flip = (k: TxKind): TxKind => (m.invertSign ? (k === 'income' ? 'expense' : 'income') : k);
  if (m.amountMode === 'signed') {
    const r = parseImportAmount(cells.amount ?? '', cur, m.decimalMark);
    if (!r.ok) return { error: r.error === 'empty' ? 'empty' : r.error === 'precision' ? 'precision' : 'amount' };
    if (r.minor === 0) return 'zero';
    return { kind: flip(r.minor < 0 ? 'expense' : 'income'), minor: Math.abs(r.minor) };
  }
  const parts: { kind: TxKind; minor: number }[] = [];
  let empties = 0;
  for (const [cell, kind] of [
    [cells.debit, 'expense'],
    [cells.credit, 'income'],
  ] as const) {
    const r = parseImportAmount(cell ?? '', cur, m.decimalMark);
    if (!r.ok) {
      if (r.error === 'empty') {
        empties++;
        continue;
      }
      return { error: r.error === 'precision' ? 'precision' : 'amount' };
    }
    if (r.minor !== 0) parts.push({ kind, minor: Math.abs(r.minor) });
  }
  if (parts.length === 0) return empties === 2 ? { error: 'empty' } : 'zero';
  if (parts.length > 1) return { error: 'amount' };
  return { kind: flip(parts[0]!.kind), minor: parts[0]!.minor };
}

/**
 * One draft per data row. Rows that are entirely empty, and rows whose amount is zero, are dropped and counted.
 * Throws ImportLimitError when the table has more than MAX_IMPORT_ROWS rows.
 */
export function buildDrafts(file: ParsedFile, mapping: ImportMapping, currency: CurrencyCode): DraftsResult {
  const drafts: ImportDraft[] = [];
  let skippedEmpty = 0;
  let skippedZero = 0;
  let errorCount = 0;
  const idx = dataRowIndexes(file, mapping);
  const cell = (row: string[], col: number | null) => (col === null ? '' : (row[col] ?? ''));

  for (const i of idx) {
    const row = file.rows[i]!;
    if (row.every((c) => c.trim() === '')) {
      skippedEmpty++;
      continue;
    }
    if (drafts.length + skippedZero >= MAX_IMPORT_ROWS) throw new ImportLimitError('tooManyRows');
    const dateText = cell(row, mapping.dateCol);
    const money = readMoney(
      {
        amount: cell(row, mapping.amountCol),
        debit: cell(row, mapping.debitCol),
        credit: cell(row, mapping.creditCol),
      },
      mapping,
      currency,
    );
    if (money === 'zero') {
      skippedZero++;
      continue;
    }
    const occurredOn = dateText.trim() === '' ? null : parseDateWith(dateText, mapping.dateFormat);
    let error: DraftError | null = null;
    if (occurredOn === null) error = 'date';
    else if ('error' in money) error = money.error;
    if (error) errorCount++;
    drafts.push({
      line: file.lines[i]!,
      occurredOn,
      description: cleanDescription(cell(row, mapping.descriptionCol)),
      amountMinor: 'minor' in money ? money.minor : 0,
      kind: 'kind' in money ? money.kind : 'expense',
      error,
    });
  }
  return { drafts, skippedEmpty, skippedZero, errorCount };
}

export interface DraftTotals {
  incomeCount: number;
  incomeMinor: number;
  expenseCount: number;
  expenseMinor: number;
}

/** Sums integer minor units (one currency: the account's). */
export function totalsOf(drafts: readonly Pick<ImportDraft, 'kind' | 'amountMinor'>[]): DraftTotals {
  const t: DraftTotals = { incomeCount: 0, incomeMinor: 0, expenseCount: 0, expenseMinor: 0 };
  for (const d of drafts) {
    if (d.kind === 'income') {
      t.incomeCount++;
      t.incomeMinor += d.amountMinor;
    } else {
      t.expenseCount++;
      t.expenseMinor += d.amountMinor;
    }
  }
  return t;
}
