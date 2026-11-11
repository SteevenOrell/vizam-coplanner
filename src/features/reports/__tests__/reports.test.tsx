import { screen } from '@testing-library/react-native';

import type { Transaction } from '../../../domain/models';
import { renderScreen } from '../../../test/render';
import { periodTransactionsCsv, savingsToCsv } from '../exports';
import { periodRange, ReportsScreen } from '../ReportsScreen';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'x',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  accountId: 'a1',
  categoryId: 'c1',
  kind: 'expense',
  amountMinor: 1250,
  currency: 'CAD',
  occurredOn: '2026-11-03',
  description: 'Lunch',
  note: '',
  recurringBillId: null,
  ...over,
});

describe('CSV exports', () => {
  it('exports only the period, with exact decimals and negative expenses', () => {
    const csv = periodTransactionsCsv(
      [
        tx({}),
        tx({ id: 'y', kind: 'income', amountMinor: 500000, occurredOn: '2026-11-05', description: '=SUM(A1)' }),
        tx({ id: 'z', occurredOn: '2026-09-30' }),
        tx({ id: 'w', currency: 'XOF', amountMinor: 5000, occurredOn: '2026-11-04' }),
      ],
      new Map([['c1', { name: 'Dining' }]]),
      new Map([['a1', { name: 'Everyday' }]]),
      '2026-11-01',
      '2026-11-30',
    );
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('date,type,amount,currency,category,account,description,note');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('2026-11-03,expense,-12.50,CAD,Dining,Everyday,Lunch,');
    expect(lines[2]).toBe('2026-11-04,expense,-5000,XOF,Dining,Everyday,Lunch,');
    expect(lines[3]).toContain("'=SUM(A1)");
  });

  it('exports savings contributions in the period', () => {
    const csv = savingsToCsv(
      [
        {
          name: 'Trip, home',
          currency: 'CAD',
          contributions: [
            { amountMinor: 10000, contributedOn: '2026-11-02', note: 'Gift' },
            { amountMinor: -2550, contributedOn: '2026-11-09', note: '' },
            { amountMinor: 999, contributedOn: '2026-01-01', note: 'old' },
          ],
        },
      ],
      '2026-11-01',
      '2026-11-30',
    );
    expect(csv.trim().split('\r\n')).toEqual([
      'goal,date,amount,currency,note',
      '"Trip, home",2026-11-02,100.00,CAD,Gift',
      '"Trip, home",2026-11-09,-25.50,CAD,',
    ]);
  });
});

describe('ReportsScreen', () => {
  it('computes period ranges', () => {
    expect(periodRange('last3', '2026-11-11')).toEqual({ from: '2026-09', to: '2026-11' });
    expect(periodRange('thisYear', '2026-11-11')).toEqual({ from: '2026-01', to: '2026-11' });
  });

  it('renders the report cards over demo data', async () => {
    await renderScreen(<ReportsScreen />);
    expect(await screen.findByText('Income vs expenses')).toBeTruthy();
    expect(await screen.findByText('Monthly summary')).toBeTruthy();
    expect(screen.getByText('Export transactions CSV')).toBeTruthy();
  });
});
