import { assertMinor, type CurrencyCode } from './currency';

export interface Amounted {
  amountMinor: number;
  currency: CurrencyCode;
}

export type CurrencyTotals = Partial<Record<CurrencyCode, number>>;

/** Sums per currency. Never mixes currencies (there is no exchange-rate policy). */
export function sumByCurrency(items: Iterable<Amounted>): CurrencyTotals {
  const out: CurrencyTotals = {};
  for (const it of items) {
    const next = (out[it.currency] ?? 0) + it.amountMinor;
    assertMinor(next);
    out[it.currency] = next;
  }
  return out;
}

/** Sums items that must all share `currency`; throws on a mismatch instead of silently combining. */
export function sumSameCurrency(items: Iterable<Amounted>, currency: CurrencyCode): number {
  let total = 0;
  for (const it of items) {
    if (it.currency !== currency) {
      throw new Error(`Cannot add ${it.currency} to a ${currency} total without an exchange-rate policy`);
    }
    total += it.amountMinor;
    assertMinor(total);
  }
  return total;
}

/** Share of `part` in `whole` as a ratio (0..n); 0 when whole is 0. Display only. */
export function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/** Whole percent, rounded half up, for labels ("82%"). */
export function percent(part: number, whole: number): number {
  return Math.round(ratio(part, whole) * 100);
}

/**
 * Splits `total` into integer parts proportional to `weights` (largest remainder), so the parts always add up to the
 * total exactly. Used for even monthly savings plans and pie slices.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  assertMinor(total);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) throw new RangeError('Weights must add up to a positive number');
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]! += 1;
    rest -= 1;
  }
  return floors;
}
