import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { updatePreferences } from '../../../data/repos/core';
import { createTransaction } from '../../../data/repos/transactions';
import { DEMO_NAMES_EN } from '../../../data/seed/demo';
import { renderScreen, routerMock, TEST_TODAY } from '../../../test/render';
import { ActivityScreen } from '../ActivityScreen';
import { TransactionDetailsScreen } from '../TransactionDetailsScreen';
import { TransactionFormScreen } from '../TransactionFormScreen';

interface Row {
  amount_minor: number;
  currency: string;
  kind: string;
  description: string;
  deleted_at: string | null;
}

async function typeAndSave(amount: string, description: string) {
  await fireEvent.changeText(await screen.findByTestId('tx-amount'), amount);
  await fireEvent.changeText(screen.getByTestId('tx-description'), description);
  await fireEvent.press(screen.getByTestId('tx-save'));
}

describe('transaction form', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows a per-field error and does not save an empty amount', async () => {
    const { db } = await renderScreen(<TransactionFormScreen />, { params: { kind: 'expense' } });
    const before = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
    await fireEvent.press(await screen.findByTestId('tx-save'));
    expect(await screen.findByText('Enter an amount greater than zero.')).toBeTruthy();
    const after = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
    expect(after!.n).toBe(before!.n);
    expect(routerMock.back).not.toHaveBeenCalled();
  });

  it('saves an expense in minor units with the account currency', async () => {
    const { db } = await renderScreen(<TransactionFormScreen />, { params: { kind: 'expense' } });
    await typeAndSave('12.50', 'Form test lunch');
    await waitFor(() => expect(routerMock.back).toHaveBeenCalled());
    const row = await db.first<Row>(
      "SELECT amount_minor, currency, kind, description, deleted_at FROM transactions WHERE description = 'Form test lunch'",
    );
    expect(row).toMatchObject({ amount_minor: 1250, currency: 'CAD', kind: 'expense' });
  });

  it('saves income when the kind query param is income', async () => {
    const { db } = await renderScreen(<TransactionFormScreen />, { params: { kind: 'income' } });
    await typeAndSave('2000', 'Form test income');
    await waitFor(() => expect(routerMock.back).toHaveBeenCalled());
    const row = await db.first<Row>(
      "SELECT amount_minor, currency, kind, description, deleted_at FROM transactions WHERE description = 'Form test income'",
    );
    expect(row).toMatchObject({ amount_minor: 200000, kind: 'income' });
  });

  it('rejects decimals for XOF and saves whole francs', async () => {
    const { db } = await renderScreen(<TransactionFormScreen />, {
      params: { kind: 'expense' },
      // With XOF as the primary currency the default account is the XOF one.
      setup: async (d) => {
        await updatePreferences(d, { primaryCurrency: 'XOF' });
      },
    });
    await typeAndSave('100.5', 'Form test xof');
    expect(await screen.findByText('Too many decimals for this currency.')).toBeTruthy();
    expect(routerMock.back).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('tx-amount'), '1500');
    await fireEvent.press(screen.getByTestId('tx-save'));
    await waitFor(() => expect(routerMock.back).toHaveBeenCalled());
    const row = await db.first<Row>(
      "SELECT amount_minor, currency, kind, description, deleted_at FROM transactions WHERE description = 'Form test xof'",
    );
    expect(row).toMatchObject({ amount_minor: 1500, currency: 'XOF' });
  });

  it('offers to add an account when there are none', async () => {
    await renderScreen(<TransactionFormScreen />, { seed: 'starter' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Add an account' }));
    expect(routerMock.push).toHaveBeenCalledWith('/account/new');
  });
});

describe('transaction details', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes with confirmation and can undo', async () => {
    const params: Record<string, string> = {};
    const { db } = await renderScreen(<TransactionDetailsScreen />, {
      params,
      setup: async (d) => {
        const account = await d.first<{ id: string }>('SELECT id FROM accounts WHERE currency = ? LIMIT 1', ['CAD']);
        const tx = await createTransaction(d, {
          accountId: account!.id,
          categoryId: null,
          kind: 'expense',
          amountMinor: 4321,
          occurredOn: TEST_TODAY,
          description: 'Details test coffee',
          note: 'A note',
        });
        params.id = tx.id;
      },
    });
    expect(await screen.findByText('Details test coffee')).toBeTruthy();
    expect(screen.getByText('A note')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tx-delete'));
    expect(await screen.findByText('Delete this transaction?')).toBeTruthy();
    // The page button and the dialog's confirm button share a label; the dialog's comes last.
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await fireEvent.press(deleteButtons[deleteButtons.length - 1]!);

    await waitFor(() => expect(routerMock.back).toHaveBeenCalled());
    const deleted = await db.first<Row>('SELECT deleted_at FROM transactions WHERE id = ?', [params.id!]);
    expect(deleted!.deleted_at).not.toBeNull();

    expect(await screen.findByText('Transaction deleted')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => {
      const restored = await db.first<Row>('SELECT deleted_at FROM transactions WHERE id = ?', [params.id!]);
      expect(restored!.deleted_at).toBeNull();
    });
  });

  it('shows a not-found state for an unknown id', async () => {
    await renderScreen(<TransactionDetailsScreen />, { params: { id: 'does-not-exist' } });
    expect(await screen.findByText('Transaction not found')).toBeTruthy();
  });
});

describe('activity', () => {
  it('searches and filters', async () => {
    await renderScreen(<ActivityScreen />);
    const salary = DEMO_NAMES_EN.descriptions.salary;
    await fireEvent.changeText(await screen.findByTestId('activity-search'), salary);
    expect((await screen.findAllByText(salary)).length).toBeGreaterThan(0);

    // Salary rows are income only: the Expenses chip leaves nothing to show.
    await fireEvent.press(screen.getByRole('button', { name: 'Expenses' }));
    expect(await screen.findByText('No matching transactions')).toBeTruthy();

    await fireEvent.press(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    await waitFor(() => expect(screen.queryByText('No matching transactions')).toBeNull());
  });

  it('shows the currency chips because two currencies are in use', async () => {
    await renderScreen(<ActivityScreen />);
    expect(await screen.findByRole('button', { name: 'FCFA' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All currencies' })).toBeTruthy();
  });
});
