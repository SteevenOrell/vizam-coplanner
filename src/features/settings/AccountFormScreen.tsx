import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import { createAccount, getAccount, updateAccount } from '../../data/repos/core';
import { ValidationError } from '../../data/tables';
import type { Account, AccountKind } from '../../domain/models';
import type { CurrencyCode } from '../../domain/money/currency';
import { amountToInput, parseAmount } from '../../domain/money/format';
import { usePreferences } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip, ChipRow, SegmentedControl } from '../../ui/Chip';
import { AmountField, FieldShell, TextField, amountErrorKey } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';
import { useSnackbar } from '../../ui/Snackbar';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { currencyLabel, errorMessage } from '../transactions/helpers';
import { SwitchRow } from './SwitchRow';

const KINDS: readonly AccountKind[] = ['checking', 'savings', 'cash', 'credit', 'other'];

export function AccountFormScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : null;
  const state = useDbQuery(async (db) => (id ? getAccount(db, id) : null), [id]);
  const title = id ? t('settings.accountForm.editTitle') : t('settings.accountForm.newTitle');

  return (
    <Screen title={title} back testID="account-form">
      <QueryView state={state}>
        {(account) =>
          id && !account ? (
            <Card>
              <EmptyState icon="search" title={t('settings.accountForm.notFound')} />
            </Card>
          ) : (
            <Form account={account} />
          )
        }
      </QueryView>
    </Screen>
  );
}

function Form({ account }: { account: Account | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefs } = usePreferences();
  const db = useDb();
  const snackbar = useSnackbar();
  const editing = account !== null;

  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking');
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency ?? prefs.primaryCurrency);
  const [opening, setOpening] = useState(
    account && account.openingBalanceMinor !== 0
      ? amountToInput(Math.abs(account.openingBalanceMinor), account.currency)
      : '',
  );
  const [owed, setOwed] = useState((account?.openingBalanceMinor ?? 0) < 0);
  const [archived, setArchived] = useState(account?.archived ?? false);
  const [errors, setErrors] = useState<{ name?: string; opening?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t('errors.name');
    // An empty opening balance means zero (unlike a transaction amount, zero is fine here).
    let openingMinor = 0;
    if (opening.trim()) {
      const parsed = parseAmount(opening, currency);
      if (!parsed.ok) next.opening = t((amountErrorKey(parsed) ?? 'errors.amount') as 'errors.amount');
      else openingMinor = owed ? -parsed.amountMinor : parsed.amountMinor;
    }
    setErrors(next);
    if (next.name || next.opening) return;

    setSaving(true);
    try {
      if (account) {
        await updateAccount(db, account.id, {
          name: name.trim(),
          kind,
          openingBalanceMinor: openingMinor,
          archived,
        });
      } else {
        await createAccount(db, { name: name.trim(), kind, currency, openingBalanceMinor: openingMinor });
      }
      snackbar({ message: account ? t('settings.accountForm.saved') : t('settings.accountForm.created') });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      const message = errorMessage(t, e);
      if (e instanceof ValidationError && e.code === 'name') setErrors({ name: message });
      else setErrors({ form: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TextField
        label={t('settings.accountForm.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('settings.accountForm.namePlaceholder')}
        maxLength={60}
        error={errors.name}
        testID="account-name"
      />

      <FieldShell label={t('settings.accountForm.kind')}>
        <ChipRow>
          {KINDS.map((k) => (
            <Chip key={k} label={t(`common.accountKinds.${k}`)} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </ChipRow>
      </FieldShell>

      <FieldShell
        label={t('settings.accountForm.currency')}
        help={editing ? t('settings.accountForm.currencyLocked') : null}
      >
        {editing ? (
          <View style={styles.locked}>
            <Icon name="lock" size={16} color={colors.textMuted} />
            <Text variant="bodyStrong">{t(`common.currency.${currency}`)}</Text>
          </View>
        ) : (
          <SegmentedControl<CurrencyCode>
            testID="account-currency"
            value={currency}
            options={[
              { value: 'CAD', label: currencyLabel('CAD') },
              { value: 'XOF', label: currencyLabel('XOF') },
            ]}
            onChange={setCurrency}
          />
        )}
      </FieldShell>

      <AmountField
        label={t('settings.accountForm.opening')}
        value={opening}
        onChangeText={setOpening}
        currency={currency}
        error={errors.opening}
        testID="account-opening"
      />
      <SwitchRow
        testID="account-owed"
        label={t('settings.accountForm.owed')}
        help={t('settings.accountForm.owedHelp')}
        value={owed}
        onValueChange={setOwed}
      />
      {editing ? (
        <SwitchRow
          testID="account-archive"
          label={t('settings.accountForm.archive')}
          help={t('settings.accountForm.archiveHelp')}
          value={archived}
          onValueChange={setArchived}
        />
      ) : null}

      {errors.form ? (
        <Text variant="label" color="danger" accessibilityRole="alert">
          {errors.form}
        </Text>
      ) : null}
      <Button label={t('common.actions.save')} onPress={() => void save()} loading={saving} testID="account-save" />
    </>
  );
}

const styles = StyleSheet.create({
  locked: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
});
