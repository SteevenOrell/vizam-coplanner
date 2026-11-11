import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

export function Chip({
  label,
  selected,
  onPress,
  icon,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected: !!selected } : undefined}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.surfaceAlt,
          borderColor: selected ? colors.accent : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? colors.onAccent : colors.textSecondary} /> : null}
      <Text variant="label" color={selected ? 'onAccent' : 'textSecondary'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Horizontally scrolling row of chips (filters). */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

/** Two to four equal options (Income / Expense, Month / Year …). */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  testID,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View testID={testID} accessibilityRole="tablist" style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segmentItem, selected ? { backgroundColor: colors.surface } : null]}
          >
            <Text variant="label" color={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    minHeight: 36,
  },
  row: { gap: space.sm, paddingVertical: space.xs },
  segment: { flexDirection: 'row', borderRadius: radii.pill, padding: 4 },
  segmentItem: { flex: 1, minHeight: 38, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
