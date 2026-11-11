import { monthEnd, monthOf, monthStart, type IsoDate, type MonthKey } from '../../domain/dates';
import type { RecurringBill } from '../../domain/models';
import { upcomingObligations, type Obligation } from '../../domain/recurrence';

/**
 * Unpaid bill obligations that belong to a month, as seen from `today`:
 * - a past month has none (they were paid or skipped),
 * - the current month starts at today and includes overdue bills once, on their overdue date,
 * - a future month lists every due date inside it.
 */
export function monthObligations(bills: readonly RecurringBill[], month: MonthKey, today: IsoDate): Obligation[] {
  const current = monthOf(today);
  const end = monthEnd(month);
  if (month < current) return [];
  if (month === current) return upcomingObligations(bills, today, end);
  const start = monthStart(month);
  return upcomingObligations(bills, start, end).filter((o) => o.dueOn >= start);
}
