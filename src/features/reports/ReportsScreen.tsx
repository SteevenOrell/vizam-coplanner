import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb, useDbQuery, useLookups } from '../../data/hooks';
import { categoryMap, listAccountBalances, listAccounts } from '../../data/repos/core';
import { getBudget, getGoal, listGoals, type BudgetWithUsage } from '../../data/repos/planning';
import { listTransactions, usedCurrencies } from '../../data/repos/transactions';
import {
  addMonthKey,
  monthEnd,
  monthOf,
  monthRange,
  monthStart,
  type IsoDate,
  type MonthKey,
} from '../../domain/dates';
import type { CurrencyCode } from '../../domain/money/currency';
import { cashFlow, categoryBreakdown, monthlyTrend, savingsRate } from '../../domain/reports';
import { usePreferences, useToday } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip, ChipRow, SegmentedControl } from '../../ui/Chip';
import { formatDate, formatMonth } from '../../ui/format';
import { Divider } from '../../ui/ListRow';
import { Money, useMoneyFormat } from '../../ui/Money';
import { ProgressBar } from '../../ui/Progress';
import { Screen, SectionHeader } from '../../ui/Screen';
import { useSnackbar } from '../../ui/Snackbar';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { currencyLabel, errorMessage, DbGate } from '../budgets/parts';
import { ChartFrame, Donut, GroupedBars, TrendLine } from './charts';
import { periodTransactionsCsv, savingsToCsv, type GoalContributions } from './exports';
import { shareCsv } from './shareFile';

type Period = 'thisMonth' | 'last3' | 'last6' | 'thisYear';
const PERIODS: readonly Period[] = ['thisMonth', 'last3', 'last6', 'thisYear'];

export function periodRange(period: Period, today: IsoDate): { from: MonthKey; to: MonthKey } {
  const cur = monthOf(today);
  switch (period) {
    case 'thisMonth':
      return { from: cur, to: cur };
    case 'last3':
      return { from: addMonthKey(cur, -2), to: cur };
    case 'last6':
      return { from: addMonthKey(cur, -5), to: cur };
    case 'thisYear':
      return { from: `${cur.slice(0, 4)}-01`, to: cur };
  }
}

const MAX_SLICES = 6;

export function ReportsScreen() {
  return (
    <DbGate>
      <ReportsScreenContent />
    </DbGate>
  );
}

