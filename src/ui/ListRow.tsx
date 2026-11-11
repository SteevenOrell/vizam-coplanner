import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/** Coloured round badge with a category / goal icon. The colour is a tint, the icon keeps contrast. */
export function CategoryBadge({ icon, color, size = 44 }: { icon: IconName | string; color: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22` }]}>
      <Icon name={icon} size={Math.round(size * 0.5)} color={color} strokeWidth={2} />
    </View>
  );
}

/** Standard list row: leading badge, title + subtitle, trailing content (amount, chevron …). */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  accessibilityLabel,
  chevron = false,
  testID,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  chevron?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      {leading}
      <View style={styles.texts}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? <Icon name="chevronRight" size={18} color={colors.textMuted} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View
        testID={testID}
        style={styles.row}
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' }]}
    >
      {content}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border, marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radii.md,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '50%' },
  divider: { height: StyleSheet.hairlineWidth },
});
