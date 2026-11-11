import { monthsUntil, type IsoDate } from './dates';
import type { SavingsContribution, SavingsGoal } from './models';

export interface GoalProgress {
  savedMinor: number;
  remainingMinor: number;
  ratio: number;
  reached: boolean;
  /** Even monthly amount needed to reach the target by its date (rounded up); null without a date or when reached. */
  monthlyNeededMinor: number | null;
  /** True when the target date has passed and the goal is not reached. */
  overdue: boolean;
}

export function goalBalance(contributions: readonly Pick<SavingsContribution, 'amountMinor'>[]): number {
  return contributions.reduce((s, c) => s + c.amountMinor, 0);
}

export function goalProgress(
  goal: Pick<SavingsGoal, 'targetMinor' | 'targetDate'>,
  savedMinor: number,
  today: IsoDate,
): GoalProgress {
  const remaining = Math.max(0, goal.targetMinor - savedMinor);
  const reached = remaining === 0;
  let monthlyNeeded: number | null = null;
  let overdue = false;
  if (!reached && goal.targetDate) {
    const months = monthsUntil(today, goal.targetDate);
    if (months === 0) overdue = goal.targetDate < today;
    monthlyNeeded = months === 0 ? remaining : Math.ceil(remaining / months);
  }
  return {
    savedMinor,
    remainingMinor: remaining,
    ratio: goal.targetMinor === 0 ? 0 : Math.min(savedMinor / goal.targetMinor, 1),
    reached,
    monthlyNeededMinor: monthlyNeeded,
    overdue,
  };
}

export type ContributionCheck = { ok: true } | { ok: false; error: 'zero' | 'overdraw' };

/**
 * A withdrawal may not take the goal below zero. Same rule as the Postgres trigger
 * `savings_contributions_keep_balance` (supabase/migrations).
 */
export function checkContribution(currentBalanceMinor: number, amountMinor: number): ContributionCheck {
  if (amountMinor === 0) return { ok: false, error: 'zero' };
  if (currentBalanceMinor + amountMinor < 0) return { ok: false, error: 'overdraw' };
  return { ok: true };
}
