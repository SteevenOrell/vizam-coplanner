import { readFileSync } from 'fs';
import { join } from 'path';

import type { Category } from '../../models';
import { suggestCategory, keywordFor } from '../categorize';
import { decodeBytes, parseImportText } from '../csv';
import { buildDrafts, totalsOf } from '../drafts';
import { detectDuplicates } from '../duplicates';
import { analyzeDateColumn, detectLayout, mappingFits, parseMapping } from '../layout';
import { ImportLimitError, MAX_IMPORT_ROWS } from '../types';

export function fixture(name: string): string {
  const bytes = readFileSync(join(__dirname, '../../../../tests/fixtures/bank', name));
  return decodeBytes(new Uint8Array(bytes));
}

const cat = (id: string, kind: 'income' | 'expense', icon: string): Category => ({
  id,
  kind,
  icon,
  name: id,
  color: '#000000',
  createdAt: '',
  updatedAt: '',
});
const CATEGORIES = [
  cat('salary', 'income', 'briefcase'),
  cat('housing', 'expense', 'home'),
  cat('groceries', 'expense', 'cart'),
  cat('dining', 'expense', 'utensils'),
  cat('transport', 'expense', 'bus'),
  cat('utilities', 'expense', 'bolt'),
  cat('health', 'expense', 'heart'),
  cat('subs', 'expense', 'repeat'),
  cat('family', 'expense', 'users'),
];

describe('Canadian fixture (comma, MM/DD/YYYY, debit and credit, preamble)', () => {
  const file = parseImportText(fixture('canadian.csv'));
  const guess = detectLayout(file, 'CAD');

  it('finds the header below the preamble and the columns', () => {
    expect(file.delimiter).toBe(',');
    expect(guess.mapping).toMatchObject({
      startRow: 1,
      hasHeader: true,
      dateCol: 0,
      descriptionCol: 1,
      amountMode: 'split',
      debitCol: 2,
      creditCol: 3,
      dateFormat: 'mdy-slash',
      decimalMark: '.',
    });
    expect(guess.dates.ambiguous).toBe(false);
  });

  it('builds exact drafts and counts what it skipped', () => {
    const r = buildDrafts(file, guess.mapping, 'CAD');
    expect(r.errorCount).toBe(0);
    expect(r.skippedEmpty).toBe(1);
    expect(r.skippedZero).toBe(1);
    expect(r.drafts).toHaveLength(10);
    expect(r.drafts[0]).toMatchObject({
      occurredOn: '2026-11-01',
      description: 'ACME PAYROLL, DIRECT DEPOSIT',
      kind: 'income',
      amountMinor: 245000,
    });
    expect(totalsOf(r.drafts)).toEqual({ incomeCount: 1, incomeMinor: 245000, expenseCount: 9, expenseMinor: 142915 });
  });

  it('flags the repeated coffee inside the file and categorises by keyword', () => {
    const { drafts } = buildDrafts(file, guess.mapping, 'CAD');
    const dups = detectDuplicates(drafts, []);
    expect([...dups.values()]).toEqual(['file']);
    const byDesc = (s: string) => drafts.find((d) => d.description.includes(s))!;
    const id = (s: string) => suggestCategory(byDesc(s), [], CATEGORIES)?.categoryId;
    expect(id('PAYROLL')).toBe('salary');
    expect(id('RENT')).toBe('housing');
    expect(id('METRO')).toBe('groceries');
    expect(id('TIM HORTONS')).toBe('dining');
    expect(id('HYDRO')).toBe('utilities');
    expect(id('NETFLIX')).toBe('subs');
    expect(id('UBER EATS')).toBe('dining');
    expect(id('PHARMAPRIX')).toBe('health');
    expect(id('UNKNOWN')).toBeUndefined();
  });

  it('invert sign swaps debit and credit', () => {
    const r = buildDrafts(file, { ...guess.mapping, invertSign: true }, 'CAD');
    expect(r.drafts[0]!.kind).toBe('expense');
    expect(r.drafts[1]!.kind).toBe('income');
  });
});

