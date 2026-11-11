import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinear, RadialGradient, Rect, Stop } from 'react-native-svg';

import { decorativeProps } from './platform';
import { useTheme } from './theme/ThemeProvider';

/**
 * Which backdrop every screen uses. 'glass' (2026-11-11, Steeven): a calm version of the splash's fluted glass in the
 * header band. 'sky': the earlier sky gradient, kept so switching back is one line.
 */
const BACKDROP: 'glass' | 'sky' = 'glass';

/**
 * Glow colours and peak strength per theme. Peaks are the strongest that keep textSecondary and accentText at
 * WCAG AA where a glow is densest (src/ui/theme/__tests__/contrast.test.ts checks these numbers).
 */
export const GLASS = {
  light: { blue: '#2F6BEA', blueAlpha: 0.12, cyan: '#5CC8F0', cyanAlpha: 0.26 },
  dark: { blue: '#3A72EC', blueAlpha: 0.42, cyan: '#2F7FD0', cyanAlpha: 0.4 },
} as const;

/** Height of the glass band behind the header and first card, as a share of the screen (capped in px). */
const BAND_RATIO = 0.42;
const BAND_MAX = 420;

/**
 * Glass header: blue (left) and cyan (right) glows seen through vertical glass ribs, at about a third of the splash
 * strength so headings and secondary text stay AA, fading into the plain background before lists and charts start.
 * Gradient ids are prefixed so they never collide with the splash's on web.
 */
function GlassHeader() {
  const { colors, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const dark = scheme === 'dark';
  const band = Math.min(Math.round(useWindowDimensions().height * BAND_RATIO), BAND_MAX);
  const ribWidth = 26;
  const ribs = Math.ceil(width / ribWidth) + 1;
  const { blue, blueAlpha, cyan, cyanAlpha } = GLASS[dark ? 'dark' : 'light'];

  return (
    <View pointerEvents="none" style={[styles.band, { height: band }]}>
      <Svg width={width} height={band} {...decorativeProps}>
        <Defs>
          <RadialGradient id="appGlassBlue" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={blue} stopOpacity={blueAlpha} />
            <Stop offset="0.55" stopColor={blue} stopOpacity={blueAlpha * 0.5} />
            <Stop offset="1" stopColor={blue} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="appGlassCyan" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={cyan} stopOpacity={cyanAlpha} />
            <Stop offset="0.55" stopColor={cyan} stopOpacity={cyanAlpha * 0.5} />
            <Stop offset="1" stopColor={cyan} stopOpacity={0} />
          </RadialGradient>
          <SvgLinear id="appGlassRib" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.07 : 0.95} />
            <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity={dark ? 0.02 : 0.35} />
            <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor={dark ? '#000000' : '#0B1A4A'} stopOpacity={dark ? 0.16 : 0.06} />
          </SvgLinear>
          {/* Ends exactly on the screen background, so the band has no visible edge. */}
          <SvgLinear id="appGlassFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="0.55" stopColor={colors.bg} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </SvgLinear>
        </Defs>
        <Rect x={-width * 0.45} y={-band * 0.35} width={width * 1.2} height={band * 1.25} fill="url(#appGlassBlue)" />
        <Rect x={width * 0.35} y={-band * 0.45} width={width * 1.0} height={band * 1.2} fill="url(#appGlassCyan)" />
        {Array.from({ length: ribs }, (_, i) => (
          <Rect key={i} x={i * ribWidth} y={0} width={ribWidth} height={band} fill="url(#appGlassRib)" />
        ))}
        <Rect x={0} y={0} width={width} height={band} fill="url(#appGlassFade)" />
      </Svg>
    </View>
  );
}

function Sky() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <LinearGradient
        colors={[colors.skyTop, colors.skyMid, colors.bg]}
        locations={[0, 0.38, 0.78]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.glow,
          { backgroundColor: scheme === 'dark' ? 'rgba(127,169,255,0.10)' : 'rgba(255,255,255,0.45)' },
        ]}
      />
    </>
  );
}

/** Backdrop behind every screen (see BACKDROP). Fixed behind scrolling content. */
export function SkyBackground() {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      {BACKDROP === 'glass' ? <GlassHeader /> : <Sky />}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, left: 0, right: 0 },
  glow: { position: 'absolute', width: 360, height: 360, borderRadius: 180, top: -170, right: -120 },
});
