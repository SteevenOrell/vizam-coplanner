import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

export function Card({
  children,
  style,
  padded = true,
  tone = 'surface',
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'surface' | 'alt' | 'accentSoft';
  testID?: string;
}) {
  const { colors, scheme } = useTheme();
  const bg = tone === 'alt' ? colors.surfaceAlt : tone === 'accentSoft' ? colors.accentSoft : colors.surface;
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: bg, borderColor: colors.border },
        scheme === 'light' ? styles.shadow : null,
        padded ? styles.padded : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Signature blue gradient card (balances, plan summary). Text on it uses heroText / heroTextSecondary. */
export function HeroCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={[colors.heroFrom, colors.heroTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, style]}
    >
      {/* Decorative concentric "plan" rings: CoPlanner's own motif. */}
      <View pointerEvents="none" style={[styles.ring, styles.ringA]} />
      <View pointerEvents="none" style={[styles.ring, styles.ringB]} />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth },
  padded: { padding: space.lg },
  shadow: {
    shadowColor: '#111C3A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  hero: { borderRadius: radii.xl, padding: space.xl, overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  ringA: { width: 220, height: 220, right: -70, top: -90 },
  ringB: { width: 140, height: 140, right: -30, top: -50 },
});
