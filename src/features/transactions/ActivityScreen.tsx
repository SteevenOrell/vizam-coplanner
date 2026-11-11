import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionList, StyleSheet, View } from 'react-native';

import { useDbQuery, useLookups } from '../../data/hooks';
import { listCategories } from '../../data/repos/core';
import { listTransactions, usedCurrencies } from '../../data/repos/transactions';
import { diffDays, monthEnd, monthOf, monthStart, type IsoDate, type MonthKey } from '../../domain/dates';
import { sumByCurrency, type CurrencyTotals } from '../../domain/money/aggregate';
import { CURRENCY_CODES, type CurrencyCode } from '../../domain/money/currency';
import type { Transaction, TxKind } from '../../domain/models';
import { usePreferences, useToday } from '../../state/preferences';
import { IconButton } from '../../ui/Button';
import { Chip, ChipRow } from '../../ui/Chip';
import { TextField } from '../../ui/Field';
import { formatDate, relativeDay } from '../../ui/format';
import { TransactionRow } from '../../ui/finance/TransactionRow';
import { Divider } from '../../ui/ListRow';
import { Money } from '../../ui/Money';
import { Screen } from '../../ui/Screen';
import { SelectSheet } from '../../ui/Sheet';
import { EmptyState, ErrorState, Skeleton } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { currencyLabel } from './helpers';
import { MonthSwitcher } from './MonthSwitcher';

type KindFilter = 'all' | TxKind;
const ALL = '__all__';

interface DaySection {
  date: IsoDate;
  data: Transaction[];
  net: CurrencyTotals;
}

function groupByDay(rows: readonly Transaction[]): DaySection[] {
  const sections: DaySection[] = [];
  for (const tx of rows) {
    let last = sections[sections.length - 1];
    if (!last || last.date !== tx.occurredOn) {
      last = { date: tx.occurredOn, data: [], net: {} };
      sections.push(last);
    }
    last.data.push(tx);
  }
  for (const s of sections) {
    s.net = sumByCurrency(
      s.data.map((tx) => ({
        amountMinor: tx.kind === 'expense' ? -tx.amountMinor : tx.amountMinor,
        currency: tx.currency,
      })),
    );
  }
  return sections;
}

