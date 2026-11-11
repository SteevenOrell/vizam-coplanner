import { PlusJakartaSans_300Light } from '@expo-google-fonts/plus-jakarta-sans/300Light';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider, useDatabase } from '../data/DatabaseProvider';
import { useNotificationMaintenance } from '../features/notifications/maintenance';
import i18n, { initI18n } from '../i18n';
import { PreferencesProvider, usePreferences } from '../state/preferences';
import { SessionProvider, useSession } from '../state/session';
import { AppSplash } from '../ui/AppSplash';
import { SnackbarProvider } from '../ui/Snackbar';
import { ErrorState } from '../ui/states';
import { ThemeProvider, useTheme } from '../ui/theme/ThemeProvider';
import { installWebLayoutRules } from '../ui/webLayout';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
initI18n();
installWebLayoutRules();

function Maintenance() {
  useNotificationMaintenance();
  return null;
}

/** Minimum time the in-app splash stays up, so it reads as a brand moment rather than a flash. */
const MIN_SPLASH_MS = 1200;

/** Dev web only: `?holdSplash=1` keeps the splash on screen (screenshots). */
function holdSplash(): boolean {
  if (!__DEV__ || typeof window === 'undefined' || typeof window.location?.search !== 'string') return false;
  return new URLSearchParams(window.location.search).get('holdSplash') === '1';
}

function AppShell() {
  const theme = useTheme();
  const database = useDatabase();
  const { ready } = usePreferences();
  const { mode } = useSession();
  const booting = database.status === 'opening' || !ready || mode === 'loading';
  const [minElapsed, setMinElapsed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const onSplashHidden = useCallback(() => setSplashGone(true), []);

  useEffect(() => {
    // The in-app splash is on screen now: hand over from the native one.
    void SplashScreen.hideAsync().catch(() => undefined);
    const timer = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  const showApp = !booting && database.status === 'ready';
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      {database.status === 'error' ? (
        <View style={styles.center}>
          <ErrorState onRetry={database.retry} />
        </View>
      ) : showApp ? (
        <SnackbarProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="auth" />
            <Stack.Screen name="transaction/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="transaction/edit/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="goal/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="goal/edit/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="bill/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="bill/edit/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="account/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="account/edit/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="budget/edit" options={{ presentation: 'modal' }} />
          </Stack>
          {mode === 'demo' || mode === 'cloud' ? <Maintenance /> : null}
        </SnackbarProvider>
      ) : null}
      {splashGone || database.status === 'error' ? null : (
        <AppSplash visible={!showApp || !minElapsed || holdSplash()} onHidden={onSplashHidden} />
      )}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_300Light,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  // A font failure must not block the app: system fonts are an acceptable fallback.
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <DatabaseProvider>
            <PreferencesProvider>
              <ThemeProvider>
                <SessionProvider>
                  <AppShell />
                </SessionProvider>
              </ThemeProvider>
            </PreferencesProvider>
          </DatabaseProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
