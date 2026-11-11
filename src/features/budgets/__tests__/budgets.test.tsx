import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { listCategories } from '../../../data/repos/core';
import { getBudget } from '../../../data/repos/planning';
import { renderScreen, routerMock } from '../../../test/render';
import { BudgetEditorScreen } from '../BudgetEditorScreen';
import { BudgetsScreen } from '../BudgetsScreen';

beforeEach(() => jest.clearAllMocks());

describe('BudgetsScreen', () => {
  it('shows over and near status as text from the demo data', async () => {
    await renderScreen(<BudgetsScreen />);
    expect(await screen.findByText(/Over by \$8\.60/)).toBeTruthy();
    expect((await screen.findAllByText(/close to the limit/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Safe to spend per day')).toBeTruthy();
  });

  it('offers to create or copy a budget for an empty month', async () => {
    await renderScreen(<BudgetsScreen />);
    await fireEvent.press(await screen.findByLabelText('Next month'));
    expect(await screen.findByText('No budget for this month')).toBeTruthy();
    expect(screen.getByText('Create budget')).toBeTruthy();
    expect(screen.getByText('Copy last month')).toBeTruthy();
  });
});

describe('BudgetEditorScreen', () => {
  it('saves limits in minor units and skips empty rows', async () => {
    const { db } = await renderScreen(<BudgetEditorScreen />, {
      seed: 'starter',
      params: { month: '2026-12', currency: 'CAD' },
    });
    const [first, second] = await listCategories(db, 'expense');
    await fireEvent.changeText(await screen.findByTestId(`limit-${first!.id}`), '1,234.5');
    await fireEvent.changeText(screen.getByTestId(`limit-${second!.id}`), '80');
    await fireEvent.press(screen.getByTestId('budget-save'));
    await waitFor(async () => expect(await getBudget(db, '2026-12', 'CAD')).not.toBeNull());
    const saved = await getBudget(db, '2026-12', 'CAD');
    const limits = Object.fromEntries(saved!.allocations.map((a) => [a.categoryId, a.limitMinor]));
    expect(limits).toEqual({ [first!.id]: 123450, [second!.id]: 8000 });
    expect(routerMock.back).toHaveBeenCalled();
  });

  it('shows a per-row error for a bad amount and saves nothing', async () => {
    const { db } = await renderScreen(<BudgetEditorScreen />, {
      seed: 'starter',
      params: { month: '2026-12', currency: 'CAD' },
    });
    const [first] = await listCategories(db, 'expense');
    await fireEvent.changeText(await screen.findByTestId(`limit-${first!.id}`), '12.3456');
    await fireEvent.press(screen.getByTestId('budget-save'));
    expect(await screen.findByText('Too many decimals for this currency.')).toBeTruthy();
    expect(await getBudget(db, '2026-12', 'CAD')).toBeNull();
    expect(routerMock.back).not.toHaveBeenCalled();
  });
});
