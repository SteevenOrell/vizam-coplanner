import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { getPreferences, listAccountBalances } from '../../../data/repos/core';
import { formatMoney } from '../../../domain/money/format';
import { renderScreen, routerMock } from '../../../test/render';
import { DashboardScreen } from '../DashboardScreen';

describe('dashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('greets the user and shows the demo balance in the primary currency', async () => {
    const { db } = await renderScreen(<DashboardScreen />);
    expect(await screen.findByText('Hello, Alex Demo')).toBeTruthy();
    expect(screen.getByText('Demo data')).toBeTruthy();

    const cad = (await listAccountBalances(db))
      .filter((a) => a.currency === 'CAD')
      .reduce((sum, a) => sum + a.balanceMinor, 0);
    expect(screen.getByLabelText(formatMoney(cad, 'CAD', { locale: 'en-CA' }))).toBeTruthy();
    // The other currency is listed on its own line, never converted.
    expect(screen.getByText('Also in FCFA')).toBeTruthy();
  });

  it('shows budget, bills, goals and recent transactions, and navigates', async () => {
    await renderScreen(<DashboardScreen />);
    expect(await screen.findByText("This month's budget")).toBeTruthy();
    expect(screen.getByText('Upcoming bills')).toBeTruthy();
    expect(screen.getByText('Savings goals')).toBeTruthy();
    expect(screen.getByText('Recent transactions')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: '/transaction/new', params: { kind: 'expense' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Reports' }));
    expect(routerMock.push).toHaveBeenCalledWith('/reports');
  });

  it('hides balances with the eye toggle', async () => {
    const { db } = await renderScreen(<DashboardScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Hide amounts' }));
    await waitFor(async () => expect((await getPreferences(db)).hideBalances).toBe(true));
    expect((await screen.findAllByLabelText('Amount hidden')).length).toBeGreaterThan(0);
  });
});
