import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from './Button';
import { Icon, type IconName } from './Icon';
import { CategoryBadge } from './ListRow';
import { Text } from './Text';
import { CONTENT_MAX_WIDTH, radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

/**
 * Bottom sheet (modal). Backdrop and panel are siblings (a pressable inside a pressable is invalid HTML on web).
 * Closes on backdrop tap, the close button and Android back.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.close')}
        />
        <View
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.lg }]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={styles.head}>
            <Text variant="heading" accessibilityRole="header" style={styles.flex}>
              {title}
            </Text>
            <IconButton icon="close" label={t('common.actions.close')} onPress={onClose} tone="soft" size={40} />
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  subtitle?: string;
  icon?: IconName | string;
  color?: string;
}

/** Single-choice list in a sheet (accounts, categories, currencies …). */
export function SelectSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onSelect,
  emptyLabel,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly SelectOption<T>[];
  value: T | null;
  onSelect: (value: T) => void;
  emptyLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.length === 0 && emptyLabel ? (
        <Text variant="body" color="textSecondary">
          {emptyLabel}
        </Text>
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              onSelect(o.value);
              onClose();
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => [
              styles.option,
              { backgroundColor: selected ? colors.accentSoft : pressed ? colors.surfaceAlt : 'transparent' },
            ]}
          >
            {o.icon ? <CategoryBadge icon={o.icon} color={o.color ?? colors.accent} size={36} /> : null}
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {o.label}
              </Text>
              {o.subtitle ? (
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {o.subtitle}
                </Text>
              ) : null}
            </View>
            {selected ? <Icon name="check" size={20} color={colors.accentText} /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  destructive = true,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.center}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.cancel')}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[styles.dialog, { backgroundColor: colors.surface }]}
        >
          <Text variant="heading">{title}</Text>
          {body ? (
            <Text variant="body" color="textSecondary">
              {body}
            </Text>
          ) : null}
          <View style={styles.dialogActions}>
            <Button label={t('common.actions.cancel')} onPress={onCancel} variant="ghost" size="sm" />
            <Button label={confirmLabel} onPress={onConfirm} variant={destructive ? 'danger' : 'primary'} size="sm" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  panel: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    maxHeight: '88%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: space.sm,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: space.lg, gap: space.xs, paddingBottom: space.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.sm,
    borderRadius: radii.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 420, borderRadius: radii.xl, padding: space.xl, gap: space.md },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
});
