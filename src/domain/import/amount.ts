import { CURRENCIES, MAX_AMOUNT_MINOR, minorUnit, type CurrencyCode } from '../money/currency';
import type { DecimalMark } from './types';

export type ImportAmountResult =
  | { ok: true; /** Signed minor units: negative means money out. */ minor: number }
  | { ok: false; error: 'empty' | 'invalid' | 'precision' | 'range' };

const GROUPING = /[\s   ']/g;

/**
 * Exact amount parser for bank files (separate from the form's `parseAmount` heuristics: here the decimal mark is
 * a known setting, so "1,500" is 1500 with "." as the decimal mark and 1.5 with ",").
 * Accepts: currency symbols and codes, "+" / "-" (also the typographic minus), parentheses "(12.50)", a trailing
 * minus "12.50-", and CR / DR (DR = money out). More decimals than the currency allows is an error, never rounded.
 */
export function parseImportAmount(raw: string, currency: CurrencyCode, mark: DecimalMark): ImportAmountResult {
  let s = raw.trim();
  if (s === '') return { ok: false, error: 'empty' };

  let negative = false;
  // CR / DR as a word at either end.
  const crdr = /(^|[^A-Za-z])(CR|DR)(?![A-Za-z])/i.exec(s);
  if (crdr) {
    if (crdr[2]!.toUpperCase() === 'DR') negative = true;
    s = s.replace(/(^|[^A-Za-z])(CR|DR)(?![A-Za-z])/gi, '$1');
  }
  // Currency decorations.
  s = s.replace(/(?:CA|US|C|A)?\$/gi, '').replace(/[€£¥₦₵]/g, '');
  const codes = [...Object.keys(CURRENCIES), 'FCFA', 'CFA'].join('|');
  s = s.replace(new RegExp(`(^|[^A-Za-z])(?:${codes}|F)(?![A-Za-z])`, 'gi'), '$1');
  s = s.trim();
  if (/[A-Za-z]/.test(s)) return { ok: false, error: 'invalid' };

  // Sign markers.
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (/^[-−–]/.test(s)) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }
  if (/[-−–]$/.test(s)) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith('(') || s.endsWith(')')) return { ok: false, error: 'invalid' };

  s = s.replace(GROUPING, '');
  if (s === '') return { ok: false, error: 'empty' };
  const m = mark === '.' ? '\\.' : ',';
  const g = mark === '.' ? ',' : '\\.';
  const re = new RegExp(`^(?:(\\d{1,3}(?:${g}\\d{3})+|\\d+)(?:${m}(\\d*))?|${m}(\\d+))$`);
  const match = re.exec(s);
  if (!match || !/\d/.test(s)) return { ok: false, error: 'invalid' };
  const intPart = (match[1] ?? '0').split(mark === '.' ? ',' : '.').join('');
  const frac = match[2] ?? match[3] ?? '';

  const exp = minorUnit(currency);
  const trimmed = frac.replace(/0+$/, '');
  if (trimmed.length > exp) return { ok: false, error: 'precision' };
  const digits = (intPart + frac.padEnd(exp, '0').slice(0, exp)).replace(/^0+(?=\d)/, '');
  if (digits.length > String(MAX_AMOUNT_MINOR).length) return { ok: false, error: 'range' };
  const abs = Number(digits);
  if (!Number.isSafeInteger(abs) || abs > MAX_AMOUNT_MINOR) return { ok: false, error: 'range' };
  return { ok: true, minor: negative && abs !== 0 ? -abs : abs };
}

/**
 * Guesses the decimal mark of a column from its values. A mark followed by 1-2 digits (or 4+) is decimal; a mark
 * that repeats, or follows a different mark, is grouping; a single mark followed by exactly three digits proves
 * nothing ("1,500"). Without proof, whole-unit currencies (XOF) read the mark as grouping, others default to ".".
 */
export function detectDecimalMark(values: readonly string[], currency: CurrencyCode): DecimalMark {
  const votes: Record<DecimalMark, number> = { '.': 0, ',': 0 };
  let ambiguous: DecimalMark | null = null;
  for (const raw of values) {
    const s = raw.replace(GROUPING, '').replace(/[^0-9.,]/g, '');
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot < 0 && lastComma < 0) continue;
    if (lastDot >= 0 && lastComma >= 0) {
      votes[lastDot > lastComma ? '.' : ','] += 1;
      continue;
    }
    const mark: DecimalMark = lastDot >= 0 ? '.' : ',';
    const count = s.split(mark).length - 1;
    const after = s.length - s.lastIndexOf(mark) - 1;
    if (count > 1) votes[mark === '.' ? ',' : '.'] += 1;
    else if (after === 3) ambiguous = mark;
    else votes[mark] += 1;
  }
  if (votes['.'] !== votes[',']) return votes['.'] > votes[','] ? '.' : ',';
  if (ambiguous && minorUnit(currency) === 0) return ambiguous === '.' ? ',' : '.';
  return '.';
}
