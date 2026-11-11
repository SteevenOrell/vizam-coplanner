import { assertMinor, MAX_AMOUNT_MINOR, minorUnit, type CurrencyCode } from './currency';

/** "-1234.50" for (-123450, CAD), "1500" for (1500, XOF). Exact: string arithmetic, no floats. */
export function minorToDecimalString(amountMinor: number, currency: CurrencyCode): string {
  assertMinor(amountMinor);
  const exp = minorUnit(currency);
  const sign = amountMinor < 0 ? '-' : '';
  const digits = String(Math.abs(amountMinor));
  if (exp === 0) return sign + digits;
  const padded = digits.padStart(exp + 1, '0');
  return `${sign}${padded.slice(0, -exp)}.${padded.slice(-exp)}`;
}

export type ParseResult =
  { ok: true; amountMinor: number } | { ok: false; error: 'empty' | 'invalid' | 'precision' | 'range' };

/**
 * Parses what a person types into an amount field: "12", "12.5", "1 234,56", "1,234.56", "1.500" (XOF thousands).
 * Rules: spaces (incl. NBSP / narrow NBSP) and apostrophes are grouping; when both "." and "," appear the last one is
 * the decimal mark; a single mark followed by exactly 3 digits is grouping; otherwise a single mark is decimal. More
 * decimals than the currency allows is an error (never silently rounded). Negative input is rejected: the sign comes
 * from the transaction kind.
 */
export function parseAmount(input: string, currency: CurrencyCode): ParseResult {
  const s = input.trim().replace(/[\s  ']/g, '');
  if (s === '') return { ok: false, error: 'empty' };
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return { ok: false, error: 'invalid' };

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalMark: '.' | ',' | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalMark = lastDot > lastComma ? '.' : ',';
  } else {
    const mark = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    if (mark) {
      const count = s.split(mark).length - 1;
      const after = s.length - s.lastIndexOf(mark) - 1;
      decimalMark = count === 1 && after !== 3 ? mark : null;
    }
  }

  let intPart = s;
  let fracPart = '';
  if (decimalMark) {
    const idx = s.lastIndexOf(decimalMark);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
    if (/[.,]/.test(fracPart)) return { ok: false, error: 'invalid' };
  }
  const groupMark = decimalMark === '.' ? ',' : decimalMark === ',' ? '.' : null;
  if (groupMark === null) {
    // No decimal mark: every "." / "," is grouping and must separate groups of three digits.
    if (/[.,]/.test(intPart) && !/^\d{1,3}([.,]\d{3})+$/.test(intPart)) return { ok: false, error: 'invalid' };
    intPart = intPart.replace(/[.,]/g, '');
  } else {
    if (intPart.includes(decimalMark!)) return { ok: false, error: 'invalid' };
    if (intPart.includes(groupMark) && !new RegExp(`^\\d{1,3}(\\${groupMark}\\d{3})+$`).test(intPart)) {
      return { ok: false, error: 'invalid' };
    }
    intPart = intPart.split(groupMark).join('');
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) return { ok: false, error: 'invalid' };

  const exp = minorUnit(currency);
  const trimmedFrac = fracPart.replace(/0+$/, '');
  if (trimmedFrac.length > exp) return { ok: false, error: 'precision' };
  const combined = (intPart + fracPart.padEnd(exp, '0').slice(0, exp)).replace(/^0+(?=\d)/, '');
  if (combined.length > String(MAX_AMOUNT_MINOR).length) return { ok: false, error: 'range' };
  const amountMinor = Number(combined);
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_AMOUNT_MINOR) return { ok: false, error: 'range' };
  return { ok: true, amountMinor };
}

export interface FormatOptions {
  locale?: string;
  /** Prefix "+" for positive values (income rows). */
  signed?: boolean;
  /** Drop the currency symbol (e.g. inside a field that already shows a currency pill). */
  hideCurrency?: boolean;
  /** Compact notation for chart axes: "1.2K", "3 M". */
  compact?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();
function formatter(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = formatterCache.get(key);
  if (!f) {
    f = make();
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Display only. The value handed to Intl is `minor / 10^exp`; for safe integers below MAX_AMOUNT_MINOR the nearest
 * double rounds back to the exact digits at the currency's precision, so the printed text is exact.
 */
export function formatMoney(amountMinor: number, currency: CurrencyCode, options: FormatOptions = {}): string {
  assertMinor(amountMinor);
  const { locale = 'en-CA', signed = false, hideCurrency = false, compact = false } = options;
  const exp = minorUnit(currency);
  const key = `${locale}|${currency}|${hideCurrency}|${compact}|${signed}`;
  const f = formatter(key, () =>
    compact
      ? new Intl.NumberFormat(locale, {
          notation: 'compact',
          maximumFractionDigits: 1,
          ...(hideCurrency ? {} : { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }),
        })
      : new Intl.NumberFormat(locale, {
          ...(hideCurrency
            ? { minimumFractionDigits: exp, maximumFractionDigits: exp }
            : {
                style: 'currency',
                currency,
                currencyDisplay: 'narrowSymbol',
                minimumFractionDigits: exp,
                maximumFractionDigits: exp,
              }),
          signDisplay: signed ? 'exceptZero' : 'auto',
        }),
  );
  return f.format(amountMinor / 10 ** exp);
}

/** Value for a text field when editing an existing amount: "1234.5" -> "1234.50"; XOF stays an integer. */
export function amountToInput(amountMinor: number, currency: CurrencyCode): string {
  return minorToDecimalString(Math.abs(amountMinor), currency);
}
