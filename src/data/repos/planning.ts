import { computeBudgetUsage, type BudgetUsage } from '../../domain/budget';
import { addMonthKey, monthEnd, monthStart, type IsoDate, type MonthKey } from '../../domain/dates';
import type { CurrencyCode } from '../../domain/money/currency';
import type {
  Budget,
  BudgetAllocation,
  BillFrequency,
  RecurringBill,
  SavingsContribution,
  SavingsGoal,
  Transaction,
} from '../../domain/models';
import { nextDueAfter } from '../../domain/recurrence';
import { checkContribution, goalProgress, type GoalProgress } from '../../domain/savings';
import type { SqlDriver } from '../db/driver';
import {
  allocationsSpec,
  billsSpec,
  budgetsSpec,
  contributionsSpec,
  getRow,
  goalsSpec,
  listRows,
  newId,
  nowIso,
  putRow,
  softDeleteRow,
  transactionsSpec,
  ValidationError,
  write,
} from '../tables';
import { getAccount, getCategory, requireAmount, requireDate, requireText } from './core';
import { listTransactions } from './transactions';

// ---------------------------------------------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------------------------------------------
export interface BudgetWithUsage {
  budget: Budget;
  allocations: BudgetAllocation[];
  usage: BudgetUsage;
}

export async function getBudget(
  db: SqlDriver,
  month: MonthKey,
  currency: CurrencyCode,
): Promise<BudgetWithUsage | null> {
  const [budget] = await listRows(db, budgetsSpec, 'month = ? AND currency = ?', [monthStart(month), currency]);
  if (!budget) return null;
  const allocations = await listRows(db, allocationsSpec, 'budget_id = ?', [budget.id]);
  const txs = await listTransactions(db, { kind: 'expense', currency, from: monthStart(month), to: monthEnd(month) });
  return { budget, allocations, usage: computeBudgetUsage(budget, allocations, txs) };
}

export async function listBudgetMonths(db: SqlDriver): Promise<Budget[]> {
  return listRows(db, budgetsSpec, '1 = 1', [], 'month DESC, currency ASC');
}

/**
 * Creates or updates the budget for a month and currency with exactly these allocations (one transaction):
 * existing categories are updated, new ones added, missing ones removed.
 */
export function saveBudget(
  db: SqlDriver,
  month: MonthKey,
  currency: CurrencyCode,
  allocations: readonly { categoryId: string; limitMinor: number }[],
): Promise<Budget> {
  return write(db, async () => {
    const seen = new Set<string>();
    for (const a of allocations) {
      requireAmount(a.limitMinor, { allowZero: true });
      if (seen.has(a.categoryId)) throw new ValidationError('duplicateCategory');
      seen.add(a.categoryId);
      const cat = await getCategory(db, a.categoryId);
      if (!cat || cat.kind !== 'expense') throw new ValidationError('category');
    }
    const now = nowIso();
    let [budget] = await listRows(db, budgetsSpec, 'month = ? AND currency = ?', [monthStart(month), currency]);
    if (!budget) {
      budget = { id: newId(), createdAt: now, updatedAt: now, month, currency, name: '' };
      await putRow(db, budgetsSpec, budget);
    }
    const existing = await listRows(db, allocationsSpec, 'budget_id = ?', [budget.id]);
    const byCategory = new Map(existing.map((a) => [a.categoryId, a]));
    for (const a of allocations) {
      const prev = byCategory.get(a.categoryId);
      if (prev && prev.limitMinor === a.limitMinor) continue;
      await putRow(db, allocationsSpec, {
        id: prev?.id ?? newId(),
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        budgetId: budget.id,
        categoryId: a.categoryId,
        limitMinor: a.limitMinor,
      });
    }
    for (const prev of existing) {
      if (!seen.has(prev.categoryId)) await softDeleteRow(db, allocationsSpec, prev.id);
    }
    return budget;
  });
}

