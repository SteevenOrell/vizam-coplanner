import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDbQuery, useDb } from '../../data/hooks';
import { categoryMap } from '../../data/repos/core';
import { copyPreviousBudget, getBudget, listBills } from '../../data/repos/planning';
import { usedCurrencies } from '../../data/repos/transactions';
import { dailyAllowance } from '../../domain/budget';
import { diffDays, monthEnd, monthOf, monthStart } from '../../domain/dates';
import type { CurrencyCode } from '../../domain/money/currency';
import { usePreferences, useToday } from '../../state/preferences';
import { Button, IconButton } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { SegmentedControl } from '../../ui/Chip';
import { CategoryBadge, Divider } from '../../ui/ListRow';
import { Money, useMoneyFormat } from '../../ui/Money';
import { ProgressBar } from '../../ui/Progress';
import { Screen, SectionHeader } from '../../ui/Screen';
import { useSnackbar } from '../../ui/Snackbar';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { monthObligations } from '../bills/obligations';
import { BudgetStatusText, currencyLabel, errorMessage, HeroStat, MonthSwitcher, DbGate } from './parts';

export function BudgetsScreen() {
  return (
    <DbGate>
      <BudgetsScreenContent />
    </DbGate>
  );
}

function BudgetsScreenContent() {
  const { t } = useTranslation();
  const db = useDb();
  const today = useToday();
  const { prefs } = usePreferences();
  const fmt = useMoneyFormat();
  const snack = useSnackbar();
  const { colors } = useTheme();
  const [month, setMonth] = useState(() => monthOf(today));
  const [picked, setPicked] = useState<CurrencyCode | null>(null);
  const currency = picked ?? prefs.primaryCurrency;
  const [busy, setBusy] = useState(false);

  const state = useDbQuery(
    async (d) => {
      const [currencies, data, bills, categories] = await Promise.all([
        usedCurrencies(d, prefs.primaryCurrency),
        getBudget(d, month, currency),
        listBills(d, { includeInactive: false }),
        categoryMap(d),
      ]);
      return { currencies, data, bills, categories };
    },
    [month, currency, prefs.primaryCurrency],
  );

  const goEdit = () => router.push({ pathname: '/budget/edit', params: { month, currency } });

  const copyLast = async () => {
    setBusy(true);
    try {
      const copied = await copyPreviousBudget(db, month, currency);
      snack({ message: copied ? t('budgets.copied') : t('budgets.nothingToCopy') });
    } catch (e) {
      snack({ message: errorMessage(t, e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t('budgets.title')}
      right={
        state.status === 'success' && state.data.data ? (
          <IconButton icon="edit" label={t('budgets.edit')} tone="soft" onPress={goEdit} />
        ) : null
      }
    >
      <MonthSwitcher month={month} onChange={setMonth} />
      <QueryView state={state}>
        {({ currencies, data, bills, categories }) => {
          const currentMonth = monthOf(today);
          const isPast = month < currentMonth;
          const from = month === currentMonth ? today : monthStart(month);
          const planned = monthObligations(bills, month, today)
            .filter((o) => o.currency === currency)
            .reduce((s, o) => s + o.amountMinor, 0);
          const daysLeft = isPast ? 0 : diffDays(from, monthEnd(month)) + 1;
          return (
            <>
              {currencies.length > 1 ? (
                <SegmentedControl
                  value={currency}
                  onChange={setPicked}
                  options={currencies.map((c) => ({ value: c, label: currencyLabel(c) }))}
                />
              ) : null}
              {!data ? (
                <Card>
                  <EmptyState icon="budget" title={t('budgets.emptyTitle')} body={t('budgets.emptyBody')} />
                  <View style={styles.actions}>
                    <Button label={t('budgets.create')} icon="plus" onPress={goEdit} />
                    <Button
                      label={t('budgets.copyLast')}
                      variant="secondary"
                      icon="repeat"
                      onPress={() => void copyLast()}
                      loading={busy}
                    />
                  </View>
                </Card>
              ) : (
                <>
                  <HeroCard>
                    <Text variant="overline" color="heroTextSecondary">
                      {t('budgets.spentOfLimit')}
                    </Text>
                    <Money
                      amountMinor={data.usage.spentMinor}
                      currency={currency}
                      variant="display"
                      color="heroText"
                      lightDecimals
                      sensitive
                    />
                    <Text variant="label" color="heroTextSecondary">
                      {t('budgets.ofLimit', { amount: fmt(data.usage.limitMinor, currency) })}
                    </Text>
                    <View style={styles.heroBar}>
                      <ProgressBar
                        ratio={data.usage.ratio}
                        status={data.usage.status}
                        onHero
                        height={10}
                        label={t('budgets.progressLabel', { percent: Math.round(data.usage.ratio * 100) })}
                      />
                    </View>
                    <View style={styles.stats}>
                      <HeroStat label={t('budgets.remaining')}>
                        <Text variant="amount" color="heroText">
                          {data.usage.remainingMinor < 0
                            ? t('budgets.over', { amount: fmt(-data.usage.remainingMinor, currency) })
                            : fmt(data.usage.remainingMinor, currency)}
                        </Text>
                      </HeroStat>
                      <HeroStat label={t('budgets.plannedBills')}>
                        <Text variant="amount" color="heroText">
                          {fmt(planned, currency)}
                        </Text>
                      </HeroStat>
                      {!isPast ? (
                        <HeroStat label={t('budgets.safePerDay')}>
                          <Text variant="amount" color="heroText">
                            {fmt(dailyAllowance(data.usage.remainingMinor, planned, daysLeft), currency)}
                          </Text>
                        </HeroStat>
                      ) : null}
                    </View>
                  </HeroCard>

                  <SectionHeader title={t('budgets.categories')} />
                  <Card>
                    {[...data.usage.categories]
                      .sort((a, b) => b.ratio - a.ratio)
                      .map((c, i) => {
                        const cat = categories.get(c.categoryId);
                        const name = cat?.name ?? t('common.uncategorized');
                        return (
                          <View key={c.categoryId}>
                            {i > 0 ? <Divider /> : null}
                            <Pressable
                              testID={`budget-cat-${c.categoryId}`}
                              onPress={() =>
                                router.push({
                                  pathname: '/budget/category/[id]',
                                  params: { id: c.categoryId, month, currency },
                                })
                              }
                              accessibilityRole="button"
                              accessibilityLabel={`${name}, ${fmt(c.spentMinor, currency)} / ${fmt(c.limitMinor, currency)}`}
                              style={styles.catRow}
                            >
                              <View style={styles.catHead}>
                                <CategoryBadge
                                  icon={cat?.icon ?? 'tag'}
                                  color={cat?.color ?? colors.textMuted}
                                  size={40}
                                />
                                <View style={styles.flex}>
                                  <Text variant="bodyStrong" numberOfLines={1}>
                                    {name}
                                  </Text>
                                  <Text variant="caption" color="textSecondary">
                                    {fmt(c.spentMinor, currency)} / {fmt(c.limitMinor, currency)}
                                  </Text>
                                </View>
                              </View>
                              <ProgressBar
                                ratio={c.ratio}
                                status={c.status}
                                label={t('budgets.progressLabel', { percent: Math.round(c.ratio * 100) })}
                              />
                              <BudgetStatusText
                                status={c.status}
                                remainingMinor={c.remainingMinor}
                                currency={currency}
                              />
                            </Pressable>
                          </View>
                        );
                      })}
                  </Card>
                  {data.usage.unbudgetedMinor > 0 ? (
                    <Card>
                      <View style={styles.unbudgeted}>
                        <View style={styles.flex}>
                          <Text variant="bodyStrong">{t('budgets.unbudgeted')}</Text>
                          <Text variant="caption" color="textSecondary">
                            {t('budgets.unbudgetedHelp')}
                          </Text>
                        </View>
                        <Money amountMinor={data.usage.unbudgetedMinor} currency={currency} />
                      </View>
                    </Card>
                  ) : null}
                </>
              )}
              {currencies.length > 1 ? (
                <Text variant="caption" color="textMuted">
                  {t('common.currency.noConversion')}
                </Text>
              ) : null}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  actions: { gap: space.sm },
  heroBar: { marginTop: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.lg },
  catRow: { gap: space.sm, paddingVertical: space.md },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  unbudgeted: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
