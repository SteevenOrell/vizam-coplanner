import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { SqlDriver } from '../../../data/db/driver';
import { getGoal, listGoals } from '../../../data/repos/planning';
import { renderScreen, routerMock, TEST_TODAY } from '../../../test/render';
import { GoalDetailScreen } from '../GoalDetailScreen';
import { GoalsScreen } from '../GoalsScreen';

beforeEach(() => jest.clearAllMocks());

async function emergencyFund(db: SqlDriver) {
  const goals = await listGoals(db, TEST_TODAY);
  return goals.find((g) => g.currency === 'CAD')!;
}

describe('goals', () => {
  it('lists goals with totals per currency', async () => {
    await renderScreen(<GoalsScreen />);
    expect(await screen.findByText('Total saved')).toBeTruthy();
    expect((await screen.findAllByText(/to go/)).length).toBeGreaterThan(0);
  });
});

describe('goal detail', () => {
  it('records a contribution and rejects an overdrawing withdrawal', async () => {
    const params: Record<string, string> = {};
    const { db } = await renderScreen(<GoalDetailScreen />, {
      params,
      setup: async (d) => {
        params.id = (await emergencyFund(d)).id;
      },
    });
    const goalId = params.id!;
    const before = (await getGoal(db, goalId, TEST_TODAY))!.goal.progress.savedMinor;

    await fireEvent.press(await screen.findByTestId('goal-add'));
    await fireEvent.changeText(await screen.findByTestId('money-amount'), '25.50');
    await fireEvent.press(screen.getByTestId('money-submit'));
    await waitFor(async () =>
      expect((await getGoal(db, goalId, TEST_TODAY))!.goal.progress.savedMinor).toBe(before + 2550),
    );

    await fireEvent.press(await screen.findByTestId('goal-withdraw'));
    await fireEvent.changeText(await screen.findByTestId('money-amount'), '99999999');
    await fireEvent.press(screen.getByTestId('money-submit'));
    expect(await screen.findByText("You can't withdraw more than is saved.")).toBeTruthy();
    expect((await getGoal(db, goalId, TEST_TODAY))!.goal.progress.savedMinor).toBe(before + 2550);
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