describe('French fixture (Windows-1252, semicolon, DD/MM/YYYY, comma decimals, one signed column)', () => {
  const text = fixture('french-cp1252.csv');
  const file = parseImportText(text);
  const guess = detectLayout(file, 'CAD');

  it('decodes the accents', () => {
    expect(text).toContain('Libellé');
    expect(text).toContain('ÉPICERIE');
    expect(file.delimiter).toBe(';');
  });

  it('maps the columns and ignores the balance', () => {
    expect(guess.mapping).toMatchObject({
      hasHeader: true,
      dateCol: 0,
      descriptionCol: 1,
      amountMode: 'signed',
      amountCol: 2,
      dateFormat: 'dmy-slash',
      decimalMark: ',',
    });
  });

  it('negative is an expense and "-1 234,56" is exact', () => {
    const r = buildDrafts(file, guess.mapping, 'CAD');
    expect(r.errorCount).toBe(0);
    expect(r.drafts).toHaveLength(8);
    expect(r.drafts[0]).toMatchObject({ kind: 'income', amountMinor: 245000, occurredOn: '2026-11-01' });
    expect(r.drafts.find((d) => d.description.includes('FAMILLE'))).toMatchObject({
      kind: 'expense',
      amountMinor: 123456,
    });
    const t = totalsOf(r.drafts);
    expect(t.expenseMinor).toBe(85000 + 6348 + 1290 + 1099 + 340 + 123456 + 7420);
  });

  it('suggests categories from French keywords, accents ignored', () => {
    const { drafts } = buildDrafts(file, guess.mapping, 'CAD');
    const id = (s: string) =>
      suggestCategory(
        drafts.find((d) => d.description.includes(s))!,
        [],
        CATEGORIES,
      )?.categoryId;
    expect(id('PAIE')).toBe('salary');
    expect(id('LOYER')).toBe('housing');
    expect(id('ÉPICERIE')).toBe('groceries');
    expect(id('PHARMACIE')).toBe('health'); // longer keyword beats "marche"
    expect(id('SPOTIFY')).toBe('subs');
    expect(id('CAFÉ')).toBe('dining');
    expect(id('FAMILLE')).toBe('family');
    expect(id('ÉLECTRICITÉ')).toBe('utilities');
  });

  it('inverting the sign makes negatives income', () => {
    const r = buildDrafts(file, { ...guess.mapping, invertSign: true }, 'CAD');
    expect(r.drafts[0]!.kind).toBe('expense');
    expect(r.drafts[1]!.kind).toBe('income');
  });
});

describe('XOF fixture (whole francs, ISO dates)', () => {
  const file = parseImportText(fixture('xof.csv'));
  const guess = detectLayout(file, 'XOF');

  it('detects the layout; the currency column is ignored', () => {
    expect(guess.mapping).toMatchObject({
      dateCol: 0,
      descriptionCol: 1,
      amountCol: 2,
      dateFormat: 'iso',
      decimalMark: '.',
    });
  });

  it('reads whole francs and accepts 1500.00', () => {
    const r = buildDrafts(file, guess.mapping, 'XOF');
    expect(r.errorCount).toBe(0);
    expect(r.drafts.map((d) => d.amountMinor)).toEqual([350000, 50000, 25000, 18500, 75000, 2000, 1500]);
    expect(totalsOf(r.drafts)).toEqual({ incomeCount: 2, incomeMinor: 375000, expenseCount: 5, expenseMinor: 147000 });
  });

  it('suggests West African keywords', () => {
    const { drafts } = buildDrafts(file, guess.mapping, 'XOF');
    const id = (s: string, kind?: string) =>
      suggestCategory(
        drafts.find((d) => d.description.includes(s) && (!kind || d.kind === kind))!,
        [],
        CATEGORIES,
      )?.categoryId;
    expect(id('ORANGE MONEY')).toBe('family');
    expect(id('SUPERMARCHE')).toBe('groceries');
    expect(id('RECHARGE')).toBe('utilities');
    expect(id('YANGO')).toBe('transport');
    expect(id('SALAIRE')).toBe('salary');
    expect(id('WAVE', 'income')).toBeUndefined(); // incoming transfers: no built-in category
  });

  it('a decimal in a whole-franc file is a precision error, not rounded', () => {
    const f = parseImportText('Date,Description,Amount\n2026-11-01,A,100.5\n2026-11-02,B,1500.00\n');
    const g = detectLayout(f, 'XOF');
    const r = buildDrafts(f, g.mapping, 'XOF');
    expect(r.drafts[0]).toMatchObject({ error: 'precision', amountMinor: 0 });
    expect(r.drafts[1]).toMatchObject({ error: null, amountMinor: 1500 });
    expect(r.errorCount).toBe(1);
  });
});

