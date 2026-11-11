import { exists, type TFunction } from 'i18next';

import { ValidationError } from '../../data/tables';
import type { CurrencyCode } from '../../domain/money/currency';

/** Short currency name for pills and headings. */
export function currencyLabel(currency: CurrencyCode): string {
  return currency === 'XOF' ? 'FCFA' : currency;
}

/** Maps a repo `ValidationError.code` (or anything else) to a translated message. Never leaks raw errors. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ValidationError) {
    const key = `errors.${error.code}`;
    if (exists(key)) return t(key as 'errors.generic');
  }
  return t('errors.generic');
}
