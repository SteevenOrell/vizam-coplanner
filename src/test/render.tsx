/**
 * Test harness for screens: real providers over an in-memory SQLite database (better-sqlite3), optional demo seed.
 * Usage:
 *   const { db } = await renderScreen(<BudgetsScreen />, { seed: 'demo', params: { id: '…' } });
 *   expect(await screen.findByText('…')).toBeTruthy();   // `screen` from @testing-library/react-native
 * RNTL 14: render is async; interactions with fireEvent need `await act(...)` or findBy/waitFor afterwards.
 * `routerMock` (from jest.setup.ts) records navigation: expect(routerMock.push).toHaveBeenCalledWith(...).
 */
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '../data/DatabaseProvider';
import { openBetterSqliteDriver } from '../data/db/betterSqliteDriver';
import type { SqlDriver } from '../data/db/driver';
import { migrate } from '../data/db/migrate';
import { setMeta, updatePreferences } from '../data/repos/core';
import { seedDemoData, seedStarterCategories } from '../data/seed/demo';
import i18n, { initI18n } from '../i18n';
import { PreferencesProvider } from '../state/preferences';
import { SessionProvider } from '../state/session';
import { SnackbarProvider } from '../ui/Snackbar';
import { ThemeProvider } from '../ui/theme/ThemeProvider';

export const TEST_TODAY = '2026-11-11';

export interface RenderOptions {
  seed?: 'demo' | 'starter' | 'none';
  params?: Record<string, string>;
  scheme?: 'light' | 'dark';
  /** Runs against the database before rendering (extra fixtures). */
  setup?: (db: SqlDriver) => Promise<void>;
}

export async function createTestDb(seed: RenderOptions['seed'] = 'demo'): Promise<SqlDriver> {
  const db = openBetterSqliteDriver();
  await migrate(db);
  if (seed === 'demo') await seedDemoData(db, TEST_TODAY);
  if (seed === 'starter') {
    await seedStarterCategories(db);
    await updatePreferences(db, { displayName: 'Test' });
  }
  if (seed !== 'none') await setMeta(db, 'mode', 'demo');
  return db;
}

export async function renderScreen(ui: ReactElement, opts: RenderOptions = {}) {
  initI18n('en');
  const db = await createTestDb(opts.seed ?? 'demo');
  if (opts.setup) await opts.setup(db);
  setRouteParams(opts.params ?? {});
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <I18nextProvider i18n={i18n}>
        <DatabaseProvider open={async () => db}>
          <PreferencesProvider>
            <ThemeProvider scheme={opts.scheme ?? 'light'}>
              <SessionProvider>
                <SnackbarProvider>{ui}</SnackbarProvider>
              </SessionProvider>
            </ThemeProvider>
          </PreferencesProvider>
        </DatabaseProvider>
      </I18nextProvider>
    </SafeAreaProvider>,
  );
  return { db };
}

/** Route params returned by the mocked useLocalSearchParams. */
export function setRouteParams(params: Record<string, string>) {
  (globalThis as { __routeParams?: Record<string, string> }).__routeParams = params;
}

export { routerMock } from './routerMock';