describe('layout detection edge cases', () => {
  it('reports ambiguous dates so the user must choose', () => {
    const f = parseImportText('Date,Description,Amount\n03/11/2026,A,-5.00\n05/10/2026,B,-6.00\n');
    const g = detectLayout(f, 'CAD');
    expect(g.dates.ambiguous).toBe(true);
    expect(g.dates.formats).toEqual(['dmy-slash', 'mdy-slash']);
    const dmy = buildDrafts(f, { ...g.mapping, dateFormat: 'dmy-slash' }, 'CAD');
    const mdy = buildDrafts(f, { ...g.mapping, dateFormat: 'mdy-slash' }, 'CAD');
    expect(dmy.drafts[0]!.occurredOn).toBe('2026-11-03');
    expect(mdy.drafts[0]!.occurredOn).toBe('2026-03-11');
    expect(analyzeDateColumn(f, g.mapping).ambiguous).toBe(true);
  });

  it('works without a header by looking at the values', () => {
    const f = parseImportText('2026-11-01,Coffee shop,-4.50\n2026-11-02,Payroll,1500.00\n');
    const g = detectLayout(f, 'CAD');
    expect(g.mapping).toMatchObject({ hasHeader: false, dateCol: 0, descriptionCol: 1, amountCol: 2, startRow: 0 });
    const r = buildDrafts(f, g.mapping, 'CAD');
    expect(r.drafts.map((d) => [d.kind, d.amountMinor])).toEqual([
      ['expense', 450],
      ['income', 150000],
    ]);
  });

  it('understands English month names and a time part', () => {
    const f = parseImportText('Posted,Details,Amount\n3 Nov 2026 10:15,Shop,(12.50)\n"Nov 4, 2026",Pay,100.00 CR\n');
    const g = detectLayout(f, 'CAD');
    expect(g.mapping.dateFormat).toBe('text');
    const r = buildDrafts(f, g.mapping, 'CAD');
    expect(r.drafts.map((d) => [d.occurredOn, d.kind, d.amountMinor])).toEqual([
      ['2026-11-03', 'expense', 1250],
      ['2026-11-04', 'income', 10000],
    ]);
  });

  it('marks bad rows with their error and keeps the line numbers', () => {
    const f = parseImportText(
      'Date,Description,Amount\n2026-11-01,A,-1.00\nnot a date,B,-2.00\n2026-11-03,C,\n2026-11-04,D,abc\n2026-11-05,E,-1.234\n',
    );
    const g = detectLayout(f, 'CAD');
    // "not a date" breaks detection, so pin the format the way the user would.
    const r = buildDrafts(f, { ...g.mapping, dateFormat: 'iso' }, 'CAD');
    expect(r.drafts.map((d) => [d.line, d.error])).toEqual([
      [2, null],
      [3, 'date'],
      [4, 'empty'],
      [5, 'amount'],
      [6, 'precision'],
    ]);
    expect(r.errorCount).toBe(4);
  });

  it('cleans descriptions: control characters and length', () => {
    const f = parseImportText(
      `Date,Description,Amount\n2026-11-01,"  Hello\u0007\u0000  World  ${'x'.repeat(200)}",-1.00\n`,
    );
    const r = buildDrafts(f, detectLayout(f, 'CAD').mapping, 'CAD');
    expect(r.drafts[0]!.description.startsWith('Hello World xxx')).toBe(true);
    expect(r.drafts[0]!.description).toHaveLength(120);
  });

  it('refuses more than 5000 rows', () => {
    const lines = ['Date,Description,Amount'];
    for (let i = 0; i < MAX_IMPORT_ROWS + 1; i++) lines.push('2026-11-01,Row,-1.00');
    const f = parseImportText(lines.join('\n'));
    expect(() => buildDrafts(f, detectLayout(f, 'CAD').mapping, 'CAD')).toThrow(ImportLimitError);
    const ok = parseImportText(lines.slice(0, MAX_IMPORT_ROWS + 1).join('\n'));
    expect(buildDrafts(ok, detectLayout(ok, 'CAD').mapping, 'CAD').drafts).toHaveLength(MAX_IMPORT_ROWS);
  });

  it('saved mappings survive JSON and are validated', () => {
    const f = parseImportText(fixture('xof.csv'));
    const m = detectLayout(f, 'XOF').mapping;
    expect(parseMapping(JSON.stringify(m))).toEqual(m);
    expect(mappingFits(f, m)).toBe(true);
    expect(mappingFits(f, { ...m, amountCol: 40 })).toBe(false);
    expect(parseMapping('{"version":1}')).toBeNull();
    expect(parseMapping('nope')).toBeNull();
    expect(parseMapping(JSON.stringify({ ...m, dateFormat: 'bogus' }))).toBeNull();
    expect(m.signature).toBe('date|description|montant|devise');
  });
});

