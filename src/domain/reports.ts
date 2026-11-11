import { addDays, monthEnd, monthOf, monthRange, monthStart, type IsoDate, type MonthKey } from './dates';
import type { CurrencyCode } from './money/currency';
import type { Transaction } from './models';

type Tx = Pick<Transaction, 'kind' | 'amountMinor' | 'currency' | 'occurredOn' | 'categoryId'>;

export interface PeriodSummary {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  count: number;
}

const empty = (): PeriodSummary => ({ incomeMinor: 0, expenseMinor: 0, netMinor: 0, count: 0 });

function add(s: PeriodSummary, t: Tx): void {
  if (t.kind === 'income') s.incomeMinor += t.amountMinor;
  else s.expenseMinor += t.amountMinor;
  s.netMinor = s.incomeMinor - s.expenseMinor;
  s.count += 1;
}

/** Income, expenses and net for one currency in [from, to]. */
export function summarize(transactions: readonly Tx[], currency: CurrencyCode, from: IsoDate, to: IsoDate) {
  const s = empty();
  for (const t of transactions) {
    if (t.currency === currency && t.occurredOn >= from && t.occurredOn <= to) add(s, t);
  }
  return s;
}

export function monthSummary(transactions: readonly Tx[], currency: CurrencyCode, month: MonthKey): PeriodSummary {
  return summarize(transactions, currency, monthStart(month), monthEnd(month));
}

export interface MonthTrendPoint extends PeriodSummary {
  month: MonthKey;
}

/** One point per month (oldest first), including empty months, for one currency. */
export function monthlyTrend(
  transactions: readonly Tx[],
  currency: CurrencyCode,
  from: MonthKey,
  to: MonthKey,
): MonthTrendPoint[] {
  const byMonth = new Map<MonthKey, PeriodSummary>(monthRange(from, to).map((m) => [m, empty()]));
  for (const t of transactions) {
    if (t.currency !== currency) continue;
    const s = byMonth.get(monthOf(t.occurredOn));
    if (s) add(s, t);
  }
  return [...byMonth].map(([month, s]) => ({ month, ...s }));
}

export interface CategoryShare {
  categoryId: string | null;
  amountMinor: number;
  share: number;
}

/** Totals per category for one kind and currency in [from, to], largest first. */
export function categoryBreakdown(
  transactions: readonly Tx[],
  kind: Tx['kind'],
  currency: CurrencyCode,
  from: IsoDate,
  to: IsoDate,
): CategoryShare[] {
  const totals = new Map<string | null, number>();
  let all = 0;
  for (const t of transactions) {
    if (t.kind !== kind || t.currency !== currency || t.occurredOn < from || t.occurredOn > to) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountMinor);
    all += t.amountMinor;
  }
  return [...totals]
    .map(([categoryId, amountMinor]) => ({ categoryId, amountMinor, share: all === 0 ? 0 : amountMinor / all }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

export interface CashFlowPoint {
  date: IsoDate;
  inMinor: number;
  outMinor: number;
  /** Running balance from `startBalanceMinor`. */
  balanceMinor: number;
}

/** Daily cash flow for one currency, one point per day in [from, to]. */
export function cashFlow(
  transactions: readonly Tx[],
  currency: CurrencyCode,
  from: IsoDate,
  to: IsoDate,
  startBalanceMinor = 0,
): CashFlowPoint[] {
  const byDay = new Map<IsoDate, { in: number; out: number }>();
  for (const t of transactions) {
    if (t.currency !== currency || t.occurredOn < from || t.occurredOn > to) continue;
    const d = byDay.get(t.occurredOn) ?? { in: 0, out: 0 };
    if (t.kind === 'income') d.in += t.amountMinor;
    else d.out += t.amountMinor;
    byDay.set(t.occurredOn, d);
  }
  const out: CashFlowPoint[] = [];
  let balance = startBalanceMinor;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = byDay.get(d) ?? { in: 0, out: 0 };
    balance += v.in - v.out;
    out.push({ date: d, inMinor: v.in, outMinor: v.out, balanceMinor: balance });
  }
  return out;
}

/** Savings rate for a period: net / income, null without income. */
export function savingsRate(s: PeriodSummary): number | null {
  return s.incomeMinor === 0 ? null : s.netMinor / s.incomeMinor;
}