/** Starts a month's budget from the previous month's limits. Returns null when there is nothing to copy. */
export async function copyPreviousBudget(
  db: SqlDriver,
  month: MonthKey,
  currency: CurrencyCode,
): Promise<Budget | null> {
  const prev = await getBudget(db, addMonthKey(month, -1), currency);
  if (!prev || prev.allocations.length === 0) return null;
  return saveBudget(
    db,
    month,
    currency,
    prev.allocations.map((a) => ({ categoryId: a.categoryId, limitMinor: a.limitMinor })),
  );
}

export function deleteBudget(db: SqlDriver, budgetId: string): Promise<void> {
  return write(db, async () => {
    const allocations = await listRows(db, allocationsSpec, 'budget_id = ?', [budgetId]);
    for (const a of allocations) await softDeleteRow(db, allocationsSpec, a.id);
    await softDeleteRow(db, budgetsSpec, budgetId);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------------------------------------------
export interface GoalWithProgress extends SavingsGoal {
  progress: GoalProgress;
}

export interface GoalInput {
  name: string;
  targetMinor: number;
  currency: CurrencyCode;
  targetDate: IsoDate | null;
  icon: string;
  color: string;
}

async function goalBalanceMinor(db: SqlDriver, goalId: string): Promise<number> {
  const r = await db.first<{ total: number | null }>(
    'SELECT SUM(amount_minor) AS total FROM savings_contributions WHERE goal_id = ? AND deleted_at IS NULL',
    [goalId],
  );
  return Number(r?.total ?? 0);
}

export async function listGoals(
  db: SqlDriver,
  today: IsoDate,
  { includeArchived = false } = {},
): Promise<GoalWithProgress[]> {
  const goals = await listRows(db, goalsSpec, includeArchived ? '1 = 1' : 'archived = 0', [], 'created_at ASC');
  const totals = await db.all<{ goal_id: string; total: number }>(
    'SELECT goal_id, SUM(amount_minor) AS total FROM savings_contributions WHERE deleted_at IS NULL GROUP BY goal_id',
  );
  const byGoal = new Map(totals.map((t) => [t.goal_id, Number(t.total)]));
  return goals.map((g) => ({ ...g, progress: goalProgress(g, byGoal.get(g.id) ?? 0, today) }));
}

export async function getGoal(
  db: SqlDriver,
  id: string,
  today: IsoDate,
): Promise<{ goal: GoalWithProgress; contributions: SavingsContribution[] } | null> {
  const goal = await getRow(db, goalsSpec, id);
  if (!goal) return null;
  const contributions = await listRows(
    db,
    contributionsSpec,
    'goal_id = ?',
    [id],
    'contributed_on DESC, created_at DESC',
  );
  const saved = contributions.reduce((s, c) => s + c.amountMinor, 0);
  return { goal: { ...goal, progress: goalProgress(goal, saved, today) }, contributions };
}

function validateGoal(input: GoalInput): GoalInput {
  requireAmount(input.targetMinor);
  if (input.targetDate) requireDate(input.targetDate);
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.color)) throw new ValidationError('color');
  return { ...input, name: requireText(input.name, 60, 'name', { min: 1 }) };
}

export function createGoal(db: SqlDriver, input: GoalInput): Promise<SavingsGoal> {
  const clean = validateGoal(input);
  const now = nowIso();
  const goal: SavingsGoal = { id: newId(), createdAt: now, updatedAt: now, archived: false, ...clean };
  return write(db, async () => {
    await putRow(db, goalsSpec, goal);
    return goal;
  });
}

/** The currency of a goal with contributions cannot change (they would silently switch currency). */
export function updateGoal(db: SqlDriver, id: string, input: GoalInput & { archived?: boolean }): Promise<SavingsGoal> {
  return write(db, async () => {
    const current = await getRow(db, goalsSpec, id);
    if (!current) throw new ValidationError('notFound');
    const clean = validateGoal(input);
    if (clean.currency !== current.currency) {
      const n = await db.first<{ n: number }>(
        'SELECT COUNT(*) AS n FROM savings_contributions WHERE goal_id = ? AND deleted_at IS NULL',
        [id],
      );
      if (Number(n?.n ?? 0) > 0) throw new ValidationError('currencyLocked');
    }
    const next: SavingsGoal = {
      ...current,
      ...clean,
      archived: input.archived ?? current.archived,
      updatedAt: nowIso(),
    };
    await putRow(db, goalsSpec, next);
    return next;
  });
}

export function deleteGoal(db: SqlDriver, id: string): Promise<void> {
  return write(db, async () => {
    const contributions = await listRows(db, contributionsSpec, 'goal_id = ?', [id]);
    // Tombstone the goal first: the balance rule only guards contributions of live goals.
    await softDeleteRow(db, goalsSpec, id);
    for (const c of contributions) await softDeleteRow(db, contributionsSpec, c.id);
  });
}

/** Deposit (positive) or withdrawal (negative). Checked against the balance inside the same transaction. */
export function addContribution(
  db: SqlDriver,
  goalId: string,
  amountMinor: number,
  contributedOn: IsoDate,
  note = '',
): Promise<SavingsContribution> {
  return write(db, async () => {
    requireAmount(Math.abs(amountMinor));
    requireDate(contributedOn);
    const goal = await getRow(db, goalsSpec, goalId);
    if (!goal) throw new ValidationError('notFound');
    const check = checkContribution(await goalBalanceMinor(db, goalId), amountMinor);
    if (!check.ok) throw new ValidationError(check.error);
    const now = nowIso();
    const c: SavingsContribution = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      goalId,
      amountMinor,
      contributedOn,
      note: requireText(note, 200, 'note'),
    };
    await putRow(db, contributionsSpec, c);
    return c;
  });
}

