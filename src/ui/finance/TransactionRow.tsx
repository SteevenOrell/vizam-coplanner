import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { IsoDate } from '../../domain/dates';
import { formatMoney } from '../../domain/money/format';
import type { Transaction } from '../../domain/models';
import type { Lookups } from '../../data/hooks';
import { usePreferences } from '../../state/preferences';
import { relativeDay } from '../format';
import { CategoryBadge, ListRow } from '../ListRow';
import { Money } from '../Money';
import { useTheme } from '../theme/ThemeProvider';

/** One transaction in a list: category badge, description, category · date, signed amount. Opens the details. */
export function TransactionRow({
  tx,
  lookups,
  today,
  showDate = true,
}: {
  tx: Transaction;
  lookups: Lookups;
  today: IsoDate;
  showDate?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const category = tx.categoryId ? lookups.categories.get(tx.categoryId) : undefined;
  const categoryName = category?.name ?? t('common.uncategorized');
  const title = tx.description || categoryName;
  const subtitle = [categoryName, showDate ? relativeDay(tx.occurredOn, today, locale, t) : null]
    .filter(Boolean)
    .join(' · ');
  const amountText = formatMoney(tx.kind === 'expense' ? -tx.amountMinor : tx.amountMinor, tx.currency, {
    locale,
    signed: true,
  });
  return (
    <ListRow
      testID={`tx-${tx.id}`}
      leading={<CategoryBadge icon={category?.icon ?? 'tag'} color={category?.color ?? colors.textMuted} />}
      title={title}
      subtitle={subtitle}
      trailing={<Money amountMinor={tx.amountMinor} currency={tx.currency} kind={tx.kind} />}
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: tx.id } })}
      accessibilityLabel={`${title}, ${subtitle}, ${amountText}`}
    />
  );
}
