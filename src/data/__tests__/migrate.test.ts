import { openBetterSqliteDriver } from '../db/betterSqliteDriver';
import { getSchemaVersion, migrate, migrations } from '../db/migrate';
import { createAccount, getPreferences, listAccountBalances, updatePreferences } from '../repos/core';
import { getBudget, listBills, listGoals } from '../repos/planning';
import { listTransactions } from '../repos/transactions';
import { seedDemoData } from '../seed/demo';

const TODAY = '2026-11-11';

describe('migration 002 (more currencies, import tables)', () => {
  it('upgrades a populated v1 database without losing rows and keeps foreign keys on', async () => {
    const db = openBetterSqliteDriver();
    await migrate(db, migrations.slice(0, 1));
    await seedDemoData(db, TODAY);
    const before = {
      txs: (await listTransactions(db)).length,
      balances: await listAccountBalances(db),
      bills: (await listBills(db)).length,
      goals: (await listGoals(db, TODAY)).map((g) => g.progress.savedMinor),
      budget: (await getBudget(db, '2026-11', 'CAD'))!.usage.spentMinor,
      prefs: await getPreferences(db),
    };

    expect(await migrate(db)).toEqual([2]);
    expect(await getSchemaVersion(db)).toBe(2);

    expect((await listTransactions(db)).length).toBe(before.txs);
    expect(await listAccountBalances(db)).toEqual(before.balances);
    expect((await listBills(db)).length).toBe(before.bills);
    expect((await listGoals(db, TODAY)).map((g) => g.progress.savedMinor)).toEqual(before.goals);
    expect((await getBudget(db, '2026-11', 'CAD'))!.usage.spentMinor).toBe(before.budget);
    expect(await getPreferences(db)).toEqual(before.prefs);

    expect(await db.first<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    // Unique partial indexes survived the rebuild.
    await expect(
      db.run(
        "INSERT INTO budgets (id, month, currency, created_at, updated_at) VALUES ('x', '2026-11-01', 'CAD', 'n', 'n')",
      ),
    ).rejects.toThrow(/UNIQUE/);

    // New currencies now pass the local constraints; unknown codes are still refused by the repos.
    const eur = await createAccount(db, {
      name: 'Euro card',
      kind: 'checking',
      currency: 'EUR',
      openingBalanceMinor: 1050,
    });
    expect(eur.currency).toBe('EUR');
    await updatePreferences(db, { primaryCurrency: 'XAF' });
    expect((await getPreferences(db)).primaryCurrency).toBe('XAF');
    await expect(db.run("UPDATE accounts SET currency = 'eu' WHERE id = ?", [eur.id])).rejects.toThrow(/CHECK/);

    await expect(
      createAccount(db, { name: 'Yen', kind: 'cash', currency: 'JPY' as never, openingBalanceMinor: 0 }),
    ).rejects.toMatchObject({ code: 'currency' });

    // Import tables exist.
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'import%' OR name = 'category_rules'",
    );
    expect(tables.map((t) => t.name).sort()).toEqual([
      'category_rules',
      'import_batch_items',
      'import_batches',
      'import_profiles',
    ]);
    await db.close();
  });
});