describe('duplicates', () => {
  const draft = (line: number, date: string, desc: string, minor: number, kind: 'income' | 'expense' = 'expense') => ({
    line,
    occurredOn: date,
    description: desc,
    amountMinor: minor,
    kind,
    error: null,
  });

  it('matches existing transactions: same kind and amount, date within a day, similar description', () => {
    const existing = [
      { kind: 'expense' as const, amountMinor: 1250, occurredOn: '2026-11-03', description: 'Metro épicerie' },
    ];
    const drafts = [
      draft(1, '2026-11-04', 'METRO EPICERIE #12', 1250), // +1 day, contains match
      draft(2, '2026-11-05', 'METRO EPICERIE #12', 1250), // 2 days away
      draft(3, '2026-11-03', 'METRO EPICERIE #12', 1251), // other amount
      draft(4, '2026-11-03', 'METRO EPICERIE #12', 1250, 'income'), // other kind
      draft(5, '2026-11-02', 'Totally different', 1250), // other description
    ];
    expect([...detectDuplicates(drafts, existing)]).toEqual([[1, 'existing']]);
  });

  it('matches on shared words and treats an empty description as similar', () => {
    const existing = [
      { kind: 'expense' as const, amountMinor: 500, occurredOn: '2026-11-03', description: 'Lunch with Sam' },
    ];
    expect(detectDuplicates([draft(1, '2026-11-03', 'LUNCH SAM CARD 99', 500)], existing).get(1)).toBe('existing');
    expect(detectDuplicates([draft(1, '2026-11-03', '', 500)], existing).get(1)).toBe('existing');
  });

  it('flags only later repeats in the file and ignores error rows', () => {
    const drafts = [
      draft(1, '2026-11-03', 'Coffee', 400),
      draft(2, '2026-11-03', 'Coffee', 400),
      draft(3, '2026-11-03', 'Tea', 400),
      draft(4, '2026-11-03', 'Coffee', 400),
      { ...draft(5, '2026-11-03', 'Coffee', 400), error: 'amount' as const },
    ];
    expect([...detectDuplicates(drafts, [])]).toEqual([
      [2, 'file'],
      [4, 'file'],
    ]);
  });
});

describe('category suggestions', () => {
  it('user rules beat the built-in keywords, longest pattern first, same kind only', () => {
    const rules = [
      { pattern: 'metro', kind: 'expense' as const, categoryId: 'transport' },
      { pattern: 'metro plus', kind: 'expense' as const, categoryId: 'dining' },
      { pattern: 'metro', kind: 'income' as const, categoryId: 'salary' },
    ];
    const s = (description: string, kind: 'income' | 'expense' = 'expense') =>
      suggestCategory({ description, kind }, rules, CATEGORIES);
    expect(s('METRO #123')).toEqual({ categoryId: 'transport', source: 'rule' });
    expect(s('Metro Plus Laval')).toEqual({ categoryId: 'dining', source: 'rule' });
    expect(s('Metro refund', 'income')).toEqual({ categoryId: 'salary', source: 'rule' });
    expect(suggestCategory({ description: 'METRO #123', kind: 'expense' }, [], CATEGORIES)).toEqual({
      categoryId: 'groceries',
      source: 'keyword',
    });
  });

  it('returns null when the user has no category with the icon, or for whole-word misses', () => {
    expect(suggestCategory({ description: 'NETFLIX', kind: 'expense' }, [], [CATEGORIES[0]!])).toBeNull();
    expect(suggestCategory({ description: 'Digital agency', kind: 'expense' }, [], CATEGORIES)).toBeNull(); // "iga" is not inside "digital"
  });

  it('derives a keyword for "always use this category"', () => {
    expect(keywordFor('NETFLIX.COM 866-579-7172')).toBe('netflix');
    expect(keywordFor('A W RESTAURANT')).toBe('a w');
    expect(keywordFor('#### 123')).toBe('');
  });
});
