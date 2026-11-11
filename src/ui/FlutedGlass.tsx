import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinear, RadialGradient, Rect, Stop } from 'react-native-svg';

import { decorativeProps } from './platform';

/**
 * Fluted (reeded) glass: soft blue and cyan glows on a white base, seen through vertical glass ribs. Each rib is a
 * narrow strip with its own left-to-right light gradient (bright edge, clear middle, faint shadow edge), which reads
 * as ribbed glass over the blurred colour behind. Pure SVG, so it renders the same on iOS, Android and web.
 */
export function FlutedGlass({ scheme, ribWidth = 26 }: { scheme: 'light' | 'dark'; ribWidth?: number }) {
  const { width, height } = useWindowDimensions();
  const ribs = Math.ceil(width / ribWidth) + 1;
  const dark = scheme === 'dark';
  const base = dark ? '#0B1640' : '#F4F7FD';
  const blue = dark ? '#2F66E0' : '#2F6BEA';
  const cyan = dark ? '#3FB6E8' : '#5CC8F0';
  const highlight = dark ? 0.1 : 0.55;
  const shade = dark ? 0.22 : 0.06;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} {...decorativeProps}>
        <Defs>
          <RadialGradient id="glowBlue" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={blue} stopOpacity={1} />
            <Stop offset="0.5" stopColor={blue} stopOpacity={dark ? 0.5 : 0.6} />
            <Stop offset="1" stopColor={blue} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowCyan" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={cyan} stopOpacity={dark ? 0.8 : 1} />
            <Stop offset="0.55" stopColor={cyan} stopOpacity={dark ? 0.3 : 0.5} />
            <Stop offset="1" stopColor={cyan} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowWhite" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.12 : 0.75} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          {/* One rib: light edge on the left, clear middle, faint shadow on the right. */}
          <SvgLinear id="rib" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={highlight} />
            <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity={highlight * 0.25} />
            <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor={dark ? '#000000' : '#0B1A4A'} stopOpacity={shade} />
          </SvgLinear>
          {/* Fades the colour out towards the bottom so text there stays readable. */}
          <SvgLinear id="veil" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor={base} stopOpacity={0} />
            <Stop offset="1" stopColor={base} stopOpacity={dark ? 0.55 : 0.85} />
          </SvgLinear>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={base} />
        {/* Blurred colour behind the glass: deep blue left, cyan right, a white bloom between. */}
        <Rect x={-width * 0.55} y={height * 0.04} width={width * 1.35} height={height * 0.72} fill="url(#glowBlue)" />
        <Rect x={width * 0.3} y={-height * 0.04} width={width * 1.1} height={height * 0.7} fill="url(#glowCyan)" />
        <Rect x={width * 0.15} y={height * 0.3} width={width * 0.7} height={height * 0.4} fill="url(#glowWhite)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#veil)" />
        {Array.from({ length: ribs }, (_, i) => (
          <Rect key={i} x={i * ribWidth} y={0} width={ribWidth} height={height} fill="url(#rib)" />
        ))}
      </Svg>
    </View>
  );
}
