import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import type { SqlDriver } from '../../../data/db/driver';
import { renderScreen } from '../../../test/render';
import { ImportScreen } from '../ImportScreen';

const CANADIAN = readFileSync(join(__dirname, '../../../../tests/fixtures/bank/canadian.csv'), 'utf8');

async function countTx(db: SqlDriver): Promise<number> {
  const r = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL');
  return Number(r?.n ?? 0);
}

async function pasteAndReview() {
  await fireEvent.press(await screen.findByTestId('import-paste-toggle'));
  await fireEvent.changeText(screen.getByTestId('import-paste-input'), CANADIAN);
  await fireEvent.press(screen.getByTestId('import-paste-continue'));
  expect(await screen.findByTestId('import-date-col')).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId('import-next').props.accessibilityState?.disabled).toBeFalsy());
  await fireEvent.press(screen.getByTestId('import-next'));
  expect(await screen.findByTestId('import-summary')).toBeTruthy();
}

describe('Import screen', () => {
  it('imports a pasted bank export into the CAD account, then flags the same rows as duplicates', async () => {
    const { db } = await renderScreen(<ImportScreen />);
    const before = await countTx(db);

    await pasteAndReview();
    // Debit/credit columns: one income (payroll), the rest expenses; the zero-amount memo row is skipped.
    expect(screen.getByTestId('import-summary-income').props.children).toBeTruthy();
    await fireEvent.press(screen.getByTestId('import-confirm'));
    expect(await screen.findByTestId('import-done')).toBeTruthy();

    const imported = (await countTx(db)) - before;
    expect(imported).toBeGreaterThanOrEqual(8);
    const payroll = await db.first<{ amount_minor: number; kind: string; currency: string }>(
      "SELECT amount_minor, kind, currency FROM transactions WHERE description LIKE 'ACME PAYROLL%'",
    );
    expect(payroll).toEqual({ amount_minor: 245000, kind: 'income', currency: 'CAD' });
    const metro = await db.first<{ amount_minor: number; kind: string }>(
      "SELECT amount_minor, kind FROM transactions WHERE description LIKE 'METRO #123%'",
    );
    expect(metro).toEqual({ amount_minor: 5432, kind: 'expense' });
    expect(await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM import_batches')).toEqual({ n: 1 });

    // Same file again: every row is a duplicate and excluded by default, so nothing can be imported.
    await fireEvent.press(screen.getByTestId('import-another'));
    await pasteAndReview();
    await waitFor(() => expect(screen.getByTestId('import-confirm').props.accessibilityState?.disabled).toBe(true));
    expect(await countTx(db)).toBe(before + imported);
  });
});
