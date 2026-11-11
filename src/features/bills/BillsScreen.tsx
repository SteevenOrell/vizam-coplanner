import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import { listAccounts } from '../../data/repos/core';
import { listBills, markBillPaid, skipBillOccurrence } from '../../data/repos/planning';
import { addDays, diffDays, monthOf, type IsoDate } from '../../domain/dates';
import { sumByCurrency, type CurrencyTotals } from '../../domain/money/aggregate';
import { CURRENCY_CODES } from '../../domain/money/currency';
import type { Account, RecurringBill } from '../../domain/models';
import { monthlyEquivalent, obligationTotals, upcomingObligations } from '../../domain/recurrence';
import { usePreferences, useToday } from '../../state/preferences';
import { Button, IconButton } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { SegmentedControl } from '../../ui/Chip';
import { FieldShell, SelectField } from '../../ui/Field';
import { formatDate } from '../../ui/format';
import { Icon, type IconName } from '../../ui/Icon';
import { CategoryBadge, Divider, ListRow } from '../../ui/ListRow';
import { Money, useMoneyFormat } from '../../ui/Money';
import { MonthGrid } from '../../ui/MonthGrid';
import { Screen, SectionHeader } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { useSnackbar } from '../../ui/Snackbar';
import { EmptyState, QueryView } from '../../ui/states';
import { Text, type TextColor } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { Badge, currencyLabel, errorMessage, DbGate } from '../budgets/parts';

type Filter = 'all' | 'subscriptions';

export function BillsScreen() {
  return (
    <DbGate>
      <BillsScreenContent />
    </DbGate>
  );
}

