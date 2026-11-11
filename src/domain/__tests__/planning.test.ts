import { computeBudgetUsage, dailyAllowance, statusFor } from '../budget';
import { csvCell, transactionsToCsv } from '../csv';
import { addMonths, diffDays, isIsoDate, monthEnd, monthRange, monthsUntil, todayIso } from '../dates';
import type { RecurringBill, Transaction } from '../models';
import { dueDatesBetween, monthlyEquivalent, nextDueAfter, upcomingObligations } from '../recurrence';
import { cashFlow, categoryBreakdown, monthlyTrend, monthSummary, savingsRate } from '../reports';
import { checkContribution, goalProgress } from '../savings';

let seq = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: p.id ?? `t${seq++}`,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  accountId: 'acc',
  categoryId: null,
  kind: 'expense',
  amountMinor: 100,
  currency: 'CAD',
  occurredOn: '2026-11-05',
  description: '',
  note: '',
  recurringBillId: null,
  ...p,
});

describe('dates', () => {
  it('validates and does month arithmetic with clamping', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', -12)).toBe('2025-11-15');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(monthsUntil('2026-11-11', '2027-05-11')).toBe(6);
    expect(monthsUntil('2026-11-11', '2026-11-20')).toBe(1);
    expect(monthsUntil('2026-11-11', '2026-11-01')).toBe(0);
    expect(todayIso(new Date(2026, 10, 11, 23, 59))).toBe('2026-11-11');
  });
});

describe('budget usage', () => {
  const budget = { month: '2026-11', currency: 'CAD' as const };
  const allocations = [
    { categoryId: 'food', limitMinor: 50000 },
    { categoryId: 'fun', limitMinor: 10000 },
    { categoryId: 'zero', limitMinor: 0 },
  ];

  it('counts only same-month, same-currency expenses', () => {
    const u = computeBudgetUsage(budget, allocations, [
      tx({ categoryId: 'food', amountMinor: 30000 }),
      tx({ categoryId: 'food', amountMinor: 12000, occurredOn: '2026-11-30' }),
      tx({ categoryId: 'food', amountMinor: 99999, occurredOn: '2026-10-31' }),
      tx({ categoryId: 'food', amountMinor: 5000, currency: 'XOF' }),
      tx({ categoryId: 'food', amountMinor: 7000, kind: 'income' }),
      tx({ categoryId: 'fun', amountMinor: 12500 }),
      tx({ categoryId: 'other', amountMinor: 800 }),
      tx({ categoryId: null, amountMinor: 200 }),
    ]);
    const food = u.categories.find((c) => c.categoryId === 'food')!;
    expect(food).toMatchObject({ spentMinor: 42000, remainingMinor: 8000, status: 'near' });
    const fun = u.categories.find((c) => c.categoryId === 'fun')!;
    expect(fun).toMatchObject({ spentMinor: 12500, remainingMinor: -2500, status: 'over' });
    expect(u.categories.find((c) => c.categoryId === 'zero')!.status).toBe('ok');
    expect(u).toMatchObject({ limitMinor: 60000, spentMinor: 54500, remainingMinor: 5500, unbudgetedMinor: 1000 });
    expect(u.status).toBe('near');
  });

  it('status thresholds', () => {
    expect(statusFor(79, 100)).toBe('ok');
    expect(statusFor(80, 100)).toBe('near');
    expect(statusFor(100, 100)).toBe('near');
    expect(statusFor(101, 100)).toBe('over');
    expect(statusFor(1, 0)).toBe('over');
  });

  it('daily allowance sets planned bills aside', () => {
    expect(dailyAllowance(30000, 6500, 20)).toBe(1175);
    expect(dailyAllowance(5000, 6500, 20)).toBe(0);
    expect(dailyAllowance(5000, 0, 0)).toBe(0);
  });
});

describe('savings', () => {
  it('progress and monthly need', () => {
    const p = goalProgress({ targetMinor: 200000, targetDate: '2027-05-11' }, 50000, '2026-11-11');
    expect(p).toMatchObject({ remainingMinor: 150000, reached: false, monthlyNeededMinor: 25000, overdue: false });
    expect(p.ratio).toBeCloseTo(0.25);
  });

  it('reached, over-saved and overdue', () => {
    expect(goalProgress({ targetMinor: 1000, targetDate: null }, 1500, '2026-11-11')).toMatchObject({
      reached: true,
      remainingMinor: 0,
      ratio: 1,
      monthlyNeededMinor: null,
    });
    expect(goalProgress({ targetMinor: 1000, targetDate: '2026-10-01' }, 200, '2026-11-11')).toMatchObject({
      overdue: true,
      monthlyNeededMinor: 800,
    });
  });

  it('never lets a withdrawal overdraw a goal', () => {
    expect(checkContribution(1000, -1000)).toEqual({ ok: true });
    expect(checkContribution(1000, -1001)).toEqual({ ok: false, error: 'overdraw' });
    expect(checkContribution(1000, 0)).toEqual({ ok: false, error: 'zero' });
  });
});

const bill = (p: Partial<RecurringBill>): RecurringBill => ({
  id: 'b1',
  createdAt: '',
  updatedAt: '',
  name: 'Rent',
  amountMinor: 150000,
  currency: 'CAD',
  accountId: null,
  categoryId: null,
  frequency: 'monthly',
  interval: 1,
  anchorDate: '2026-01-31',
  nextDueOn: '2026-01-31',
  endOn: null,
  remindDaysBefore: 2,
  isSubscription: false,
  active: true,
  ...p,
});

