import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import { listCategories } from '../../data/repos/core';
import { deleteBudget, getBudget, saveBudget, type BudgetWithUsage } from '../../data/repos/planning';
import { monthOf, type MonthKey } from '../../domain/dates';
import type { Category } from '../../domain/models';
import { isCurrencyCode, type CurrencyCode } from '../../domain/money/currency';
import { amountToInput, parseAmount } from '../../domain/money/format';
import { usePreferences, useToday } from '../../state/preferences';
import { Button, IconButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { TextField } from '../../ui/Field';
import { formatMonth } from '../../ui/format';
import { isIconName } from '../../ui/Icon';
import { useMoneyFormat } from '../../ui/Money';
import { Screen } from '../../ui/Screen';
import { ConfirmDialog } from '../../ui/Sheet';
import { useSnackbar } from '../../ui/Snackbar';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { currencyLabel, errorMessage, QueryScreen } from './parts';

export function BudgetEditorScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ month?: string; currency?: string }>();
  const today = useToday();
  const { prefs, locale } = usePreferences();
  const month: MonthKey = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : monthOf(today);
  const currency: CurrencyCode = isCurrencyCode(params.currency) ? params.currency : prefs.primaryCurrency;
  const state = useDbQuery(
    async (db) => ({ categories: await listCategories(db, 'expense'), existing: await getBudget(db, month, currency) }),
    [month, currency],
  );
  return (
    <QueryScreen state={state} title={t('budgets.editor.title')}>
      {({ categories, existing }) => (
        <Editor categories={categories} existing={existing} month={month} currency={currency} locale={locale} />
      )}
    </QueryScreen>
  );
}

function Editor({
  categories,
  existing,
  month,
  currency,
  locale,
}: {
  categories: Category[];
  existing: BudgetWithUsage | null;
  month: MonthKey;
  currency: CurrencyCode;
  locale: string;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const fmt = useMoneyFormat();
  const snack = useSnackbar();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const a of existing?.allocations ?? []) out[a.categoryId] = amountToInput(a.limitMinor, currency);
    return out;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Empty (or zero) means "not budgeted"; anything else must be a valid amount.
  const parsed = categories.map((c) => {
    const text = (values[c.id] ?? '').trim();
    if (!text) return { id: c.id, minor: null as number | null, error: null as string | null };
    const r = parseAmount(text, currency);
    if (!r.ok) {
      const key = {
        empty: 'errors.amount',
        invalid: 'errors.amountInvalid',
        precision: 'errors.amountPrecision',
        range: 'errors.amountRange',
      }[r.error];
      return { id: c.id, minor: null, error: t(key as 'errors.amount') };
    }
    return { id: c.id, minor: r.amountMinor > 0 ? r.amountMinor : null, error: null };
  });
  const total = parsed.reduce((s, p) => s + (p.minor ?? 0), 0);

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    for (const p of parsed) if (p.error) nextErrors[p.id] = p.error;
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;
    const allocations = parsed.filter((p) => p.minor !== null).map((p) => ({ categoryId: p.id, limitMinor: p.minor! }));
    if (allocations.length === 0) {
      setFormError(t('budgets.editor.needOne'));
      return;
    }
    setSaving(true);
    try {
      await saveBudget(db, month, currency, allocations);
      snack({ message: t('budgets.editor.saved') });
      router.back();
    } catch (e) {
      setFormError(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setConfirmDelete(false);
    try {
      await deleteBudget(db, existing.budget.id);
      snack({ message: t('budgets.editor.deleted') });
      router.back();
    } catch (e) {
      setFormError(errorMessage(t, e));
    }
  };

  return (
    <Screen
      title={t('budgets.editor.title')}
      back
      right={
        existing ? (
          <IconButton
            icon="trash"
            tone="soft"
            label={t('budgets.editor.delete')}
            onPress={() => setConfirmDelete(true)}
            testID="budget-delete"
          />
        ) : null
      }
      footer={
        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text variant="label" color="textSecondary">
              {t('budgets.editor.total')}
            </Text>
            <Text variant="heading" testID="budget-total">
              {fmt(total, currency)}
            </Text>
          </View>
          <Button label={t('common.actions.save')} onPress={() => void save()} loading={saving} testID="budget-save" />
        </View>
      }
    >
      <Text variant="label" color="textSecondary">
        {formatMonth(month, locale)} · {currencyLabel(currency)}
      </Text>
      <Text variant="body" color="textSecondary">
        {t('budgets.editor.help')}
      </Text>
      <Card style={styles.rows}>
        {categories.map((c) => (
          <TextField
            key={c.id}
            testID={`limit-${c.id}`}
            label={c.name}
            icon={isIconName(c.icon) ? c.icon : 'tag'}
            value={values[c.id] ?? ''}
            onChangeText={(s) => setValues((v) => ({ ...v, [c.id]: s.replace(/[^0-9.,\s]/g, '') }))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder={currency === 'XOF' ? '0' : '0.00'}
            error={errors[c.id]}
          />
        ))}
      </Card>
      {formError ? (
        <Text variant="label" color="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      <ConfirmDialog
        visible={confirmDelete}
        title={t('budgets.editor.deleteTitle')}
        body={t('budgets.editor.deleteBody')}
        confirmLabel={t('common.actions.delete')}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { gap: space.md },
  footer: { gap: space.sm },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
