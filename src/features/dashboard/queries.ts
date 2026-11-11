import type { SqlDriver } from '../../data/db/driver';
import type { Lookups } from '../../data/hooks';
import { categoryMap, listAccountBalances, listAccounts, type AccountWithBalance } from '../../data/repos/core';
import { unreadCount } from '../../data/repos/notifications';
import {
  getBudget,
  listBills,
  listGoals,
  type BudgetWithUsage,
  type GoalWithProgress,
} from '../../data/repos/planning';
import { listTransactions } from '../../data/repos/transactions';
import { addDays, monthEnd, monthOf, monthStart, type IsoDate } from '../../domain/dates';
import type { CurrencyTotals } from '../../domain/money/aggregate';
import { sumByCurrency } from '../../domain/money/aggregate';
import type { CurrencyCode } from '../../domain/money/currency';
import type { Transaction } from '../../domain/models';
import { upcomingObligations, type Obligation } from '../../domain/recurrence';
import { monthSummary, type PeriodSummary } from '../../domain/reports';

export interface DashboardData {
  balances: CurrencyTotals;
  month: PeriodSummary;
  budget: BudgetWithUsage | null;
  bills: Obligation[];
  goals: GoalWithProgress[];
  recent: Transaction[];
  unread: number;
  lookups: Lookups;
  accountCount: number;
}

export const UPCOMING_DAYS = 14;

/** Everything the Home tab shows, read in one pass. Balances are per currency, never combined. */
export async function loadDashboard(db: SqlDriver, today: IsoDate, primary: CurrencyCode): Promise<DashboardData> {
  const month = monthOf(today);
  const [balanceRows, monthTxs, budget, bills, goals, recent, unread, categories, accounts]: [
    AccountWithBalance[],
    Transaction[],
    BudgetWithUsage | null,
    Awaited<ReturnType<typeof listBills>>,
    GoalWithProgress[],
    Transaction[],
    number,
    Lookups['categories'],
    Awaited<ReturnType<typeof listAccounts>>,
  ] = await Promise.all([
    listAccountBalances(db),
    listTransactions(db, { from: monthStart(month), to: monthEnd(month) }),
    getBudget(db, month, primary),
    listBills(db, { includeInactive: false }),
    listGoals(db, today),
    listTransactions(db, { limit: 5 }),
    unreadCount(db),
    categoryMap(db),
    listAccounts(db, { includeArchived: true }),
  ]);
  return {
    balances: sumByCurrency(balanceRows.map((a) => ({ amountMinor: a.balanceMinor, currency: a.currency }))),
    month: monthSummary(monthTxs, primary, month),
    budget,
    bills: upcomingObligations(bills, today, addDays(today, UPCOMING_DAYS)),
    goals,
    recent,
    unread,
    lookups: { categories, accounts: new Map(accounts.map((a) => [a.id, a])) },
    accountCount: balanceRows.length,
  };
}
