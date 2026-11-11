import type { TFunction } from 'i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { ImportRowError } from '../../data/repos/import';
import { ImportLimitError } from '../../domain/import/types';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { errorMessage } from '../transactions/helpers';

/** A translated, non-technical message for anything the import can throw. Never shows raw error text. */
export function importErrorMessage(t: TFunction, e: unknown): string {
  if (e instanceof ImportLimitError) {
    if (e.code === 'tooLarge') return t('import.errors.tooLarge');
    if (e.code === 'tooManyRows') return t('import.errors.tooManyRows');
    return t('import.errors.noRows');
  }
  if (e instanceof ImportRowError) return t('import.errors.row', { n: e.index + 1, message: errorMessage(t, e) });
  return errorMessage(t, e);
}

export function SwitchRow({
  label,
  help,
  value,
  onChange,
  testID,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{label}</Text>
        {help ? (
          <Text variant="caption" color="textSecondary">
            {help}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.accent, false: colors.border }}
      />
    </View>
  );
}

export function Notice({
  tone,
  title,
  body,
  testID,
}: {
  tone: 'danger' | 'warning' | 'info';
  title: string;
  body?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const bg = tone === 'danger' ? colors.dangerSoft : tone === 'warning' ? colors.warningSoft : colors.accentSoft;
  const color = tone === 'danger' ? 'danger' : tone === 'warning' ? 'warningText' : 'accentText';
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'info' ? undefined : 'alert'}
      style={[styles.notice, { backgroundColor: bg }]}
    >
      <Icon name={tone === 'info' ? 'info' : 'alert'} size={20} color={colors[color]} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" color={color}>
          {title}
        </Text>
        {body ? (
          <Text variant="caption" color="textSecondary">
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  notice: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radii.md, alignItems: 'flex-start' },
});
