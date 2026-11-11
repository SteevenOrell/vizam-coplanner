import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb } from '../../data/hooks';
import { undoImport } from '../../data/repos/import';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog } from '../../ui/Sheet';
import { useSnackbar } from '../../ui/Snackbar';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { importErrorMessage, Notice } from './parts';

export function DoneStep({ batchId, count, onReset }: { batchId: string; count: number; onReset: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const db = useDb();
  const snackbar = useSnackbar();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const undo = async () => {
    setConfirm(false);
    try {
      const n = await undoImport(db, batchId);
      snackbar({ message: t('import.undone', { count: n }) });
      onReset();
    } catch (e) {
      setError(importErrorMessage(t, e));
    }
  };

  return (
    <>
      <Card>
        <View style={styles.center} testID="import-done">
          <View style={[styles.badge, { backgroundColor: colors.positiveSoft }]}>
            <Icon name="check" size={28} color={colors.positive} />
          </View>
          <Text variant="heading" align="center" accessibilityRole="header">
            {t('import.done.title', { count })}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {t('import.done.body')}
          </Text>
        </View>
      </Card>
      {error ? <Notice tone="danger" title={error} /> : null}
      <Button
        label={t('import.done.viewActivity')}
        icon="activity"
        onPress={() => router.push('/activity')}
        testID="import-view-activity"
      />
      <Button label={t('import.done.another')} variant="secondary" onPress={onReset} testID="import-another" />
      <Button
        label={t('import.done.undo')}
        variant="ghost"
        onPress={() => setConfirm(true)}
        testID="import-undo-last"
      />
      <ConfirmDialog
        visible={confirm}
        title={t('import.undoTitle')}
        body={t('import.undoBody', { count })}
        confirmLabel={t('import.undoConfirm')}
        onConfirm={() => void undo()}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
