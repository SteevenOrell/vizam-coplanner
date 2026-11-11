import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { CONTENT_MAX_WIDTH, radii, space } from './theme/tokens';
import { useTheme } from './theme/ThemeProvider';

interface SnackbarMessage {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const SnackbarContext = createContext<(msg: SnackbarMessage) => void>(() => undefined);

/** App-wide snackbar (save confirmations, "Deleted · Undo"). Shown for 5 s above the tab bar. */
export function SnackbarProvider({ children, bottomOffset = 96 }: { children: ReactNode; bottomOffset?: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<SnackbarMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((msg: SnackbarMessage) => {
    clearTimeout(timer.current);
    setCurrent(msg);
    AccessibilityInfo.announceForAccessibility?.(msg.message);
    timer.current = setTimeout(() => setCurrent(null), 5000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const value = useMemo(() => show, [show]);
  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {current ? (
        <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + bottomOffset }]}>
          <View
            style={[styles.bar, { backgroundColor: colors.navy === colors.bg ? colors.surfaceRaised : colors.navy }]}
          >
            <Text variant="label" style={styles.flex} color="heroText">
              {current.message}
            </Text>
            {current.actionLabel && current.onAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  current.onAction?.();
                  setCurrent(null);
                }}
                style={styles.action}
              >
                <Text variant="bodyStrong" color="heroTextSecondary">
                  {current.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  return useContext(SnackbarContext);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radii.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  action: { minHeight: 32, justifyContent: 'center' },
});
