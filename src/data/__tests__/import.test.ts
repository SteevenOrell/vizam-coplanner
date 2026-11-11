import { readFileSync } from 'fs';
import { join } from 'path';

import { suggestCategory } from '../../domain/import/categorize';
import { decodeBytes, parseImportText } from '../../domain/import/csv';
import { buildDrafts } from '../../domain/import/drafts';
import { detectLayout } from '../../domain/import/layout';
import { openBetterSqliteDriver } from '../db/betterSqliteDriver';
import type { SqlDriver } from '../db/driver';
import { migrate } from '../db/migrate';
import { createAccount, createCategory, deleteCategory, listCategories } from '../repos/core';
import {
  deleteCategoryRule,
  findDuplicates,
  findImportProfile,
  importTransactions,
  ImportRowError,
  listCategoryRules,
  listImportBatches,
  listImportProfiles,
  saveImportProfile,
  undoImport,
  upsertCategoryRule,
  type ImportRow,
} from '../repos/import';
import { createTransaction, listTransactions } from '../repos/transactions';
import { ValidationError } from '../tables';

function fixtureText(name: string): string {
  return decodeBytes(new Uint8Array(readFileSync(join(__dirname, '../../../tests/fixtures/bank', name))));
}

interface Ctx {
  db: SqlDriver;
  cad: string;
  xof: string;
  salary: string;
  groceries: string;
  dining: string;
}

async function setup(): Promise<Ctx> {
  const db = openBetterSqliteDriver();
  await migrate(db);
  const cad = (await createAccount(db, { name: 'Chequing', kind: 'checking', currency: 'CAD', openingBalanceMinor: 0 })).id;
  const xof = (await createAccount(db, { name: 'Mobile money', kind: 'cash', currency: 'XOF', openingBalanceMinor: 0 })).id;
  const mk = (name: string, kind: 'income' | 'expense', icon: string) =>
    createCategory(db, { name, kind, icon, color: '#336699' }).then((c) => c.id);
  return {
    db,
    cad,
    xof,
    salary: await mk('Salary', 'income', 'briefcase'),
    groceries: await mk('Groceries', 'expense', 'cart'),
    dining: await mk('Dining', 'expense', 'utensils'),
  };
}

const row = (over: Partial<ImportRow> = {}): ImportRow => ({
  occurredOn: '2026-11-03',
  description: 'Coffee',
  amountMinor: 450,
  kind: 'expense',
  categoryId: null,
  ...over,
});

const count = async (db: SqlDriver, table: string) =>
  (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;

describe('importTransactions', () => {
  it('inserts rows with the account currency, queues them for sync and records a batch', async () => {
    const { db, cad, groceries, salary } = await setup();
    const res = await importTransactions(
      db,
      cad,
      [
        row({ categoryId: groceries, description: '  Metro  ', amountMinor: 5432 }),
        row({ kind: 'income', categoryId: salary, amountMinor: 245000, description: 'Payroll' }),
      ],
      'bank.csv',
    );
    expect(res.count).toBe(2);
    const txs = await listTransactions(db, { accountId: cad });
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.currency === 'CAD' && t.recurringBillId === null)).toBe(true);
    expect(txs.find((t) => t.kind === 'expense')).toMatchObject({ description: 'Metro', amountMinor: 5432 });
    const queued = await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE table_name = 'transactions'");
    expect(queued[0]!.n).toBeGreaterThanOrEqual(2);
    const batches = await listImportBatches(db);
    expect(batches).toEqual([
      expect.objectContaining({ id: res.batchId, accountId: cad, sourceName: 'bank.csv', rowCount: 2 }),
    ]);
    expect(await count(db, 'import_batch_items')).toBe(2);
  });

  it('takes the currency from the account (XOF stays whole francs)', async () => {
    const { db, xof } = await setup();
    await importTransactions(db, xof, [row({ amountMinor: 1500 })], 'x.csv');
    expect((await listTransactions(db, { accountId: xof }))[0]).toMatchObject({ currency: 'XOF', amountMinor: 1500 });
  });

  it.each([
    ['amount', row({ amountMinor: 0 })],
    ['amount', row({ amountMinor: 1.5 })],
    ['date', row({ occurredOn: '2026-02-30' })],
    ['description', row({ description: 'x'.repeat(121) })],
  ])('is all or nothing: a bad %s on the last row inserts nothing', async (code, bad) => {
    const { db, cad } = await setup();
    const p = importTransactions(db, cad, [row(), row({ description: 'Second' }), bad], 'bank.csv');
    await expect(p).rejects.toMatchObject({ code, index: 2 });
    await expect(p).rejects.toBeInstanceOf(ImportRowError);
    expect(await count(db, 'transactions')).toBe(0);
    expect(await count(db, 'import_batches')).toBe(0);
    expect(await count(db, 'import_batch_items')).toBe(0);
    expect(await db.first("SELECT 1 AS x FROM outbox WHERE table_name = 'transactions'")).toBeNull();
  });

  it('rejects a category of the other kind or a missing one, and checks the account', async () => {
    const { db, cad, groceries, salary } = await setup();
    await expect(importTransactions(db, cad, [row(), row({ categoryId: salary })], 's')).rejects.toMatchObject({
      code: 'category',
      index: 1,
    });
    await expect(importTransactions(db, cad, [row({ categoryId: 'nope' })], 's')).rejects.toMatchObject({ code: 'category' });
    await expect(importTransactions(db, 'missing', [row({ categoryId: groceries })], 's')).rejects.toMatchObject({
      code: 'account',
    });
    await expect(importTransactions(db, cad, [], 's')).rejects.toMatchObject({ code: 'empty' });
    expect(await count(db, 'transactions')).toBe(0);
  });
});

