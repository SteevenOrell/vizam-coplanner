import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './Button';
import { SkyBackground } from './SkyBackground';
import { Text } from './Text';
import { CONTENT_MAX_WIDTH, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/**
 * Standard screen: safe-area aware header (optional back button, title, right actions) and a scrolling content
 * column capped at CONTENT_MAX_WIDTH and centred on wide screens. `footer` stays pinned (form save buttons).
 */
export function Screen({
  title,
  back = false,
  right,
  children,
  footer,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
  header,
  testID,
}: {
  title?: string;
  /** Show a back button (falls back to Home when there is no history, e.g. a deep link). */
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  /** Replaces the default header entirely. */
  header?: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const head =
    header ??
    (title || back || right ? (
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerInner}>
          {back ? (
            <IconButton icon="chevronLeft" label={t('common.actions.back')} onPress={goBack} tone="soft" />
          ) : null}
          <Text variant="heading" accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title ?? ''}
          </Text>
          <View style={styles.right}>{right}</View>
        </View>
      </View>
    ) : (
      <View style={{ height: insets.top }} />
    ));

  const body = (
    <View style={[styles.column, contentStyle]}>
      {children}
      {!footer ? <View style={{ height: insets.bottom + space.xxl }} /> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      testID={testID}
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SkyBackground />
      {head}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.scrollContent]}>{body}</View>
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + space.md, backgroundColor: colors.bg, borderTopColor: colors.border },
          ]}
        >
          <View style={styles.column}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** Section heading with an optional "See all" style action on the right. */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header" style={styles.flex}>
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm, alignItems: 'center' },
  headerInner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
  },
  title: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  scrollContent: { paddingHorizontal: space.lg, alignItems: 'center' },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, gap: space.lg, paddingTop: space.sm },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  section: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
});
