import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDbQuery, useLookups, type Lookups } from '../../data/hooks';
import { getBudget, listBills } from '../../data/repos/planning';
import { listTransactions } from '../../data/repos/transactions';
import type { CategoryUsage } from '../../domain/budget';
import { daysInMonth, monthEnd, monthOf, monthStart, type IsoDate, type MonthKey } from '../../domain/dates';
import { isCurrencyCode, type CurrencyCode } from '../../domain/money/currency';
import type { RecurringBill, Transaction } from '../../domain/models';
import { usePreferences, useToday } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { formatDate, formatMonth } from '../../ui/format';
import { CategoryBadge, Divider, ListRow } from '../../ui/ListRow';
import { Money, useMoneyFormat } from '../../ui/Money';
import { ProgressBar } from '../../ui/Progress';
import { Screen, SectionHeader } from '../../ui/Screen';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { TransactionRow } from '../../ui/finance/TransactionRow';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { monthObligations } from '../bills/obligations';
import { ChartFrame, SimpleBars } from '../reports/charts';
import { Banner, BudgetStatusText, HeroStat } from './parts';

export function BudgetCategoryScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; month?: string; currency?: string }>();
  const today = useToday();
  const { prefs } = usePreferences();
  const id = params.id ?? '';
  const month: MonthKey = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : monthOf(today);
  const currency: CurrencyCode = isCurrencyCode(params.currency) ? params.currency : prefs.primaryCurrency;
  const lookups = useLookups();

  const state = useDbQuery(
    async (db) => {
      const [budget, txs, bills] = await Promise.all([
        getBudget(db, month, currency),
        listTransactions(db, {
          kind: 'expense',
          currency,
          categoryId: id,
          from: monthStart(month),
          to: monthEnd(month),
        }),
        listBills(db, { includeInactive: false }),
      ]);
      return { usage: budget?.usage.categories.find((c) => c.categoryId === id) ?? null, txs, bills };
    },
    [id, month, currency],
  );

  return (
    <Screen title={t('budgets.categoryTitle')} back>
      <QueryView state={lookups}>
        {(lk) => (
          <QueryView state={state}>
            {({ usage, txs, bills }) => (
              <Content
                lookups={lk}
                categoryId={id}
                month={month}
                currency={currency}
                today={today}
                usage={usage}
                txs={txs}
                bills={bills}
              />
            )}
          </QueryView>
        )}
      </QueryView>
    </Screen>
  );
}

