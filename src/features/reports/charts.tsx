import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';

import type { CurrencyCode } from '../../domain/money/currency';
import { minorUnit } from '../../domain/money/currency';
import { formatMoney } from '../../domain/money/format';
import { usePreferences } from '../../state/preferences';
import { fonts } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';

const Y_AXIS_WIDTH = 46;

/** Chart value (major units) for an integer amount. Display only; stored money never goes through floats. */
export function chartValue(amountMinor: number, currency: CurrencyCode): number {
  return amountMinor / 10 ** minorUnit(currency);
}

function useAxis(currency: CurrencyCode) {
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const textStyle = { color: colors.textMuted, fontSize: 10, fontFamily: fonts.regular };
  const formatY = (v: string) => {
    const minor = Math.round(Number(v) * 10 ** minorUnit(currency));
    return Number.isFinite(minor) ? formatMoney(minor, currency, { locale, compact: true, hideCurrency: true }) : v;
  };
  return { colors, textStyle, formatY };
}

/**
 * Measures its own width (so charts never overflow, even at 300 px) and gives screen readers one text summary
 * instead of the chart's individual shapes.
 */
export function ChartFrame({
  summary,
  minHeight = 0,
  children,
}: {
  summary: string;
  minHeight?: number;
  children: (width: number) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={[styles.frame, { minHeight }]}
    >
      {width > 0 ? children(width) : null}
    </View>
  );
}

export interface GroupedPoint {
  label: string;
  a: number;
  b: number;
}

/** Two bars per group (income vs expenses). Values are integer minor units. */
export function GroupedBars({
  width,
  groups,
  colorA,
  colorB,
  currency,
}: {
  width: number;
  groups: readonly GroupedPoint[];
  colorA: string;
  colorB: string;
  currency: CurrencyCode;
}) {
  const { colors, textStyle, formatY } = useAxis(currency);
  const inner = Math.max(60, width - Y_AXIS_WIDTH - 12);
  const n = Math.max(1, groups.length);
  const groupW = inner / n;
  const gap = 2;
  const barWidth = Math.max(4, Math.min(22, Math.floor(groupW * 0.34)));
  const spacing = Math.max(2, Math.floor(groupW - 2 * barWidth - gap));
  const every = groupW < 20 ? 3 : groupW < 34 ? 2 : 1;
  const data = groups.flatMap((g, i) => [
    {
      value: chartValue(g.a, currency),
      label: i % every === 0 ? g.label : '',
      frontColor: colorA,
      spacing: gap,
      labelWidth: Math.max(28, groupW),
      labelTextStyle: textStyle,
    },
    { value: chartValue(g.b, currency), frontColor: colorB },
  ]);
  return (
    <BarChart
      data={data}
      width={inner}
      height={170}
      barWidth={barWidth}
      spacing={spacing}
      initialSpacing={Math.floor(spacing / 2)}
      endSpacing={0}
      yAxisLabelWidth={Y_AXIS_WIDTH}
      noOfSections={4}
      yAxisThickness={0}
      xAxisColor={colors.border}
      rulesColor={colors.border}
      yAxisTextStyle={textStyle}
      formatYLabel={formatY}
      barBorderTopLeftRadius={3}
      barBorderTopRightRadius={3}
      backgroundColor="transparent"
      disableScroll
      isAnimated={false}
    />
  );
}

/** One bar per item (daily spending). Labels are shown only where there is room. */
export function SimpleBars({
  width,
  items,
  color,
  currency,
  labelEvery = 1,
}: {
  width: number;
  items: readonly { label: string; value: number }[];
  color: string;
  currency: CurrencyCode;
  labelEvery?: number;
}) {
  const { colors, textStyle, formatY } = useAxis(currency);
  const inner = Math.max(60, width - Y_AXIS_WIDTH - 12);
  const slot = inner / Math.max(1, items.length);
  const barWidth = Math.max(3, Math.min(22, Math.floor(slot * 0.62)));
  const spacing = Math.max(1, Math.floor(slot - barWidth));
  const data = items.map((it, i) => ({
    value: chartValue(it.value, currency),
    label: i % labelEvery === 0 ? it.label : '',
    frontColor: color,
    labelWidth: 26,
    labelTextStyle: textStyle,
  }));
  return (
    <BarChart
      data={data}
      width={inner}
      height={150}
      barWidth={barWidth}
      spacing={spacing}
      initialSpacing={Math.floor(spacing / 2)}
      endSpacing={0}
      yAxisLabelWidth={Y_AXIS_WIDTH}
      noOfSections={3}
      yAxisThickness={0}
      xAxisColor={colors.border}
      rulesColor={colors.border}
      yAxisTextStyle={textStyle}
      formatYLabel={formatY}
      barBorderTopLeftRadius={2}
      barBorderTopRightRadius={2}
      backgroundColor="transparent"
      disableScroll
      isAnimated={false}
    />
  );
}

/** A single line (net trend, running balance, cumulative savings). Values are integer minor units. */
export function TrendLine({
  width,
  points,
  color,
  currency,
  labelEvery = 1,
}: {
  width: number;
  points: readonly { label: string; value: number }[];
  color: string;
  currency: CurrencyCode;
  labelEvery?: number;
}) {
  const { colors, textStyle, formatY } = useAxis(currency);
  const inner = Math.max(60, width - Y_AXIS_WIDTH - 40);
  const data = points.map((p, i) => ({
    value: chartValue(p.value, currency),
    label: i % labelEvery === 0 ? p.label : '',
    labelTextStyle: textStyle,
  }));
  return (
    <LineChart
      data={data}
      width={inner}
      height={160}
      color={color}
      thickness={2.5}
      curved
      areaChart
      startFillColor={color}
      endFillColor={color}
      startOpacity={0.22}
      endOpacity={0.02}
      hideDataPoints={data.length > 12}
      dataPointsColor={color}
      dataPointsRadius={3}
      adjustToWidth
      initialSpacing={6}
      endSpacing={6}
      yAxisLabelWidth={Y_AXIS_WIDTH}
      noOfSections={4}
      yAxisThickness={0}
      xAxisColor={colors.border}
      rulesColor={colors.border}
      yAxisTextStyle={textStyle}
      formatYLabel={formatY}
      backgroundColor="transparent"
      disableScroll
      isAnimated={false}
    />
  );
}

/** Donut chart; the legend with amounts is rendered by the screen (text, not colour only). */
export function Donut({
  width,
  slices,
  center,
}: {
  width: number;
  slices: readonly { value: number; color: string }[];
  center?: ReactNode;
}) {
  const { colors } = useTheme();
  const radius = Math.max(50, Math.min(90, Math.floor(width / 2) - 10));
  return (
    <View style={styles.donut}>
      <PieChart
        data={slices.map((s) => ({ value: Math.max(0, s.value), color: s.color }))}
        donut
        radius={radius}
        innerRadius={Math.round(radius * 0.62)}
        innerCircleColor={colors.surface}
        backgroundColor="transparent"
        centerLabelComponent={center ? () => <>{center}</> : undefined}
        isAnimated={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden' },
  donut: { alignItems: 'center', paddingVertical: 4 },
});
