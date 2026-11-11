import i18n, { changeLanguage, use as registerPlugin } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en_common from './locales/en/common.json';
import en_errors from './locales/en/errors.json';
import en_onboarding from './locales/en/onboarding.json';
import en_auth from './locales/en/auth.json';
import en_dashboard from './locales/en/dashboard.json';
import en_transactions from './locales/en/transactions.json';
import en_budgets from './locales/en/budgets.json';
import en_savings from './locales/en/savings.json';
import en_bills from './locales/en/bills.json';
import en_calendar from './locales/en/calendar.json';
import en_reports from './locales/en/reports.json';
import en_notifications from './locales/en/notifications.json';
import en_settings from './locales/en/settings.json';
import fr_common from './locales/fr/common.json';
import fr_errors from './locales/fr/errors.json';
import fr_onboarding from './locales/fr/onboarding.json';
import fr_auth from './locales/fr/auth.json';
import fr_dashboard from './locales/fr/dashboard.json';
import fr_transactions from './locales/fr/transactions.json';
import fr_budgets from './locales/fr/budgets.json';
import fr_savings from './locales/fr/savings.json';
import fr_bills from './locales/fr/bills.json';
import fr_calendar from './locales/fr/calendar.json';
import fr_reports from './locales/fr/reports.json';
import fr_notifications from './locales/fr/notifications.json';
import fr_settings from './locales/fr/settings.json';

/**
 * One namespace ("translation") split into files per feature so parallel work never edits the same JSON:
 * `t('common.actions.save')`, `t('budgets.title')`. English is the source of truth for key types; the parity test
 * (__tests__/parity.test.ts) keeps French in step.
 */
const en = {
  common: en_common,
  errors: en_errors,
  onboarding: en_onboarding,
  auth: en_auth,
  dashboard: en_dashboard,
  transactions: en_transactions,
  budgets: en_budgets,
  savings: en_savings,
  bills: en_bills,
  calendar: en_calendar,
  reports: en_reports,
  notifications: en_notifications,
  settings: en_settings,
};
const fr = {
  common: fr_common,
  errors: fr_errors,
  onboarding: fr_onboarding,
  auth: fr_auth,
  dashboard: fr_dashboard,
  transactions: fr_transactions,
  budgets: fr_budgets,
  savings: fr_savings,
  bills: fr_bills,
  calendar: fr_calendar,
  reports: fr_reports,
  notifications: fr_notifications,
  settings: fr_settings,
};

export const resources = { en: { translation: en }, fr: { translation: fr } } as const;
export type Language = keyof typeof resources;
export const LANGUAGES: readonly Language[] = ['en', 'fr'];

/** BCP 47 locale for Intl formatting (money, dates): Canadian English / French. */
export function formatLocale(language: Language): string {
  return language === 'fr' ? 'fr-CA' : 'en-CA';
}

let initialised = false;

export function initI18n(language: Language = 'en') {
  if (!initialised) {
    initialised = true;
    void registerPlugin(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: 'en',
      supportedLngs: LANGUAGES as Language[],
      interpolation: { escapeValue: false },
      returnNull: false,
      initAsync: false,
    });
  } else if (i18n.language !== language) {
    void changeLanguage(language);
  }
  return i18n;
}

export default i18n;
