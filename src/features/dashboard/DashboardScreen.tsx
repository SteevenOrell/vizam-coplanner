import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDbQuery } from '../../data/hooks';
import { diffDays } from '../../domain/dates';
import { CURRENCY_CODES, type CurrencyCode } from '../../domain/money/currency';
import { usePreferences, useToday } from '../../state/preferences';
import { useSession } from '../../state/session';
import { Button, IconButton, RoundAction } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { formatDate, relativeDay } from '../../ui/format';
import { TransactionRow } from '../../ui/finance/TransactionRow';
import { Icon } from '../../ui/Icon';
import { CategoryBadge, Divider, ListRow } from '../../ui/ListRow';
import { Money, useMoneyFormat } from '../../ui/Money';
import { ProgressBar, ProgressRing } from '../../ui/Progress';
import { Screen, SectionHeader } from '../../ui/Screen';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { currencyLabel } from '../transactions/helpers';
import { loadDashboard, type DashboardData } from './queries';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function DashboardScreen() {
  const today = useToday();
  const { prefs } = usePreferences();
  const primary = prefs.primaryCurrency;
  const state = useDbQuery((db) => loadDashboard(db, today, primary), [today, primary]);

  return (
    <Screen header={<Header unread={state.status === 'success' ? state.data.unread : 0} />} testID="dashboard-screen">
      <QueryView state={state}>{(data) => <Body data={data} />}</QueryView>
    </Screen>
  );
}