function Content({
  lookups,
  categoryId,
  month,
  currency,
  today,
  usage,
  txs,
  bills,
}: {
  lookups: Lookups;
  categoryId: string;
  month: MonthKey;
  currency: CurrencyCode;
  today: IsoDate;
  usage: CategoryUsage | null;
  txs: Transaction[];
  bills: RecurringBill[];
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const fmt = useMoneyFormat();
  const category = lookups.categories.get(categoryId);
  if (!category) return <EmptyState icon="budget" title={t('errors.notFound')} />;
  const spent = usage?.spentMinor ?? txs.reduce((s, x) => s + x.amountMinor, 0);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = daysInMonth(y, m);
  const perDay = new Array<number>(days).fill(0);
  for (const x of txs) perDay[Number(x.occurredOn.slice(8)) - 1]! += x.amountMinor;
  const planned = monthObligations(bills, month, today).filter(
    (o) => o.currency === currency && bills.find((b) => b.id === o.billId)?.categoryId === categoryId,
  );
  const status = usage?.status ?? 'ok';
  const peak = Math.max(0, ...perDay);
  const peakDay = perDay.indexOf(peak) + 1;

  return (
    <>
      <HeroCard>
        <View style={styles.heroHead}>
          <CategoryBadge icon={category.icon} color={colors.heroText} size={44} />
          <View style={styles.flex}>
            <Text variant="heading" color="heroText" numberOfLines={1}>
              {category.name}
            </Text>
            <Text variant="caption" color="heroTextSecondary">
              {formatMonth(month, locale)}
            </Text>
          </View>
        </View>
        <Text variant="overline" color="heroTextSecondary" style={styles.top}>
          {t('budgets.spent')}
        </Text>
        <Money amountMinor={spent} currency={currency} variant="display" color="heroText" lightDecimals sensitive />
        {usage ? (
          <>
            <View style={styles.top}>
              <ProgressBar
                ratio={usage.ratio}
                status={usage.status}
                onHero
                height={10}
                label={t('budgets.progressLabel', { percent: Math.round(usage.ratio * 100) })}
              />
            </View>
            <View style={styles.stats}>
              <HeroStat label={t('budgets.limit')}>
                <Text variant="amount" color="heroText">
                  {fmt(usage.limitMinor, currency)}
                </Text>
              </HeroStat>
              <HeroStat label={t('budgets.remaining')}>
                <Text variant="amount" color="heroText">
                  {usage.remainingMinor < 0
                    ? t('budgets.over', { amount: fmt(-usage.remainingMinor, currency) })
                    : fmt(usage.remainingMinor, currency)}
                </Text>
              </HeroStat>
            </View>
          </>
        ) : null}
      </HeroCard>

      {usage && status !== 'ok' ? (
        <Banner tone={status === 'over' ? 'danger' : 'warning'} icon="alert">
          <Text variant="label" color={status === 'over' ? 'danger' : 'warningText'}>
            {status === 'over'
              ? t('budgets.warnOver')
              : t('budgets.warnNear', { percent: Math.round(usage.ratio * 100) })}
          </Text>
          <BudgetStatusText status={status} remainingMinor={usage.remainingMinor} currency={currency} />
        </Banner>
      ) : null}

      <SectionHeader title={t('budgets.dailySpending')} />
      <Card>
        {peak === 0 ? (
          <Text variant="body" color="textSecondary">
            {t('budgets.noSpending')}
          </Text>
        ) : (
          <ChartFrame
            minHeight={190}
            summary={t('budgets.dailySummary', {
              total: fmt(spent, currency),
              day: peakDay,
              peak: fmt(peak, currency),
            })}
          >
            {(w) => (
              <SimpleBars
                width={w}
                currency={currency}
                color={category.color}
                labelEvery={5}
                items={perDay.map((v, i) => ({ label: String(i + 1), value: v }))}
              />
            )}
          </ChartFrame>
        )}
      </Card>

      {planned.length > 0 ? (
        <>
          <SectionHeader title={t('budgets.plannedBillsTitle')} />
          <Card>
            {planned.map((o, i) => (
              <View key={`${o.billId}-${o.dueOn}`}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  leading={<CategoryBadge icon="repeat" color={colors.warning} />}
                  title={o.name}
                  subtitle={t('budgets.dueOn', { date: formatDate(o.dueOn, locale, 'short') })}
                  trailing={<Money amountMinor={o.amountMinor} currency={o.currency} />}
                  onPress={() => router.push('/bills')}
                  accessibilityLabel={`${o.name}, ${formatDate(o.dueOn, locale, 'short')}, ${fmt(o.amountMinor, o.currency)}`}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title={t('budgets.transactions')} />
      {txs.length === 0 ? (
        <Card>
          <EmptyState icon="activity" title={t('budgets.noTransactions')} />
        </Card>
      ) : (
        <Card>
          {txs.map((x, i) => (
            <View key={x.id}>
              {i > 0 ? <Divider /> : null}
              <TransactionRow tx={x} lookups={lookups} today={today} />
            </View>
          ))}
        </Card>
      )}

      <Button
        label={t('budgets.editLimits')}
        variant="secondary"
        icon="edit"
        onPress={() => router.push({ pathname: '/budget/edit', params: { month, currency } })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  top: { marginTop: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.lg },
});
