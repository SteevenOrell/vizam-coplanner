import { addDays, addMonths, diffDays, type IsoDate } from './dates';
import { sumByCurrency, type CurrencyTotals } from './money/aggregate';
import type { CurrencyCode } from './money/currency';
import type { BillFrequency, RecurringBill } from './models';

type Schedule = Pick<RecurringBill, 'frequency' | 'interval' | 'anchorDate' | 'endOn'>;

const MAX_ITERATIONS = 5000;

/** The n-th due date (n = 0 is the anchor). Monthly and yearly keep the anchor's day, clamped to short months. */
export function occurrence(schedule: Pick<Schedule, 'frequency' | 'interval' | 'anchorDate'>, n: number): IsoDate {
  const { frequency, interval, anchorDate } = schedule;
  const anchorDay = Number(anchorDate.slice(8, 10));
  switch (frequency) {
    case 'weekly':
      return addDays(anchorDate, 7 * interval * n);
    case 'monthly':
      return addMonths(anchorDate, interval * n, anchorDay);
    case 'yearly':
      return addMonths(anchorDate, 12 * interval * n, anchorDay);
  }
}

function firstIndexOnOrAfter(schedule: Schedule, date: IsoDate): number {
  if (date <= schedule.anchorDate) return 0;
  // Estimate, then correct: avoids iterating from the anchor for long-running bills.
  const days = diffDays(schedule.anchorDate, date);
  const perStep = schedule.frequency === 'weekly' ? 7 : schedule.frequency === 'monthly' ? 28 : 365;
  let n = Math.max(0, Math.floor(days / (perStep * schedule.interval)) - 1);
  while (n > 0 && occurrence(schedule, n) >= date) n -= 1;
  let guard = 0;
  while (occurrence(schedule, n) < date && guard++ < MAX_ITERATIONS) n += 1;
  return n;
}

/** Due dates in [from, to], not after `endOn`. */
export function dueDatesBetween(schedule: Schedule, from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  if (to < from) return out;
  let n = firstIndexOnOrAfter(schedule, from);
  for (let i = 0; i < MAX_ITERATIONS; i++, n++) {
    const d = occurrence(schedule, n);
    if (d > to || (schedule.endOn && d > schedule.endOn)) break;
    out.push(d);
  }
  return out;
}

/** The due date after `current` (used when a bill is marked paid). Null when the series has ended. */
export function nextDueAfter(schedule: Schedule, current: IsoDate): IsoDate | null {
  const n = firstIndexOnOrAfter(schedule, addDays(current, 1));
  const d = occurrence(schedule, n);
  return schedule.endOn && d > schedule.endOn ? null : d;
}

export interface Obligation {
  billId: string;
  name: string;
  dueOn: IsoDate;
  amountMinor: number;
  currency: CurrencyCode;
  isSubscription: boolean;
}

/**
 * Unpaid obligations in [from, to]: every due date from the bill's `nextDueOn` on (earlier ones are paid). Overdue
 * bills (nextDueOn < from) are included once, on their overdue date, so they are never hidden.
 */
export function upcomingObligations(bills: readonly RecurringBill[], from: IsoDate, to: IsoDate): Obligation[] {
  const out: Obligation[] = [];
  for (const b of bills) {
    if (!b.active) continue;
    const start = b.nextDueOn > from ? b.nextDueOn : from;
    const dates = dueDatesBetween(b, start, to);
    if (b.nextDueOn < from && (!b.endOn || b.nextDueOn <= b.endOn)) dates.unshift(b.nextDueOn);
    for (const dueOn of dates) {
      out.push({
        billId: b.id,
        name: b.name,
        dueOn,
        amountMinor: b.amountMinor,
        currency: b.currency,
        isSubscription: b.isSubscription,
      });
    }
  }
  return out.sort((a, b) => (a.dueOn === b.dueOn ? a.name.localeCompare(b.name) : a.dueOn < b.dueOn ? -1 : 1));
}

export function obligationTotals(obligations: readonly Obligation[]): CurrencyTotals {
  return sumByCurrency(obligations);
}

/** Average monthly cost of a bill, rounded to the minor unit (weekly ≈ 52/12, yearly / 12). */
export function monthlyEquivalent(amountMinor: number, frequency: BillFrequency, interval: number): number {
  switch (frequency) {
    case 'weekly':
      return Math.round((amountMinor * 52) / (12 * interval));
    case 'monthly':
      return Math.round(amountMinor / interval);
    case 'yearly':
      return Math.round(amountMinor / (12 * interval));
  }
}