function Header({ unread }: { unread: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefs } = usePreferences();
  const { mode } = useSession();
  const insets = useSafeAreaInsets();
  const name = prefs.displayName.trim();
  return (
    <View style={[styles.headerOuter, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.openSettings')}
          style={[styles.avatar, { backgroundColor: colors.accentSoft }]}
        >
          {name ? (
            <Text variant="bodyStrong" color="accentText">
              {initials(name)}
            </Text>
          ) : (
            <Icon name="user" size={22} color={colors.accentText} />
          )}
        </Pressable>
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={1} accessibilityRole="header">
            {name ? t('dashboard.greeting', { name }) : t('dashboard.greetingAnon')}
          </Text>
          {mode === 'demo' ? (
            <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}>
              <Text variant="overline" color="warningText">
                {t('common.demoBadge')}
              </Text>
            </View>
          ) : null}
        </View>
        <IconButton
          icon="bell"
          label={t('dashboard.notifications')}
          tone="soft"
          badge={unread}
          onPress={() => router.push('/notifications')}
        />
      </View>
    </View>
  );
}

function Body({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  return (
    <>
      <BalanceHero data={data} />
      <QuickActions />
      <BudgetCard data={data} />
      <UpcomingBills data={data} />
      <GoalsRow data={data} />
      <RecentTransactions data={data} />
      <Text variant="caption" color="textMuted" align="center">
        {t('common.conceptNote')}
      </Text>
    </>
  );
}

function BalanceHero({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const { prefs, update } = usePreferences();
  const primary = prefs.primaryCurrency;
  const others = CURRENCY_CODES.filter((c) => c !== primary && data.balances[c] !== undefined);
  const hidden = prefs.hideBalances;
  return (
    <HeroCard style={styles.hero}>
      <View style={styles.heroTop}>
        <Text variant="label" color="heroTextSecondary">
          {t('dashboard.totalBalance')} · {currencyLabel(primary)}
        </Text>
        <IconButton
          icon={hidden ? 'eyeOff' : 'eye'}
          label={hidden ? t('common.actions.showBalances') : t('common.actions.hideBalances')}
          tone="hero"
          size={40}
          onPress={() => void update({ hideBalances: !hidden })}
        />
      </View>
      <Money
        amountMinor={data.balances[primary] ?? 0}
        currency={primary}
        variant="display"
        color="heroText"
        lightDecimals
        sensitive
        testID="hero-balance"
      />
      {others.map((c: CurrencyCode) => (
        <View key={c} style={styles.otherLine}>
          <Text variant="caption" color="heroTextSecondary">
            {t('dashboard.alsoIn', { currency: currencyLabel(c) })}
          </Text>
          <Money amountMinor={data.balances[c] ?? 0} currency={c} variant="bodyStrong" color="heroText" sensitive />
        </View>
      ))}
      <View style={styles.stats}>
        <StatTile
          icon="arrowDown"
          label={t('dashboard.income')}
          amountMinor={data.month.incomeMinor}
          currency={primary}
          onPress={() => router.push('/income')}
        />
        <StatTile
          icon="arrowUp"
          label={t('dashboard.expenses')}
          amountMinor={data.month.expenseMinor}
          currency={primary}
          onPress={() => router.push('/expenses')}
        />
      </View>
    </HeroCard>
  );
}

function StatTile({
  icon,
  label,
  amountMinor,
  currency,
  onPress,
}: {
  icon: 'arrowDown' | 'arrowUp';
  label: string;
  amountMinor: number;
  currency: CurrencyCode;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${t('dashboard.thisMonth')}`}
      style={({ pressed }) => [styles.stat, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={styles.statHead}>
        <Icon name={icon} size={14} color={colors.heroText} />
        <Text variant="caption" color="heroTextSecondary" numberOfLines={1} style={styles.flex}>
          {label}
        </Text>
      </View>
      <Money amountMinor={amountMinor} currency={currency} variant="bodyStrong" color="heroText" sensitive />
    </Pressable>
  );
}

function QuickActions() {
  const { t } = useTranslation();
  return (
    <View style={styles.actions}>
      <RoundAction
        icon="minus"
        label={t('dashboard.actions.addExpense')}
        onPress={() => router.push({ pathname: '/transaction/new', params: { kind: 'expense' } })}
      />
      <RoundAction
        icon="plus"
        label={t('dashboard.actions.addIncome')}
        onPress={() => router.push({ pathname: '/transaction/new', params: { kind: 'income' } })}
      />
      <RoundAction icon="repeat" label={t('dashboard.actions.bills')} onPress={() => router.push('/bills')} />
      <RoundAction icon="calendar" label={t('dashboard.actions.calendar')} onPress={() => router.push('/calendar')} />
      <RoundAction icon="chart" label={t('dashboard.actions.reports')} onPress={() => router.push('/reports')} />
    </View>
  );
}

function BudgetCard({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const mf = useMoneyFormat();
  const usage = data.budget?.usage;
  return (
    <View style={styles.section}>
      <SectionHeader title={t('dashboard.budget.title')} />
      {usage ? (
        <Pressable
          onPress={() => router.push('/budgets')}
          accessibilityRole="button"
          accessibilityLabel={`${t('dashboard.budget.title')}: ${t('dashboard.budget.spentOf', {
            spent: mf(usage.spentMinor, usage.currency),
            limit: mf(usage.limitMinor, usage.currency),
          })}`}
        >
          <Card style={styles.budgetCard} testID="dashboard-budget">
            <Text variant="label" color="textSecondary">
              {t('dashboard.budget.spentOf', {
                spent: mf(usage.spentMinor, usage.currency),
                limit: mf(usage.limitMinor, usage.currency),
              })}
            </Text>
            <ProgressBar
              ratio={usage.ratio}
              status={usage.status}
              label={t('common.a11y.progress', { percent: Math.round(Math.min(usage.ratio, 9.99) * 100) })}
            />
            {usage.status === 'over' ? (
              <View style={styles.statusLine}>
                <Icon name="alert" size={18} color={colors.danger} />
                <Text variant="bodyStrong" color="danger" style={styles.flex}>
                  {t('dashboard.budget.over', { amount: mf(-usage.remainingMinor, usage.currency) })}
                </Text>
              </View>
            ) : (
              <View style={styles.statusLine}>
                {usage.status === 'near' ? <Icon name="alert" size={18} color={colors.warningText} /> : null}
                <Text variant="bodyStrong" color={usage.status === 'near' ? 'warningText' : 'text'} style={styles.flex}>
                  {t('dashboard.budget.left', { amount: mf(usage.remainingMinor, usage.currency) })}
                  {usage.status === 'near' ? ` · ${t('dashboard.budget.near')}` : ''}
                </Text>
              </View>
            )}
          </Card>
        </Pressable>
      ) : (
        <Card>
          <EmptyState
            icon="budget"
            title={t('dashboard.budget.emptyTitle')}
            body={t('dashboard.budget.emptyBody')}
            action={{ label: t('dashboard.budget.emptyAction'), onPress: () => router.push('/budgets') }}
          />
        </Card>
      )}
    </View>
  );
}

function UpcomingBills({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const today = useToday();
  const shown = data.bills.slice(0, 4);
  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('dashboard.bills.title')}
        action={
          <Button label={t('common.actions.seeAll')} variant="ghost" size="sm" onPress={() => router.push('/bills')} />
        }
      />
      <Card padded={false} style={styles.listCard}>
        {shown.length === 0 ? (
          <Text variant="body" color="textSecondary" style={styles.pad}>
            {t('dashboard.bills.none')}
          </Text>
        ) : (
          shown.map((o, i) => {
            const overdue = diffDays(today, o.dueOn) < 0;
            const due = overdue
              ? `${t('dashboard.bills.overdue')} · ${formatDate(o.dueOn, locale, 'short')}`
              : relativeDay(o.dueOn, today, locale, t);
            return (
              <View key={`${o.billId}-${o.dueOn}`}>
                {i > 0 ? <Divider inset={space.lg} /> : null}
                <ListRow
                  leading={<CategoryBadge icon="repeat" color={overdue ? colors.danger : colors.accent} />}
                  title={o.name}
                  subtitle={due}
                  trailing={<Money amountMinor={o.amountMinor} currency={o.currency} />}
                  onPress={() => router.push('/bills')}
                  accessibilityLabel={`${o.name}, ${due}`}
                />
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}

function GoalsRow({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const mf = useMoneyFormat();
  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('dashboard.goals.title')}
        action={
          <Button label={t('common.actions.seeAll')} variant="ghost" size="sm" onPress={() => router.push('/goals')} />
        }
      />
      {data.goals.length === 0 ? (
        <Card>
          <EmptyState
            icon="goal"
            title={t('dashboard.goals.none')}
            action={{ label: t('dashboard.goals.noneAction'), onPress: () => router.push('/goals') }}
          />
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalsRow}>
          {data.goals.map((g) => {
            const percent = Math.round(Math.min(g.progress.ratio, 1) * 100);
            const summary = t('dashboard.goals.savedOf', {
              saved: mf(g.progress.savedMinor, g.currency),
              target: mf(g.targetMinor, g.currency),
            });
            return (
              <Pressable
                key={g.id}
                onPress={() => router.push({ pathname: '/goal/[id]', params: { id: g.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${g.name}, ${percent}%, ${summary}`}
              >
                <Card style={styles.goalCard}>
                  <View style={styles.ringBox}>
                    <ProgressRing ratio={g.progress.ratio} size={64} color={g.color} />
                    <View style={styles.ringCenter}>
                      <Text variant="caption" style={styles.ringText}>
                        {t('dashboard.goals.percent', { percent })}
                      </Text>
                    </View>
                  </View>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={2}>
                    {summary}
                  </Text>
                  {g.progress.reached ? <Icon name="check" size={16} color={colors.positive} /> : null}
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function RecentTransactions({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const today = useToday();
  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('dashboard.recent.title')}
        action={
          <Button
            label={t('common.actions.seeAll')}
            variant="ghost"
            size="sm"
            onPress={() => router.push('/activity')}
          />
        }
      />
      {data.recent.length === 0 ? (
        <Card>
          <EmptyState
            icon="wallet"
            title={t('dashboard.recent.empty')}
            action={{
              label: t('dashboard.recent.emptyAction'),
              onPress: () => router.push('/transaction/new'),
            }}
          />
        </Card>
      ) : (
        <Card padded={false} style={styles.listCard}>
          {data.recent.map((tx, i) => (
            <View key={tx.id}>
              {i > 0 ? <Divider inset={space.lg} /> : null}
              <TransactionRow tx={tx} lookups={data.lookups} today={today} />
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  headerOuter: { alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.lg },
  header: { width: '100%', maxWidth: 720, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  hero: { gap: space.xs },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  otherLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  stat: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    gap: space.xs,
    borderRadius: radii.md,
    padding: space.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, justifyContent: 'space-between' },
  section: { gap: space.sm },
  budgetCard: { gap: space.md },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  listCard: { paddingVertical: space.xs },
  pad: { padding: space.lg },
  goalsRow: { gap: space.md, paddingVertical: space.xs, paddingRight: space.xs },
  goalCard: { width: 164, gap: space.xs },
  ringBox: { width: 64, height: 64, marginBottom: space.xs },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: { fontWeight: '600' },
});
