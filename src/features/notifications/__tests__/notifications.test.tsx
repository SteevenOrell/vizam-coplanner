import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { notifyDataChanged } from '../../../data/changes';
import { getPreferences } from '../../../data/repos/core';
import { listNotifications, refreshDerivedNotifications, unreadCount } from '../../../data/repos/notifications';
import i18n from '../../../i18n';
import { renderScreen, routerMock, TEST_TODAY } from '../../../test/render';
import { notificationText, useNotificationMaintenance } from '../maintenance';
import { NotificationsScreen } from '../NotificationsScreen';

beforeEach(() => jest.clearAllMocks());

describe('NotificationsScreen', () => {
  it('lists notifications, opens one and marks all read', async () => {
    const { db } = await renderScreen(<NotificationsScreen />, {
      setup: async (d) => {
        await refreshDerivedNotifications(
          d,
          TEST_TODAY,
          await getPreferences(d),
          notificationText(i18n.t.bind(i18n), 'en-CA'),
          'en-CA',
        );
      },
    });
    expect(await screen.findByText('Dining is over budget')).toBeTruthy();
    expect(await unreadCount(db)).toBeGreaterThan(0);

    await fireEvent.press(screen.getByLabelText(/Dining is over budget/));
    expect(routerMock.push).toHaveBeenCalledWith('/budgets');

    await fireEvent.press(await screen.findByTestId('mark-all-read'));
    await waitFor(async () => expect(await unreadCount(db)).toBe(0));
  });

  it('shows the empty state', async () => {
    await renderScreen(<NotificationsScreen />, { seed: 'starter' });
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
  });
});

function Maintenance() {
  useNotificationMaintenance();
  return null;
}

describe('useNotificationMaintenance', () => {
  it('creates the derived notifications once', async () => {
    const { db } = await renderScreen(<Maintenance />);
    await waitFor(async () => expect((await listNotifications(db)).length).toBeGreaterThan(0));
    const first = (await listNotifications(db)).map((n) => n.id).sort();
    // A data change re-runs it after the debounce; nothing is duplicated.
    notifyDataChanged('local');
    await new Promise((r) => setTimeout(r, 2200));
    expect((await listNotifications(db)).map((n) => n.id).sort()).toEqual(first);
  });
});
