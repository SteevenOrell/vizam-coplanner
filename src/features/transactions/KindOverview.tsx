import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { useDbQuery, useLookups, type Lookups } from '../../data/hooks';
import { listTransactions } from '../../data/repos/transactions';
import { addMonthKey, monthEnd, monthOf, monthStart, type MonthKey } from '../../domain/dates';
import { sumByCurrency } from '../../domain/money/aggregate';
import { CURRENCY_CODES, type CurrencyCode } from '../../domain/money/currency';
import { categoryBreakdown, monthlyTrend } from '../../domain/reports';
import type { Transaction, TxKind } from '../../domain/models';
import { usePreferences, useToday } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { formatMonth } from '../../ui/format';
import { TransactionRow } from '../../ui/finance/TransactionRow';
import { Icon } from '../../ui/Icon';
import { CategoryBadge, Divider } from '../../ui/ListRow';
import { Money, useMoneyFormat } from '../../ui/Money';
import { ProgressBar } from '../../ui/Progress';
import { Screen, SectionHeader } from '../../ui/Screen';
import { EmptyState, QueryView, Skeleton } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { currencyLabel } from './helpers';
import { MonthSwitcher } from './MonthSwitcher';

const TREND_MONTHS = 6;
/** Horizontal room used by the screen padding and the card padding around charts. */
const CHART_INSET = space.lg * 2 + space.lg * 2;

export function KindOverview({ kind }: { kind: TxKind }) {
  const { t } = useTranslation();
  const today = useToday();
  const [month, setMonth] = useState<MonthKey>(monthOf(today));
  const [width, setWidth] = useState(0);
  const rows = useDbQuery(
    (db) =>
      listTransactions(db, {
        from: monthStart(addMonthKey(month, -TREND_MONTHS)),
        to: monthEnd(month),
      }),
    [month],
    { keepPrevious: true },
  );
  const lookups = useLookups();
  const title = kind === 'income' ? t('transactions.overview.incomeTitle') : t('transactions.overview.expensesTitle');
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));

  return (
    <Screen title={title} back testID={`${kind}-overview`}>
      <View onLayout={onLayout} style={styles.stack}>
        <MonthSwitcher month={month} onChange={setMonth} />
        <QueryView state={rows} skeleton={<Skeleton lines={4} height={90} />}>
          {(data) =>
            lookups.status === 'success' ? (
              <Content kind={kind} month={month} rows={data} lookups={lookups.data} width={width} />
            ) : (
              <Skeleton lines={4} height={90} />
            )
          }
        </QueryView>
      </View>
    </Screen>
  );
}

