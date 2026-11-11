import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  addDays,
  addMonthKey,
  daysInMonth,
  monthOf,
  monthStart,
  weekday,
  type IsoDate,
  type MonthKey,
} from '../domain/dates';
import { usePreferences } from '../state/preferences';
import { IconButton } from './Button';
import { formatMonth, weekdayNames } from './format';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/**
 * Month calendar grid (weeks start on Sunday in en-CA, Monday in fr-CA). `marks` adds small dots under days
 * (e.g. bills due, transactions). Used by the date picker and the financial calendar screen.
 */
export function MonthGrid({
  month,
  selected,
  today,
  onSelect,
  marks,
  onMonthChange,
}: {
  month: MonthKey;
  selected?: IsoDate | null;
  today: IsoDate;
  onSelect: (date: IsoDate) => void;
  marks?: ReadonlyMap<IsoDate, readonly string[]>;
  onMonthChange?: (month: MonthKey) => void;
}) {
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const { t } = useTranslation();
  const weekStart = locale.startsWith('fr') ? 1 : 0;
  const first = monthStart(month);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lead = (weekday(first) - weekStart + 7) % 7;
  const total = daysInMonth(y, m);
  const cells: (IsoDate | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);
  const names = weekdayNames(locale, weekStart);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {onMonthChange ? (
          <IconButton
            icon="chevronLeft"
            label={formatMonth(addMonthKey(month, -1), locale)}
            onPress={() => onMonthChange(addMonthKey(month, -1))}
            size={40}
          />
        ) : null}
        <Text variant="heading" align="center" style={styles.flex} accessibilityRole="header">
          {formatMonth(month, locale)}
        </Text>
        {onMonthChange ? (
          <IconButton
            icon="chevronRight"
            label={formatMonth(addMonthKey(month, 1), locale)}
            onPress={() => onMonthChange(addMonthKey(month, 1))}
            size={40}
          />
        ) : null}
      </View>
      <View style={styles.row}>
        {names.map((n, i) => (
          <Text key={i} variant="caption" color="textMuted" align="center" style={styles.cell}>
            {n}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={styles.row}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={styles.cell} />;
            const isSel = d === selected;
            const isToday = d === today;
            const dots = marks?.get(d) ?? [];
            return (
              <Pressable
                key={d}
                onPress={() => onSelect(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${d}${isToday ? `, ${t('common.dates.today')}` : ''}${dots.length ? ` (${dots.length})` : ''}`}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    isSel
                      ? { backgroundColor: colors.accent }
                      : isToday
                        ? { borderColor: colors.accent, borderWidth: 1.5 }
                        : null,
                  ]}
                >
                  <Text variant="label" color={isSel ? 'onAccent' : 'text'}>
                    {String(Number(d.slice(8)))}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {dots.slice(0, 3).map((c, k) => (
                    <View key={k} style={[styles.dot, { backgroundColor: c }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Date picker in a bottom sheet. */
export function DatePickerSheet({
  visible,
  onClose,
  title,
  value,
  today,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: IsoDate;
  today: IsoDate;
  onChange: (date: IsoDate) => void;
}) {
  const [month, setMonth] = useState<MonthKey>(monthOf(value));
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <MonthGrid
        month={month}
        selected={value}
        today={today}
        onMonthChange={setMonth}
        onSelect={(d) => {
          onChange(d);
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'flex-start', paddingTop: 2 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
