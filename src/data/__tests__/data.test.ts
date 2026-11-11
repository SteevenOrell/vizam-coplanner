import { addDays, monthOf } from '../../domain/dates';
import { openBetterSqliteDriver } from '../db/betterSqliteDriver';
import type { SqlDriver } from '../db/driver';
import { migrate } from '../db/migrate';
import {
  createAccount,
  createCategory,
  getPreferences,
  listAccountBalances,
  listCategories,
  updatePreferences,
} from '../repos/core';
import {
  listNotifications,
  refreshDerivedNotifications,
  stableId,
  unreadCount,
  type NotificationText,
} from '../repos/notifications';
import {
  addContribution,
  copyPreviousBudget,
  createBill,
  createGoal,
  deleteContribution,
  deleteGoal,
  getBudget,
  getGoal,
  listBills,
  listGoals,
  markBillPaid,
  saveBudget,
  skipBillOccurrence,
} from '../repos/planning';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  restoreTransaction,
  updateTransaction,
} from '../repos/transactions';
import { seedDemoData, seedStarterCategories } from '../seed/demo';
import { pullChanges, pushOutbox, syncOnce, type Remote, type RemoteRow } from '../sync';
import type { SyncTable } from '../tables';

const TODAY = '2026-11-11';
let db: SqlDriver;

beforeEach(async () => {
  db = openBetterSqliteDriver();
  await migrate(db);
});

afterEach(async () => {
  await db.close();
});

async function basics() {
  await seedStarterCategories(db);
  const cad = await createAccount(db, {
    name: 'Chequing',
    kind: 'checking',
    currency: 'CAD',
    openingBalanceMinor: 10000,
  });
  const xof = await createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'XOF', openingBalanceMinor: 0 });
  const cats = await listCategories(db);
  const groceries = cats.find((c) => c.name === 'Groceries')!;
  const salary = cats.find((c) => c.name === 'Salary')!;
  return { cad, xof, groceries, salary };
}

describe('transactions', () => {
  it('takes the currency from the account and validates kinds and amounts', async () => {
    const { cad, xof, groceries, salary } = await basics();
    const t = await createTransaction(db, {
      accountId: xof.id,
      categoryId: groceries.id,
      kind: 'expense',
      amountMinor: 2500,
      occurredOn: TODAY,
      description: '  Market  ',
      note: '',
    });
    expect(t.currency).toBe('XOF');
    expect(t.description).toBe('Market');

    const base = {
      accountId: cad.id,
      categoryId: null,
      kind: 'expense' as const,
      occurredOn: TODAY,
      description: '',
      note: '',
    };
    await expect(createTransaction(db, { ...base, amountMinor: 0 })).rejects.toMatchObject({ code: 'amount' });
    await expect(createTransaction(db, { ...base, amountMinor: 1.5 })).rejects.toMatchObject({ code: 'amount' });
    await expect(createTransaction(db, { ...base, amountMinor: 100, occurredOn: '2026-02-30' })).rejects.toMatchObject({
      code: 'date',
    });
    await expect(createTransaction(db, { ...base, amountMinor: 100, categoryId: salary.id })).rejects.toMatchObject({
      code: 'category',
    });
    await expect(createTransaction(db, { ...base, amountMinor: 100, accountId: 'nope' })).rejects.toMatchObject({
      code: 'account',
    });
  });

  it('filters, searches safely, updates, deletes and restores', async () => {
    const { cad, groceries, salary } = await basics();
    const mk = (p: Partial<Parameters<typeof createTransaction>[1]>) =>
      createTransaction(db, {
        accountId: cad.id,
        categoryId: groceries.id,
        kind: 'expense',
        amountMinor: 1000,
        occurredOn: TODAY,
        description: 'Groceries',
        note: '',
        ...p,
      });
    const a = await mk({ description: '100% organic', occurredOn: '2026-11-01' });
    await mk({ description: 'Corner store', note: 'milk_2L' });
    await mk({ kind: 'income', categoryId: salary.id, amountMinor: 500000, description: 'Pay' });

    expect((await listTransactions(db, { search: '100%' })).map((t) => t.id)).toEqual([a.id]);
    expect(await listTransactions(db, { search: '%' })).toHaveLength(1);
    expect(await listTransactions(db, { search: 'MILK_' })).toHaveLength(1);
    expect(await listTransactions(db, { search: "'; DROP TABLE transactions; --" })).toHaveLength(0);
    expect(await listTransactions(db, { kind: 'income' })).toHaveLength(1);
    expect(await listTransactions(db, { from: '2026-11-05' })).toHaveLength(2);

    const updated = await updateTransaction(db, a.id, {
      accountId: cad.id,
      categoryId: groceries.id,
      kind: 'expense',
      amountMinor: 2222,
      occurredOn: '2026-11-02',
      description: 'Edited',
      note: 'n',
    });
    expect(updated.amountMinor).toBe(2222);

    const [balance] = await listAccountBalances(db);
    expect(balance!.balanceMinor).toBe(10000 - 2222 - 1000 + 500000);

    await deleteTransaction(db, a.id);
    expect(await listTransactions(db)).toHaveLength(2);
    await restoreTransaction(db, updated);
    expect(await listTransactions(db)).toHaveLength(3);
  });
});

