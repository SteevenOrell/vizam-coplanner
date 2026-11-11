import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { BudgetStatus } from '../domain/budget';
import { decorativeProps } from './platform';
import { useTheme } from './theme/ThemeProvider';

/** Horizontal progress (budgets, goals). `ratio` may exceed 1 (over budget): the bar is then full and red. */
export function ProgressBar({
  ratio,
  status = 'ok',
  height = 8,
  onHero = false,
  label,
}: {
  ratio: number;
  status?: BudgetStatus | 'goal';
  height?: number;
  onHero?: boolean;
  label?: string;
}) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const pair: [string, string] =
    status === 'over'
      ? [colors.danger, colors.danger]
      : status === 'near'
        ? [colors.warning, colors.warning]
        : status === 'goal'
          ? [colors.accent, colors.positive]
          : [colors.accent, colors.accent];
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: onHero ? 'rgba(255,255,255,0.2)' : colors.surfaceAlt },
      ]}
    >
      {clamped > 0 ? (
        <LinearGradient
          colors={pair}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: `${clamped * 100}%`, height, borderRadius: height / 2 }}
        />
      ) : null}
    </View>
  );
}

/** Circular progress for goals. */
export function ProgressRing({
  ratio,
  size = 64,
  stroke = 7,
  color,
}: {
  ratio: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <Svg width={size} height={size} {...decorativeProps}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color ?? colors.accent}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - clamped)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({ track: { width: '100%', overflow: 'hidden' } });
