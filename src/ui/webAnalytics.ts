import { inject } from '@vercel/analytics';
import { Platform } from 'react-native';

/**
 * Vercel Web Analytics for the web export only (cookieless page views; no custom events, no personal data).
 * It loads `/_vercel/insights/script.js`, which only exists on the Vercel deployment.
 */
export function installWebAnalytics(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  inject({ mode: __DEV__ ? 'development' : 'production' });
}