describe('budgets', () => {
  it('saves allocations, computes usage per currency and copies the previous month', async () => {
    const { cad, xof, groceries, salary } = await basics();
    await createTransaction(db, {
      accountId: cad.id,
      categoryId: groceries.id,
      kind: 'expense',
      amountMinor: 41000,
      occurredOn: TODAY,
      description: '',
      note: '',
    });
    await createTransaction(db, {
      accountId: xof.id,
      categoryId: groceries.id,
      kind: 'expense',
      amountMinor: 99999,
      occurredOn: TODAY,
      description: '',
      note: '',
    });
    await saveBudget(db, '2026-11', 'CAD', [{ categoryId: groceries.id, limitMinor: 50000 }]);
    const b = (await getBudget(db, '2026-11', 'CAD'))!;
    expect(b.usage.categories[0]).toMatchObject({ spentMinor: 41000, remainingMinor: 9000, status: 'near' });

    await expect(saveBudget(db, '2026-11', 'CAD', [{ categoryId: salary.id, limitMinor: 1 }])).rejects.toMatchObject({
      code: 'category',
    });
    await expect(
      saveBudget(db, '2026-11', 'CAD', [
        { categoryId: groceries.id, limitMinor: 1 },
        { categoryId: groceries.id, limitMinor: 2 },
      ]),
    ).rejects.toMatchObject({ code: 'duplicateCategory' });

    // Saving again with an empty list removes the allocation but keeps one budget row.
    await saveBudget(db, '2026-11', 'CAD', []);
    expect((await getBudget(db, '2026-11', 'CAD'))!.allocations).toHaveLength(0);
    await saveBudget(db, '2026-11', 'CAD', [{ categoryId: groceries.id, limitMinor: 60000 }]);

    expect(await copyPreviousBudget(db, '2026-11', 'XOF')).toBeNull();
    await copyPreviousBudget(db, '2026-12', 'CAD');
    expect((await getBudget(db, '2026-12', 'CAD'))!.allocations[0]!.limitMinor).toBe(60000);
  });
});

describe('savings goals', () => {
  it('records deposits and refuses to overdraw', async () => {
    const goal = await createGoal(db, {
      name: 'Trip',
      targetMinor: 100000,
      currency: 'CAD',
      targetDate: '2027-05-11',
      icon: 'plane',
      color: '#3778F6',
    });
    const dep = await addContribution(db, goal.id, 30000, TODAY);
    await addContribution(db, goal.id, -10000, TODAY);
    await expect(addContribution(db, goal.id, -20001, TODAY)).rejects.toMatchObject({ code: 'overdraw' });
    await expect(addContribution(db, goal.id, 0, TODAY)).rejects.toMatchObject({ code: 'amount' });
    // Removing the deposit would leave the withdrawal below zero.
    await expect(deleteContribution(db, dep.id)).rejects.toMatchObject({ code: 'overdraw' });

    const g = (await getGoal(db, goal.id, TODAY))!;
    expect(g.goal.progress).toMatchObject({ savedMinor: 20000, remainingMinor: 80000, monthlyNeededMinor: 13334 });
    expect(g.contributions).toHaveLength(2);

    await deleteGoal(db, goal.id);
    expect(await listGoals(db, TODAY)).toHaveLength(0);
  });
});

