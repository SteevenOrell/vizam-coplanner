import type { TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { subscribeDataChanges } from '../../data/changes';
import type { SqlDriver } from '../../data/db/driver';
import { useDatabase } from '../../data/DatabaseProvider';
import { refreshDerivedNotifications, type NotificationText } from '../../data/repos/notifications';
import type { IsoDate } from '../../domain/dates';
import type { Preferences } from '../../domain/models';
import { rescheduleBillReminders } from '../../services/reminders';
import { usePreferences, useToday } from '../../state/preferences';
import { formatDate } from '../../ui/format';

const DEBOUNCE_MS = 1500;

/** Notification texts from the translation files (the repository stays free of UI strings). */
export function notificationText(t: TFunction, locale: string): NotificationText {
  return {
    billDue: (name, amount, dueOn) => ({
      title: t('notifications.text.billDueTitle', { name }),
      body: t('notifications.text.billDueBody', { amount, date: formatDate(dueOn, locale, 'medium') }),
    }),
    budgetNear: (category, percent) => ({
      title: t('notifications.text.budgetNearTitle', { category }),
      body: t('notifications.text.budgetNearBody', { percent }),
    }),
    budgetOver: (category, amount) => ({
      title: t('notifications.text.budgetOverTitle', { category }),
      body: t('notifications.text.budgetOverBody', { amount }),
    }),
    goalReached: (name) => ({
      title: t('notifications.text.goalReachedTitle', { name }),
      body: t('notifications.text.goalReachedBody'),
    }),
  };
}

interface Inputs {
  db: SqlDriver | null;
  today: IsoDate;
  prefs: Preferences;
  locale: string;
  t: TFunction;
}

/**
 * Keeps in-app notifications and local OS reminders in step with the data. Runs on mount, when the app returns to
 * the foreground and (debounced) after data changes. Its own writes are ignored so it can never loop. It never asks
 * for the OS notification permission (only the Notifications screen does); reminders are scheduled only when the
 * permission is already granted. Best effort: failures are swallowed and nothing is logged (no user data in logs).
 */
export function useNotificationMaintenance(): void {
  const database = useDatabase();
  const db = database.status === 'ready' ? database.db : null;
  const dbReady = db !== null;
  const today = useToday();
  const { prefs, ready, locale } = usePreferences();
  const { t } = useTranslation();
  const inputs = useRef<Inputs | null>(null);
  const run = useRef<() => Promise<void>>(async () => undefined);

  // Latest values for the long-lived callbacks below (refs are only touched in effects).
  useEffect(() => {
    inputs.current = { db, today, prefs, locale, t };
  });

  // The controller: one run at a time, debounced re-runs, own writes ignored.
  useEffect(() => {
    let running = false;
    let ignored = 0;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void execute(), DEBOUNCE_MS);
    };

    const execute = async (): Promise<void> => {
      const c = inputs.current;
      if (disposed || !c || !c.db) return;
      if (running) return later();
      running = true;
      ignored = 0;
      try {
        const text = notificationText(c.t, c.locale);
        await refreshDerivedNotifications(c.db, c.today, c.prefs, text, c.locale);
        await rescheduleBillReminders(c.db, c.today, c.prefs, text, c.locale, c.t('notifications.channelName'));
      } catch {
        // Best effort: the next trigger tries again.
      } finally {
        // One change event is our own write; anything more came from somewhere else and needs another pass.
        const others = ignored - 1;
        running = false;
        ignored = 0;
        if (others > 0) later();
      }
    };
    run.current = execute;

    const unsubscribe = subscribeDataChanges(() => {
      if (running) ignored += 1;
      else later();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void execute();
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribe();
      app.remove();
    };
  }, []);

  // On mount and whenever what the notifications are built from changes.
  useEffect(() => {
    if (ready && dbReady) void run.current();
  }, [
    ready,
    dbReady,
    today,
    prefs.notifyBills,
    prefs.notifyBudgets,
    prefs.billReminderDays,
    prefs.primaryCurrency,
    locale,
  ]);
}
