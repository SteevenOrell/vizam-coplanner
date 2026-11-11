import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { notifyDataChanged } from '../../data/changes';
import { useDb, useDbQuery } from '../../data/hooks';
import { deleteNotification, listNotifications, markAllRead, markRead } from '../../data/repos/notifications';
import { todayIso } from '../../domain/dates';
import type { AppNotification, NotificationKind } from '../../domain/models';
import { requestReminderPermission, reminderPermissionGranted } from '../../services/reminders';
import { usePreferences, useToday } from '../../state/preferences';
import { Button, IconButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { formatDate } from '../../ui/format';
import { type IconName } from '../../ui/Icon';
import { CategoryBadge, Divider } from '../../ui/ListRow';
import { Screen, SectionHeader } from '../../ui/Screen';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { Banner, DbGate } from '../budgets/parts';

const ICONS: Record<NotificationKind, IconName> = {
  bill_due: 'clock',
  budget_near: 'alert',
  budget_over: 'alert',
  goal_reached: 'goal',
  system: 'info',
};

export function NotificationsScreen() {
  return (
    <DbGate>
      <NotificationsScreenContent />
    </DbGate>
  );
}

function NotificationsScreenContent() {
  const { t } = useTranslation();
  const db = useDb();
  const today = useToday();
  const state = useDbQuery((d) => listNotifications(d), [today]);
  const [permission, setPermission] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void reminderPermissionGranted().then((ok) => !cancelled && setPermission(ok));
    return () => {
      cancelled = true;
    };
  }, []);

  const enableReminders = useCallback(async () => {
    const ok = await requestReminderPermission();
    setPermission(ok);
    // Lets the maintenance hook schedule the OS reminders now that it is allowed.
    if (ok) notifyDataChanged('local');
  }, []);

  const open = async (n: AppNotification) => {
    if (!n.readAt) await markRead(db, [n.id]);
    switch (n.kind) {
      case 'bill_due':
        router.push('/bills');
        break;
      case 'budget_near':
      case 'budget_over':
        router.push('/budgets');
        break;
      case 'goal_reached':
        if (n.relatedId) router.push({ pathname: '/goal/[id]', params: { id: n.relatedId } });
        else router.push('/goals');
        break;
      default:
        break;
    }
  };

  return (
    <Screen
      title={t('notifications.title')}
      back
      right={
        state.status === 'success' && state.data.some((n) => !n.readAt) ? (
          <Button
            label={t('notifications.markAllRead')}
            size="sm"
            variant="secondary"
            onPress={() => void markAllRead(db)}
            testID="mark-all-read"
          />
        ) : null
      }
    >
      {Platform.OS === 'web' ? (
        <Banner tone="info" icon="info">
          <Text variant="label" color="accentText">
            {t('notifications.webNote')}
          </Text>
        </Banner>
      ) : permission === false ? (
        <Banner tone="info" icon="bell">
          <Text variant="label" color="accentText">
            {t('notifications.permissionBody')}
          </Text>
          <View style={styles.bannerAction}>
            <Button
              label={t('notifications.turnOn')}
              size="sm"
              onPress={() => void enableReminders()}
              testID="turn-on-reminders"
            />
          </View>
        </Banner>
      ) : null}

      <QueryView state={state}>
        {(items) => {
          if (items.length === 0) {
            return (
              <Card>
                <EmptyState icon="bell" title={t('notifications.emptyTitle')} body={t('notifications.emptyBody')} />
              </Card>
            );
          }
          const isToday = (n: AppNotification) => todayIso(new Date(n.scheduledFor)) === today;
          const groups = [
            { key: 'today', title: t('notifications.today'), rows: items.filter(isToday) },
            { key: 'earlier', title: t('notifications.earlier'), rows: items.filter((n) => !isToday(n)) },
          ].filter((g) => g.rows.length > 0);
          return (
            <>
              {groups.map((g) => (
                <View key={g.key} style={styles.group}>
                  <SectionHeader title={g.title} />
                  <Card>
                    {g.rows.map((n, i) => (
                      <View key={n.id}>
                        {i > 0 ? <Divider /> : null}
                        <Row n={n} onOpen={() => void open(n)} onDelete={() => void deleteNotification(db, n.id)} />
                      </View>
                    ))}
                  </Card>
                </View>
              ))}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function Row({ n, onOpen, onDelete }: { n: AppNotification; onOpen: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const unread = !n.readAt;
  const tone =
    n.kind === 'budget_over'
      ? colors.danger
      : n.kind === 'goal_reached'
        ? colors.positive
        : n.kind === 'bill_due' || n.kind === 'budget_near'
          ? colors.warning
          : colors.accent;
  const when = formatDate(todayIso(new Date(n.scheduledFor)), locale, 'medium');
  return (
    <View style={styles.row} testID={`notification-${n.id}`}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? `${t('notifications.unread')}. ` : ''}${n.title}. ${n.body}. ${when}`}
        style={styles.rowMain}
      >
        <View>
          <CategoryBadge icon={ICONS[n.kind]} color={tone} size={40} />
          {unread ? (
            <View style={[styles.dot, { backgroundColor: colors.danger, borderColor: colors.surface }]} />
          ) : null}
        </View>
        <View style={styles.texts}>
          <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={2}>
            {n.title}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {n.body}
          </Text>
          <Text variant="caption" color="textMuted">
            {when}
          </Text>
        </View>
      </Pressable>
      <IconButton
        icon="trash"
        size={40}
        label={t('notifications.delete')}
        onPress={onDelete}
        testID={`notification-delete-${n.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  bannerAction: { alignSelf: 'flex-start', marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 64 },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  dot: { position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
});
