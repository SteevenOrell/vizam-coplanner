import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDbQuery } from '../../data/hooks';
import { listGoals, type GoalWithProgress } from '../../data/repos/planning';
import { sumByCurrency } from '../../domain/money/aggregate';
import { CURRENCY_CODES, type CurrencyCode } from '../../domain/money/currency';
import { usePreferences, useToday } from '../../state/preferences';
import { IconButton } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { formatDate } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { Money, useMoneyFormat } from '../../ui/Money';
import { ProgressRing } from '../../ui/Progress';
import { Screen } from '../../ui/Screen';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { Badge } from '../budgets/parts';

export function GoalsScreen() {
  const { t } = useTranslation();
  const today = useToday();
  const { prefs } = usePreferences();
  const [showArchived, setShowArchived] = useState(false);
  const state = useDbQuery((db) => listGoals(db, today, { includeArchived: showArchived }), [today, showArchived]);

  return (
    <Screen
      title={t('savings.title')}
      right={
        <IconButton icon="plus" tone="soft" label={t('savings.newGoal')} onPress={() => router.push('/goal/new')} />
      }
    >
      <QueryView state={state}>
        {(goals) => {
          const live = goals.filter((g) => !g.archived);
          const totals = sumByCurrency(live.map((g) => ({ amountMinor: g.progress.savedMinor, currency: g.currency })));
          const currencies = [
            prefs.primaryCurrency,
            ...CURRENCY_CODES.filter((c) => c !== prefs.primaryCurrency),
          ].filter((c) => totals[c] !== undefined);
          return (
            <>
              <HeroCard>
                <Text variant="overline" color="heroTextSecondary">
                  {t('savings.totalSaved')}
                </Text>
                {currencies.length === 0 ? (
                  <Money
                    amountMinor={0}
                    currency={prefs.primaryCurrency}
                    variant="display"
                    color="heroText"
                    lightDecimals
                  />
                ) : (
                  currencies.map((c, i) => (
                    <Money
                      key={c}
                      amountMinor={totals[c] ?? 0}
                      currency={c}
                      variant={i === 0 ? 'display' : 'title'}
                      color="heroText"
                      lightDecimals
                      sensitive
                    />
                  ))
                )}
                <Text variant="caption" color="heroTextSecondary">
                  {t('savings.goalsCount', { count: live.length })}
                  {currencies.length > 1 ? ` · ${t('common.currency.noConversion')}` : ''}
                </Text>
              </HeroCard>

              <View style={styles.toolbar}>
                <Chip
                  label={t('savings.showArchived')}
                  icon={showArchived ? 'check' : undefined}
                  selected={showArchived}
                  onPress={() => setShowArchived((v) => !v)}
                />
              </View>

              {goals.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="piggy"
                    title={t('savings.emptyTitle')}
                    body={t('savings.emptyBody')}
                    action={{ label: t('savings.newGoal'), onPress: () => router.push('/goal/new') }}
                  />
                </Card>
              ) : (
                goals.map((g) => <GoalCard key={g.id} goal={g} />)
              )}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function GoalCard({ goal }: { goal: GoalWithProgress }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const fmt = useMoneyFormat();
  const p = goal.progress;
  const percent = Math.round(p.ratio * 100);
  const currency: CurrencyCode = goal.currency;
  return (
    <Pressable
      testID={`goal-${goal.id}`}
      onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${fmt(p.savedMinor, currency)} / ${fmt(goal.targetMinor, currency)}, ${percent}%`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : goal.archived ? 0.7 : 1 })}
    >
      <Card style={styles.card}>
        <View style={styles.ringWrap}>
          <ProgressRing ratio={p.ratio} size={68} color={goal.color} />
          <View style={styles.ringCenter} pointerEvents="none">
            <Icon name={goal.icon} size={22} color={goal.color} />
          </View>
        </View>
        <View style={styles.info}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {goal.name}
          </Text>
          <Text variant="label" color="textSecondary">
            {fmt(p.savedMinor, currency)} / {fmt(goal.targetMinor, currency)} · {percent}%
          </Text>
          {!p.reached ? (
            <Text variant="caption" color="textSecondary">
              {t('savings.remaining', { amount: fmt(p.remainingMinor, currency) })}
            </Text>
          ) : null}
          {goal.targetDate ? (
            <Text variant="caption" color="textSecondary">
              {t('savings.targetBy', { date: formatDate(goal.targetDate, locale, 'medium') })}
            </Text>
          ) : null}
          {p.monthlyNeededMinor !== null && !p.overdue ? (
            <Text variant="caption" color="accentText">
              {t('savings.monthlyNeeded', { amount: fmt(p.monthlyNeededMinor, currency) })}
            </Text>
          ) : null}
          <View style={styles.badges}>
            {p.reached ? <Badge label={t('savings.reached')} tone="positive" icon="check" /> : null}
            {p.overdue ? <Badge label={t('savings.overdue')} tone="danger" icon="alert" /> : null}
            {goal.archived ? <Badge label={t('savings.archived')} tone="info" /> : null}
          </View>
        </View>
        <Icon name="chevronRight" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', justifyContent: 'flex-start' },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ringWrap: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
});
