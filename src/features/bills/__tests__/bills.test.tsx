import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { listBills } from '../../../data/repos/planning';
import { listTransactions } from '../../../data/repos/transactions';
import { monthObligations } from '../obligations';
import { renderScreen, TEST_TODAY } from '../../../test/render';
import { BillsScreen } from '../BillsScreen';

describe('BillsScreen', () => {
  it('shows the 30 day total and the bills with a due label', async () => {
    await renderScreen(<BillsScreen />);
    expect(await screen.findByText('Due in the next 30 days')).toBeTruthy();
    expect(await screen.findByText('Rent')).toBeTruthy();
    expect(screen.getAllByText('Mark paid').length).toBeGreaterThan(0);
  });

  it('marks a bill paid: records an expense and advances the due date', async () => {
    const { db } = await renderScreen(<BillsScreen />);
    const bills = (await listBills(db)).filter((b) => b.active && b.currency === 'CAD');
    const bill = bills[0]!;
    await fireEvent.press(await screen.findByTestId(`pay-${bill.id}`));
    await fireEvent.press(await screen.findByTestId('pay-confirm'));
    await waitFor(async () => {
      const after = (await listBills(db)).find((b) => b.id === bill.id)!;
      expect(after.nextDueOn > bill.nextDueOn).toBe(true);
    });
    const paid = (await listTransactions(db, { kind: 'expense' })).filter((t) => t.recurringBillId === bill.id);
    expect(paid.some((t) => t.amountMinor === bill.amountMinor && t.currency === bill.currency)).toBe(true);
  });

  it('skips an occurrence without a transaction', async () => {
    const { db } = await renderScreen(<BillsScreen />);
    const bill = (await listBills(db)).find((b) => b.active)!;
    const before = (await listTransactions(db)).length;
    await fireEvent.press(await screen.findByTestId(`skip-${bill.id}`));
    await waitFor(async () => {
      const after = (await listBills(db)).find((b) => b.id === bill.id)!;
      expect(after.nextDueOn > bill.nextDueOn).toBe(true);
    });
    expect((await listTransactions(db)).length).toBe(before);
  });
});

describe('monthObligations', () => {
  it('has nothing for past months and includes overdue bills once in the current month', async () => {
    const { db } = await renderScreen(<BillsScreen />);
    const bills = await listBills(db);
    expect(monthObligations(bills, '2026-10', TEST_TODAY)).toEqual([]);
    const current = monthObligations(bills, '2026-11', TEST_TODAY);
    expect(current.every((o) => o.dueOn <= '2026-11-30' || o.dueOn < TEST_TODAY)).toBe(true);
  });
});
