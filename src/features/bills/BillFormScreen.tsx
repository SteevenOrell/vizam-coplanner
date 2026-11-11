import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import { listAccounts, listCategories } from '../../data/repos/core';
import { createBill, deleteBill, getBill, updateBill } from '../../data/repos/planning';
import type { IsoDate } from '../../domain/dates';
import type { Account, BillFrequency, Category, RecurringBill } from '../../domain/models';
import type { CurrencyCode } from '../../domain/money/currency';
import { amountToInput, parseAmount } from '../../domain/money/format';
import { usePreferences, useToday } from '../../state/preferences';
import { Button, IconButton } from '../../ui/Button';
import { CurrencySelect } from '../../ui/CurrencySelect';
import { Chip, ChipRow, SegmentedControl } from '../../ui/Chip';
import { AmountField, amountErrorKey, FieldShell, SelectField, TextField } from '../../ui/Field';
import { formatDate } from '../../ui/format';
import { DatePickerSheet } from '../../ui/MonthGrid';
import { Screen } from '../../ui/Screen';
import { ConfirmDialog, SelectSheet } from '../../ui/Sheet';
import { useSnackbar } from '../../ui/Snackbar';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { currencyLabel, errorMessage, QueryScreen } from '../budgets/parts';

const REMIND_CHOICES = [0, 1, 2, 3, 7, 14] as const;
const FREQUENCIES: readonly BillFrequency[] = ['weekly', 'monthly', 'yearly'];

/** Creates a recurring bill (`/bill/new`) or edits one (`/bill/edit/[id]`). */
export function BillFormScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const state = useDbQuery(
    async (db) => ({
      bill: id ? await getBill(db, id) : null,
      accounts: await listAccounts(db),
      categories: await listCategories(db, 'expense'),
    }),
    [id],
  );
  return (
    <QueryScreen state={state} title={id ? t('bills.form.editTitle') : t('bills.form.newTitle')}>
      {({ bill, accounts, categories }) => (
        <BillForm bill={bill} missing={!!id && !bill} accounts={accounts} categories={categories} />
      )}
    </QueryScreen>
  );
}