export function deleteContribution(db: SqlDriver, id: string): Promise<void> {
  return write(db, async () => {
    const c = await getRow(db, contributionsSpec, id);
    if (!c) return;
    const balance = await goalBalanceMinor(db, c.goalId);
    if (balance - c.amountMinor < 0) throw new ValidationError('overdraw');
    await softDeleteRow(db, contributionsSpec, id);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Recurring bills
// ---------------------------------------------------------------------------------------------------------------
export interface BillInput {
  name: string;
  amountMinor: number;
  currency: CurrencyCode;
  accountId: string | null;
  categoryId: string | null;
  frequency: BillFrequency;
  interval: number;
  /** First due date. */
  anchorDate: IsoDate;
  endOn: IsoDate | null;
  remindDaysBefore: number;
  isSubscription: boolean;
}

async function validateBill(db: SqlDriver, input: BillInput): Promise<BillInput> {
  requireAmount(input.amountMinor);
  requireDate(input.anchorDate);
  if (input.endOn) {
    requireDate(input.endOn);
    if (input.endOn < input.anchorDate) throw new ValidationError('endBeforeStart');
  }
  if (!Number.isInteger(input.interval) || input.interval < 1 || input.interval > 12) {
    throw new ValidationError('interval');
  }
  if (!Number.isInteger(input.remindDaysBefore) || input.remindDaysBefore < 0 || input.remindDaysBefore > 14) {
    throw new ValidationError('reminderDays');
  }
  if (input.accountId) {
    const a = await getAccount(db, input.accountId);
    if (!a || a.currency !== input.currency) throw new ValidationError('accountCurrency');
  }
  if (input.categoryId) {
    const c = await getCategory(db, input.categoryId);
    if (!c || c.kind !== 'expense') throw new ValidationError('category');
  }
  return { ...input, name: requireText(input.name, 60, 'name', { min: 1 }) };
}

export function listBills(db: SqlDriver, { includeInactive = true } = {}): Promise<RecurringBill[]> {
  return listRows(
    db,
    billsSpec,
    includeInactive ? '1 = 1' : 'active = 1',
    [],
    'active DESC, next_due_on ASC, name ASC',
  );
}

export function getBill(db: SqlDriver, id: string): Promise<RecurringBill | null> {
  return getRow(db, billsSpec, id);
}

export function createBill(db: SqlDriver, input: BillInput): Promise<RecurringBill> {
  return write(db, async () => {
    const clean = await validateBill(db, input);
    const now = nowIso();
    const bill: RecurringBill = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      ...clean,
      nextDueOn: clean.anchorDate,
      active: true,
    };
    await putRow(db, billsSpec, bill);
    return bill;
  });
}

/** Changing the schedule restarts it at the new first due date. */
export function updateBill(db: SqlDriver, id: string, input: BillInput & { active?: boolean }): Promise<RecurringBill> {
  return write(db, async () => {
    const current = await getRow(db, billsSpec, id);
    if (!current) throw new ValidationError('notFound');
    const clean = await validateBill(db, input);
    const scheduleChanged =
      clean.anchorDate !== current.anchorDate ||
      clean.frequency !== current.frequency ||
      clean.interval !== current.interval;
    const next: RecurringBill = {
      ...current,
      ...clean,
      nextDueOn: scheduleChanged ? clean.anchorDate : current.nextDueOn,
      active: input.active ?? current.active,
      updatedAt: nowIso(),
    };
    await putRow(db, billsSpec, next);
    return next;
  });
}

export function deleteBill(db: SqlDriver, id: string): Promise<void> {
  return write(db, () => softDeleteRow(db, billsSpec, id));
}

/**
 * Marks the bill's current due date as paid: records the expense and advances next_due_on, in one transaction.
 * `expectedDueOn` guards against a double tap paying twice (same rule as the record_bill_payment RPC).
 */
export function markBillPaid(
  db: SqlDriver,
  billId: string,
  expectedDueOn: IsoDate,
  paidOn: IsoDate,
  accountId: string,
): Promise<{ transaction: Transaction; bill: RecurringBill }> {
  return write(db, async () => {
    requireDate(paidOn);
    const bill = await getRow(db, billsSpec, billId);
    if (!bill || !bill.active) throw new ValidationError('notFound');
    if (bill.nextDueOn !== expectedDueOn) throw new ValidationError('alreadyPaid');
    const account = await getAccount(db, accountId);
    if (!account || account.currency !== bill.currency) throw new ValidationError('accountCurrency');
    const now = nowIso();
    const tx: Transaction = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      accountId,
      categoryId: bill.categoryId,
      kind: 'expense',
      amountMinor: bill.amountMinor,
      currency: bill.currency,
      occurredOn: paidOn,
      description: bill.name,
      note: '',
      recurringBillId: bill.id,
    };
    await putRow(db, transactionsSpec, tx);
    const nextDue = nextDueAfter(bill, bill.nextDueOn);
    const nextBill: RecurringBill = {
      ...bill,
      nextDueOn: nextDue ?? bill.nextDueOn,
      active: nextDue !== null,
      updatedAt: now,
    };
    await putRow(db, billsSpec, nextBill);
    return { transaction: tx, bill: nextBill };
  });
}

/** Skips the current due date without recording a payment. */
export function skipBillOccurrence(db: SqlDriver, billId: string, expectedDueOn: IsoDate): Promise<RecurringBill> {
  return write(db, async () => {
    const bill = await getRow(db, billsSpec, billId);
    if (!bill || !bill.active) throw new ValidationError('notFound');
    if (bill.nextDueOn !== expectedDueOn) throw new ValidationError('alreadyPaid');
    const nextDue = nextDueAfter(bill, bill.nextDueOn);
    const next: RecurringBill = {
      ...bill,
      nextDueOn: nextDue ?? bill.nextDueOn,
      active: nextDue !== null,
      updatedAt: nowIso(),
    };
    await putRow(db, billsSpec, next);
    return next;
  });
}
