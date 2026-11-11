import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDbQuery, useLookups } from '../../data/hooks';
import { listBills } from '../../data/repos/planning';
import { listTransactions } from '../../data/repos/transactions';
import { monthEnd, monthOf, monthStart, type IsoDate, type MonthKey } from '../../domain/dates';
import { CURRENCY_CODES } from '../../domain/money/currency';
import { monthSummary } from '../../domain/reports';
import { obligationTotals } from '../../domain/recurrence';
import { usePreferences, useToday } from '../../state/preferences';
import { Card } from '../../ui/Card';
import { formatDate } from '../../ui/format';
import { CategoryBadge, Divider, ListRow } from '../../ui/ListRow';
import { Money } from '../../ui/Money';
import { MonthGrid } from '../../ui/MonthGrid';
import { Screen, SectionHeader } from '../../ui/Screen';
import { QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { TransactionRow } from '../../ui/finance/TransactionRow';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { monthObligations } from '../bills/obligations';

export function CalendarScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefs, locale } = usePreferences();
  const today = useToday();
  const [month, setMonth] = useState<MonthKey>(() => monthOf(today));
  const [selected, setSelected] = useState<IsoDate>(today);
  const lookups = useLookups();
  const state = useDbQuery(
    async (db) => ({
      txs: await listTransactions(db, { from: monthStart(month), to: monthEnd(month) }),
      bills: await listBills(db, { includeInactive: false }),
    }),
    [month],
  );

  const changeMonth = (m: MonthKey) => {
    setMonth(m);
    setSelected(monthOf(today) === m ? today : monthStart(m));
  };

  return (
    <Screen title={t('calendar.title')} back>
      <QueryView state={lookups}>
        {(lk) => (
          <QueryView state={state}>
            {({ txs, bills }) => {
              const obligations = monthObligations(bills, month, today);
              const marks = new Map<IsoDate, string[]>();
              const mark = (d: IsoDate, color: string) => {
                const list = marks.get(d) ?? [];
                if (!list.includes(color)) list.push(color);
                marks.set(d, list);
              };
              for (const o of obligations) mark(o.dueOn, colors.warning);
              for (const x of txs) mark(x.occurredOn, x.kind === 'income' ? colors.positive : colors.accent);

              const sum = monthSummary(txs, prefs.primaryCurrency, month);
              const billsDue = obligations
                .filter((o) => o.currency === prefs.primaryCurrency)
                .reduce((s, o) => s + o.amountMinor, 0);
              const dayObligations = obligations.filter((o) => o.dueOn === selected);
              const dayTxs = txs.filter((x) => x.occurredOn === selected);
              const totals = obligationTotals(obligations);
              const totalCurrencies = [
                prefs.primaryCurrency,
                ...CURRENCY_CODES.filter((c) => c !== prefs.primaryCurrency),
              ].filter((c) => totals[c] !== undefined);

              return (
                <>
                  <Card>
                    <MonthGrid
                      month={month}
                      selected={selected}
                      today={today}
                      onSelect={setSelected}
                      onMonthChange={changeMonth}
                      marks={marks}
                    />
                    <View style={styles.legend}>
                      <LegendItem color={colors.warning} label={t('calendar.legendBill')} />
                      <LegendItem color={colors.positive} label={t('calendar.legendIncome')} />
                      <LegendItem color={colors.accent} label={t('calendar.legendExpense')} />
                    </View>
                  </Card>

                  <Card>
                    <Text variant="overline" color="textSecondary">
                      {t('calendar.monthSummary', { currency: prefs.primaryCurrency })}
                    </Text>
                    <View style={styles.strip}>
                      <View style={styles.stat}>
                        <Text variant="caption" color="textSecondary">
                          {t('calendar.income')}
                        </Text>
                        <Money amountMinor={sum.incomeMinor} currency={prefs.primaryCurrency} kind="income" />
                      </View>
                      <View style={styles.stat}>
                        <Text variant="caption" color="textSecondary">
                          {t('calendar.expenses')}
                        </Text>
                        <Money amountMinor={sum.expenseMinor} currency={prefs.primaryCurrency} />
                      </View>
                      <View style={styles.stat}>
                        <Text variant="caption" color="textSecondary">
                          {t('calendar.billsDue')}
                        </Text>
                        <Money amountMinor={billsDue} currency={prefs.primaryCurrency} color="warningText" />
                      </View>
                    </View>
                  </Card>

                  <SectionHeader title={formatDate(selected, locale, 'long')} />
                  <Card>
                    {dayObligations.length === 0 && dayTxs.length === 0 ? (
                      <Text variant="body" color="textSecondary">
                        {t('calendar.nothingThisDay')}
                      </Text>
                    ) : null}
                    {dayObligations.map((o, i) => (
                      <View key={`${o.billId}-${o.dueOn}`}>
                        {i > 0 ? <Divider /> : null}
                        <ListRow
                          leading={<CategoryBadge icon="repeat" color={colors.warning} />}
                          title={o.name}
                          subtitle={t('calendar.billDue')}
                          trailing={<Money amountMinor={o.amountMinor} currency={o.currency} />}
                          onPress={() => router.push('/bills')}
                          accessibilityLabel={`${o.name}, ${t('calendar.billDue')}`}
                        />
                      </View>
                    ))}
                    {dayObligations.length > 0 && dayTxs.length > 0 ? <Divider /> : null}
                    {dayTxs.map((x, i) => (
                      <View key={x.id}>
                        {i > 0 ? <Divider /> : null}
                        <TransactionRow tx={x} lookups={lk} today={today} showDate={false} />
                      </View>
                    ))}
                  </Card>

                  <SectionHeader title={t('calendar.forecast')} />
                  <Card>
                    {obligations.length === 0 ? (
                      <Text variant="body" color="textSecondary">
                        {t('calendar.forecastEmpty')}
                      </Text>
                    ) : (
                      <>
                        {obligations.map((o, i) => (
                          <View key={`${o.billId}-${o.dueOn}`}>
                            {i > 0 ? <Divider /> : null}
                            <ListRow
                              leading={<CategoryBadge icon="calendar" color={colors.warning} size={40} />}
                              title={o.name}
                              subtitle={formatDate(o.dueOn, locale, 'medium')}
                              trailing={<Money amountMinor={o.amountMinor} currency={o.currency} />}
                              onPress={() => setSelected(o.dueOn < monthStart(month) ? monthStart(month) : o.dueOn)}
                              accessibilityLabel={`${o.name}, ${formatDate(o.dueOn, locale, 'medium')}`}
                            />
                          </View>
                        ))}
                        <Divider />
                        <View style={styles.totals}>
                          <Text variant="label" color="textSecondary">
                            {t('calendar.forecastTotal')}
                          </Text>
                          {totalCurrencies.map((c) => (
                            <Money key={c} amountMinor={totals[c] ?? 0} currency={c} variant="bodyStrong" />
                          ))}
                          {totalCurrencies.length > 1 ? (
                            <Text variant="caption" color="textMuted">
                              {t('common.currency.noConversion')}
                            </Text>
                          ) : null}
                        </View>
                      </>
                    )}
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

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.sm },
  stat: { flexGrow: 1, flexBasis: 90, gap: 2 },
  totals: { alignItems: 'flex-end', gap: 2, paddingTop: space.sm },
});
