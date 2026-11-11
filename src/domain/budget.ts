import { monthOf, type MonthKey } from './dates';
import type { CurrencyCode } from './money/currency';
import type { Budget, BudgetAllocation, Transaction } from './models';

export type BudgetStatus = 'ok' | 'near' | 'over';

/** Usage at or above this share of the limit counts as "near" (warning colour, optional notification). */
export const NEAR_LIMIT_RATIO = 0.8;

export interface CategoryUsage {
  categoryId: string;
  limitMinor: number;
  spentMinor: number;
  /** limit - spent; negative when over budget. */
  remainingMinor: number;
  /** spent / limit (0 when the limit is 0 and nothing was spent, Infinity-safe: capped at 9.99). */
  ratio: number;
  status: BudgetStatus;
}

export interface BudgetUsage {
  month: MonthKey;
  currency: CurrencyCode;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  ratio: number;
  status: BudgetStatus;
  categories: CategoryUsage[];
  /** Expenses this month in the budget's currency whose category has no allocation. */
  unbudgetedMinor: number;
}

export function statusFor(spent: number, limit: number): BudgetStatus {
  if (limit === 0) return spent > 0 ? 'over' : 'ok';
  if (spent > limit) return 'over';
  return spent / limit >= NEAR_LIMIT_RATIO ? 'near' : 'ok';
}

function ratioOf(spent: number, limit: number): number {
  if (limit === 0) return spent > 0 ? 9.99 : 0;
  return Math.min(spent / limit, 9.99);
}

/**
 * Budget usage for one month and currency. Only expenses in the same month and the same currency count; income and
 * other currencies are ignored (never converted).
 */
export function computeBudgetUsage(
  budget: Pick<Budget, 'month' | 'currency'>,
  allocations: readonly Pick<BudgetAllocation, 'categoryId' | 'limitMinor'>[],
  transactions: readonly Pick<Transaction, 'kind' | 'amountMinor' | 'currency' | 'occurredOn' | 'categoryId'>[],
): BudgetUsage {
  const spentByCategory = new Map<string, number>();
  let unbudgeted = 0;
  const allocated = new Set(allocations.map((a) => a.categoryId));
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.currency !== budget.currency || monthOf(t.occurredOn) !== budget.month) continue;
    if (t.categoryId && allocated.has(t.categoryId)) {
      spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + t.amountMinor);
    } else {
      unbudgeted += t.amountMinor;
    }
  }
  const categories = allocations.map<CategoryUsage>((a) => {
    const spent = spentByCategory.get(a.categoryId) ?? 0;
    return {
      categoryId: a.categoryId,
      limitMinor: a.limitMinor,
      spentMinor: spent,
      remainingMinor: a.limitMinor - spent,
      ratio: ratioOf(spent, a.limitMinor),
      status: statusFor(spent, a.limitMinor),
    };
  });
  const limit = categories.reduce((s, c) => s + c.limitMinor, 0);
  const spent = categories.reduce((s, c) => s + c.spentMinor, 0);
  return {
    month: budget.month,
    currency: budget.currency,
    limitMinor: limit,
    spentMinor: spent,
    remainingMinor: limit - spent,
    ratio: ratioOf(spent, limit),
    status: statusFor(spent, limit),
    categories,
    unbudgetedMinor: unbudgeted,
  };
}

/**
 * What is still safe to spend per remaining day of the month (including today), after setting aside `plannedMinor`
 * for bills still due this month. Never negative.
 */
export function dailyAllowance(remainingMinor: number, plannedMinor: number, daysLeft: number): number {
  const free = remainingMinor - plannedMinor;
  if (free <= 0 || daysLeft <= 0) return 0;
  return Math.floor(free / daysLeft);
}
