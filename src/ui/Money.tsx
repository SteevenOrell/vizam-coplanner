import { useTranslation } from 'react-i18next';
import { StyleSheet, Text as RNText, type TextStyle } from 'react-native';

import type { CurrencyCode } from '../domain/money/currency';
import { formatMoney } from '../domain/money/format';
import { usePreferences } from '../state/preferences';
import { Text, type TextColor } from './Text';
import { type as typeScale, type TypeVariant } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/** Formats with the user's locale. */
export function useMoneyFormat() {
  const { locale } = usePreferences();
  return (
    amountMinor: number,
    currency: CurrencyCode,
    opts: { signed?: boolean; compact?: boolean; hideCurrency?: boolean } = {},
  ) => formatMoney(amountMinor, currency, { locale, ...opts });
}

/**
 * An amount in its own currency. `kind` colours income green and prefixes the sign; `display` renders the decimals
 * lighter (balances). Honors "hide amounts" from settings when `sensitive` is set (balances, not list rows).
 */
export function Money({
  amountMinor,
  currency,
  variant = 'amount',
  color,
  kind,
  sensitive = false,
  lightDecimals = false,
  align,
  testID,
}: {
  amountMinor: number;
  currency: CurrencyCode;
  variant?: TypeVariant;
  color?: TextColor;
  kind?: 'income' | 'expense';
  sensitive?: boolean;
  lightDecimals?: boolean;
  align?: TextStyle['textAlign'];
  testID?: string;
}) {
  const { prefs, locale } = usePreferences();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const signedValue = kind === 'expense' ? -Math.abs(amountMinor) : amountMinor;
  const text = formatMoney(signedValue, currency, { locale, signed: kind !== undefined });
  const resolvedColor: TextColor = color ?? (kind === 'income' ? 'positive' : 'text');

  if (sensitive && prefs.hideBalances) {
    return (
      <Text
        variant={variant}
        color={resolvedColor}
        align={align}
        accessibilityLabel={t('common.a11y.hidden')}
        testID={testID}
      >
        ••••••
      </Text>
    );
  }

  if (lightDecimals) {
    // Split at the last decimal separator in the formatted string ("1,234.56 $" / "1 234,56 $").
    const m = /^(.*\d)([.,]\d+)(\D*)$/.exec(text);
    if (m) {
      return (
        <Text variant={variant} color={resolvedColor} align={align} accessibilityLabel={text} testID={testID}>
          {m[1]}
          <RNText style={[typeScale[variant] as TextStyle, styles.decimals, { color: colors[resolvedColor] }]}>
            {m[2]}
          </RNText>
          {m[3]}
        </Text>
      );
    }
  }
  return (
    <Text variant={variant} color={resolvedColor} align={align} testID={testID}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({ decimals: { opacity: 0.55 } });
