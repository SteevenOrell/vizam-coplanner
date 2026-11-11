import { diffDays, type IsoDate, type MonthKey } from '../domain/dates';

/** Date and month labels with Intl, from ISO strings (never shifted by time zones: noon UTC, formatted in UTC). */
function asDate(iso: IsoDate): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function formatDate(iso: IsoDate, locale: string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : style === 'medium'
        ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
        : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, opts).format(asDate(iso));
}

export function formatMonth(month: MonthKey, locale: string, style: 'long' | 'short' = 'long'): string {
  const s = new Intl.DateTimeFormat(locale, {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(asDate(`${month}-15`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Narrow weekday names starting at `weekStart` (0 = Sunday). */
export function weekdayNames(locale: string, weekStart: number): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  // 2026-11-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => f.format(asDate(`2026-11-0${1 + ((weekStart + i) % 7)}`)));
}

/** "Today", "Yesterday", "Tomorrow", else a short date. `t` is i18next's. */
export function relativeDay(
  iso: IsoDate,
  today: IsoDate,
  locale: string,
  t: (k: 'common.dates.today' | 'common.dates.yesterday' | 'common.dates.tomorrow') => string,
): string {
  const d = diffDays(today, iso);
  if (d === 0) return t('common.dates.today');
  if (d === -1) return t('common.dates.yesterday');
  if (d === 1) return t('common.dates.tomorrow');
  return formatDate(iso, locale, 'short');
}