function Content({
  kind,
  month,
  rows,
  lookups,
  width,
}: {
  kind: TxKind;
  month: MonthKey;
  rows: Transaction[];
  lookups: Lookups;
  width: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefs, locale } = usePreferences();
  const today = useToday();
  const mf = useMoneyFormat();
  const primary = prefs.primaryCurrency;
  const from = monthStart(month);
  const to = monthEnd(month);

  const model = useMemo(() => {
    const inMonth = rows.filter((r) => r.kind === kind && r.occurredOn >= from && r.occurredOn <= to);
    const totals = sumByCurrency(inMonth);
    const currencies: CurrencyCode[] = [
      primary,
      ...CURRENCY_CODES.filter((c) => c !== primary && totals[c] !== undefined),
    ];
    const prevMonth = addMonthKey(month, -1);
    const prevTotal = sumByCurrency(
      rows.filter(
        (r) => r.kind === kind && r.occurredOn >= monthStart(prevMonth) && r.occurredOn <= monthEnd(prevMonth),
      ),
    )[primary];
    const trend = monthlyTrend(rows, primary, addMonthKey(month, -(TREND_MONTHS - 1)), month);
    return { inMonth, totals, currencies, prevTotal: prevTotal ?? 0, trend };
  }, [rows, kind, month, from, to, primary]);

  const currentPrimary = model.totals[primary] ?? 0;
  let comparison: string;
  if (model.prevTotal === 0) comparison = t('transactions.overview.vsNone');
  else {
    const pct = Math.round((Math.abs(currentPrimary - model.prevTotal) / model.prevTotal) * 100);
    comparison =
      currentPrimary === model.prevTotal || pct === 0
        ? t('transactions.overview.vsSame')
        : currentPrimary > model.prevTotal
          ? t('transactions.overview.vsMore', { percent: pct })
          : t('transactions.overview.vsLess', { percent: pct });
  }
  const trendIcon =
    model.prevTotal === 0 || currentPrimary === model.prevTotal
      ? 'dot'
      : currentPrimary > model.prevTotal
        ? 'arrowUp'
        : 'arrowDown';

  const trendValues = model.trend.map((p) => (kind === 'income' ? p.incomeMinor : p.expenseMinor));
  const hasTrend = trendValues.some((v) => v > 0);
  const chartWidth = Math.max(0, width - CHART_INSET - 44);
  const barWidth = Math.max(12, Math.min(34, Math.floor(chartWidth / TREND_MONTHS / 2)));
  const barSpacing = Math.max(4, Math.floor((chartWidth - 8 - barWidth * TREND_MONTHS) / TREND_MONTHS));
  const trendSummary = t('transactions.overview.trendSummary', {
    list: model.trend
      .map((p, i) => `${formatMonth(p.month, locale, 'short')} ${mf(trendValues[i] ?? 0, primary)}`)
      .join(', '),
  });

  return (
    <>
      <HeroCard style={styles.hero}>
        <Text variant="label" color="heroTextSecondary">
          {kind === 'income' ? t('transactions.overview.totalIncome') : t('transactions.overview.totalExpenses')} ·{' '}
          {currencyLabel(primary)}
        </Text>
        <Money
          amountMinor={currentPrimary}
          currency={primary}
          variant="display"
          color="heroText"
          lightDecimals
          testID="overview-total"
        />
        {model.currencies.slice(1).map((c) => (
          <View key={c} style={styles.otherLine}>
            <Text variant="caption" color="heroTextSecondary">
              {t('transactions.overview.inCurrency', { currency: currencyLabel(c) })}
            </Text>
            <Money amountMinor={model.totals[c] ?? 0} currency={c} variant="bodyStrong" color="heroText" />
          </View>
        ))}
        <View style={styles.compare}>
          <Icon name={trendIcon} size={16} color={colors.heroText} />
          <Text variant="caption" color="heroTextSecondary" style={styles.flex}>
            {comparison}
          </Text>
        </View>
      </HeroCard>

      {model.inMonth.length === 0 ? (
        <Card>
          <EmptyState
            icon={kind === 'income' ? 'arrowDown' : 'arrowUp'}
            title={t('transactions.overview.emptyTitle')}
            body={t('transactions.overview.emptyBody')}
            action={{
              label: t('common.actions.add'),
              onPress: () => router.push({ pathname: '/transaction/new', params: { kind } }),
            }}
          />
        </Card>
      ) : (
        model.currencies.map((currency, index) => (
          <Breakdown
            key={currency}
            kind={kind}
            currency={currency}
            showCurrency={model.currencies.length > 1}
            rows={model.inMonth}
            from={from}
            to={to}
            lookups={lookups}
            donut={kind === 'expense' && index === 0}
            width={width}
          />
        ))
      )}

      <View style={styles.stack}>
        <SectionHeader title={`${t('transactions.overview.trend')} · ${currencyLabel(primary)}`} />
        <Card testID={`${kind}-trend`}>
          {hasTrend && chartWidth > 0 ? (
            <View accessible accessibilityRole="image" accessibilityLabel={trendSummary}>
              <BarChart
                data={model.trend.map((p, i) => ({
                  value: trendValues[i] ?? 0,
                  label: formatMonth(p.month, locale, 'short'),
                  frontColor: p.month === month ? colors.accent : colors.accentSoft,
                }))}
                width={chartWidth}
                height={150}
                barWidth={barWidth}
                spacing={barSpacing}
                initialSpacing={4}
                endSpacing={0}
                noOfSections={3}
                maxValue={Math.max(1, ...trendValues)}
                barBorderRadius={6}
                yAxisThickness={0}
                xAxisThickness={0}
                rulesColor={colors.border}
                yAxisLabelWidth={44}
                yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                formatYLabel={(label: string) => mf(Math.round(Number(label)), primary, { compact: true })}
                isAnimated={false}
                disableScroll
                disablePress
              />
            </View>
          ) : (
            <Text variant="caption" color="textSecondary">
              {hasTrend ? trendSummary : t('transactions.overview.emptyTitle')}
            </Text>
          )}
          {hasTrend ? (
            <Text variant="caption" color="textSecondary">
              {trendSummary}
            </Text>
          ) : null}
        </Card>
      </View>

      {model.inMonth.length > 0 ? (
        <View style={styles.stack}>
          <SectionHeader
            title={t('transactions.overview.list')}
            action={
              <Button
                label={t('transactions.overview.seeAll')}
                variant="ghost"
                size="sm"
                onPress={() => router.push('/activity')}
              />
            }
          />
          <Card padded={false} style={styles.listCard}>
            {model.inMonth.map((tx, i) => (
              <View key={tx.id}>
                {i > 0 ? <Divider inset={space.lg} /> : null}
                <TransactionRow tx={tx} lookups={lookups} today={today} />
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}

function Breakdown({
  kind,
  currency,
  showCurrency,
  rows,
  from,
  to,
  lookups,
  donut,
  width,
}: {
  kind: TxKind;
  currency: CurrencyCode;
  showCurrency: boolean;
  rows: Transaction[];
  from: string;
  to: string;
  lookups: Lookups;
  donut: boolean;
  width: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const mf = useMoneyFormat();
  const shares = useMemo(() => categoryBreakdown(rows, kind, currency, from, to), [rows, kind, currency, from, to]);
  const total = shares.reduce((s, x) => s + x.amountMinor, 0);
  if (shares.length === 0) return null;

  const named = shares.map((s, i) => {
    const category = s.categoryId ? lookups.categories.get(s.categoryId) : undefined;
    return {
      ...s,
      name: category?.name ?? t('common.uncategorized'),
      icon: category?.icon ?? 'tag',
      color: category?.color ?? colors.chart[i % colors.chart.length] ?? colors.accent,
      percent: Math.round(s.share * 100),
    };
  });
  const donutSummary = t('transactions.overview.donutSummary', {
    list: named
      .slice(0, 5)
      .map((n) => `${n.name} ${t('transactions.overview.share', { percent: n.percent })}`)
      .join(', '),
  });
  const radius = Math.max(50, Math.min(80, Math.floor((width - CHART_INSET) / 2) - 8));

  return (
    <View style={styles.stack}>
      <SectionHeader
        title={
          showCurrency
            ? `${t('transactions.overview.byCategory')} · ${currencyLabel(currency)}`
            : t('transactions.overview.byCategory')
        }
      />
      <Card style={styles.breakdown} testID={`${kind}-breakdown-${currency}`}>
        {donut && width > 0 ? (
          <View accessible accessibilityRole="image" accessibilityLabel={donutSummary} style={styles.donut}>
            <PieChart
              donut
              data={named.map((n) => ({ value: n.amountMinor, color: n.color }))}
              radius={radius}
              innerRadius={Math.round(radius * 0.62)}
              innerCircleColor={colors.surface}
              isAnimated={false}
              centerLabelComponent={() => (
                <View style={styles.center}>
                  <Money amountMinor={total} currency={currency} variant="label" />
                </View>
              )}
            />
          </View>
        ) : null}
        {named.map((n) => (
          <View key={n.categoryId ?? 'none'} style={styles.barRow}>
            <View style={styles.barHead}>
              <CategoryBadge icon={n.icon} color={n.color} size={32} />
              <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                {n.name}
              </Text>
              <Text variant="caption" color="textSecondary">
                {t('transactions.overview.share', { percent: n.percent })}
              </Text>
            </View>
            <ProgressBar
              ratio={n.share}
              height={6}
              label={`${n.name}: ${mf(n.amountMinor, currency)}, ${t('transactions.overview.share', {
                percent: n.percent,
              })}`}
            />
            <Money amountMinor={n.amountMinor} currency={currency} variant="caption" color="textSecondary" />
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  stack: { gap: space.md },
  hero: { gap: space.xs },
  otherLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  compare: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  listCard: { paddingVertical: space.xs },
  breakdown: { gap: space.lg },
  donut: { alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', maxWidth: 90 },
  barRow: { gap: space.xs },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
