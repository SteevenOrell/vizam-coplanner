import type { CurrencyCode } from '../money/currency';
import { detectDecimalMark, parseImportAmount } from './amount';
import { detectDateFormat, type DateDetection } from './dates';
import { DATE_FORMATS, type DateFormat, type ImportMapping, type ParsedFile } from './types';

type Role = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'currency' | 'balance';

/** Lowercase, accents and punctuation removed, single spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ROLE_RULES: readonly [Role, RegExp][] = [
  ['balance', /\b(balance|solde)\b/],
  ['currency', /\b(currency|devise|monnaie)\b/],
  ['debit', /\b(debit|debits|withdrawal|withdrawals|retrait|retraits|money out|paid out|sortie|sorties)\b/],
  ['credit', /\b(credit|credits|deposit|deposits|depot|depots|money in|paid in|entree|entrees)\b/],
  ['amount', /\b(amount|montant|somme|value)\b/],
  ['date', /\b(date|jour|posted)\b/],
  ['description', /\b(description|libelle|detail|details|memo|payee|narrative|merchant|beneficiaire)\b/],
];
const WEAK_DESCRIPTION = /\b(name|nom|label|reference|objet|motif|transaction|operation)\b/;
const SECONDARY_DATE = /\b(valeur|value|posted|posting|comptabilisation|settlement)\b/;

function roleOf(header: string): Role | null {
  const h = normalizeText(header);
  if (h === '') return null;
  for (const [role, re] of ROLE_RULES) if (re.test(h)) return role;
  return WEAK_DESCRIPTION.test(h) ? 'description' : null;
}

function nonEmpty(v: string): boolean {
  return v.trim() !== '';
}

export function headerSignature(cells: readonly string[]): string {
  return cells.map(normalizeText).join('|');
}

/** Rows that belong to the table (after the preamble and the header), with their index in `file.rows`. */
export function dataRowIndexes(file: ParsedFile, mapping: ImportMapping): number[] {
  const out: number[] = [];
  for (let i = mapping.startRow + (mapping.hasHeader ? 1 : 0); i < file.rows.length; i++) out.push(i);
  return out;
}

