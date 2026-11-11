import { Platform } from 'react-native';

import type { SqlDriver } from '../data/db/driver';
import { listBills } from '../data/repos/planning';
import type { NotificationText } from '../data/repos/notifications';
import { addDays, type IsoDate } from '../domain/dates';
import { formatMoney } from '../domain/money/format';
import type { Preferences } from '../domain/models';
import { upcomingObligations } from '../domain/recurrence';

// Loaded lazily: expo-notifications warns on web, where reminders are not supported anyway.
const loadNotifications = () => import('expo-notifications');

/** Marks the OS notifications CoPlanner scheduled, so only those are cancelled when the schedule is rebuilt. */
const SOURCE = 'coplanner-bill-reminder';
/** iOS keeps at most 64 pending local notifications. */
const MAX_SCHEDULED = 60;
const CHANNEL_ID = 'bills';

/** True when the OS lets the app show notifications (never asks). Always false on web. */
export async function reminderPermissionGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await (await loadNotifications()).getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Asks the OS for permission. Call it only from a user action (the "Turn on reminders" banner). */
export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await (await loadNotifications()).requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function cancelOwnReminders(Notifications: Awaited<ReturnType<typeof loadNotifications>>): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { source?: string } | null | undefined)?.source === SOURCE)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Rebuilds the OS reminders for bills due in the next 30 days: cancels the ones CoPlanner scheduled before, then
 * schedules one per due date at 9:00 local time on the reminder day. Does nothing (beyond cancelling) when bill
 * notifications are off or the OS permission is not granted. Native only; returns how many were scheduled.
 */
export async function rescheduleBillReminders(
  db: SqlDriver,
  today: IsoDate,
  prefs: Pick<Preferences, 'notifyBills'>,
  text: NotificationText,
  locale: string,
  channelName: string,
): Promise<number> {
  if (Platform.OS === 'web') return 0;
  const Notifications = await loadNotifications();
  await cancelOwnReminders(Notifications);
  if (!prefs.notifyBills || !(await reminderPermissionGranted())) return 0;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const bills = await listBills(db, { includeInactive: false });
  const byId = new Map(bills.map((b) => [b.id, b]));
  const now = Date.now();
  let scheduled = 0;
  for (const o of upcomingObligations(bills, today, addDays(today, 30))) {
    if (scheduled >= MAX_SCHEDULED) break;
    const bill = byId.get(o.billId);
    if (!bill) continue;
    const [y, m, d] = addDays(o.dueOn, -bill.remindDaysBefore).split('-').map(Number) as [number, number, number];
    const at = new Date(y, m - 1, d, 9, 0, 0);
    if (at.getTime() <= now) continue;
    const msg = text.billDue(o.name, formatMoney(o.amountMinor, o.currency, { locale }), o.dueOn);
    await Notifications.scheduleNotificationAsync({
      content: { title: msg.title, body: msg.body, data: { source: SOURCE, billId: o.billId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
    });
    scheduled += 1;
  }
  return scheduled;
}
