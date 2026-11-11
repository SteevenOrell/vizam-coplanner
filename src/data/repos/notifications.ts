import { addDays, monthOf, type IsoDate } from '../../domain/dates';
import { formatMoney } from '../../domain/money/format';
import type { AppNotification, NotificationKind, Preferences } from '../../domain/models';
import { upcomingObligations } from '../../domain/recurrence';
import type { SqlDriver } from '../db/driver';
import { listRows, notificationsSpec, nowIso, putRow, softDeleteRow, write } from '../tables';
import { listBills, getBudget, listGoals } from './planning';
import { usedCurrencies } from './transactions';

export function listNotifications(db: SqlDriver, now: string = nowIso()): Promise<AppNotification[]> {
  return listRows(db, notificationsSpec, 'scheduled_for <= ?', [now], 'scheduled_for DESC, created_at DESC LIMIT 200');
}

export async function unreadCount(db: SqlDriver, now: string = nowIso()): Promise<number> {
  const r = await db.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM notifications WHERE deleted_at IS NULL AND read_at IS NULL AND scheduled_for <= ?',
    [now],
  );
  return Number(r?.n ?? 0);
}

export function markRead(db: SqlDriver, ids: readonly string[]): Promise<void> {
  return write(db, async () => {
    const now = nowIso();
    for (const id of ids) {
      const rows = await listRows(db, notificationsSpec, 'id = ? AND read_at IS NULL', [id]);
      for (const n of rows) await putRow(db, notificationsSpec, { ...n, readAt: now, updatedAt: now });
    }
  });
}

export async function markAllRead(db: SqlDriver): Promise<void> {
  const unread = await listRows(db, notificationsSpec, 'read_at IS NULL AND scheduled_for <= ?', [nowIso()]);
  await markRead(
    db,
    unread.map((n) => n.id),
  );
}

export function deleteNotification(db: SqlDriver, id: string): Promise<void> {
  return write(db, () => softDeleteRow(db, notificationsSpec, id));
}

/**
 * Deterministic id for a derived notification, so regenerating never duplicates it (also across devices: two
 * devices derive the same id and the server keeps one row). FNV-1a based, formatted as a version-4-shaped UUID.
 */
export function stableId(key: string): string {
  const hash = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  const hex = hash(0x811c9dc5) + hash(0x01000193) + hash(0x9e3779b9) + hash(0x85ebca6b);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16]!, 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface NotificationText {
  billDue: (name: string, amount: string, dueOn: IsoDate) => { title: string; body: string };
  budgetNear: (category: string, percent: number) => { title: string; body: string };
  budgetOver: (category: string, amount: string) => { title: string; body: string };
  goalReached: (name: string) => { title: string; body: string };
}

/**
 * Creates the in-app notifications implied by the current data (idempotent): bill reminders `billReminderDays`
 * before each due date in the next 30 days, budget near/over warnings for this month, goals reached. The local OS
 * reminders are scheduled separately from the same data (src/services/reminders.ts).
 */
export async function refreshDerivedNotifications(
  db: SqlDriver,
  today: IsoDate,
  prefs: Preferences,
  text: NotificationText,
  locale: string,
): Promise<number> {
  const wanted: AppNotification[] = [];
  const now = nowIso();
  const make = (
    key: string,
    kind: NotificationKind,
    relatedId: string,
    at: string,
    t: { title: string; body: string },
  ) =>
    wanted.push({
      id: stableId(key),
      createdAt: now,
      updatedAt: now,
      kind,
      title: t.title.slice(0, 120),
      body: t.body.slice(0, 500),
      relatedId,
      scheduledFor: at,
      readAt: null,
    });

  if (prefs.notifyBills) {
    const bills = await listBills(db, { includeInactive: false });
    for (const o of upcomingObligations(bills, today, addDays(today, 30))) {
      const bill = bills.find((b) => b.id === o.billId)!;
      const remindOn =
        addDays(o.dueOn, -bill.remindDaysBefore) < today ? today : addDays(o.dueOn, -bill.remindDaysBefore);
      const [y, m, d] = remindOn.split('-').map(Number) as [number, number, number];
      make(
        `bill:${o.billId}:${o.dueOn}`,
        'bill_due',
        o.billId,
        // 9:00 local time on the reminder day (shown in the inbox from then on).
        new Date(y, m - 1, d, 9, 0, 0).toISOString(),
        text.billDue(o.name, formatMoney(o.amountMinor, o.currency, { locale }), o.dueOn),
      );
    }
  }

  if (prefs.notifyBudgets) {
    const month = monthOf(today);
    for (const currency of await usedCurrencies(db, prefs.primaryCurrency)) {
      const b = await getBudget(db, month, currency);
      if (!b) continue;
      const names = new Map(
        (await db.all<{ id: string; name: string }>('SELECT id, name FROM categories')).map((c) => [c.id, c.name]),
      );
      for (const c of b.usage.categories) {
        const name = names.get(c.categoryId) ?? '';
        if (c.status === 'over') {
          make(
            `budget_over:${b.budget.id}:${c.categoryId}`,
            'budget_over',
            b.budget.id,
            now,
            text.budgetOver(name, formatMoney(-c.remainingMinor, currency, { locale })),
          );
        } else if (c.status === 'near') {
          make(
            `budget_near:${b.budget.id}:${c.categoryId}`,
            'budget_near',
            b.budget.id,
            now,
            text.budgetNear(name, Math.round(c.ratio * 100)),
          );
        }
      }
    }
  }

  for (const g of await listGoals(db, today)) {
    if (g.progress.reached) make(`goal:${g.id}`, 'goal_reached', g.id, now, text.goalReached(g.name));
  }

  let created = 0;
  await write(db, async () => {
    for (const n of wanted) {
      const exists = await db.first<{ id: string }>('SELECT id FROM notifications WHERE id = ?', [n.id]);
      if (exists) continue;
      await putRow(db, notificationsSpec, n);
      created += 1;
    }
  });
  return created;
}