describe('recurrence', () => {
  it('monthly keeps the anchor day and clamps short months', () => {
    expect(dueDatesBetween(bill({}), '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('weekly, every 2 weeks, yearly on Feb 29 and end dates', () => {
    expect(
      dueDatesBetween(bill({ frequency: 'weekly', interval: 2, anchorDate: '2026-11-02' }), '2026-11-10', '2026-12-10'),
    ).toEqual(['2026-11-16', '2026-11-30']);
    expect(
      dueDatesBetween(bill({ frequency: 'yearly', anchorDate: '2028-02-29' }), '2028-01-01', '2032-12-31'),
    ).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
    expect(dueDatesBetween(bill({ endOn: '2026-03-15' }), '2026-01-01', '2026-12-31')).toHaveLength(2);
  });

  it('finds dates far from the anchor', () => {
    expect(dueDatesBetween(bill({ anchorDate: '2000-01-31' }), '2026-02-01', '2026-02-28')).toEqual(['2026-02-28']);
  });

  it('next due after paying', () => {
    expect(nextDueAfter(bill({}), '2026-01-31')).toBe('2026-02-28');
    expect(nextDueAfter(bill({}), '2026-02-28')).toBe('2026-03-31');
    expect(nextDueAfter(bill({ endOn: '2026-02-10' }), '2026-01-31')).toBeNull();
  });

  it('upcoming obligations skip paid dates, keep overdue ones, and ignore inactive bills', () => {
    const list = upcomingObligations(
      [
        bill({ id: 'rent', nextDueOn: '2026-11-30', anchorDate: '2026-01-30' }),
        bill({ id: 'late', name: 'Phone', nextDueOn: '2026-11-02', anchorDate: '2026-01-02', amountMinor: 6500 }),
        bill({ id: 'off', active: false }),
        bill({
          id: 'xof',
          name: 'Family',
          currency: 'XOF',
          amountMinor: 50000,
          anchorDate: '2026-11-20',
          nextDueOn: '2026-11-20',
        }),
      ],
      '2026-11-11',
      '2026-12-10',
    );
    expect(list.map((o) => `${o.billId}@${o.dueOn}`)).toEqual([
      'late@2026-11-02',
      'xof@2026-11-20',
      'rent@2026-11-30',
      'late@2026-12-02',
    ]);
  });

  it('monthly equivalent', () => {
    expect(monthlyEquivalent(1000, 'weekly', 1)).toBe(4333);
    expect(monthlyEquivalent(12000, 'yearly', 1)).toBe(1000);
    expect(monthlyEquivalent(3000, 'monthly', 3)).toBe(1000);
  });
});

describe('reports', () => {
  const data = [
    tx({ kind: 'income', amountMinor: 400000, occurredOn: '2026-10-01', categoryId: 'salary' }),
    tx({ kind: 'expense', amountMinor: 150000, occurredOn: '2026-10-02', categoryId: 'rent' }),
    tx({ kind: 'income', amountMinor: 400000, occurredOn: '2026-11-01', categoryId: 'salary' }),
    tx({ kind: 'expense', amountMinor: 150000, occurredOn: '2026-11-02', categoryId: 'rent' }),
    tx({ kind: 'expense', amountMinor: 50000, occurredOn: '2026-11-03', categoryId: 'food' }),
    tx({ kind: 'expense', amountMinor: 999999, occurredOn: '2026-11-03', currency: 'XOF' }),
  ];

  it('month summary per currency', () => {
    const s = monthSummary(data, 'CAD', '2026-11');
    expect(s).toEqual({ incomeMinor: 400000, expenseMinor: 200000, netMinor: 200000, count: 3 });
    expect(savingsRate(s)).toBe(0.5);
    expect(monthSummary(data, 'XOF', '2026-11').expenseMinor).toBe(999999);
  });

  it('trend includes empty months', () => {
    const t = monthlyTrend(data, 'CAD', '2026-09', '2026-11');
    expect(t.map((p) => [p.month, p.netMinor])).toEqual([
      ['2026-09', 0],
      ['2026-10', 250000],
      ['2026-11', 200000],
    ]);
  });

  it('category breakdown sorted by amount', () => {
    const b = categoryBreakdown(data, 'expense', 'CAD', '2026-11-01', '2026-11-30');
    expect(b.map((c) => c.categoryId)).toEqual(['rent', 'food']);
    expect(b[0]!.share).toBe(0.75);
  });

  it('cash flow running balance', () => {
    const f = cashFlow(data, 'CAD', '2026-11-01', '2026-11-04', 1000);
    expect(f.map((p) => p.balanceMinor)).toEqual([401000, 251000, 201000, 201000]);
  });
});

describe('csv', () => {
  it('escapes, guards formulas and writes exact signed amounts', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5', { numeric: true })).toBe('-5');
    const csv = transactionsToCsv(
      [
        tx({
          id: '1',
          kind: 'expense',
          amountMinor: 4250,
          description: '+cmd',
          categoryId: 'c',
          occurredOn: '2026-11-02',
        }),
        tx({
          id: '2',
          kind: 'income',
          amountMinor: 1500,
          currency: 'XOF',
          occurredOn: '2026-11-01',
          note: 'line\nbreak',
        }),
      ],
      new Map([['c', { name: 'Groceries' }]]),
      new Map([['acc', { name: 'Wallet' }]]),
    );
    expect(csv.split('\r\n')).toEqual([
      'date,type,amount,currency,category,account,description,note',
      '2026-11-01,income,1500,XOF,,Wallet,,"line\nbreak"',
      "2026-11-02,expense,-42.50,CAD,Groceries,Wallet,'+cmd,",
      '',
    ]);
  });
});