export function columnValues(file: ParsedFile, mapping: ImportMapping, col: number | null, limit = Infinity): string[] {
  if (col === null) return [];
  const out: string[] = [];
  for (const i of dataRowIndexes(file, mapping)) {
    const v = file.rows[i]![col];
    if (v !== undefined && nonEmpty(v)) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

export function tableWidth(file: ParsedFile, mapping: ImportMapping): number {
  let w = 0;
  for (const i of dataRowIndexes(file, mapping).slice(0, 200)) w = Math.max(w, file.rows[i]!.length);
  if (mapping.hasHeader) w = Math.max(w, file.rows[mapping.startRow]?.length ?? 0);
  return w;
}

/** Date format candidates for the mapped date column (for the live "ambiguous" check). */
export function analyzeDateColumn(file: ParsedFile, mapping: ImportMapping): DateDetection {
  return detectDateFormat(columnValues(file, mapping, mapping.dateCol));
}

export interface LayoutGuess {
  mapping: ImportMapping;
  dates: DateDetection;
  columnCount: number;
}

function findHeaderRow(rows: readonly string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const roles = new Set<Role>();
    for (const cell of rows[i]!) {
      const r = roleOf(cell);
      if (r) roles.add(r);
    }
    const money = roles.has('amount') || roles.has('debit') || roles.has('credit');
    if (roles.size >= 2 && (roles.has('date') || money) && (roles.has('date') || roles.has('description') || money)) {
      return i;
    }
  }
  return -1;
}

function firstTableRow(rows: readonly string[][]): number {
  const widths = new Map<number, number>();
  for (const r of rows.slice(0, 40)) if (r.length >= 2) widths.set(r.length, (widths.get(r.length) ?? 0) + 1);
  let modal = 0;
  let best = 0;
  for (const [w, n] of widths) {
    if (n > best || (n === best && w > modal)) {
      best = n;
      modal = w;
    }
  }
  if (modal === 0) return 0;
  const idx = rows.findIndex((r) => r.length >= modal);
  return idx < 0 ? 0 : idx;
}

/**
 * Guesses where the table starts, which column is which (from English and French headers, then from the values),
 * the date format and the decimal mark. Nothing here is final: the user confirms or changes it.
 */
export function detectLayout(file: ParsedFile, currency: CurrencyCode): LayoutGuess {
  const rows = file.rows;
  const headerAt = findHeaderRow(rows);
  const hasHeader = headerAt >= 0;
  const startRow = hasHeader ? headerAt : firstTableRow(rows);
  const header = hasHeader ? rows[startRow]! : [];

  const mapping: ImportMapping = {
    version: 1,
    startRow,
    hasHeader,
    dateCol: null,
    descriptionCol: null,
    amountMode: 'signed',
    amountCol: null,
    debitCol: null,
    creditCol: null,
    dateFormat: 'iso',
    decimalMark: '.',
    invertSign: false,
    signature: '',
  };
  const roles = header.map(roleOf);
  const colOf = (role: Role, avoid?: RegExp): number | null => {
    const all = roles.flatMap((r, i) => (r === role ? [i] : []));
    const preferred = avoid ? all.find((i) => !avoid.test(normalizeText(header[i]!))) : undefined;
    return preferred ?? all[0] ?? null;
  };
  mapping.dateCol = colOf('date', SECONDARY_DATE);
  mapping.amountCol = colOf('amount');
  mapping.debitCol = colOf('debit');
  mapping.creditCol = colOf('credit');
  // A header that names a strong description beats a weak one ("Type de transaction").
  const strong = header.findIndex((h) => ROLE_RULES.find(([r]) => r === 'description')![1].test(normalizeText(h)));
  mapping.descriptionCol = strong >= 0 ? strong : colOf('description');
  mapping.signature = hasHeader ? headerSignature(header) : '';

  const width = tableWidth(file, mapping);
  const taken = () =>
    new Set(
      [mapping.dateCol, mapping.descriptionCol, mapping.amountCol, mapping.debitCol, mapping.creditCol].filter(
        (c): c is number => c !== null,
      ),
    );
  const ignored = new Set(roles.flatMap((r, i) => (r === 'balance' || r === 'currency' ? [i] : [])));

  // Fill the gaps from the values.
  if (mapping.dateCol === null) {
    for (let c = 0; c < width; c++) {
      if (taken().has(c) || ignored.has(c)) continue;
      if (detectDateFormat(columnValues(file, mapping, c, 200)).format) {
        mapping.dateCol = c;
        break;
      }
    }
  }
  const numeric = (c: number) => {
    const vals = columnValues(file, mapping, c, 200);
    if (vals.length === 0) return false;
    const ok = vals.filter(
      (v) => parseImportAmount(v, currency, '.').ok || parseImportAmount(v, currency, ',').ok,
    ).length;
    return ok / vals.length >= 0.8;
  };
  if (mapping.amountCol === null && mapping.debitCol === null && mapping.creditCol === null) {
    for (let c = 0; c < width; c++) {
      if (taken().has(c) || ignored.has(c) || roles[c] === 'description') continue;
      if (numeric(c)) {
        mapping.amountCol = c;
        break;
      }
    }
  }
  if (mapping.descriptionCol === null) {
    let bestLen = 0;
    for (let c = 0; c < width; c++) {
      if (taken().has(c) || ignored.has(c) || numeric(c)) continue;
      const len = columnValues(file, mapping, c, 100).reduce((n, v) => n + v.length, 0);
      if (len > bestLen) {
        bestLen = len;
        mapping.descriptionCol = c;
      }
    }
  }

  mapping.amountMode =
    mapping.amountCol === null && (mapping.debitCol !== null || mapping.creditCol !== null) ? 'split' : 'signed';
  if (mapping.amountCol !== null && mapping.debitCol !== null && mapping.creditCol !== null) {
    // Both styles named: prefer the separate columns (the single column is usually a net or running figure).
    mapping.amountMode = 'split';
  }
  if (!hasHeader) mapping.signature = `cols:${width}`;

  const amountValues =
    mapping.amountMode === 'split'
      ? [...columnValues(file, mapping, mapping.debitCol), ...columnValues(file, mapping, mapping.creditCol)]
      : columnValues(file, mapping, mapping.amountCol);
  mapping.decimalMark = detectDecimalMark(amountValues, currency);

  const dates = analyzeDateColumn(file, mapping);
  if (dates.format) mapping.dateFormat = dates.format;
  return { mapping, dates, columnCount: width };
}

/** True when a saved mapping still fits this file (its columns exist). */
export function mappingFits(file: ParsedFile, mapping: ImportMapping): boolean {
  const width = Math.max(tableWidth(file, mapping), file.rows[mapping.startRow]?.length ?? 0);
  const cols = [mapping.dateCol, mapping.descriptionCol, mapping.amountCol, mapping.debitCol, mapping.creditCol];
  return mapping.startRow < file.rows.length && cols.every((c) => c === null || c < width);
}

/** Validates JSON from storage. Returns null for anything that is not a usable mapping. */
export function parseMapping(json: string): ImportMapping | null {
  try {
    const m = JSON.parse(json) as Partial<ImportMapping>;
    const col = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 200);
    if (
      !m ||
      m.version !== 1 ||
      !Number.isInteger(m.startRow) ||
      typeof m.hasHeader !== 'boolean' ||
      ![m.dateCol, m.descriptionCol, m.amountCol, m.debitCol, m.creditCol].every(col) ||
      (m.amountMode !== 'signed' && m.amountMode !== 'split') ||
      (m.decimalMark !== '.' && m.decimalMark !== ',') ||
      typeof m.invertSign !== 'boolean' ||
      typeof m.signature !== 'string' ||
      !DATE_FORMATS.includes(m.dateFormat as DateFormat)
    ) {
      return null;
    }
    return m as ImportMapping;
  } catch {
    return null;
  }
}
