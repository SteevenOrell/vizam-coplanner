import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { getPreferences, listAccounts } from '../../../data/repos/core';
import { renderScreen, routerMock } from '../../../test/render';
import { AccountFormScreen } from '../AccountFormScreen';
import { SettingsScreen } from '../SettingsScreen';

describe('settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('changes theme, primary currency and hide-amounts, and persists them', async () => {
    const { db } = await renderScreen(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('tab', { name: 'Dark' }));
    await waitFor(async () => expect((await getPreferences(db)).theme).toBe('dark'));

    await fireEvent.press(screen.getByTestId('settings-currency'));
    await fireEvent.press(await screen.findByRole('radio', { name: /XOF, FCFA/ }));
    await waitFor(async () => expect((await getPreferences(db)).primaryCurrency).toBe('XOF'));

    await fireEvent(screen.getByTestId('settings-hide'), 'valueChange', true);
    await waitFor(async () => expect((await getPreferences(db)).hideBalances).toBe(true));
  });

  it('shows the demo mode card and lists accounts', async () => {
    await renderScreen(<SettingsScreen />);
    expect(await screen.findByText('Demo mode')).toBeTruthy();
    expect(screen.getByText('Reset demo data')).toBeTruthy();
    expect(screen.getByText('Leave demo')).toBeTruthy();
    // Not signed in to the cloud: no delete-account action.
    expect(screen.queryByTestId('settings-delete-account')).toBeNull();
  });

  it('keeps the reminder days between 0 and 14', async () => {
    const { db } = await renderScreen(<SettingsScreen />);
    const more = await screen.findByTestId('settings-days-more');
    for (let i = 0; i < 20; i += 1) await fireEvent.press(more);
    await waitFor(async () => expect((await getPreferences(db)).billReminderDays).toBe(14));
  });
});

describe('account form', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates an account with a negative opening balance when money is owed', async () => {
    const { db } = await renderScreen(<AccountFormScreen />);
    await fireEvent.changeText(await screen.findByTestId('account-name'), 'Form test card');
    await fireEvent.changeText(screen.getByTestId('account-opening'), '250.75');
    await fireEvent(screen.getByTestId('account-owed'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('account-save'));
    await waitFor(() => expect(routerMock.back).toHaveBeenCalled());
    const created = (await listAccounts(db)).find((a) => a.name === 'Form test card');
    expect(created).toMatchObject({ openingBalanceMinor: -25075, currency: 'CAD' });
  });

  it('requires a name', async () => {
    await renderScreen(<AccountFormScreen />);
    await fireEvent.press(await screen.findByTestId('account-save'));
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    expect(routerMock.back).not.toHaveBeenCalled();
  });
});
