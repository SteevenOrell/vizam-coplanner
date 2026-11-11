import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Display name lives here and in src/i18n/locales/{en,fr}/common.json (`appName`). */
const APP_NAME = 'CoPlanner';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: 'coplanner',
  scheme: 'coplanner',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0C1A46',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.vizam.coplanner',
  },
  android: {
    package: 'com.vizam.coplanner',
    adaptiveIcon: {
      backgroundColor: '#111C3A',
      foregroundImage: './assets/android-icon-foreground.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    output: 'single',
    name: APP_NAME,
    themeColor: '#111C3A',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F4F7FD',
        image: './assets/splash-icon-navy.png',
        imageWidth: 200,
        resizeMode: 'contain',
        dark: { backgroundColor: '#0B1640', image: './assets/splash-icon.png' },
      },
    ],
    'expo-sqlite',
    'expo-font',
    'expo-localization',
    // Local reminders only (bills, budgets); no remote push.
    ['expo-notifications', { color: '#3778F6', enableRemoteNotifications: false }],
  ],
  experiments: {
    typedRoutes: true,
  },
});
