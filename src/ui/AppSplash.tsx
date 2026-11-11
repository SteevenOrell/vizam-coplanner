import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

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
  const opacity = useRef(new Animated.Value(1)).current;
  const rise = useRef(new Animated.Value(0)).current;

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

  const sky: [string, string, string] =
    scheme === 'dark' ? ['#060B1C', '#14307A', '#3C6FD8'] : ['#123A9E', '#2D66E0', '#9CC4FF'];

  return (
    <Animated.View
      testID="app-splash"
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityLabel={`${t('common.appName')}. ${t('common.states.loading')}`}
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <LinearGradient colors={sky} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      {/* Soft clouds of light near the horizon. */}
      <View style={[styles.cloud, styles.cloudA]} />
      <View style={[styles.cloud, styles.cloudB]} />
      <View style={[styles.cloud, styles.cloudC]} />
      <Animated.View
        style={[
          styles.center,
          {
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
          },
        ]}
      >
        <View style={styles.tile}>
          <LogoMark size={76} />
        </View>
        <Text variant="title" color="heroText" style={styles.wordmark}>
          {t('common.appName')}
        </Text>
        <Text variant="body" color="heroTextSecondary" align="center" style={styles.tagline}>
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
    width: 116,
    height: 116,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    marginBottom: space.xl,
  },
  wordmark: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  tagline: { marginTop: space.xs, maxWidth: 280, color: '#E4ECFF' },
  cloud: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' },
  cloudA: { width: 420, height: 160, bottom: -40, left: -120 },
  cloudB: { width: 360, height: 140, bottom: 30, right: -150 },
  cloudC: { width: 240, height: 90, bottom: 120, left: -60, backgroundColor: 'rgba(255,255,255,0.10)' },
});
