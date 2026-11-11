import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import { listAccounts, listCategories } from '../../data/repos/core';
import { createTransaction, getTransaction, updateTransaction } from '../../data/repos/transactions';
import { ValidationError } from '../../data/tables';
import { addDays, type IsoDate } from '../../domain/dates';
import { amountToInput, parseAmount } from '../../domain/money/format';
import type { Account, Category, Transaction, TxKind } from '../../domain/models';
import { usePreferences, useToday } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip, SegmentedControl } from '../../ui/Chip';
import { AmountField, SelectField, TextField, amountErrorKey } from '../../ui/Field';
import { formatDate } from '../../ui/format';
import { Screen } from '../../ui/Screen';
import { SelectSheet } from '../../ui/Sheet';
import { DatePickerSheet } from '../../ui/MonthGrid';
import { useSnackbar } from '../../ui/Snackbar';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { currencyLabel, errorMessage } from './helpers';

const NONE = '__none__';

interface FormData {
  accounts: Account[];
  categories: Category[];
  tx: Transaction | null;
}

type FieldName = 'amount' | 'account' | 'category' | 'date' | 'description' | 'note';
type FieldErrors = Partial<Record<FieldName | 'form', string>>;

function fieldFor(code: string): FieldName | 'form' {
  if (code.startsWith('amount') || code === 'zero') return 'amount';
  if (code === 'account' || code === 'accountCurrency') return 'account';
  if (code === 'category' || code === 'date' || code === 'description' || code === 'note') return code;
  return 'form';
}

export function TransactionFormScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : null;
  const initialKind: TxKind = params.kind === 'income' ? 'income' : 'expense';
  const state = useDbQuery(
    async (db): Promise<FormData> => {
      const [accounts, categories, tx] = await Promise.all([
        listAccounts(db, { includeArchived: id !== null }),
        listCategories(db),
        id ? getTransaction(db, id) : Promise.resolve(null),
      ]);
      return { accounts, categories, tx };
    },
    [id],
  );

  const title = id ? t('transactions.form.editTitle') : t('transactions.form.newTitle');

  if (state.status !== 'success') {
    return (
      <Screen title={title} back testID="transaction-form">
        <QueryView state={state}>{() => null}</QueryView>
      </Screen>
    );
  }
  const data = state.data;
  if (id && !data.tx) {
    return (
      <Screen title={title} back testID="transaction-form">
        <Card>
          <EmptyState
            icon="search"
            title={t('transactions.details.notFoundTitle')}
            body={t('transactions.details.notFoundBody')}
          />
        </Card>
      </Screen>
    );
  }
  if (data.accounts.length === 0) {
    return (
      <Screen title={title} back testID="transaction-form">
        <Card>
          <EmptyState
            icon="wallet"
            title={t('transactions.form.noAccountsTitle')}
            body={t('transactions.form.noAccountsBody')}
            action={{ label: t('transactions.form.addAccount'), onPress: () => router.push('/account/new') }}
          />
        </Card>
      </Screen>
    );
  }
  return <Form title={title} data={data} initialKind={initialKind} />;
}

