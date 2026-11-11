import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { FlutedGlass } from './FlutedGlass';
import { decorativeProps, useNativeDriver } from './platform';
import { Text } from './Text';
import { fonts, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/** The CoPlanner mark (open "C" plan cycle around three rising bars), same drawing as assets/brand-mark.svg. */
export function LogoMark({ size = 96, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="96 96 320 320" {...decorativeProps}>
      <Path d="M352 168a128 128 0 1 0 0 176" fill="none" stroke={color} strokeWidth={44} strokeLinecap="round" />
      <Rect x={214} y={262} width={30} height={58} rx={15} fill={color} />
      <Rect x={262} y={226} width={30} height={94} rx={15} fill={color} />
      <Rect x={310} y={190} width={30} height={130} rx={15} fill={color} opacity={0.9} />
    </Svg>
  );
}

/**
 * In-app splash: a full-screen blue sky (deep blue at the top, bright sky towards the horizon) with the mark in a
 * glassy tile, the wordmark and the tagline. Takes over from the native splash, then fades out when `visible`
 * turns false. The mark rises in unless Reduce Motion is on.
 */
export function AppSplash({ visible, onHidden }: { visible: boolean; onHidden: () => void }) {
  const { scheme } = useTheme();
  const { t } = useTranslation();
  const [opacity] = useState(() => new Animated.Value(1));
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) rise.setValue(1);
      else
        Animated.timing(rise, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver,
        }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [rise]);

  useEffect(() => {
    if (visible) return;
    Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver }).start(() => onHidden());
  }, [visible, opacity, onHidden]);

  const dark = scheme === 'dark';

  return (
    <Animated.View
      testID="app-splash"
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityLabel={`${t('common.appName')}. ${t('common.states.loading')}`}
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <FlutedGlass scheme={dark ? 'dark' : 'light'} />
      <Animated.View
        style={[
          styles.center,
          {
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
          },
        ]}
      >
        <LinearGradient
          colors={['#111C3A', '#2F6BEA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, dark ? styles.tileDark : styles.tileLight]}
        >
          <LogoMark size={74} />
        </LinearGradient>
        <Text variant="title" style={[styles.wordmark, { color: dark ? '#FFFFFF' : '#111C3A' }]}>
          {t('common.appName')}
        </Text>
        <Text variant="body" align="center" style={[styles.tagline, { color: dark ? '#DCE6FF' : '#2B3A63' }]}>
          {t('common.tagline')}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: '18%',
  },
  tile: {
    width: 112,
    height: 112,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
    borderWidth: 1,
  },
  tileLight: {
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#111C3A',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  tileDark: { borderColor: 'rgba(255,255,255,0.25)' },
  wordmark: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  tagline: { marginTop: space.xs, maxWidth: 280 },
});