describe('undoImport', () => {
  it('soft-deletes that batch only and removes its rows, leaving other data alone', async () => {
    const { db, cad } = await setup();
    const manual = await createTransaction(db, {
      accountId: cad,
      categoryId: null,
      kind: 'expense',
      amountMinor: 999,
      occurredOn: '2026-11-01',
      description: 'Manual',
      note: '',
    });
    const a = await importTransactions(db, cad, [row(), row({ description: 'Two' })], 'a.csv');
    const b = await importTransactions(db, cad, [row({ description: 'Other batch' })], 'b.csv');
    expect(await listTransactions(db)).toHaveLength(4);

    await expect(undoImport(db, a.batchId)).resolves.toBe(2);
    const left = await listTransactions(db);
    expect(left.map((t) => t.description).sort()).toEqual(['Manual', 'Other batch']);
    expect(left.some((t) => t.id === manual.id)).toBe(true);
    // Soft delete: the rows still exist (so the deletion syncs).
    expect((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NOT NULL'))!.n).toBe(2);
    expect((await listImportBatches(db)).map((x) => x.id)).toEqual([b.batchId]);
    expect(await count(db, 'import_batch_items')).toBe(1);
    await expect(undoImport(db, a.batchId)).rejects.toBeInstanceOf(ValidationError);
  });

  it('does not count transactions already deleted by hand', async () => {
    const { db, cad } = await setup();
    const r = await importTransactions(db, cad, [row(), row({ description: 'Two' })], 'a.csv');
    const [first] = await listTransactions(db);
    await db.run('UPDATE transactions SET deleted_at = ? WHERE id = ?', ['2026-11-11T00:00:00Z', first!.id]);
    await expect(undoImport(db, r.batchId)).resolves.toBe(1);
  });
});

describe('category rules', () => {
  it('upserts, lists and deletes; validates the category and its kind', async () => {
    const { db, groceries, dining, salary } = await setup();
    const r1 = await upsertCategoryRule(db, { pattern: ' Metro ', kind: 'expense', categoryId: groceries });
    expect(r1.pattern).toBe('Metro');
    const r2 = await upsertCategoryRule(db, { pattern: 'METRO', kind: 'expense', categoryId: dining });
    expect(r2.id).toBe(r1.id);
    expect(await listCategoryRules(db)).toEqual([{ id: r1.id, pattern: 'Metro', kind: 'expense', categoryId: dining }]);
    // Same pattern, other kind: a separate rule.
    await upsertCategoryRule(db, { pattern: 'metro', kind: 'income', categoryId: salary });
    expect(await listCategoryRules(db)).toHaveLength(2);

    await expect(upsertCategoryRule(db, { pattern: 'x', kind: 'expense', categoryId: groceries })).rejects.toMatchObject({ code: 'pattern' });
    await expect(upsertCategoryRule(db, { pattern: 'abc', kind: 'expense', categoryId: salary })).rejects.toMatchObject({ code: 'category' });
    await expect(upsertCategoryRule(db, { pattern: 'abc', kind: 'expense', categoryId: 'nope' })).rejects.toMatchObject({ code: 'category' });

    await deleteCategoryRule(db, r1.id);
    expect(await listCategoryRules(db)).toHaveLength(1);
  });

  it('ignores rules whose category was deleted', async () => {
    const { db, groceries } = await setup();
    await upsertCategoryRule(db, { pattern: 'metro', kind: 'expense', categoryId: groceries });
    await deleteCategory(db, groceries);
    expect(await listCategoryRules(db)).toEqual([]);
  });
});

describe('saved layouts', () => {
  it('saves per account, finds by header layout and replaces on re-save', async () => {
    const { db, cad, xof } = await setup();
    const file = parseImportText(fixtureText('xof.csv'));
    const mapping = detectLayout(file, 'XOF').mapping;
    expect(await findImportProfile(db, xof, mapping.signature)).toBeNull();
    const p = await saveImportProfile(db, xof, mapping);
    expect(await findImportProfile(db, xof, mapping.signature)).toMatchObject({ id: p.id, mapping });
    expect(await findImportProfile(db, cad, mapping.signature)).toBeNull();

    const again = await saveImportProfile(db, xof, { ...mapping, invertSign: true });
    expect(again.id).toBe(p.id);
    const list = await listImportProfiles(db, xof);
    expect(list).toHaveLength(1);
    expect(list[0]!.mapping.invertSign).toBe(true);
    expect(await findImportProfile(db, xof, '')).toBeNull();
    await expect(saveImportProfile(db, 'missing', mapping)).rejects.toMatchObject({ code: 'account' });
  });
});

describe('whole pipeline on the fixtures', () => {
  it.each([
    ['canadian.csv', 'CAD', 10, 1, 245000, 142915],
    ['french-cp1252.csv', 'CAD', 8, 1, 245000, 85000 + 6348 + 1290 + 1099 + 340 + 123456 + 7420],
    ['xof.csv', 'XOF', 7, 2, 375000, 147000],
  ] as const)('%s: parse, map, dedupe, categorise, import, undo', async (name, currency, n, incomes, inMinor, outMinor) => {
    const ctx = await setup();
    const accountId = currency === 'CAD' ? ctx.cad : ctx.xof;
    const file = parseImportText(fixtureText(name));
    const { mapping } = detectLayout(file, currency);
    const { drafts, errorCount } = buildDrafts(file, mapping, currency);
    expect(errorCount).toBe(0);
    expect(drafts).toHaveLength(n);

    const categories = await listCategories(ctx.db);
    const rules = await listCategoryRules(ctx.db);
    const rows: ImportRow[] = drafts.map((d) => ({
      occurredOn: d.occurredOn!,
      description: d.description,
      amountMinor: d.amountMinor,
      kind: d.kind,
      categoryId: suggestCategory(d, rules, categories)?.categoryId ?? null,
    }));
    const first = await importTransactions(ctx.db, accountId, rows, name);
    expect(first.count).toBe(n);
    const txs = await listTransactions(ctx.db, { accountId });
    expect(txs.filter((t) => t.kind === 'income')).toHaveLength(incomes);
    expect(txs.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amountMinor, 0)).toBe(inMinor);
    expect(txs.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amountMinor, 0)).toBe(outMinor);
    expect(txs.every((t) => t.currency === currency)).toBe(true);
    expect(txs.some((t) => t.categoryId !== null)).toBe(true);

    // Importing the same file again: every row (except in-file repeats) is flagged as already there.
    const dups = await findDuplicates(ctx.db, accountId, drafts);
    expect(dups.size).toBe(drafts.length);
    expect([...dups.values()].every((k) => k === 'existing')).toBe(true);

    await expect(undoImport(ctx.db, first.batchId)).resolves.toBe(n);
    expect(await listTransactions(ctx.db)).toHaveLength(0);
    expect((await findDuplicates(ctx.db, accountId, drafts)).size).toBe(name === 'canadian.csv' ? 1 : 0);
  });

  it('findDuplicates does not look at other accounts', async () => {
    const { db, cad, xof } = await setup();
    await importTransactions(db, cad, [row()], 'a');
    const drafts = [{ line: 2, occurredOn: '2026-11-03', description: 'Coffee', amountMinor: 450, kind: 'expense' as const, error: null }];
    expect((await findDuplicates(db, cad, drafts)).get(2)).toBe('existing');
    expect((await findDuplicates(db, xof, drafts)).size).toBe(0);
  });
});