describe('recurring bills', () => {
  it('marks paid once per due date and advances; skip moves on without a transaction', async () => {
    const { cad, xof, groceries } = await basics();
    const bill = await createBill(db, {
      name: 'Phone',
      amountMinor: 6500,
      currency: 'CAD',
      accountId: cad.id,
      categoryId: groceries.id,
      frequency: 'monthly',
      interval: 1,
      anchorDate: '2026-11-30',
      endOn: null,
      remindDaysBefore: 2,
      isSubscription: false,
    });
    const { transaction, bill: after } = await markBillPaid(db, bill.id, '2026-11-30', TODAY, cad.id);
    expect(transaction).toMatchObject({ amountMinor: 6500, currency: 'CAD', recurringBillId: bill.id });
    expect(after.nextDueOn).toBe('2026-12-30');
    await expect(markBillPaid(db, bill.id, '2026-11-30', TODAY, cad.id)).rejects.toMatchObject({ code: 'alreadyPaid' });
    await expect(markBillPaid(db, bill.id, '2026-12-30', TODAY, xof.id)).rejects.toMatchObject({
      code: 'accountCurrency',
    });
    const skipped = await skipBillOccurrence(db, bill.id, '2026-12-30');
    expect(skipped.nextDueOn).toBe('2027-01-30');
    expect(await listTransactions(db)).toHaveLength(1);

    await expect(
      createBill(db, { ...bill, accountId: xof.id, anchorDate: '2026-11-30', endOn: null }),
    ).rejects.toMatchObject({ code: 'accountCurrency' });
  });

  it('a bill whose series ends becomes inactive after the last payment', async () => {
    const { cad } = await basics();
    const bill = await createBill(db, {
      name: 'Course',
      amountMinor: 1000,
      currency: 'CAD',
      accountId: cad.id,
      categoryId: null,
      frequency: 'monthly',
      interval: 1,
      anchorDate: '2026-11-15',
      endOn: '2026-11-20',
      remindDaysBefore: 0,
      isSubscription: false,
    });
    const { bill: after } = await markBillPaid(db, bill.id, '2026-11-15', '2026-11-15', cad.id);
    expect(after.active).toBe(false);
    expect(await listBills(db, { includeInactive: false })).toHaveLength(0);
  });
});

const text: NotificationText = {
  billDue: (name, amount, dueOn) => ({ title: `${name} due`, body: `${amount} on ${dueOn}` }),
  budgetNear: (c, p) => ({ title: `${c} ${p}%`, body: '' }),
  budgetOver: (c, a) => ({ title: `${c} over`, body: a }),
  goalReached: (n) => ({ title: `${n} reached`, body: '' }),
};

