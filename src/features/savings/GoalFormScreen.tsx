import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import { createGoal, getGoal, updateGoal } from '../../data/repos/planning';
import type { IsoDate } from '../../domain/dates';
import type { SavingsGoal } from '../../domain/models';
import type { CurrencyCode } from '../../domain/money/currency';
import { amountToInput, parseAmount } from '../../domain/money/format';
import { usePreferences, useToday } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { CurrencySelect } from '../../ui/CurrencySelect';
import { AmountField, amountErrorKey, FieldShell, SelectField, TextField } from '../../ui/Field';
import { formatDate } from '../../ui/format';
import { Icon, PICKABLE_ICONS } from '../../ui/Icon';
import { DatePickerSheet } from '../../ui/MonthGrid';
import { Screen } from '../../ui/Screen';
import { useSnackbar } from '../../ui/Snackbar';
import { Text } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { currencyLabel, errorMessage, QueryScreen } from '../budgets/parts';

/** Creates a goal (`/goal/new`) or edits one (`/goal/edit/[id]`). */
export function GoalFormScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const today = useToday();
  const state = useDbQuery(async (db) => (id ? await getGoal(db, id, today) : undefined), [id, today]);
  return (
    <QueryScreen state={state} title={id ? t('savings.form.editTitle') : t('savings.form.newTitle')}>
      {(data) => (
        <GoalForm
          goal={data?.goal ?? null}
          locked={(data?.contributions.length ?? 0) > 0}
          missing={!!id && !data}
          today={today}
        />
      )}
    </QueryScreen>
  );
}

function GoalForm({
  goal,
  locked,
  missing,
  today,
}: {
  goal: SavingsGoal | null;
  locked: boolean;
  missing: boolean;
  today: IsoDate;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { prefs, locale } = usePreferences();
  const db = useDb();
  const snack = useSnackbar();
  const [name, setName] = useState(goal?.name ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(goal?.currency ?? prefs.primaryCurrency);
  const [target, setTarget] = useState(goal ? amountToInput(goal.targetMinor, goal.currency) : '');
  const [targetDate, setTargetDate] = useState<IsoDate | null>(goal?.targetDate ?? null);
  const [icon, setIcon] = useState(goal?.icon ?? 'piggy');
  const [color, setColor] = useState(goal?.color ?? colors.chart[0]!);
  const [pickDate, setPickDate] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; target?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  if (missing) {
    return (
      <Screen title={t('savings.form.editTitle')} back>
        <Text variant="body" color="danger">
          {t('errors.notFound')}
        </Text>
      </Screen>
    );
  }

  const save = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t('errors.name');
    const parsed = parseAmount(target, currency);
    const key = amountErrorKey(parsed);
    if (key || !parsed.ok) next.target = t((key ?? 'errors.amount') as 'errors.amount');
    setErrors(next);
    if (next.name || next.target || !parsed.ok) return;
    setSaving(true);
    try {
      const input = { name, targetMinor: parsed.amountMinor, currency, targetDate, icon, color };
      if (goal) await updateGoal(db, goal.id, input);
      else await createGoal(db, input);
      snack({ message: t('savings.form.saved') });
      router.back();
    } catch (e) {
      setErrors({ form: errorMessage(t, e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={goal ? t('savings.form.editTitle') : t('savings.form.newTitle')}
      back
      footer={
        <View style={styles.footer}>
          {errors.form ? (
            <Text variant="label" color="danger" accessibilityLiveRegion="polite">
              {errors.form}
            </Text>
          ) : null}
          <Button label={t('common.actions.save')} onPress={() => void save()} loading={saving} testID="goal-save" />
        </View>
      }
    >
      <TextField
        testID="goal-name"
        label={t('savings.form.name')}
        value={name}
        onChangeText={setName}
        maxLength={60}
        placeholder={t('savings.form.namePlaceholder')}
        error={errors.name}
      />
      <AmountField
        testID="goal-target"
        label={t('savings.form.target')}
        value={target}
        onChangeText={setTarget}
        currency={currency}
        error={errors.target}
      />
      {locked ? (
        <Text variant="caption" color="textMuted">
          {t('savings.form.currencyLocked', { currency: currencyLabel(currency) })}
        </Text>
      ) : (
        <FieldShell label={t('savings.form.currency')}>
          <CurrencySelect testID="goal-currency" value={currency} onChange={setCurrency} />
        </FieldShell>
      )}
      <SelectField
        label={t('savings.form.targetDate')}
        value={targetDate ? formatDate(targetDate, locale, 'medium') : null}
        placeholder={t('savings.form.noDate')}
        icon="calendar"
        onPress={() => setPickDate(true)}
      />
      {targetDate ? (
        <Button label={t('savings.form.clearDate')} variant="ghost" size="sm" onPress={() => setTargetDate(null)} />
      ) : null}

      <FieldShell label={t('savings.form.icon')}>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {PICKABLE_ICONS.map((name_) => {
            const selected = name_ === icon;
            return (
              <Pressable
                key={name_}
                onPress={() => setIcon(name_)}
                accessibilityRole="radio"
                accessibilityLabel={t(`savings.form.icons.${name_}` as 'savings.form.icons.tag')}
                accessibilityState={{ checked: selected }}
                style={[
                  styles.iconCell,
                  {
                    backgroundColor: selected ? colors.accentSoft : colors.surfaceAlt,
                    borderColor: selected ? colors.accent : 'transparent',
                  },
                ]}
              >
                <Icon name={name_} size={22} color={selected ? colors.accentText : colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      </FieldShell>

      <FieldShell label={t('savings.form.color')}>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {colors.chart.map((c, i) => {
            const selected = c.toLowerCase() === color.toLowerCase();
            return (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityLabel={t('savings.form.colorN', { n: i + 1 })}
                accessibilityState={{ checked: selected }}
                style={[styles.swatchWrap, { borderColor: selected ? colors.text : 'transparent' }]}
              >
                <View style={[styles.swatch, { backgroundColor: c }]}>
                  {selected ? <Icon name="check" size={20} color={colors.onAccent} strokeWidth={2.5} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </FieldShell>

      <DatePickerSheet
        visible={pickDate}
        onClose={() => setPickDate(false)}
        title={t('savings.form.targetDate')}
        value={targetDate ?? today}
        today={today}
        onChange={setTargetDate}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  iconCell: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
