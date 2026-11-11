import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { currencyLabel, type CurrencyCode } from '../domain/money/currency';
import { formatMoney, minorToDecimalString, parseAmount, type ParseResult } from '../domain/money/format';
import { usePreferences } from '../state/preferences';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { fonts, radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/** The box border shows focus; the browser's own outline on the inner input is removed on web. */
const noOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

/** Label + control + error/help line. Use for every form row. */
export function FieldShell({
  label,
  error,
  help,
  children,
}: {
  label: string;
  error?: string | null;
  help?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={styles.shell}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      {children}
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : help ? (
        <Text variant="caption" color="textMuted">
          {help}
        </Text>
      ) : null}
    </View>
  );
}

export function TextField({
  label,
  error,
  help,
  icon,
  ...input
}: TextInputProps & { label: string; error?: string | null; help?: string | null; icon?: IconName }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <FieldShell label={label} error={error} help={help}>
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: error ? colors.danger : focused ? colors.focus : colors.border,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={20} color={colors.textMuted} /> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[
            styles.input,
            noOutline,
            { color: colors.text },
            input.multiline ? styles.multiline : null,
            input.style,
          ]}
        />
      </View>
    </FieldShell>
  );
}

export function amountErrorKey(result: ParseResult): string | null {
  if (result.ok) return result.amountMinor === 0 ? 'errors.amount' : null;
  return {
    empty: 'errors.amount',
    invalid: 'errors.amountInvalid',
    precision: 'errors.amountPrecision',
    range: 'errors.amountRange',
  }[result.error];
}

/**
 * Amount input in a currency: big digits, a currency pill, and a live preview of how the amount was understood
 * ("= $1,234.50"), so "1.234" vs "1,234" is never ambiguous. The parent keeps the raw text; use `parseAmount`
 * (or the `onAmount` callback) to get integer minor units.
 */
export function AmountField({
  label,
  value,
  onChangeText,
  currency,
  onCurrencyPress,
  error,
  testID,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  currency: CurrencyCode;
  /** When set, the currency pill is a button (e.g. to switch account / currency). */
  onCurrencyPress?: () => void;
  error?: string | null;
  testID?: string;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const parsed = parseAmount(value, currency);
  const preview = parsed.ok && value.trim() ? `= ${formatMoney(parsed.amountMinor, currency, { locale })}` : null;
  return (
    <FieldShell label={label} error={error} help={preview}>
      <View
        style={[
          styles.amountBox,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: error ? colors.danger : focused ? colors.focus : colors.border,
          },
        ]}
      >
        <TextInput
          testID={testID}
          accessibilityLabel={`${label} (${currency})`}
          value={value}
          onChangeText={(s) => onChangeText(s.replace(/[^0-9.,\s]/g, ''))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder={minorToDecimalString(0, currency)}
          placeholderTextColor={colors.textMuted}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.amountInput, noOutline, { color: colors.text }]}
        />
        <Pressable
          onPress={onCurrencyPress}
          disabled={!onCurrencyPress}
          accessibilityRole={onCurrencyPress ? 'button' : 'text'}
          accessibilityLabel={t(`common.currency.${currency}`)}
          style={[styles.pill, { backgroundColor: colors.accentSoft }]}
        >
          <Text variant="label" color="accentText">
            {currencyLabel(currency)}
          </Text>
          {onCurrencyPress ? <Icon name="chevronDown" size={14} color={colors.accentText} /> : null}
        </Pressable>
      </View>
    </FieldShell>
  );
}

/** A tappable row that opens a picker (account, category, date …). */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  icon,
  error,
  testID,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  onPress: () => void;
  icon?: IconName;
  error?: string | null;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <FieldShell label={label} error={error}>
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder ?? ''}`}
        style={({ pressed }) => [
          styles.box,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: error ? colors.danger : colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={20} color={colors.textMuted} /> : null}
        <Text variant="body" color={value ? 'text' : 'textMuted'} style={styles.flex} numberOfLines={1}>
          {value ?? placeholder ?? ''}
        </Text>
        <Icon name="chevronDown" size={18} color={colors.textMuted} />
      </Pressable>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shell: { gap: space.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: space.md,
    minHeight: 50,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, paddingVertical: space.md, minWidth: 0 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    minHeight: 72,
    gap: space.sm,
  },
  amountInput: { flex: 1, fontFamily: fonts.light, fontSize: 34, paddingVertical: space.sm, minWidth: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: space.md,
    minHeight: 36,
  },
});
