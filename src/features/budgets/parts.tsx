import { exists, type TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { AsyncState } from '../../data/asyncState';
import { useDatabase } from '../../data/DatabaseProvider';
import { ValidationError } from '../../data/tables';
import { Screen } from '../../ui/Screen';
import { ErrorState, Skeleton } from '../../ui/states';
import type { MonthKey } from '../../domain/dates';
import { addMonthKey } from '../../domain/dates';
import type { BudgetStatus } from '../../domain/budget';
import type { CurrencyCode } from '../../domain/money/currency';
import { usePreferences } from '../../state/preferences';
import { IconButton } from '../../ui/Button';
import { formatMonth } from '../../ui/format';
import { Icon, type IconName } from '../../ui/Icon';
import { useMoneyFormat } from '../../ui/Money';
import { Text, type TextColor } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';

/** Text for a failed save: validation codes map to `errors.<code>`, anything else is the generic message. */
export function errorMessage(t: TFunction, e: unknown): string {
  if (e instanceof ValidationError) {
    const key = `errors.${e.code}`;
    if (exists(key)) return t(key as 'errors.generic');
  }
  return t('errors.generic');
}

/** Short label for a currency in pills and segmented controls ("FCFA" reads better than "XOF" to users). */
export function currencyLabel(c: CurrencyCode): string {
  return c === 'XOF' ? 'FCFA' : c;
}

/** Renders its children only once the database is open (screens call `useDb`, which needs it). */
export function DbGate({ children }: { children: ReactNode }) {
  const database = useDatabase();
  if (database.status === 'ready') return <>{children}</>;
  return <Screen>{database.status === 'error' ? <ErrorState onRetry={database.retry} /> : <Skeleton />}</Screen>;
}

/**
 * Query result for screens that build their own `<Screen>` (forms with a pinned footer): while loading or on error it
 * renders a plain screen with a back button, once data is there it calls `children(data)`.
 */
export function QueryScreen<T>({
  state,
  title,
  children,
}: {
  state: AsyncState<T> & { reload?: () => void };
  title: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'success') return <>{children(state.data)}</>;
  return (
    <Screen title={title} back>
      {state.status === 'loading' ? <Skeleton /> : <ErrorState onRetry={state.reload} />}
    </Screen>
  );
}

/** Previous / next month with the month name in between. */
export function MonthSwitcher({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void }) {
  const { t } = useTranslation();
  const { locale } = usePreferences();
  return (
    <View style={styles.switcher}>
      <IconButton
        icon="chevronLeft"
        tone="soft"
        label={t('budgets.prevMonth')}
        onPress={() => onChange(addMonthKey(month, -1))}
      />
      <Text variant="heading" align="center" style={styles.flex} accessibilityLiveRegion="polite">
        {formatMonth(month, locale)}
      </Text>
      <IconButton
        icon="chevronRight"
        tone="soft"
        label={t('budgets.nextMonth')}
        onPress={() => onChange(addMonthKey(month, 1))}
      />
    </View>
  );
}

/** Inline notice (warning, danger or info) with an icon, so status is never colour only. */
export function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'warning' | 'danger' | 'info';
  icon: IconName;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const bg = tone === 'warning' ? colors.warningSoft : tone === 'danger' ? colors.dangerSoft : colors.accentSoft;
  const fg: TextColor = tone === 'warning' ? 'warningText' : tone === 'danger' ? 'danger' : 'accentText';
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: bg }]}>
      <Icon name={icon} size={20} color={colors[fg]} />
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

/** A label above a value on the hero card. */
export function HeroStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.heroStat}>
      <Text variant="caption" color="heroTextSecondary">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** "$40.00 left" / "Over by $12.00" with an icon. */
export function BudgetStatusText({
  status,
  remainingMinor,
  currency,
}: {
  status: BudgetStatus;
  remainingMinor: number;
  currency: CurrencyCode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fmt = useMoneyFormat();
  const over = remainingMinor < 0;
  const text = over
    ? t('budgets.over', { amount: fmt(-remainingMinor, currency) })
    : status === 'near'
      ? t('budgets.leftNear', { amount: fmt(remainingMinor, currency) })
      : t('budgets.left', { amount: fmt(remainingMinor, currency) });
  const color: TextColor = status === 'over' ? 'danger' : status === 'near' ? 'warningText' : 'textSecondary';
  const icon: IconName = status === 'ok' ? 'check' : 'alert';
  return (
    <View style={styles.status}>
      <Icon name={icon} size={16} color={status === 'ok' ? colors.positive : colors[color]} />
      <Text variant="label" color={color} style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

/** Small pill with an icon and text (Reached, Overdue, Subscription …). */
export function Badge({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: 'positive' | 'warning' | 'danger' | 'info';
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const bg = {
    positive: colors.positiveSoft,
    warning: colors.warningSoft,
    danger: colors.dangerSoft,
    info: colors.accentSoft,
  }[tone];
  const fg: TextColor = { positive: 'positive', warning: 'warningText', danger: 'danger', info: 'accentText' }[
    tone
  ] as TextColor;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={14} color={colors[fg]} /> : null}
      <Text variant="label" color={fg}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  switcher: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderRadius: radii.md, padding: space.md },
  heroStat: { flexGrow: 1, flexBasis: 96, gap: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
});
