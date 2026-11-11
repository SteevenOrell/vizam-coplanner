import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { subscribeDataChanges } from '../data/changes';
import { useDatabase } from '../data/DatabaseProvider';
import { DEFAULT_PREFERENCES, getPreferences, updatePreferences } from '../data/repos/core';
import { todayIso, type IsoDate } from '../domain/dates';
import type { Preferences } from '../domain/models';
import { formatLocale, initI18n } from '../i18n';

interface PreferencesValue {
  prefs: Preferences;
  /** Loaded from the database at least once. */
  ready: boolean;
  update: (patch: Partial<Preferences>) => Promise<void>;
  /** Intl locale for money and dates ("en-CA" / "fr-CA"). */
  locale: string;
}

const PreferencesContext = createContext<PreferencesValue>({
  prefs: DEFAULT_PREFERENCES,
  ready: false,
  update: async () => undefined,
  locale: 'en-CA',
});

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (database.status !== 'ready') return;
    let cancelled = false;
    const load = () =>
      getPreferences(database.db).then(
        (p) => {
          if (cancelled) return;
          setPrefs(p);
          setReady(true);
        },
        () => !cancelled && setReady(true),
      );
    void load();
    const unsub = subscribeDataChanges(() => void load());
    return () => {
      cancelled = true;
      unsub();
    };
  }, [database]);

  useEffect(() => {
    initI18n(prefs.locale);
  }, [prefs.locale]);

  const update = useCallback(
    async (patch: Partial<Preferences>) => {
      if (database.status !== 'ready') return;
      setPrefs((p) => ({ ...p, ...patch }));
      await updatePreferences(database.db, patch);
    },
    [database],
  );

  const value = useMemo(() => ({ prefs, ready, update, locale: formatLocale(prefs.locale) }), [prefs, ready, update]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  return useContext(PreferencesContext);
}

/**
 * Today's date in the local calendar; updates when the app returns to the foreground. Dev web builds accept
 * `?today=YYYY-MM-DD` for stable screenshots.
 */
export function useToday(): IsoDate {
  const [today, setToday] = useState(() => overrideToday() ?? todayIso());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(overrideToday() ?? todayIso());
    });
    const timer = setInterval(() => setToday(overrideToday() ?? todayIso()), 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return today;
}

function overrideToday(): IsoDate | null {
  if (!__DEV__ || typeof window === 'undefined' || typeof window.location?.search !== 'string') return null;
  const v = new URLSearchParams(window.location.search).get('today');
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