export function ActivityScreen() {
  const { t } = useTranslation();
  const today = useToday();
  const { prefs, locale } = usePreferences();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [currency, setCurrency] = useState<CurrencyCode | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [month, setMonth] = useState<MonthKey | null>(null);
  const [pickCategory, setPickCategory] = useState(false);

  const q = search.trim();
  const rows = useDbQuery(
    (db) =>
      listTransactions(db, {
        kind: kind === 'all' ? undefined : kind,
        currency: currency ?? undefined,
        categoryId: categoryId ?? undefined,
        search: q || undefined,
        from: month ? monthStart(month) : undefined,
        to: month ? monthEnd(month) : undefined,
      }),
    [kind, currency, categoryId, q, month],
    { keepPrevious: true },
  );
  const currencies = useDbQuery((db) => usedCurrencies(db, prefs.primaryCurrency), [prefs.primaryCurrency]);
  const categories = useDbQuery((db) => listCategories(db), []);
  const lookups = useLookups();

  const sections = useMemo(() => (rows.status === 'success' ? groupByDay(rows.data) : []), [rows]);
  const filtered = kind !== 'all' || currency !== null || categoryId !== null || q !== '' || month !== null;
  const clear = () => {
    setSearch('');
    setKind('all');
    setCurrency(null);
    setCategoryId(null);
    setMonth(null);
  };

  const categoryName =
    categoryId && categories.status === 'success'
      ? (categories.data.find((c) => c.id === categoryId)?.name ?? t('transactions.activity.allCategories'))
      : t('transactions.activity.allCategories');
  const currencyList = currencies.status === 'success' ? currencies.data.filter((c) => CURRENCY_CODES.includes(c)) : [];

  const dayLabel = (date: IsoDate) => {
    const d = diffDays(today, date);
    if (d === 0 || d === -1) return `${relativeDay(date, today, locale, t)} · ${formatDate(date, locale, 'short')}`;
    return formatDate(date, locale, 'long');
  };

  const header = (
    <View style={styles.filters}>
      <TextField
        label={t('common.search')}
        value={search}
        onChangeText={setSearch}
        placeholder={t('transactions.activity.search')}
        icon="search"
        returnKeyType="search"
        autoCorrect={false}
        testID="activity-search"
        maxLength={80}
      />
      <MonthSwitcher
        month={month}
        onChange={setMonth}
        onToggleAll={() => setMonth((m) => (m ? null : monthOf(today)))}
      />
      <ChipRow>
        <Chip label={t('transactions.activity.filterAll')} selected={kind === 'all'} onPress={() => setKind('all')} />
        <Chip
          label={t('transactions.activity.filterIncome')}
          selected={kind === 'income'}
          onPress={() => setKind('income')}
          icon="arrowDown"
        />
        <Chip
          label={t('transactions.activity.filterExpense')}
          selected={kind === 'expense'}
          onPress={() => setKind('expense')}
          icon="arrowUp"
        />
      </ChipRow>
      {currencyList.length > 1 ? (
        <ChipRow>
          <Chip
            label={t('transactions.activity.allCurrencies')}
            selected={currency === null}
            onPress={() => setCurrency(null)}
          />
          {currencyList.map((c) => (
            <Chip key={c} label={currencyLabel(c)} selected={currency === c} onPress={() => setCurrency(c)} />
          ))}
        </ChipRow>
      ) : null}
      <ChipRow>
        <Chip
          label={categoryName}
          icon="tag"
          selected={categoryId !== null}
          onPress={() => setPickCategory(true)}
          testID="activity-category"
        />
        {filtered ? <Chip label={t('transactions.activity.clearFilters')} icon="close" onPress={clear} /> : null}
      </ChipRow>
      {rows.status === 'success' ? (
        <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
          {t('transactions.activity.count', { count: rows.data.length })}
        </Text>
      ) : null}
    </View>
  );

  const empty =
    rows.status === 'loading' ? (
      <Skeleton />
    ) : rows.status === 'error' ? (
      <ErrorState onRetry={rows.reload} />
    ) : filtered ? (
      <EmptyState
        icon="search"
        title={t('transactions.activity.noResultsTitle')}
        body={t('transactions.activity.noResultsBody')}
        action={{ label: t('transactions.activity.clearFilters'), onPress: clear }}
      />
    ) : (
      <EmptyState
        icon="wallet"
        title={t('transactions.activity.emptyTitle')}
        body={t('transactions.activity.emptyBody')}
        action={{ label: t('common.actions.add'), onPress: () => router.push('/transaction/new') }}
      />
    );

  return (
    <Screen
      title={t('transactions.activity.title')}
      scroll={false}
      contentStyle={styles.fill}
      right={
        <IconButton
          icon="plus"
          label={t('common.tabs.add')}
          tone="soft"
          onPress={() => router.push('/transaction/new')}
        />
      }
      testID="activity-screen"
    >
      <SectionList
        testID="activity-list"
        sections={sections}
        keyExtractor={(tx) => tx.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={14}
        windowSize={8}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text variant="label" color="textSecondary" style={styles.dayLabel}>
              {dayLabel(section.date)}
            </Text>
            <View style={styles.net}>
              {CURRENCY_CODES.filter((c) => section.net[c] !== undefined).map((c) => (
                <Money key={c} amountMinor={section.net[c] ?? 0} currency={c} variant="caption" color="textSecondary" />
              ))}
            </View>
          </View>
        )}
        renderItem={({ item }) =>
          lookups.status === 'success' ? (
            <TransactionRow tx={item} lookups={lookups.data} today={today} showDate={false} />
          ) : null
        }
        ItemSeparatorComponent={Divider}
      />
      <SelectSheet
        visible={pickCategory}
        onClose={() => setPickCategory(false)}
        title={t('transactions.activity.categoryFilter')}
        value={categoryId ?? ALL}
        options={[
          { value: ALL, label: t('transactions.activity.allCategories') },
          ...(categories.status === 'success'
            ? categories.data.map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color }))
            : []),
        ]}
        onSelect={(v) => setCategoryId(v === ALL ? null : v)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  filters: { gap: space.sm, paddingBottom: space.sm },
  listContent: { paddingBottom: space.huge },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.md,
    paddingBottom: space.xs,
    paddingHorizontal: space.sm,
  },
  dayLabel: { flex: 1, minWidth: 0 },
  net: { alignItems: 'flex-end' },
});
