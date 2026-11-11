/**
 * Money is always an integer count of the currency's minor unit plus an explicit ISO 4217 code. Most currencies have
 * 2 decimals; the CFA francs (XOF, XAF) have 0. Floats never hold amounts: parsing and decimal strings use integer
 * and string arithmetic only. Amounts in different currencies are never added together (no exchange-rate policy in
 * the MVP, see docs/PROJECT_PLAN.md "Decisions").
 *
 * Adding a currency: add it here (ISO 4217 minor unit), to supabase/migrations (currencies table) and to
 * src/i18n/locales/{en,fr}/common.json (`currency.<CODE>`). Nothing else hard-codes the list.
 */
export const CURRENCIES = {
  CAD: { code: 'CAD', minorUnit: 2, name: 'Canadian dollar' },
  XOF: { code: 'XOF', minorUnit: 0, name: 'West African CFA franc' },
  USD: { code: 'USD', minorUnit: 2, name: 'US dollar' },
  EUR: { code: 'EUR', minorUnit: 2, name: 'Euro' },
  GBP: { code: 'GBP', minorUnit: 2, name: 'Pound sterling' },
  CHF: { code: 'CHF', minorUnit: 2, name: 'Swiss franc' },
  XAF: { code: 'XAF', minorUnit: 0, name: 'Central African CFA franc' },
  NGN: { code: 'NGN', minorUnit: 2, name: 'Nigerian naira' },
  GHS: { code: 'GHS', minorUnit: 2, name: 'Ghanaian cedi' },
  MAD: { code: 'MAD', minorUnit: 2, name: 'Moroccan dirham' },
} as const;

/** Short label for pills and tight spots: "FCFA" for the West African franc (what people say), else the code. */
export function currencyLabel(code: CurrencyCode): string {
  return code === 'XOF' ? 'FCFA' : code;
}

export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** Upper bound for one stored amount, mirrored by the Postgres and SQLite check constraints. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000_000;

export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function minorUnit(currency: CurrencyCode): number {
  return CURRENCIES[currency].minorUnit;
}

export function assertMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError(`Amount must be an integer minor unit: ${amountMinor}`);
  if (Math.abs(amountMinor) > MAX_AMOUNT_MINOR) throw new RangeError('Amount is too large');
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  assertMinor(amountMinor);
  return { amountMinor, currency };
}