describe('demo data and derived notifications', () => {
  it('seeds a consistent, deterministic demo', async () => {
    await seedDemoData(db, TODAY);
    const txs = await listTransactions(db);
    expect(txs.length).toBeGreaterThan(100);
    expect(txs.every((t) => t.occurredOn <= TODAY)).toBe(true);
    expect(new Set(txs.map((t) => t.currency))).toEqual(new Set(['CAD', 'XOF']));
    expect((await getBudget(db, monthOf(TODAY), 'XOF'))!.allocations).toHaveLength(2);
    const goals = await listGoals(db, TODAY);
    expect(goals).toHaveLength(3);
    expect(goals.every((g) => g.progress.savedMinor > 0)).toBe(true);
    const bills = await listBills(db);
    expect(bills.every((b) => b.nextDueOn >= TODAY)).toBe(true);
    expect((await getPreferences(db)).displayName).toBe('Alex Demo');
    expect(await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')).toEqual({ n: 0 });
    // Every account's balance is a whole number of minor units in its own currency.
    for (const a of await listAccountBalances(db)) expect(Number.isSafeInteger(a.balanceMinor)).toBe(true);
  });

  it('creates notifications once (stable ids)', async () => {
    await seedDemoData(db, TODAY);
    const prefs = await getPreferences(db);
    const first = await refreshDerivedNotifications(db, TODAY, prefs, text, 'en-CA');
    expect(first).toBeGreaterThan(0);
    expect(await refreshDerivedNotifications(db, TODAY, prefs, text, 'en-CA')).toBe(0);
    const later = new Date(Date.parse(`${addDays(TODAY, 40)}T12:00:00Z`)).toISOString();
    const all = await listNotifications(db, later);
    expect(all.length).toBe(first);
    expect(all.some((n) => n.kind === 'bill_due')).toBe(true);
    expect(await unreadCount(db, later)).toBe(first);
    expect(stableId('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableId('a')).not.toBe(stableId('b'));
  });

  it('respects notification preferences', async () => {
    await seedDemoData(db, TODAY);
    const prefs = await updatePreferences(db, { notifyBills: false, notifyBudgets: false });
    await refreshDerivedNotifications(db, TODAY, prefs, text, 'en-CA');
    const all = await listNotifications(db, '2100-01-01T00:00:00Z');
    expect(all.every((n) => n.kind === 'goal_reached')).toBe(true);
  });
});

/** In-memory stand-in for Supabase: upserts by id, server-side updated_at, optional rejection. */
function fakeRemote(reject?: (table: SyncTable, row: RemoteRow) => string | null) {
  const tables = new Map<string, Map<string, RemoteRow>>();
  let clock = Date.parse('2026-11-11T10:00:00Z');
  let prefs: RemoteRow | null = null;
  let displayName: string | null = null;
  const remote: Remote = {
    async upsert(table, rows) {
      for (const row of rows) {
        const code = reject?.(table, row);
        if (code) throw Object.assign(new Error('rejected'), { code });
      }
      const t = tables.get(table) ?? new Map();
      for (const row of rows) t.set(String(row.id), { ...row, updated_at: new Date((clock += 1000)).toISOString() });
      tables.set(table, t);
    },
    async pull(table, since, limit) {
      return [...(tables.get(table)?.values() ?? [])]
        .filter((r) => !since || String(r.updated_at) > since)
        .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
        .slice(0, limit);
    },
    async savePreferences(p, name) {
      prefs = { ...p, updated_at: new Date().toISOString() };
      displayName = name;
    },
    async loadPreferences() {
      return { prefs, displayName };
    },
  };
  return { remote, tables };
}

describe('sync', () => {
  it('pushes the outbox in order with user_id, then another device pulls it', async () => {
    const { remote, tables } = fakeRemote();
    const { cad, groceries } = await basics();
    await createTransaction(db, {
      accountId: cad.id,
      categoryId: groceries.id,
      kind: 'expense',
      amountMinor: 1234,
      occurredOn: TODAY,
      description: 'x',
      note: '',
    });
    await updatePreferences(db, { displayName: 'Sam', primaryCurrency: 'XOF' });
    const res = await syncOnce(db, remote, 'user-1');
    expect(res.rejected).toBe(0);
    expect(await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')).toEqual({ n: 0 });
    const pushedTx = [...tables.get('transactions')!.values()][0]!;
    expect(pushedTx).toMatchObject({ user_id: 'user-1', amount_minor: 1234, currency: 'CAD', kind: 'expense' });
    const pushedAccount = [...tables.get('accounts')!.values()].find((a) => a.id === cad.id)!;
    expect(pushedAccount.archived).toBe(false);

    const other = openBetterSqliteDriver();
    await migrate(other);
    await syncOnce(other, remote, 'user-1');
    expect(await listTransactions(other)).toHaveLength(1);
    expect((await listCategories(other)).length).toBe(12);
    expect((await getPreferences(other)).displayName).toBe('Sam');
    expect((await listAccountBalances(other)).find((a) => a.id === cad.id)!.balanceMinor).toBe(10000 - 1234);
    await other.close();
  });

  it('keeps unpushed local edits over pulled rows and drops rows the server rejects for good', async () => {
    const { remote } = fakeRemote((table, row) => (table === 'categories' && row.name === 'Bad' ? '23514' : null));
    const { cad } = await basics();
    await createCategory(db, { name: 'Bad', kind: 'expense', icon: 'tag', color: '#000000' });
    const res = await pushOutbox(db, remote, 'u');
    expect(res.rejected).toBe(1);
    expect(await db.first<{ value: string }>("SELECT value FROM meta WHERE key = 'sync:rejected'")).toEqual({
      value: '1',
    });

    // Server has an older name for the account; a local unpushed rename must win.
    await remote.upsert('accounts', [
      {
        id: cad.id,
        name: 'Server name',
        kind: 'checking',
        currency: 'CAD',
        opening_balance_minor: 0,
        archived: false,
        created_at: 'x',
        deleted_at: null,
      },
    ]);
    await db.run("UPDATE accounts SET name = 'Local name' WHERE id = ?", [cad.id]);
    await db.run("INSERT INTO outbox (table_name, row_id, created_at) VALUES ('accounts', ?, 'now')", [cad.id]);
    await pullChanges(db, remote);
    expect((await db.first<{ name: string }>('SELECT name FROM accounts WHERE id = ?', [cad.id]))!.name).toBe(
      'Local name',
    );
  });

  it('a network failure keeps the outbox for the next attempt', async () => {
    const remote: Remote = {
      upsert: async () => {
        throw new Error('Network request failed');
      },
      pull: async () => [],
      savePreferences: async () => undefined,
      loadPreferences: async () => ({ prefs: null, displayName: null }),
    };
    await basics();
    await expect(pushOutbox(db, remote, 'u')).rejects.toThrow('Network');
    const n = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
    expect(n!.n).toBeGreaterThan(0);
  });
});