function BillsScreenContent() {
  const { t } = useTranslation();
  const today = useToday();
  const { prefs } = usePreferences();
  const [filter, setFilter] = useState<Filter>('all');
  const [paying, setPaying] = useState<RecurringBill | null>(null);
  const db = useDb();
  const snack = useSnackbar();
  const state = useDbQuery(async (d) => ({ bills: await listBills(d), accounts: await listAccounts(d) }), []);

  const skip = async (bill: RecurringBill) => {
    try {
      await skipBillOccurrence(db, bill.id, bill.nextDueOn);
      snack({ message: t('bills.skipped') });
    } catch (e) {
      snack({ message: errorMessage(t, e) });
    }
  };

  const ordered = (totals: CurrencyTotals) =>
    [prefs.primaryCurrency, ...CURRENCY_CODES.filter((c) => c !== prefs.primaryCurrency)].filter(
      (c) => totals[c] !== undefined,
    );

  return (
    <Screen
      title={t('bills.title')}
      back
      right={<IconButton icon="plus" tone="soft" label={t('bills.newBill')} onPress={() => router.push('/bill/new')} />}
    >
      <QueryView state={state}>
        {({ bills, accounts }) => {
          const active = bills.filter((b) => b.active);
          const inactive = bills.filter((b) => !b.active);
          const due30 = obligationTotals(upcomingObligations(active, today, addDays(today, 30)));
          const subs = sumByCurrency(
            active
              .filter((b) => b.isSubscription)
              .map((b) => ({
                amountMinor: monthlyEquivalent(b.amountMinor, b.frequency, b.interval),
                currency: b.currency,
              })),
          );
          const shown = (filter === 'subscriptions' ? active.filter((b) => b.isSubscription) : active)
            .slice()
            .sort((a, b) =>
              a.nextDueOn === b.nextDueOn ? a.name.localeCompare(b.name) : a.nextDueOn < b.nextDueOn ? -1 : 1,
            );
          const dueCurrencies = ordered(due30);
          const subCurrencies = ordered(subs);
          return (
            <>
              <HeroCard>
                <Text variant="overline" color="heroTextSecondary">
                  {t('bills.dueNext30')}
                </Text>
                {dueCurrencies.length === 0 ? (
                  <Money
                    amountMinor={0}
                    currency={prefs.primaryCurrency}
                    variant="display"
                    color="heroText"
                    lightDecimals
                  />
                ) : (
                  dueCurrencies.map((c, i) => (
                    <Money
                      key={c}
                      amountMinor={due30[c] ?? 0}
                      currency={c}
                      variant={i === 0 ? 'display' : 'title'}
                      color="heroText"
                      lightDecimals
                      sensitive
                    />
                  ))
                )}
                <View style={styles.heroSubs}>
                  <Text variant="caption" color="heroTextSecondary">
                    {t('bills.subscriptionsMonthly')}
                  </Text>
                  {subCurrencies.length === 0 ? (
                    <Text variant="amount" color="heroText">
                      {t('bills.noSubscriptions')}
                    </Text>
                  ) : (
                    subCurrencies.map((c) => (
                      <Money key={c} amountMinor={subs[c] ?? 0} currency={c} color="heroText" sensitive />
                    ))
                  )}
                </View>
              </HeroCard>

              <SegmentedControl
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('bills.filterAll') },
                  { value: 'subscriptions', label: t('bills.filterSubscriptions') },
                ]}
              />

              {shown.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="repeat"
                    title={filter === 'subscriptions' ? t('bills.emptySubsTitle') : t('bills.emptyTitle')}
                    body={t('bills.emptyBody')}
                    action={{ label: t('bills.newBill'), onPress: () => router.push('/bill/new') }}
                  />
                </Card>
              ) : (
                shown.map((b) => (
                  <BillCard key={b.id} bill={b} today={today} onPay={() => setPaying(b)} onSkip={() => void skip(b)} />
                ))
              )}

              {inactive.length > 0 ? (
                <>
                  <SectionHeader title={t('bills.inactive')} />
                  <Card>
                    {inactive.map((b, i) => (
                      <View key={b.id}>
                        {i > 0 ? <Divider /> : null}
                        <InactiveRow bill={b} />
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}

              {dueCurrencies.length > 1 || subCurrencies.length > 1 ? (
                <Text variant="caption" color="textMuted">
                  {t('common.currency.noConversion')}
                </Text>
              ) : null}

              {paying ? (
                <PaySheet
                  key={paying.id}
                  bill={paying}
                  accounts={accounts}
                  today={today}
                  onClose={() => setPaying(null)}
                  onDone={() => {
                    setPaying(null);
                    snack({ message: t('bills.paid') });
                  }}
                />
              ) : null}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function useFrequency() {
  const { t } = useTranslation();
  return (b: Pick<RecurringBill, 'frequency' | 'interval'>) =>
    t(`common.frequency.${b.frequency}` as 'common.frequency.monthly', { count: b.interval });
}

function BillCard({
  bill,
  today,
  onPay,
  onSkip,
}: {
  bill: RecurringBill;
  today: IsoDate;
  onPay: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const fmt = useMoneyFormat();
  const freq = useFrequency();
  const diff = diffDays(today, bill.nextDueOn);
  let due: { text: string; color: TextColor; icon: IconName };
  if (diff < 0) due = { text: t('bills.overdueBy', { count: -diff }), color: 'danger', icon: 'alert' };
  else if (diff === 0) due = { text: t('bills.dueToday'), color: 'warningText', icon: 'clock' };
  else if (diff <= 3) due = { text: t('common.dates.inDays', { count: diff }), color: 'warningText', icon: 'clock' };
  else
    due = {
      text: t('bills.dueOn', { date: formatDate(bill.nextDueOn, locale, 'medium') }),
      color: 'textSecondary',
      icon: 'calendar',
    };
  const iconColor =
    due.color === 'danger' ? colors.danger : due.color === 'warningText' ? colors.warning : colors.textMuted;

  return (
    <Card style={styles.card} testID={`bill-${bill.id}`}>
      <Pressable
        onPress={() => router.push({ pathname: '/bill/edit/[id]', params: { id: bill.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${bill.name}, ${fmt(bill.amountMinor, bill.currency)}, ${freq(bill)}, ${due.text}`}
        style={styles.cardTop}
      >
        <CategoryBadge icon={bill.isSubscription ? 'repeat' : 'note'} color={colors.accent} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {bill.name}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {freq(bill)}
          </Text>
          <View style={styles.dueRow}>
            <Icon name={due.icon} size={14} color={iconColor} />
            <Text variant="caption" color={due.color} style={styles.flex}>
              {due.text}
            </Text>
          </View>
        </View>
        <View style={styles.amountCol}>
          <Money amountMinor={bill.amountMinor} currency={bill.currency} />
          {bill.isSubscription ? <Badge label={t('bills.subscription')} tone="info" /> : null}
        </View>
      </Pressable>
      <View style={styles.cardActions}>
        <Button label={t('bills.markPaid')} size="sm" onPress={onPay} testID={`pay-${bill.id}`} />
        <Button label={t('bills.skip')} size="sm" variant="ghost" onPress={onSkip} testID={`skip-${bill.id}`} />
      </View>
    </Card>
  );
}

function InactiveRow({ bill }: { bill: RecurringBill }) {
  const { colors } = useTheme();
  const freq = useFrequency();
  return (
    <ListRow
      leading={<CategoryBadge icon="repeat" color={colors.textMuted} />}
      title={bill.name}
      subtitle={freq(bill)}
      trailing={<Money amountMinor={bill.amountMinor} currency={bill.currency} color="textSecondary" />}
      onPress={() => router.push({ pathname: '/bill/edit/[id]', params: { id: bill.id } })}
      accessibilityLabel={bill.name}
    />
  );
}

function PaySheet({
  bill,
  accounts,
  today,
  onClose,
  onDone,
}: {
  bill: RecurringBill;
  accounts: Account[];
  today: IsoDate;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const db = useDb();
  const fmt = useMoneyFormat();
  const matching = accounts.filter((a) => a.currency === bill.currency);
  const [accountId, setAccountId] = useState<string | null>(
    matching.find((a) => a.id === bill.accountId)?.id ?? matching[0]?.id ?? null,
  );
  const [date, setDate] = useState<IsoDate>(today);
  const [picking, setPicking] = useState(false);
  const [month, setMonth] = useState(monthOf(today));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!accountId) return;
    setSaving(true);
    try {
      await markBillPaid(db, bill.id, bill.nextDueOn, date, accountId);
      onDone();
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={t('bills.markPaidTitle', { name: bill.name })}
      footer={
        picking ? undefined : (
          <Button
            label={t('bills.confirmPaid', { amount: fmt(bill.amountMinor, bill.currency) })}
            onPress={() => void submit()}
            loading={saving}
            disabled={!accountId}
            testID="pay-confirm"
          />
        )
      }
    >
      {picking ? (
        <MonthGrid
          month={month}
          selected={date}
          today={today}
          onMonthChange={setMonth}
          onSelect={(d) => {
            setDate(d);
            setPicking(false);
          }}
        />
      ) : (
        <View style={styles.sheetBody}>
          <SelectField
            label={t('bills.paidOn')}
            value={formatDate(date, locale, 'medium')}
            onPress={() => setPicking(true)}
            icon="calendar"
          />
          <FieldShell label={t('bills.account')} error={error}>
            {matching.length === 0 ? (
              <Text variant="body" color="textSecondary">
                {t('bills.noAccount', { currency: currencyLabel(bill.currency) })}
              </Text>
            ) : (
              <View accessibilityRole="radiogroup" style={styles.sheetBody}>
                {matching.map((a) => {
                  const selected = a.id === accountId;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => setAccountId(a.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={a.name}
                      style={[styles.option, { backgroundColor: selected ? colors.accentSoft : colors.surfaceAlt }]}
                    >
                      <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                        {a.name}
                      </Text>
                      {selected ? <Icon name="check" size={20} color={colors.accentText} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </FieldShell>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  heroSubs: { marginTop: space.lg, gap: 2 },
  card: { gap: space.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  amountCol: { alignItems: 'flex-end', gap: space.xs, flexShrink: 0 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
  sheetBody: { gap: space.sm, paddingBottom: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radii.md,
  },
});
