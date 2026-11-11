import { csvCell, toCsv, transactionsToCsv } from '../../domain/csv';
import type { IsoDate } from '../../domain/dates';
import type { Account, Category, SavingsContribution, Transaction } from '../../domain/models';
import type { CurrencyCode } from '../../domain/money/currency';
import { minorToDecimalString } from '../../domain/money/format';

/** Transactions dated in [from, to], in the same CSV layout as the transactions export (all currencies). */
export function periodTransactionsCsv(
  transactions: readonly Transaction[],
  categories: ReadonlyMap<string, Pick<Category, 'name'>>,
  accounts: ReadonlyMap<string, Pick<Account, 'name'>>,
  from: IsoDate,
  to: IsoDate,
): string {
  return transactionsToCsv(
    transactions.filter((t) => t.occurredOn >= from && t.occurredOn <= to),
    categories,
    accounts,
  );
}

export const SAVINGS_CSV_HEADER = ['goal', 'date', 'amount', 'currency', 'note'] as const;

export interface GoalContributions {
  name: string;
  currency: CurrencyCode;
  contributions: readonly Pick<SavingsContribution, 'amountMinor' | 'contributedOn' | 'note'>[];
}

/** One row per contribution dated in [from, to]; withdrawals are negative. Amounts are exact decimals. */
export function savingsToCsv(goals: readonly GoalContributions[], from: IsoDate, to: IsoDate): string {
  const rows = goals
    .flatMap((g) =>
      g.contributions
        .filter((c) => c.contributedOn >= from && c.contributedOn <= to)
        .map((c) => ({ goal: g.name, currency: g.currency, ...c })),
    )
    .sort((a, b) =>
      a.contributedOn === b.contributedOn ? a.goal.localeCompare(b.goal) : a.contributedOn < b.contributedOn ? -1 : 1,
    )
    .map((c) => [
      csvCell(c.goal),
      csvCell(c.contributedOn, { numeric: true }),
      csvCell(minorToDecimalString(c.amountMinor, c.currency), { numeric: true }),
      csvCell(c.currency),
      csvCell(c.note),
    ]);
  return toCsv(SAVINGS_CSV_HEADER, rows);
}