function ReportsScreenContent() {
  const { t } = useTranslation();
  const db = useDb();
  const today = useToday();
  const { prefs, locale } = usePreferences();
  const snack = useSnackbar();
  const lookups = useLookups();
  const [period, setPeriod] = useState<Period>('last6');
  const [picked, setPicked] = useState<CurrencyCode | null>(null);
  const [busy, setBusy] = useState<'tx' | 'savings' | null>(null);
  const currency = picked ?? prefs.primaryCurrency;
  const { from, to } = periodRange(period, today);

  const state = useDbQuery(
    async (d) => {
      const currencies = await usedCurrencies(d, prefs.primaryCurrency);
      const [txs, balances, goals] = await Promise.all([
        listTransactions(d, { from: monthStart(from) }),
        listAccountBalances(d),
        listGoals(d, today),
      ]);
      const budgets: BudgetWithUsage[] = [];
      for (const m of monthRange(from, to)) {
        for (const c of currencies) {
          const b = await getBudget(d, m, c);
          if (b) budgets.push(b);
        }
      }
      const goalData: GoalContributions[] = [];
      for (const g of goals) {
        const full = await getGoal(d, g.id, today);
        goalData.push({ name: g.name, currency: g.currency, contributions: full?.contributions ?? [] });
      }
      return { currencies, txs, balances, goals, budgets, goalData };
    },
    [from, to, today, prefs.primaryCurrency],
  );

  const exportTx = async () => {
    setBusy('tx');
    try {
      const [cats, accts] = [await categoryMap(db), await listAccounts(db, { includeArchived: true })];
      const txs = await listTransactions(db, { from: monthStart(from), to: monthEnd(to) });
      const csv = periodTransactionsCsv(
        txs,
        cats,
        new Map(accts.map((a) => [a.id, a])),
        monthStart(from),
        monthEnd(to),
      );
      const r = await shareCsv(`coplanner-transactions-${from}_${to}.csv`, csv);
      snack({ message: r === 'unavailable' ? t('reports.exportUnavailable') : t('reports.exported') });
    } catch (e) {
      snack({ message: errorMessage(t, e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title={t('reports.title')} back>
      <ChipRow>
        {PERIODS.map((p) => (
          <Chip key={p} label={t(`reports.periods.${p}`)} selected={period === p} onPress={() => setPeriod(p)} />
        ))}
      </ChipRow>
      <QueryView state={lookups}>
        {(lk) => (
          <QueryView state={state}>
            {({ currencies, txs, balances, goals, budgets, goalData }) => {
              const trend = monthlyTrend(txs, currency, from, to);
              const fromDate = monthStart(from);
              const toDate = monthEnd(to);
              const inPeriod = txs.filter(
                (x) => x.currency === currency && x.occurredOn >= fromDate && x.occurredOn <= toDate,
              );
              const totalIncome = trend.reduce((s, p) => s + p.incomeMinor, 0);
              const totalExpense = trend.reduce((s, p) => s + p.expenseMinor, 0);
              const shares = categoryBreakdown(txs, 'expense', currency, fromDate, toDate);

              const latest = to;
              const cfFrom = monthStart(latest);
              const cfTo = today < monthEnd(latest) ? today : monthEnd(latest);
              const accountIds = new Set(balances.filter((b) => b.currency === currency).map((b) => b.id));
              const balanceNow = balances
                .filter((b) => b.currency === currency)
                .reduce((s, b) => s + b.balanceMinor, 0);
              const netSince = txs
                .filter((x) => accountIds.has(x.accountId) && x.occurredOn >= cfFrom)
                .reduce((s, x) => s + (x.kind === 'income' ? x.amountMinor : -x.amountMinor), 0);
              const flow = cashFlow(txs, currency, cfFrom, cfTo, balanceNow - netSince);

              const budgetRows = budgets
                .filter((b) => b.budget.currency === currency)
                .sort((a, b) => (a.budget.month < b.budget.month ? -1 : 1));
              const goalRows = goals.filter((g) => g.currency === currency);

              const exportSavings = async () => {
                setBusy('savings');
                try {
                  const csv = savingsToCsv(goalData, fromDate, toDate);
                  const r = await shareCsv(`coplanner-savings-${from}_${to}.csv`, csv);
                  snack({ message: r === 'unavailable' ? t('reports.exportUnavailable') : t('reports.exported') });
                } catch (e) {
                  snack({ message: errorMessage(t, e) });
                } finally {
                  setBusy(null);
                }
              };

              return (
                <>
                  {currencies.length > 1 ? (
                    <>
                      <SegmentedControl
                        value={currency}
                        onChange={setPicked}
                        options={currencies.map((c) => ({ value: c, label: currencyLabel(c) }))}
                      />
                      <Text variant="caption" color="textMuted">
                        {t('common.currency.noConversion')}
                      </Text>
                    </>
                  ) : null}

                  {inPeriod.length === 0 && budgetRows.length === 0 && goalRows.length === 0 ? (
                    <Card>
                      <EmptyState icon="chart" title={t('reports.emptyTitle')} body={t('reports.emptyBody')} />
                    </Card>
                  ) : null}

                  <IncomeExpenses
                    trend={trend}
                    currency={currency}
                    locale={locale}
                    totalIncome={totalIncome}
                    totalExpense={totalExpense}
                  />
                  <CategoryCard shares={shares} currency={currency} lookups={lk} total={totalExpense} />
                  <NetTrend trend={trend} currency={currency} locale={locale} />
                  <CashFlowCard flow={flow} currency={currency} locale={locale} month={latest} />
                  <BudgetPerformance rows={budgetRows} currency={currency} locale={locale} />
                  <SavingsProgress goals={goalRows} currency={currency} />
                  <SummaryTable trend={trend} currency={currency} locale={locale} />

                  <SectionHeader title={t('reports.export')} />
                  <Card style={styles.exportCard}>
                    <Text variant="caption" color="textSecondary">
                      {t('reports.exportHelp', {
                        from: formatDate(fromDate, locale, 'medium'),
                        to: formatDate(toDate, locale, 'medium'),
                      })}
                    </Text>
                    <Button
                      label={t('reports.exportTransactions')}
                      icon="download"
                      variant="secondary"
                      onPress={() => void exportTx()}
                      loading={busy === 'tx'}
                      testID="export-transactions"
                    />
                    <Button
                      label={t('reports.exportSavings')}
                      icon="download"
                      variant="secondary"
                      onPress={() => void exportSavings()}
                      loading={busy === 'savings'}
                      testID="export-savings"
                    />
                  </Card>
                </>
              );
            }}
          </QueryView>
        )}
      </QueryView>
    </Screen>
  );
}

type Trend = ReturnType<typeof monthlyTrend>;

function ReportCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <SectionHeader title={title} />
      <Card style={styles.card}>{children}</Card>
    </>
  );
}

function IncomeExpenses({
  trend,
  currency,
  locale,
  totalIncome,
  totalExpense,
}: {
  trend: Trend;
  currency: CurrencyCode;
  locale: string;
  totalIncome: number;
  totalExpense: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fmt = useMoneyFormat();
  return (
    <ReportCard title={t('reports.incomeVsExpenses')}>
      <View style={styles.legend}>
        <LegendDot color={colors.positive} label={t('reports.income')} />
        <LegendDot color={colors.accent} label={t('reports.expenses')} />
      </View>
      <ChartFrame
        minHeight={200}
        summary={t('reports.incomeVsExpensesSummary', {
          months: trend.length,
          income: fmt(totalIncome, currency),
          expenses: fmt(totalExpense, currency),
        })}
      >
        {(w) => (
          <GroupedBars
            width={w}
            currency={currency}
            colorA={colors.positive}
            colorB={colors.accent}
            groups={trend.map((p) => ({
              label: formatMonth(p.month, locale, 'short'),
              a: p.incomeMinor,
              b: p.expenseMinor,
            }))}
          />
        )}
      </ChartFrame>
      <View style={styles.totals}>
        <Text variant="label" color="positive">
          {t('reports.income')}: {fmt(totalIncome, currency)}
        </Text>
        <Text variant="label" color="accentText">
          {t('reports.expenses')}: {fmt(totalExpense, currency)}
        </Text>
      </View>
    </ReportCard>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

function CategoryCard({
  shares,
  currency,
  lookups,
  total,
}: {
  shares: ReturnType<typeof categoryBreakdown>;
  currency: CurrencyCode;
  lookups: { categories: Map<string, { name: string; color: string }> };
  total: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fmt = useMoneyFormat();
  if (shares.length === 0) {
    return (
      <ReportCard title={t('reports.categorySpending')}>
        <Text variant="body" color="textSecondary">
          {t('reports.noExpenses')}
        </Text>
      </ReportCard>
    );
  }
  const rows = shares.map((s, i) => {
    const cat = s.categoryId ? lookups.categories.get(s.categoryId) : undefined;
    return {
      key: s.categoryId ?? 'none',
      name: cat?.name ?? t('common.uncategorized'),
      color: cat?.color ?? (s.categoryId ? colors.chart[i % colors.chart.length]! : colors.textMuted),
      amountMinor: s.amountMinor,
      share: s.share,
    };
  });
  const head = rows.slice(0, MAX_SLICES);
  const rest = rows.slice(MAX_SLICES);
  const legend = rest.length
    ? [
        ...head,
        {
          key: 'rest',
          name: t('reports.otherCategories'),
          color: colors.textMuted,
          amountMinor: rest.reduce((s, r) => s + r.amountMinor, 0),
          share: rest.reduce((s, r) => s + r.share, 0),
        },
      ]
    : head;
  return (
    <ReportCard title={t('reports.categorySpending')}>
      <ChartFrame
        summary={t('reports.categorySummary', {
          count: rows.length,
          top: rows[0]!.name,
          percent: Math.round(rows[0]!.share * 100),
        })}
      >
        {(w) => (
          <Donut
            width={w}
            slices={legend.map((r) => ({ value: r.amountMinor, color: r.color }))}
            center={
              <Text variant="label" color="textSecondary" align="center">
                {fmt(total, currency)}
              </Text>
            }
          />
        )}
      </ChartFrame>
      {legend.map((r, i) => (
        <View key={r.key}>
          {i > 0 ? <Divider /> : null}
          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: r.color }]} />
            <Text variant="body" style={styles.flex} numberOfLines={1}>
              {r.name}
            </Text>
            <Text variant="label" color="textSecondary">
              {Math.round(r.share * 100)}%
            </Text>
            <Text variant="amount">{fmt(r.amountMinor, currency)}</Text>
          </View>
        </View>
      ))}
    </ReportCard>
  );
}

function NetTrend({ trend, currency, locale }: { trend: Trend; currency: CurrencyCode; locale: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fmt = useMoneyFormat();
  const last = trend[trend.length - 1];
  return (
    <ReportCard title={t('reports.netTrend')}>
      {trend.length < 2 ? (
        <Text variant="body" color="textSecondary">
          {t('reports.needTwoMonths')}
        </Text>
      ) : (
        <ChartFrame
          minHeight={200}
          summary={t('reports.netTrendSummary', {
            months: trend.length,
            latest: fmt(last?.netMinor ?? 0, currency),
          })}
        >
          {(w) => (
            <TrendLine
              width={w}
              currency={currency}
              color={colors.accent}
              labelEvery={trend.length > 6 ? 2 : 1}
              points={trend.map((p) => ({ label: formatMonth(p.month, locale, 'short'), value: p.netMinor }))}
            />
          )}
        </ChartFrame>
      )}
    </ReportCard>
  );
}

function CashFlowCard({
  flow,
  currency,
  locale,
  month,
}: {
  flow: ReturnType<typeof cashFlow>;
  currency: CurrencyCode;
  locale: string;
  month: MonthKey;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fmt = useMoneyFormat();
  const first = flow[0];
  const last = flow[flow.length - 1];
  return (
    <ReportCard title={t('reports.cashFlow', { month: formatMonth(month, locale) })}>
      {flow.length < 2 || !first || !last ? (
        <Text variant="body" color="textSecondary">
          {t('reports.needTwoDays')}
        </Text>
      ) : (
        <>
          <ChartFrame
            minHeight={200}
            summary={t('reports.cashFlowSummary', {
              start: fmt(first.balanceMinor - first.inMinor + first.outMinor, currency),
              end: fmt(last.balanceMinor, currency),
            })}
          >
            {(w) => (
              <TrendLine
                width={w}
                currency={currency}
                color={colors.positive}
                labelEvery={Math.max(1, Math.ceil(flow.length / 5))}
                points={flow.map((p) => ({ label: String(Number(p.date.slice(8))), value: p.balanceMinor }))}
              />
            )}
          </ChartFrame>
          <Text variant="caption" color="textSecondary">
            {t('reports.cashFlowNote')}
          </Text>
        </>
      )}
    </ReportCard>
  );
}

function BudgetPerformance({
  rows,
  currency,
  locale,
}: {
  rows: BudgetWithUsage[];
  currency: CurrencyCode;
  locale: string;
}) {
  const { t } = useTranslation();
  const fmt = useMoneyFormat();
  return (
    <ReportCard title={t('reports.budgetPerformance')}>
      {rows.length === 0 ? (
        <Text variant="body" color="textSecondary">
          {t('reports.noBudgets')}
        </Text>
      ) : (
        rows.map((r) => (
          <View key={r.budget.id} style={styles.perfRow}>
            <View style={styles.perfHead}>
              <Text variant="bodyStrong" style={styles.flex}>
                {formatMonth(r.budget.month, locale)}
              </Text>
              <Text
                variant="label"
                color={
                  r.usage.status === 'over' ? 'danger' : r.usage.status === 'near' ? 'warningText' : 'textSecondary'
                }
              >
                {r.usage.status === 'over'
                  ? t('reports.statusOver')
                  : r.usage.status === 'near'
                    ? t('reports.statusNear')
                    : t('reports.statusOk')}
              </Text>
            </View>
            <ProgressBar
              ratio={r.usage.ratio}
              status={r.usage.status}
              label={t('budgets.progressLabel', { percent: Math.round(r.usage.ratio * 100) })}
            />
            <Text variant="caption" color="textSecondary">
              {t('reports.spentOfLimit', {
                spent: fmt(r.usage.spentMinor, currency),
                limit: fmt(r.usage.limitMinor, currency),
              })}
            </Text>
          </View>
        ))
      )}
    </ReportCard>
  );
}

function SavingsProgress({
  goals,
  currency,
}: {
  goals: { id: string; name: string; targetMinor: number; progress: { savedMinor: number; ratio: number } }[];
  currency: CurrencyCode;
}) {
  const { t } = useTranslation();
  const fmt = useMoneyFormat();
  return (
    <ReportCard title={t('reports.savingsProgress')}>
      {goals.length === 0 ? (
        <Text variant="body" color="textSecondary">
          {t('reports.noGoals')}
        </Text>
      ) : (
        goals.map((g) => (
          <View key={g.id} style={styles.perfRow}>
            <View style={styles.perfHead}>
              <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                {g.name}
              </Text>
              <Text variant="label" color="textSecondary">
                {Math.round(g.progress.ratio * 100)}%
              </Text>
            </View>
            <ProgressBar
              ratio={g.progress.ratio}
              status="goal"
              label={t('budgets.progressLabel', { percent: Math.round(g.progress.ratio * 100) })}
            />
            <Text variant="caption" color="textSecondary">
              {fmt(g.progress.savedMinor, currency)} / {fmt(g.targetMinor, currency)}
            </Text>
          </View>
        ))
      )}
    </ReportCard>
  );
}

function SummaryTable({ trend, currency, locale }: { trend: Trend; currency: CurrencyCode; locale: string }) {
  const { t } = useTranslation();
  const rows = [...trend].reverse();
  return (
    <ReportCard title={t('reports.monthlySummary')}>
      {rows.map((p, i) => {
        const rate = savingsRate(p);
        return (
          <View key={p.month} accessible accessibilityLabel={`${formatMonth(p.month, locale)}`}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.sumRow}>
              <Text variant="bodyStrong">{formatMonth(p.month, locale)}</Text>
              <View style={styles.sumGrid}>
                <SumCell label={t('reports.income')}>
                  <Money amountMinor={p.incomeMinor} currency={currency} variant="label" color="positive" />
                </SumCell>
                <SumCell label={t('reports.expenses')}>
                  <Money amountMinor={p.expenseMinor} currency={currency} variant="label" />
                </SumCell>
                <SumCell label={t('reports.net')}>
                  <Money
                    amountMinor={p.netMinor}
                    currency={currency}
                    variant="label"
                    color={p.netMinor < 0 ? 'danger' : 'text'}
                  />
                </SumCell>
                <SumCell label={t('reports.savingsRate')}>
                  <Text variant="label">
                    {rate === null ? t('reports.notAvailable') : `${Math.round(rate * 100)}%`}
                  </Text>
                </SumCell>
              </View>
            </View>
          </View>
        );
      })}
    </ReportCard>
  );
}

function SumCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.sumCell}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: space.md },
  exportCard: { gap: space.md },
  legend: { flexDirection: 'row', gap: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40 },
  perfRow: { gap: space.xs },
  perfHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sumRow: { gap: space.xs, paddingVertical: space.sm },
  sumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  sumCell: { flexGrow: 1, flexBasis: 90, gap: 2 },
});
