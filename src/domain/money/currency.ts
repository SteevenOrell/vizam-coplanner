/**
 * Money is always an integer count of the currency's minor unit plus an explicit ISO 4217 code. CAD has 2 decimals
 * (cents); XOF (franc CFA BCEAO) has 0. Floats never hold amounts: parsing and decimal strings use integer and
 * string arithmetic only. Amounts in different currencies are never added together (no exchange-rate policy in the
 * MVP, see docs/PROJECT_PLAN.md "Decisions").
 */
export const CURRENCIES = {
  CAD: { code: 'CAD', minorUnit: 2, name: 'Canadian dollar' },
  XOF: { code: 'XOF', minorUnit: 0, name: 'West African CFA franc' },
} as const;

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
