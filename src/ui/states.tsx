import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { AsyncState } from '../data/asyncState';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/** Static placeholder blocks while local data loads (SQLite reads are fast; no shimmer needed). */
export function Skeleton({ lines = 3, height = 56 }: { lines?: number; height?: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('common.states.loading')} style={styles.skeleton}>
      {Array.from({ length: lines }, (_, i) => (
        <View key={i} style={[styles.block, { height, backgroundColor: colors.surfaceAlt }]} />
      ))}
    </View>
  );
}

export function EmptyState({
  icon = 'sparkle',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
        <Icon name={icon} size={28} color={colors.accentText} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textSecondary" align="center">
          {body}
        </Text>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" size="sm" /> : null}
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="alert"
      title={t('common.states.errorTitle')}
      body={t('common.states.errorBody')}
      action={onRetry ? { label: t('common.actions.retry'), onPress: onRetry } : undefined}
    />
  );
}

/** Renders loading / error / data for a useDbQuery result. */
export function QueryView<T>({
  state,
  children,
  skeleton,
}: {
  state: AsyncState<T> & { reload?: () => void };
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
}) {
  if (state.status === 'loading') return <>{skeleton ?? <Skeleton />}</>;
  if (state.status === 'error') return <ErrorState onRetry={state.reload} />;
  return <>{children(state.data)}</>;
}

const styles = StyleSheet.create({
  skeleton: { gap: space.sm },
  block: { borderRadius: radii.md },
  center: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
