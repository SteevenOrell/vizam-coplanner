import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { CURRENCY_CODES, currencyLabel, type CurrencyCode } from '../domain/money/currency';
import { usePreferences } from '../state/preferences';
import { Icon } from './Icon';
import { SelectSheet } from './Sheet';
import { Text } from './Text';
import { radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/** Primary currency first, then CAD/XOF (the app's home pair), then the rest in list order. */
export function orderedCurrencies(primary: CurrencyCode): CurrencyCode[] {
  const head = [primary, 'CAD', 'XOF'].filter((c, i, a) => a.indexOf(c) === i) as CurrencyCode[];
  return [...head, ...CURRENCY_CODES.filter((c) => !head.includes(c))];
}

/**
 * Currency picker for forms: a compact box showing the code and full name, opening a sheet with every supported
 * currency. Replaces two-option toggles now that more currencies exist.
 */
export function CurrencySelect({
  value,
  onChange,
  testID,
  disabled = false,
}: {
  value: CurrencyCode;
  onChange: (c: CurrencyCode) => void;
  testID?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefs } = usePreferences();
  const [open, setOpen] = useState(false);
  const name = t(`common.currency.${value}`);
  return (
    <>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('common.currency.pick')}: ${name}`}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.box,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={[styles.code, { backgroundColor: colors.accentSoft }]}>
          <Text variant="label" color="accentText">
            {currencyLabel(value)}
          </Text>
        </View>
        <Text variant="body" style={styles.flex} numberOfLines={1}>
          {name}
        </Text>
        {disabled ? null : <Icon name="chevronDown" size={18} color={colors.textMuted} />}
      </Pressable>
      <SelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('common.currency.pick')}
        value={value}
        onSelect={onChange}
        options={orderedCurrencies(prefs.primaryCurrency).map((c) => ({
          value: c,
          label: t(`common.currency.${c}`),
          subtitle: currencyLabel(c),
        }))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: space.md,
    minHeight: 52,
  },
  code: { borderRadius: radii.pill, paddingHorizontal: space.md, minHeight: 30, justifyContent: 'center' },
});
