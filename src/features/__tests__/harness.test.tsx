import { screen } from '@testing-library/react-native';

import { DashboardScreen } from '../dashboard/DashboardScreen';
import { renderScreen } from '../../test/render';

describe('test harness', () => {
  it('renders a screen over a seeded database', async () => {
    const { db } = await renderScreen(<DashboardScreen />);
    expect(await screen.findAllByText(/Dashboard|Hello|Alex/)).toBeTruthy();
    const n = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
    expect(n!.n).toBeGreaterThan(50);
  });
});
