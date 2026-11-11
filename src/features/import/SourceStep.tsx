import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb } from '../../data/hooks';
import { undoImport, type ImportBatch } from '../../data/repos/import';
import { currencyLabel } from '../../domain/money/currency';
import type { Account } from '../../domain/models';
import { usePreferences } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SelectField, TextField } from '../../ui/Field';
import { formatDate } from '../../ui/format';
import { Divider, ListRow } from '../../ui/ListRow';
import { SectionHeader } from '../../ui/Screen';
import { ConfirmDialog, SelectSheet } from '../../ui/Sheet';
import { useSnackbar } from '../../ui/Snackbar';
import { EmptyState } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { importErrorMessage, Notice } from './parts';
import { pickBankFile } from './file';

export function SourceStep({
  accounts,
  accountId,
  onAccount,
  batches,
  error,
  onText,
  onError,
}: {
  accounts: Account[];
  accountId: string;
  onAccount: (id: string) => void;
  batches: ImportBatch[];
  error: string | null;
  onText: (text: string, name: string) => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const { locale } = usePreferences();
  const db = useDb();
  const snackbar = useSnackbar();
  const [sheet, setSheet] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [reading, setReading] = useState(false);
  const [undoing, setUndoing] = useState<ImportBatch | null>(null);

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '';

  if (!account) {
    return (
      <Card>
        <EmptyState
          icon="wallet"
          title={t('import.source.noAccountsTitle')}
          body={t('import.source.noAccountsBody')}
          action={{ label: t('import.source.addAccount'), onPress: () => router.push('/account/new') }}
        />
      </Card>
    );
  }

  const chooseFile = async () => {
    onError(null);
    try {
      const picked = await pickBankFile();
      if (!picked) return;
      setReading(true);
      onText(picked.text, picked.name);
    } catch (e) {
      onError(importErrorMessage(t, e));
    } finally {
      setReading(false);
    }
  };

  const undo = async () => {
    const batch = undoing;
    setUndoing(null);
    if (!batch) return;
    try {
      const n = await undoImport(db, batch.id);
      snackbar({ message: t('import.undone', { count: n }) });
    } catch (e) {
      onError(importErrorMessage(t, e));
    }
  };

  return (
    <>
      <SelectField
        testID="import-account"
        label={t('import.source.account')}
        value={`${account.name} · ${currencyLabel(account.currency)}`}
        onPress={() => setSheet(true)}
        icon="wallet"
      />
      <Text variant="caption" color="textSecondary" testID="import-currency-note">
        {t('import.source.currencyNote', { currency: currencyLabel(account.currency) })}
      </Text>

      {error ? <Notice tone="danger" title={error} testID="import-error" /> : null}

      <View style={styles.actions}>
        <Button
          label={t('import.source.chooseFile')}
          icon="download"
          onPress={() => void chooseFile()}
          loading={reading}
          testID="import-choose-file"
        />
        <Button
          label={t('import.source.pasteRows')}
          variant="secondary"
          icon="edit"
          onPress={() => setPasting((p) => !p)}
          testID="import-paste-toggle"
        />
      </View>

      {pasting ? (
        <Card>
          <View style={styles.paste}>
            <TextField
              label={t('import.source.pasteLabel')}
              help={t('import.source.pasteHelp')}
              value={pasted}
              onChangeText={setPasted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('import.source.pastePlaceholder')}
              testID="import-paste-input"
            />
            <Button
              label={t('import.source.pasteContinue')}
              disabled={pasted.trim() === ''}
              onPress={() => {
                onError(null);
                onText(pasted, t('import.source.pastedName'));
              }}
              testID="import-paste-continue"
            />
          </View>
        </Card>
      ) : null}

      <Card tone="accentSoft">
        <View style={styles.help}>
          <Text variant="bodyStrong">{t('import.source.helpTitle')}</Text>
          <Text variant="body" color="textSecondary">
            {t('import.source.helpBody')}
          </Text>
          <Text variant="caption" color="textSecondary">
            {t('import.source.privacy')}
          </Text>
        </View>
      </Card>

      <SectionHeader title={t('import.source.recentTitle')} />
      {batches.length === 0 ? (
        <Text variant="body" color="textSecondary" testID="import-recent-empty">
          {t('import.source.recentEmpty')}
        </Text>
      ) : (
        <Card padded={false}>
          {batches.map((b, i) => (
            <View key={b.id}>
              {i > 0 ? <Divider inset={space.lg} /> : null}
              <ListRow
                title={b.sourceName || t('import.source.pastedName')}
                subtitle={`${t('import.source.recentRow', { count: b.rowCount })} · ${accountName(b.accountId)} · ${formatDate(b.createdAt.slice(0, 10), locale, 'medium')}`}
                trailing={
                  <Button
                    label={t('common.actions.undo')}
                    variant="ghost"
                    size="sm"
                    onPress={() => setUndoing(b)}
                    testID={`import-undo-${b.id}`}
                  />
                }
              />
            </View>
          ))}
        </Card>
      )}

      <SelectSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={t('import.source.pickAccount')}
        value={account.id}
        options={accounts.map((a) => ({
          value: a.id,
          label: a.name,
          subtitle: `${t(`common.accountKinds.${a.kind}`)} · ${currencyLabel(a.currency)}`,
          icon: 'wallet',
        }))}
        onSelect={onAccount}
      />
      <ConfirmDialog
        visible={undoing !== null}
        title={t('import.undoTitle')}
        body={t('import.undoBody', { count: undoing?.rowCount ?? 0 })}
        confirmLabel={t('import.undoConfirm')}
        onConfirm={() => void undo()}
        onCancel={() => setUndoing(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.sm },
  paste: { gap: space.md },
  help: { gap: space.sm },
});