function BillForm({
  bill,
  missing,
  accounts,
  categories,
}: {
  bill: RecurringBill | null;
  missing: boolean;
  accounts: Account[];
  categories: Category[];
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefs, locale } = usePreferences();
  const today = useToday();
  const db = useDb();
  const snack = useSnackbar();
  const [name, setName] = useState(bill?.name ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(bill?.currency ?? prefs.primaryCurrency);
  const [amount, setAmount] = useState(bill ? amountToInput(bill.amountMinor, bill.currency) : '');
  const [accountId, setAccountId] = useState<string>(bill?.accountId ?? '');
  const [categoryId, setCategoryId] = useState<string>(bill?.categoryId ?? '');
  const [frequency, setFrequency] = useState<BillFrequency>(bill?.frequency ?? 'monthly');
  const [interval, setIntervalValue] = useState(bill?.interval ?? 1);
  const [anchorDate, setAnchorDate] = useState<IsoDate>(bill?.anchorDate ?? today);
  const [endOn, setEndOn] = useState<IsoDate | null>(bill?.endOn ?? null);
  const [remind, setRemind] = useState(bill?.remindDaysBefore ?? prefs.billReminderDays);
  const [isSubscription, setIsSubscription] = useState(bill?.isSubscription ?? false);
  const [active, setActive] = useState(bill?.active ?? true);
  const [picker, setPicker] = useState<'start' | 'end' | 'account' | 'category' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; amount?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  if (missing) {
    return (
      <Screen title={t('bills.form.editTitle')} back>
        <Text variant="body" color="danger">
          {t('errors.notFound')}
        </Text>
      </Screen>
    );
  }

  const accountsHere = accounts.filter((a) => a.currency === currency);
  const account = accountsHere.find((a) => a.id === accountId);
  const category = categories.find((c) => c.id === categoryId);

  const changeCurrency = (c: CurrencyCode) => {
    setCurrency(c);
    if (accounts.find((a) => a.id === accountId)?.currency !== c) setAccountId('');
  };

  const save = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t('errors.name');
    const parsed = parseAmount(amount, currency);
    const key = amountErrorKey(parsed);
    if (key || !parsed.ok) next.amount = t((key ?? 'errors.amount') as 'errors.amount');
    setErrors(next);
    if (next.name || next.amount || !parsed.ok) return;
    setSaving(true);
    try {
      const input = {
        name,
        amountMinor: parsed.amountMinor,
        currency,
        accountId: account ? account.id : null,
        categoryId: category ? category.id : null,
        frequency,
        interval,
        anchorDate,
        endOn,
        remindDaysBefore: remind,
        isSubscription,
      };
      if (bill) await updateBill(db, bill.id, { ...input, active });
      else await createBill(db, input);
      snack({ message: t('bills.form.saved') });
      router.back();
    } catch (e) {
      setErrors({ form: errorMessage(t, e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    if (!bill) return;
    try {
      await deleteBill(db, bill.id);
      snack({ message: t('bills.form.deleted') });
      router.back();
    } catch (e) {
      setErrors({ form: errorMessage(t, e) });
    }
  };

  return (
    <Screen
      title={bill ? t('bills.form.editTitle') : t('bills.form.newTitle')}
      back
      footer={
        <View style={styles.footer}>
          {errors.form ? (
            <Text variant="label" color="danger" accessibilityLiveRegion="polite">
              {errors.form}
            </Text>
          ) : null}
          <Button label={t('common.actions.save')} onPress={() => void save()} loading={saving} testID="bill-save" />
        </View>
      }
    >
      <TextField
        testID="bill-name"
        label={t('bills.form.name')}
        value={name}
        onChangeText={setName}
        maxLength={60}
        placeholder={t('bills.form.namePlaceholder')}
        error={errors.name}
      />
      <AmountField
        testID="bill-amount"
        label={t('bills.form.amount')}
        value={amount}
        onChangeText={setAmount}
        currency={currency}
        error={errors.amount}
      />
      <FieldShell label={t('bills.form.currency')}>
        <CurrencySelect testID="bill-currency" value={currency} onChange={changeCurrency} />
      </FieldShell>
      <SelectField
        label={t('bills.form.account')}
        value={account?.name ?? null}
        placeholder={t('bills.form.none')}
        icon="wallet"
        onPress={() => setPicker('account')}
      />
      <SelectField
        label={t('bills.form.category')}
        value={category?.name ?? null}
        placeholder={t('bills.form.none')}
        icon="tag"
        onPress={() => setPicker('category')}
      />

      <FieldShell label={t('bills.form.frequency')}>
        <SegmentedControl
          value={frequency}
          onChange={setFrequency}
          options={FREQUENCIES.map((f) => ({
            value: f,
            label: t(`bills.form.freq.${f}` as 'bills.form.freq.monthly'),
          }))}
        />
      </FieldShell>
      <FieldShell label={t('bills.form.repeatEvery')}>
        <View style={styles.stepper}>
          <IconButton
            icon="minus"
            tone="soft"
            label={t('bills.form.fewer')}
            onPress={() => setIntervalValue((n) => Math.max(1, n - 1))}
            testID="interval-minus"
          />
          <Text variant="bodyStrong" align="center" style={styles.flex} accessibilityLiveRegion="polite">
            {t(`common.frequency.${frequency}` as 'common.frequency.monthly', { count: interval })}
          </Text>
          <IconButton
            icon="plus"
            tone="soft"
            label={t('bills.form.more')}
            onPress={() => setIntervalValue((n) => Math.min(12, n + 1))}
            testID="interval-plus"
          />
        </View>
      </FieldShell>

      <SelectField
        label={t('bills.form.firstDue')}
        value={formatDate(anchorDate, locale, 'medium')}
        icon="calendar"
        onPress={() => setPicker('start')}
        testID="bill-first-due"
      />
      <SelectField
        label={t('bills.form.endDate')}
        value={endOn ? formatDate(endOn, locale, 'medium') : null}
        placeholder={t('bills.form.noEnd')}
        icon="calendar"
        onPress={() => setPicker('end')}
      />
      {endOn ? (
        <Button label={t('bills.form.clearEnd')} variant="ghost" size="sm" onPress={() => setEndOn(null)} />
      ) : null}

      <FieldShell label={t('bills.form.remind')}>
        <ChipRow>
          {REMIND_CHOICES.map((d) => (
            <Chip
              key={d}
              label={d === 0 ? t('bills.form.remindSameDay') : t('bills.form.remindDays', { count: d })}
              selected={remind === d}
              onPress={() => setRemind(d)}
            />
          ))}
        </ChipRow>
      </FieldShell>

      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{t('bills.form.subscription')}</Text>
          <Text variant="caption" color="textSecondary">
            {t('bills.form.subscriptionHelp')}
          </Text>
        </View>
        <Switch
          value={isSubscription}
          onValueChange={setIsSubscription}
          accessibilityLabel={t('bills.form.subscription')}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>
      {bill ? (
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{t('bills.form.active')}</Text>
            <Text variant="caption" color="textSecondary">
              {t('bills.form.activeHelp')}
            </Text>
          </View>
          <Switch
            value={active}
            onValueChange={setActive}
            accessibilityLabel={t('bills.form.active')}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      ) : null}

      {bill ? (
        <Button
          label={t('bills.form.delete')}
          icon="trash"
          variant="danger"
          onPress={() => setConfirmDelete(true)}
          testID="bill-delete"
        />
      ) : null}

      <DatePickerSheet
        visible={picker === 'start'}
        onClose={() => setPicker(null)}
        title={t('bills.form.firstDue')}
        value={anchorDate}
        today={today}
        onChange={setAnchorDate}
      />
      <DatePickerSheet
        visible={picker === 'end'}
        onClose={() => setPicker(null)}
        title={t('bills.form.endDate')}
        value={endOn ?? anchorDate}
        today={today}
        onChange={setEndOn}
      />
      <SelectSheet
        visible={picker === 'account'}
        onClose={() => setPicker(null)}
        title={t('bills.form.account')}
        value={accountId}
        onSelect={setAccountId}
        emptyLabel={t('bills.noAccount', { currency: currencyLabel(currency) })}
        options={[
          { value: '', label: t('bills.form.none') },
          ...accountsHere.map((a) => ({
            value: a.id,
            label: a.name,
            subtitle: currencyLabel(a.currency),
            icon: 'wallet',
            color: colors.accent,
          })),
        ]}
      />
      <SelectSheet
        visible={picker === 'category'}
        onClose={() => setPicker(null)}
        title={t('bills.form.category')}
        value={categoryId}
        onSelect={setCategoryId}
        options={[
          { value: '', label: t('bills.form.none') },
          ...categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color })),
        ]}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title={t('bills.form.deleteTitle')}
        body={t('bills.form.deleteBody')}
        confirmLabel={t('common.actions.delete')}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  footer: { gap: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
});
