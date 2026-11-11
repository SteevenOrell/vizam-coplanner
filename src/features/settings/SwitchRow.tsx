import { StyleSheet, Switch, View } from 'react-native';

import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';

/** Label (+ optional help) with a switch on the right. The switch carries the label for screen readers. */
export function SwitchRow({
  label,
  help,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  help?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
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
        onValueChange={onValueChange}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={colors.onAccent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
});
