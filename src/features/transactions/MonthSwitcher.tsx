import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { addMonthKey, type MonthKey } from '../../domain/dates';
import { usePreferences } from '../../state/preferences';
import { IconButton } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { formatMonth } from '../../ui/format';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';

/**
 * Previous / next month with the month name between. `month` null means "all time" (only when `onToggleAll` is set;
 * the chip then toggles between the current month and all time).
 */
export function MonthSwitcher({
  month,
  onChange,
  onToggleAll,
}: {
  month: MonthKey | null;
  onChange: (month: MonthKey) => void;
  onToggleAll?: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = usePreferences();
  return (
    <View style={styles.row}>
      <IconButton
        icon="chevronLeft"
        label={t('transactions.activity.prevMonth')}
        tone="soft"
        onPress={() => month && onChange(addMonthKey(month, -1))}
      />
      <Text variant="bodyStrong" align="center" style={styles.label} accessibilityRole="header" numberOfLines={1}>
        {month ? formatMonth(month, locale) : t('transactions.activity.allTime')}
      </Text>
      <IconButton
        icon="chevronRight"
        label={t('transactions.activity.nextMonth')}
        tone="soft"
        onPress={() => month && onChange(addMonthKey(month, 1))}
      />
      {onToggleAll ? (
        <Chip
          label={month === null ? t('transactions.activity.byMonth') : t('transactions.activity.allTime')}
          onPress={onToggleAll}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { flex: 1, minWidth: 0 },
});
