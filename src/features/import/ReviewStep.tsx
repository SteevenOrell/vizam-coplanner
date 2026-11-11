import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Switch, View } from 'react-native';

import type { CategoryRule } from '../../data/repos/import';
import { keywordFor, suggestCategory } from '../../domain/import/categorize';
import type { DuplicateKind } from '../../domain/import/duplicates';
import { totalsOf } from '../../domain/import/drafts';
import type { DraftsResult, ImportDraft } from '../../domain/import/types';
import type { CurrencyCode } from '../../domain/money/currency';
import type { Category, TxKind } from '../../domain/models';
import { usePreferences } from '../../state/preferences';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { formatDate } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { Money } from '../../ui/Money';
import { ConfirmDialog, SelectSheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';

const NONE = '__none__';

export type Filter = 'all' | 'income' | 'expense' | 'duplicates' | 'errors';

export interface ReviewItem {
  draft: ImportDraft;
  duplicate: DuplicateKind | null;
  categoryId: string | null;
  included: boolean;
}

/** What gets imported: the included, error-free rows. */
export function selectedRows(items: readonly ReviewItem[]): ReviewItem[] {
  return items.filter((i) => i.included && !i.draft.error && i.draft.occurredOn !== null);
}

/**
 * Review state shared with the footer: which rows are included (duplicates and errors start excluded) and which
 * category each row gets (an explicit choice, else a rule, else a built-in keyword).
 */
export function useReview(
  result: DraftsResult,
  duplicates: Map<number, DuplicateKind>,
  rules: readonly CategoryRule[],
  categories: readonly Category[],
) {
  const [inclusion, setInclusion] = useState<Record<number, boolean>>({});
  const [chosen, setChosen] = useState<Record<number, string | null>>({});

  // Suggestions are the costly part (every keyword against every row): only redo them when rules change.
  const suggested = useMemo(
    () => result.drafts.map((d) => suggestCategory(d, rules, categories)?.categoryId ?? null),
    [result, rules, categories],
  );
  const items = useMemo<ReviewItem[]>(
    () =>
      result.drafts.map((draft, i) => {
        const duplicate = duplicates.get(draft.line) ?? null;
        const override = chosen[draft.line];
        const categoryId = override !== undefined ? override : suggested[i]!;
        const included = draft.error ? false : (inclusion[draft.line] ?? duplicate === null);
        return { draft, duplicate, categoryId, included };
      }),
    [result, duplicates, suggested, inclusion, chosen],
  );
  const toggle = useCallback((line: number, v: boolean) => setInclusion((s) => ({ ...s, [line]: v })), []);
  const choose = useCallback((line: number, id: string | null) => setChosen((s) => ({ ...s, [line]: id })), []);
  const reset = useCallback(() => {
    setInclusion({});
    setChosen({});
  }, []);
  return { items, toggle, choose, reset };
}

export function ReviewStep({
  items,
  result,
  duplicateCount,
  currency,
  categories,
  rules,
  onToggle,
  onChoose,
  onCreateRule,
  banner,
}: {
  items: ReviewItem[];
  result: DraftsResult;
  duplicateCount: number;
  currency: CurrencyCode;
  categories: Category[];
  rules: CategoryRule[];
  onToggle: (line: number, v: boolean) => void;
  onChoose: (line: number, id: string | null) => void;
  onCreateRule: (rule: { pattern: string; kind: TxKind; categoryId: string }) => void;
  banner?: ReactNode;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [pickLine, setPickLine] = useState<number | null>(null);
  const [pendingRule, setPendingRule] = useState<{ pattern: string; kind: TxKind; categoryId: string } | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const selected = selectedRows(items);
  const totals = totalsOf(selected.map((i) => i.draft));
  const counts = {
    all: items.length,
    income: items.filter((i) => i.draft.kind === 'income' && !i.draft.error).length,
    expense: items.filter((i) => i.draft.kind === 'expense' && !i.draft.error).length,
    duplicates: items.filter((i) => i.duplicate).length,
    errors: items.filter((i) => i.draft.error).length,
  };
  const visible = useMemo(
    () =>
      items.filter((i) => {
        switch (filter) {
          case 'income':
            return i.draft.kind === 'income' && !i.draft.error;
          case 'expense':
            return i.draft.kind === 'expense' && !i.draft.error;
          case 'duplicates':
            return i.duplicate !== null;
          case 'errors':
            return i.draft.error !== null;
          default:
            return true;
        }
      }),
    [items, filter],
  );

  const pickItem = pickLine === null ? null : (items.find((i) => i.draft.line === pickLine) ?? null);
  const pickKind = pickItem?.draft.kind ?? 'expense';
  const openPicker = useCallback((line: number) => setPickLine(line), []);

  const onSelect = (value: string) => {
    if (!pickItem) return;
    const id = value === NONE ? null : value;
    onChoose(pickItem.draft.line, id);
    if (id) {
      const pattern = keywordFor(pickItem.draft.description);
      const exists = rules.some(
        (r) => r.kind === pickKind && r.pattern.toLowerCase() === pattern && r.categoryId === id,
      );
      if (pattern.length >= 2 && !exists) setPendingRule({ pattern, kind: pickKind, categoryId: id });
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('import.review.filterAll') },
    { key: 'income', label: t('import.review.filterIncome') },
    { key: 'expense', label: t('import.review.filterExpenses') },
    { key: 'duplicates', label: t('import.review.filterDuplicates') },
    { key: 'errors', label: t('import.review.filterErrors') },
  ];

  const header = (
    <View style={styles.header}>
      <Card tone="accentSoft">
        <View style={styles.summary} testID="import-summary">
          <Text variant="bodyStrong" testID="import-summary-income">
            {t('import.review.incomes', { count: totals.incomeCount })}
          </Text>
          <Money amountMinor={totals.incomeMinor} currency={currency} kind="income" variant="bodyStrong" />
          <Text variant="bodyStrong" testID="import-summary-expenses">
            {t('import.review.expenses', { count: totals.expenseCount })}
          </Text>
          <Money amountMinor={totals.expenseMinor} currency={currency} kind="expense" variant="bodyStrong" />
          <Text variant="caption" color="textSecondary" testID="import-summary-flags">
            {t('import.review.flags', {
              errors: counts.errors,
              duplicates: duplicateCount,
              skipped: result.skippedEmpty + result.skippedZero,
            })}
          </Text>
        </View>
      </Card>
      {banner}
      <View style={styles.chips}>
        {filters.map((f) => (
          <Chip
            key={f.key}
            testID={`import-filter-${f.key}`}
            label={`${f.label} (${counts[f.key]})`}
            selected={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <>
      <FlatList
        testID="import-review-list"
        data={visible}
        keyExtractor={(i) => String(i.draft.line)}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text variant="body" color="textSecondary" align="center" style={styles.empty}>
            {t('import.review.empty')}
          </Text>
        }
        renderItem={({ item }) => (
          <ReviewRow
            item={item}
            currency={currency}
            category={item.categoryId ? categoryById.get(item.categoryId) : undefined}
            onToggle={onToggle}
            onPickCategory={openPicker}
          />
        )}
        initialNumToRender={12}
        maxToRenderPerBatch={20}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />
      <SelectSheet
        visible={pickItem !== null}
        onClose={() => setPickLine(null)}
        title={t('import.review.pickCategory')}
        value={pickItem?.categoryId ?? NONE}
        options={[
          { value: NONE, label: t('common.uncategorized'), icon: 'tag' },
          ...categories
            .filter((c) => c.kind === pickKind)
            .map((c) => ({ value: c.id, label: c.name, icon: c.icon, color: c.color })),
        ]}
        onSelect={onSelect}
      />
      <ConfirmDialog
        visible={pendingRule !== null && pickItem === null}
        title={t('import.review.ruleTitle', { keyword: pendingRule?.pattern ?? '' })}
        body={t('import.review.ruleBody', {
          keyword: pendingRule?.pattern ?? '',
          category: (pendingRule && categoryById.get(pendingRule.categoryId)?.name) ?? '',
        })}
        confirmLabel={t('import.review.ruleCreate')}
        destructive={false}
        onConfirm={() => {
          if (pendingRule) onCreateRule(pendingRule);
          setPendingRule(null);
        }}
        onCancel={() => setPendingRule(null)}
      />
    </>
  );
}

const ReviewRow = memo(function ReviewRow({
  item,
  currency,
  category,
  onToggle,
  onPickCategory,
}: {
  item: ReviewItem;
  currency: CurrencyCode;
  category: Category | undefined;
  onToggle: (line: number, v: boolean) => void;
  onPickCategory: (line: number) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const { draft, duplicate, included } = item;
  const date = draft.occurredOn ? formatDate(draft.occurredOn, locale, 'medium') : '—';
  const description = draft.description || t('import.review.noDescription');
  const status = draft.error
    ? t(`import.review.error.${draft.error}` as 'import.review.error.date')
    : duplicate === 'file'
      ? t('import.review.duplicateFile')
      : duplicate === 'existing'
        ? t('import.review.duplicateExisting')
        : null;

  return (
    <View
      testID={`import-row-${draft.line}`}
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: draft.error ? colors.danger : colors.border },
      ]}
    >
      <Switch
        testID={`import-include-${draft.line}`}
        value={included}
        disabled={draft.error !== null}
        onValueChange={(v) => onToggle(draft.line, v)}
        accessibilityLabel={t('import.review.include', { description })}
        trackColor={{ true: colors.accent, false: colors.border }}
      />
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {description}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {t('import.review.line', { line: draft.line })} · {date}
        </Text>
        {status ? (
          <Text variant="caption" color={draft.error ? 'danger' : 'warningText'} testID={`import-status-${draft.line}`}>
            {status}
          </Text>
        ) : null}
        {!draft.error ? (
          <Pressable
            testID={`import-category-${draft.line}`}
            onPress={() => onPickCategory(draft.line)}
            accessibilityRole="button"
            accessibilityLabel={t('import.review.changeCategory', { description })}
            style={[styles.category, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          >
            <Icon name="tag" size={14} color={colors.textSecondary} />
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.categoryText}>
              {category?.name ?? t('common.uncategorized')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {!draft.error ? (
        <View style={styles.rowAmount}>
          <Money amountMinor={draft.amountMinor} currency={currency} kind={draft.kind} variant="bodyStrong" />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { flex: 1, width: '100%' },
  listContent: { gap: space.sm, paddingBottom: space.lg },
  header: { gap: space.md, paddingBottom: space.sm },
  summary: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  empty: { paddingVertical: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowAmount: { flexShrink: 0, maxWidth: '40%', paddingTop: 2 },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    marginTop: space.xs,
    minHeight: 32,
    maxWidth: '100%',
    paddingHorizontal: space.sm,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  categoryText: { flexShrink: 1 },
});
