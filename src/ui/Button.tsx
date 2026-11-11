import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  size = 'md',
  style,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.accent, secondary: colors.accentSoft, ghost: 'transparent', danger: colors.dangerSoft }[
    variant
  ];
  const fg = { primary: 'onAccent', secondary: 'accentText', ghost: 'accentText', danger: 'danger' }[variant] as
    'onAccent' | 'accentText' | 'danger';
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: bg, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[fg]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={18} color={colors[fg]} /> : null}
          <Text variant="bodyStrong" color={fg} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Round icon-only button (header actions). Always has a label for screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  size = 44,
  badge,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'soft' | 'hero';
  size?: number;
  badge?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const bg = tone === 'soft' ? colors.surfaceAlt : tone === 'hero' ? 'rgba(255,255,255,0.16)' : 'transparent';
  const fg = tone === 'hero' ? colors.heroText : colors.text;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} (${badge})` : label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.icon,
        { width: size, height: size, backgroundColor: bg, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} size={22} color={fg} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
          <Text variant="overline" style={styles.badgeText} color="onAccent">
            {badge > 9 ? '9+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Circle + label quick action (dashboard). */
export function RoundAction({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.actionCircle, { backgroundColor: colors.accentSoft }]}>
        <Icon name={icon} size={22} color={colors.accentText} />
      </View>
      <Text variant="caption" color="textSecondary" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  md: { minHeight: 50 },
  sm: { minHeight: 40, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, lineHeight: 12, letterSpacing: 0 },
  action: { alignItems: 'center', gap: space.xs, flex: 1, minWidth: 64 },
  actionCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
