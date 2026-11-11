import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb, useDbQuery, useLookups, type Lookups } from '../../data/hooks';
import { getBill } from '../../data/repos/planning';
import { deleteTransaction, getTransaction, restoreTransaction } from '../../data/repos/transactions';
import type { Transaction } from '../../domain/models';
import { usePreferences } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { formatDate } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { CategoryBadge, Divider } from '../../ui/ListRow';
import { Money } from '../../ui/Money';
import { Screen } from '../../ui/Screen';
import { ConfirmDialog } from '../../ui/Sheet';
import { useSnackbar } from '../../ui/Snackbar';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { errorMessage } from './helpers';

export function TransactionDetailsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const txId = typeof id === 'string' ? id : '';
  const state = useDbQuery(
    async (db) => {
      const tx = await getTransaction(db, txId);
      const bill = tx?.recurringBillId ? await getBill(db, tx.recurringBillId) : null;
      return { tx, billName: bill?.name ?? null };
    },
    [txId],
  );
  const lookups = useLookups();

  return (
    <Screen title={t('transactions.details.title')} back testID="transaction-details">
      <QueryView state={state}>
        {({ tx, billName }) =>
          !tx ? (
            <Card>
              <EmptyState
                icon="search"
                title={t('transactions.details.notFoundTitle')}
                body={t('transactions.details.notFoundBody')}
                action={{
                  label: t('common.actions.back'),
                  onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
                }}
              />
            </Card>
          ) : lookups.status === 'success' ? (
            <Details tx={tx} billName={billName} lookups={lookups.data} />
          ) : null
        }
      </QueryView>
    </Screen>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="label" color="textSecondary" style={styles.rowLabel}>
        {label}
      </Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

function Details({ tx, billName, lookups }: { tx: Transaction; billName: string | null; lookups: Lookups }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const db = useDb();
  const snackbar = useSnackbar();
  const [confirm, setConfirm] = useState(false);
  const category = tx.categoryId ? lookups.categories.get(tx.categoryId) : undefined;
  const account = lookups.accounts.get(tx.accountId);
  const categoryName = category?.name ?? t('common.uncategorized');

  const remove = async () => {
    setConfirm(false);
    try {
      await deleteTransaction(db, tx.id);
    } catch (e) {
      snackbar({ message: errorMessage(t, e) });
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
    snackbar({
      message: t('transactions.details.deleted'),
      actionLabel: t('common.actions.undo'),
      onAction: () => {
        void restoreTransaction(db, tx).then(
          () => snackbar({ message: t('transactions.details.restored') }),
          (e: unknown) => snackbar({ message: errorMessage(t, e) }),
        );
      },
    });
  };

  return (
    <>
      <HeroCard style={styles.hero}>
        <View style={styles.heroKind}>
          <Icon name={tx.kind === 'income' ? 'arrowDown' : 'arrowUp'} size={16} color={colors.heroText} />
          <Text variant="label" color="heroTextSecondary">
            {t(`common.kinds.${tx.kind}`)}
          </Text>
        </View>
        <Money
          amountMinor={tx.amountMinor}
          currency={tx.currency}
          kind={tx.kind}
          color="heroText"
          variant="display"
          lightDecimals
          testID="details-amount"
        />
        <Text variant="heading" color="heroText" numberOfLines={3}>
          {tx.description || categoryName}
        </Text>
      </HeroCard>

      <Card style={styles.card}>
        <DetailRow label={t('transactions.details.category')}>
          <View style={styles.categoryValue}>
            <CategoryBadge icon={category?.icon ?? 'tag'} color={category?.color ?? colors.textMuted} size={32} />
            <Text variant="bodyStrong" style={styles.shrink}>
              {categoryName}
            </Text>
          </View>
        </DetailRow>
        <Divider />
        <DetailRow label={t('transactions.details.account')}>
          <Text variant="bodyStrong">{account?.name ?? '—'}</Text>
        </DetailRow>
        <Divider />
        <DetailRow label={t('transactions.details.date')}>
          <Text variant="bodyStrong">{formatDate(tx.occurredOn, locale, 'long')}</Text>
        </DetailRow>
        {tx.note ? (
          <>
            <Divider />
            <DetailRow label={t('transactions.details.note')}>
              <Text variant="body">{tx.note}</Text>
            </DetailRow>
          </>
        ) : null}
        {billName ? (
          <>
            <Divider />
            <DetailRow label={t('transactions.details.bill')}>
              <View style={styles.categoryValue}>
                <Icon name="repeat" size={18} color={colors.accentText} />
                <Text variant="bodyStrong" style={styles.shrink}>
                  {billName}
                </Text>
              </View>
            </DetailRow>
          </>
        ) : null}
      </Card>

      <View style={styles.actions}>
        <Button
          label={t('common.actions.edit')}
          icon="edit"
          variant="secondary"
          onPress={() => router.push({ pathname: '/transaction/edit/[id]', params: { id: tx.id } })}
          style={styles.action}
        />
        <Button
          label={t('common.actions.delete')}
          icon="trash"
          variant="danger"
          onPress={() => setConfirm(true)}
          testID="tx-delete"
          style={styles.action}
        />
      </View>

      <ConfirmDialog
        visible={confirm}
        title={t('transactions.details.deleteTitle')}
        body={t('transactions.details.deleteBody')}
        confirmLabel={t('common.actions.delete')}
        onConfirm={() => void remove()}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  hero: { gap: space.sm },
  heroKind: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  card: { gap: space.md, borderRadius: radii.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  rowLabel: { width: 84 },
  rowValue: { flex: 1, alignItems: 'flex-end', minWidth: 0 },
  categoryValue: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  action: { flex: 1, minWidth: 130 },
});