function Form({ title, data, initialKind }: { title: string; data: FormData; initialKind: TxKind }) {
  const { t } = useTranslation();
  const db = useDb();
  const today = useToday();
  const { prefs, locale } = usePreferences();
  const snackbar = useSnackbar();
  const { tx, accounts, categories } = data;

  const [kind, setKind] = useState<TxKind>(tx?.kind ?? initialKind);
  const [accountId, setAccountId] = useState<string>(
    tx?.accountId ?? (accounts.find((a) => a.currency === prefs.primaryCurrency) ?? accounts[0])?.id ?? '',
  );
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const currency = account?.currency ?? prefs.primaryCurrency;
  const [amountText, setAmountText] = useState(tx ? amountToInput(tx.amountMinor, tx.currency) : '');
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? null);
  const [date, setDate] = useState<IsoDate>(tx?.occurredOn ?? today);
  const [description, setDescription] = useState(tx?.description ?? '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<'account' | 'category' | 'date' | null>(null);

  const kindCategories = categories.filter((c) => c.kind === kind);
  const category = categoryId ? kindCategories.find((c) => c.id === categoryId) : undefined;

  const changeKind = (next: TxKind) => {
    setKind(next);
    // A category belongs to one kind: drop a selection that no longer matches.
    const current = categories.find((c) => c.id === categoryId);
    if (current && current.kind !== next) setCategoryId(null);
  };

  const save = async () => {
    const next: FieldErrors = {};
    if (!account) next.account = t('errors.account');
    const parsed = parseAmount(amountText, currency);
    const amountKey = amountErrorKey(parsed);
    if (amountKey) next.amount = t(amountKey as 'errors.amount');
    setErrors(next);
    if (next.account || next.amount || !parsed.ok || !account) return;

    setSaving(true);
    const input = {
      accountId: account.id,
      categoryId,
      kind,
      amountMinor: parsed.amountMinor,
      occurredOn: date,
      description: description.trim(),
      note: note.trim(),
    };
    try {
      if (tx) await updateTransaction(db, tx.id, input);
      else await createTransaction(db, input);
      snackbar({ message: tx ? t('transactions.form.updated') : t('transactions.form.saved') });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      const message = errorMessage(t, e);
      const field = e instanceof ValidationError ? fieldFor(e.code) : 'form';
      setErrors({ [field]: message });
    } finally {
      setSaving(false);
    }
  };

  const dateChips = [
    { key: 'today', label: t('common.dates.today'), value: today },
    { key: 'yesterday', label: t('common.dates.yesterday'), value: addDays(today, -1) },
  ];

  return (
    <Screen
      title={title}
      back
      testID="transaction-form"
      footer={
        <View style={styles.footer}>
          {errors.form ? (
            <Text variant="label" color="danger" accessibilityRole="alert">
              {errors.form}
            </Text>
          ) : null}
          <Button label={t('common.actions.save')} onPress={() => void save()} loading={saving} testID="tx-save" />
        </View>
      }
    >
      <SegmentedControl
        testID="tx-kind"
        value={kind}
        options={[
          { value: 'expense', label: t('common.kinds.expense') },
          { value: 'income', label: t('common.kinds.income') },
        ]}
        onChange={changeKind}
      />

      <AmountField
        label={t('transactions.form.amount')}
        value={amountText}
        onChangeText={setAmountText}
        currency={currency}
        onCurrencyPress={() => setSheet('account')}
        error={errors.amount}
        testID="tx-amount"
        autoFocus={!tx}
      />

      <SelectField
        testID="tx-category"
        label={t('transactions.form.category')}
        value={category?.name ?? t('common.uncategorized')}
        onPress={() => setSheet('category')}
        icon="tag"
        error={errors.category}
      />
      <SelectField
        testID="tx-account"
        label={t('transactions.form.account')}
        value={account ? `${account.name} · ${currencyLabel(account.currency)}` : null}
        placeholder={t('transactions.form.pickAccount')}
        onPress={() => setSheet('account')}
        icon="wallet"
        error={errors.account}
      />
      <SelectField
        testID="tx-date"
        label={t('transactions.form.date')}
        value={formatDate(date, locale, 'long')}
        onPress={() => setSheet('date')}
        icon="calendar"
        error={errors.date}
      />
      <View style={styles.chips}>
        {dateChips.map((c) => (
          <Chip key={c.key} label={c.label} selected={date === c.value} onPress={() => setDate(c.value)} />
        ))}
      </View>

      <TextField
        label={t('transactions.form.description')}
        value={description}
        onChangeText={setDescription}
        placeholder={t('transactions.form.descriptionHint')}
        maxLength={120}
        error={errors.description}
        testID="tx-description"
      />
      <TextField
        label={t('transactions.form.note')}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={1000}
        error={errors.note}
        testID="tx-note"
      />

      <SelectSheet
        visible={sheet === 'account'}
        onClose={() => setSheet(null)}
        title={t('transactions.form.pickAccount')}
        value={account?.id ?? null}
        options={accounts.map((a) => ({
          value: a.id,
          label: a.name,
          subtitle: `${t(`common.accountKinds.${a.kind}`)} · ${currencyLabel(a.currency)}`,
          icon: 'wallet',
        }))}
        onSelect={setAccountId}
      />
      <SelectSheet
        visible={sheet === 'category'}
        onClose={() => setSheet(null)}
        title={t('transactions.form.pickCategory')}
        value={categoryId ?? NONE}
        options={[
          { value: NONE, label: t('common.uncategorized'), icon: 'tag' },
          ...kindCategories.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color })),
        ]}
        onSelect={(v) => setCategoryId(v === NONE ? null : v)}
      />
      <DatePickerSheet
        visible={sheet === 'date'}
        onClose={() => setSheet(null)}
        title={t('transactions.form.pickDate')}
        value={date}
        today={today}
        onChange={setDate}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  footer: { gap: space.sm },
});
