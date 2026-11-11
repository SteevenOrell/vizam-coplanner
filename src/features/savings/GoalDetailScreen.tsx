import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import {
  addContribution,
  deleteContribution,
  deleteGoal,
  getGoal,
  updateGoal,
  type GoalWithProgress,
} from '../../data/repos/planning';
import { monthOf, type IsoDate } from '../../domain/dates';
import type { SavingsContribution } from '../../domain/models';
import { parseAmount } from '../../domain/money/format';
import { usePreferences, useToday } from '../../state/preferences';
import { Button, IconButton } from '../../ui/Button';
import { Card, HeroCard } from '../../ui/Card';
import { AmountField, amountErrorKey, SelectField, TextField } from '../../ui/Field';
import { formatDate } from '../../ui/format';
import { Icon } from '../../ui/Icon';
import { CategoryBadge, Divider, ListRow } from '../../ui/ListRow';
import { Money, useMoneyFormat } from '../../ui/Money';
import { ProgressRing } from '../../ui/Progress';
import { Screen, SectionHeader } from '../../ui/Screen';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { useSnackbar } from '../../ui/Snackbar';
import { MonthGrid } from '../../ui/MonthGrid';
import { EmptyState, QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { Badge, Banner, errorMessage, HeroStat } from '../budgets/parts';
import { ChartFrame, TrendLine } from '../reports/charts';

export function GoalDetailScreen() {
  const { t } = useTranslation();
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const today = useToday();
  const state = useDbQuery((db) => getGoal(db, id, today), [id, today]);
  return (
    <Screen title={t('savings.detail.title')} back>
      <QueryView state={state}>
        {(data) =>
          data ? (
            <Detail goal={data.goal} contributions={data.contributions} today={today} />
          ) : (
            <EmptyState icon="goal" title={t('errors.notFound')} />
          )
        }
      </QueryView>
    </Screen>
  );
}

function Detail({
  goal,
  contributions,
  today,
}: {
  goal: GoalWithProgress;
  contributions: SavingsContribution[];
  today: IsoDate;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const fmt = useMoneyFormat();
  const db = useDb();
  const snack = useSnackbar();
  const [sheet, setSheet] = useState<'add' | 'withdraw' | null>(null);
  const [confirmGoal, setConfirmGoal] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = goal.progress;
  const currency = goal.currency;

  const asc = [...contributions].sort((a, b) =>
    a.contributedOn === b.contributedOn
      ? a.createdAt.localeCompare(b.createdAt)
      : a.contributedOn < b.contributedOn
        ? -1
        : 1,
  );
  const points = asc.map((c, i) => ({
    label: formatDate(c.contributedOn, locale, 'short'),
    value: asc.slice(0, i + 1).reduce((sum, x) => sum + x.amountMinor, 0),
  }));

  const toggleArchive = async () => {
    try {
      await updateGoal(db, goal.id, {
        name: goal.name,
        targetMinor: goal.targetMinor,
        currency: goal.currency,
        targetDate: goal.targetDate,
        icon: goal.icon,
        color: goal.color,
        archived: !goal.archived,
      });
      snack({ message: goal.archived ? t('savings.detail.unarchived') : t('savings.detail.archivedMsg') });
    } catch (e) {
      setError(errorMessage(t, e));
    }
  };

  const removeGoal = async () => {
    setConfirmGoal(false);
    try {
      await deleteGoal(db, goal.id);
      snack({ message: t('savings.detail.deleted') });
      router.back();
    } catch (e) {
      setError(errorMessage(t, e));
    }
  };

  const removeContribution = async () => {
    const id = removeId;
    setRemoveId(null);
    if (!id) return;
    try {
      await deleteContribution(db, id);
      setError(null);
    } catch (e) {
      setError(errorMessage(t, e));
    }
  };

  return (
    <>
      <HeroCard>
        <View style={styles.heroTop}>
          <View style={[styles.ringBox, { backgroundColor: colors.surface }]}>
            <ProgressRing ratio={p.ratio} size={92} stroke={9} color={goal.color} />
            <View style={styles.ringCenter} pointerEvents="none">
              <Text
                variant="heading"
                accessibilityLabel={t('common.a11y.progress', { percent: Math.round(p.ratio * 100) })}
              >
                {Math.round(p.ratio * 100)}%
              </Text>
            </View>
          </View>
          <View style={styles.flex}>
            <View style={styles.nameRow}>
              <Icon name={goal.icon} size={20} color={colors.heroText} />
              <Text variant="heading" color="heroText" numberOfLines={2} style={styles.flex}>
                {goal.name}
              </Text>
            </View>
            <Money
              amountMinor={p.savedMinor}
              currency={currency}
              variant="title"
              color="heroText"
              lightDecimals
              sensitive
            />
            <Text variant="caption" color="heroTextSecondary">
              {t('savings.ofTarget', { amount: fmt(goal.targetMinor, currency) })}
            </Text>
          </View>
        </View>
        <View style={styles.heroStats}>
          <HeroStat label={t('savings.remainingLabel')}>
            <Text variant="amount" color="heroText">
              {fmt(p.remainingMinor, currency)}
            </Text>
          </HeroStat>
          {goal.targetDate ? (
            <HeroStat label={t('savings.targetDate')}>
              <Text variant="amount" color="heroText">
                {formatDate(goal.targetDate, locale, 'medium')}
              </Text>
            </HeroStat>
          ) : null}
          {p.monthlyNeededMinor !== null && !p.overdue ? (
            <HeroStat label={t('savings.monthlyNeededLabel')}>
              <Text variant="amount" color="heroText">
                {fmt(p.monthlyNeededMinor, currency)}
              </Text>
            </HeroStat>
          ) : null}
        </View>
      </HeroCard>

      <View style={styles.badges}>
        {p.reached ? <Badge label={t('savings.reached')} tone="positive" icon="check" /> : null}
        {p.overdue ? <Badge label={t('savings.overdue')} tone="danger" icon="alert" /> : null}
        {goal.archived ? <Badge label={t('savings.archived')} tone="info" /> : null}
      </View>

      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button label={t('savings.detail.addMoney')} icon="plus" onPress={() => setSheet('add')} testID="goal-add" />
        </View>
        <View style={styles.flex}>
          <Button
            label={t('savings.detail.withdraw')}
            icon="minus"
            variant="secondary"
            disabled={p.savedMinor === 0}
            onPress={() => setSheet('withdraw')}
            testID="goal-withdraw"
          />
        </View>
      </View>

      {error ? (
        <Banner tone="danger" icon="alert">
          <Text variant="label" color="danger">
            {error}
          </Text>
        </Banner>
      ) : null}

      <SectionHeader title={t('savings.detail.progress')} />
      <Card>
        {points.length < 2 ? (
          <Text variant="body" color="textSecondary">
            {t('savings.detail.chartNeedsTwo')}
          </Text>
        ) : (
          <ChartFrame
            minHeight={200}
            summary={t('savings.detail.chartSummary', {
              count: points.length,
              total: fmt(p.savedMinor, currency),
              target: fmt(goal.targetMinor, currency),
            })}
          >
            {(w) => (
              <TrendLine
                width={w}
                points={points}
                color={goal.color}
                currency={currency}
                labelEvery={Math.ceil(points.length / 4)}
              />
            )}
          </ChartFrame>
        )}
      </Card>

      <SectionHeader title={t('savings.detail.history')} />
      {contributions.length === 0 ? (
        <Card>
          <EmptyState
            icon="piggy"
            title={t('savings.detail.noContributions')}
            body={t('savings.detail.noContributionsBody')}
          />
        </Card>
      ) : (
        <Card>
          {contributions.map((c, i) => {
            const deposit = c.amountMinor > 0;
            const label = c.note || (deposit ? t('savings.detail.deposit') : t('savings.detail.withdrawal'));
            return (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  testID={`contribution-${c.id}`}
                  leading={
                    <CategoryBadge
                      icon={deposit ? 'arrowDown' : 'arrowUp'}
                      color={deposit ? colors.positive : colors.warning}
                    />
                  }
                  title={label}
                  subtitle={`${deposit ? t('savings.detail.deposit') : t('savings.detail.withdrawal')} · ${formatDate(c.contributedOn, locale, 'medium')}`}
                  trailing={
                    <View style={styles.trailing}>
                      <Money amountMinor={c.amountMinor} currency={currency} kind={deposit ? 'income' : undefined} />
                      <IconButton
                        icon="trash"
                        size={40}
                        label={t('savings.detail.deleteContribution')}
                        onPress={() => setRemoveId(c.id)}
                        testID={`contribution-delete-${c.id}`}
                      />
                    </View>
                  }
                />
              </View>
            );
          })}
        </Card>
      )}

      <View style={styles.actions}>
        <Button
          label={t('common.actions.edit')}
          icon="edit"
          variant="secondary"
          onPress={() => router.push({ pathname: '/goal/edit/[id]', params: { id: goal.id } })}
        />
        <Button
          label={goal.archived ? t('savings.detail.unarchive') : t('savings.detail.archive')}
          variant="secondary"
          onPress={() => void toggleArchive()}
        />
        <Button
          label={t('savings.detail.deleteGoal')}
          icon="trash"
          variant="danger"
          onPress={() => setConfirmGoal(true)}
        />
      </View>

      {sheet ? (
        <MoneySheet
          key={sheet}
          mode={sheet}
          goal={goal}
          today={today}
          onClose={() => setSheet(null)}
          onDone={() => {
            snack({ message: sheet === 'add' ? t('savings.detail.added') : t('savings.detail.withdrawn') });
            setSheet(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        visible={confirmGoal}
        title={t('savings.detail.deleteGoalTitle')}
        body={t('savings.detail.deleteGoalBody')}
        confirmLabel={t('common.actions.delete')}
        onConfirm={() => void removeGoal()}
        onCancel={() => setConfirmGoal(false)}
      />
      <ConfirmDialog
        visible={removeId !== null}
        title={t('savings.detail.deleteContributionTitle')}
        body={t('savings.detail.deleteContributionBody')}
        confirmLabel={t('common.actions.delete')}
        onConfirm={() => void removeContribution()}
        onCancel={() => setRemoveId(null)}
      />
    </>
  );
}

function MoneySheet({
  mode,
  goal,
  today,
  onClose,
  onDone,
}: {
  mode: 'add' | 'withdraw';
  goal: GoalWithProgress;
  today: IsoDate;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const { locale } = usePreferences();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<IsoDate>(today);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [month, setMonth] = useState(monthOf(today));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const parsed = parseAmount(amount, goal.currency);
    const key = amountErrorKey(parsed);
    if (key || !parsed.ok) {
      setError(t((key ?? 'errors.amount') as 'errors.amount'));
      return;
    }
    setSaving(true);
    try {
      await addContribution(db, goal.id, mode === 'add' ? parsed.amountMinor : -parsed.amountMinor, date, note);
      onDone();
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={mode === 'add' ? t('savings.detail.addMoney') : t('savings.detail.withdraw')}
      footer={
        picking ? undefined : (
          <Button
            label={mode === 'add' ? t('savings.detail.addMoney') : t('savings.detail.withdraw')}
            onPress={() => void submit()}
            loading={saving}
            testID="money-submit"
          />
        )
      }
    >
      {picking ? (
        <MonthGrid
          month={month}
          selected={date}
          today={today}
          onMonthChange={setMonth}
          onSelect={(d) => {
            setDate(d);
            setPicking(false);
          }}
        />
      ) : (
        <View style={styles.sheetBody}>
          <AmountField
            label={t('savings.detail.amount')}
            value={amount}
            onChangeText={(s) => {
              setAmount(s);
              setError(null);
            }}
            currency={goal.currency}
            error={error}
            testID="money-amount"
          />
          <SelectField
            label={t('savings.detail.date')}
            value={formatDate(date, locale, 'medium')}
            onPress={() => setPicking(true)}
            icon="calendar"
          />
          <TextField
            label={t('savings.detail.note')}
            value={note}
            onChangeText={setNote}
            maxLength={200}
            placeholder={t('savings.detail.notePlaceholder')}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  ringBox: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.lg },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  buttons: { flexDirection: 'row', gap: space.md },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  actions: { gap: space.sm },
  sheetBody: { gap: space.md, paddingBottom: space.md },
});
