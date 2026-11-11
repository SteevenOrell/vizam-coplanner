import type { IsoDate, MonthKey } from './dates';
import type { CurrencyCode } from './money/currency';

/** Row shapes shared by the SQLite repositories and the UI. Mirrors supabase/migrations (snake_case there). */
export type TxKind = 'income' | 'expense';
export type AccountKind = 'cash' | 'checking' | 'savings' | 'credit' | 'other';
export type BillFrequency = 'weekly' | 'monthly' | 'yearly';
export type NotificationKind = 'bill_due' | 'budget_near' | 'budget_over' | 'goal_reached' | 'system';
export type ThemePreference = 'system' | 'light' | 'dark';
export type AppLocale = 'en' | 'fr';

interface Synced {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Account extends Synced {
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  openingBalanceMinor: number;
  archived: boolean;
}

export interface Category extends Synced {
  name: string;
  kind: TxKind;
  /** Icon name from src/ui/Icon.tsx. */
  icon: string;
  color: string;
}

export interface Transaction extends Synced {
  accountId: string;
  categoryId: string | null;
  kind: TxKind;
  /** Always positive; the sign comes from `kind`. */
  amountMinor: number;
  currency: CurrencyCode;
  occurredOn: IsoDate;
  description: string;
  note: string;
  recurringBillId: string | null;
}

export interface Budget extends Synced {
  month: MonthKey;
  currency: CurrencyCode;
  name: string;
}

export interface BudgetAllocation extends Synced {
  budgetId: string;
  categoryId: string;
  limitMinor: number;
}

export interface SavingsGoal extends Synced {
  name: string;
  targetMinor: number;
  currency: CurrencyCode;
  targetDate: IsoDate | null;
  icon: string;
  color: string;
  archived: boolean;
}

export interface SavingsContribution extends Synced {
  goalId: string;
  /** Positive = deposit, negative = withdrawal. The goal balance can never go below zero. */
  amountMinor: number;
  contributedOn: IsoDate;
  note: string;
}

export interface RecurringBill extends Synced {
  name: string;
  amountMinor: number;
  currency: CurrencyCode;
  accountId: string | null;
  categoryId: string | null;
  frequency: BillFrequency;
  /** Every N weeks / months / years (1..12). */
  interval: number;
  /** First due date; its day of month is kept when months are shorter. */
  anchorDate: IsoDate;
  nextDueOn: IsoDate;
  endOn: IsoDate | null;
  remindDaysBefore: number;
  isSubscription: boolean;
  active: boolean;
}

export interface AppNotification extends Synced {
  kind: NotificationKind;
  title: string;
  body: string;
  relatedId: string | null;
  scheduledFor: string;
  readAt: string | null;
}

export interface Preferences {
  displayName: string;
  primaryCurrency: CurrencyCode;
  locale: AppLocale;
  theme: ThemePreference;
  notifyBills: boolean;
  notifyBudgets: boolean;
  billReminderDays: number;
  hideBalances: boolean;
}
