import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import { categoryMap, listAccountBalances, listAccounts } from '../../data/repos/core';
import { listTransactions } from '../../data/repos/transactions';
import { transactionsToCsv } from '../../domain/csv';
import { todayIso } from '../../domain/dates';
import type { AppLocale, ThemePreference } from '../../domain/models';
import { getSupabase } from '../../services/supabase';
import { usePreferences } from '../../state/preferences';
import { useSession } from '../../state/session';
import { Button, IconButton } from '../../ui/Button';
import { CurrencySelect } from '../../ui/CurrencySelect';
import { Card } from '../../ui/Card';
import { SegmentedControl } from '../../ui/Chip';
import { TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { CategoryBadge, Divider, ListRow } from '../../ui/ListRow';
import { Money } from '../../ui/Money';
import { Screen, SectionHeader } from '../../ui/Screen';
import { ConfirmDialog } from '../../ui/Sheet';
import { useSnackbar } from '../../ui/Snackbar';
import { QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { currencyLabel } from '../transactions/helpers';
import { shareCsv } from './exportCsv';
import { SwitchRow } from './SwitchRow';

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

type Dialog = 'reset' | 'leave' | 'signOut' | 'delete' | null;

export function SettingsScreen() {
  const { t } = useTranslation();
  const state = useDbQuery(async (db) => {
    const [balances, all] = await Promise.all([listAccountBalances(db), listAccounts(db, { includeArchived: true })]);
    const active = new Set(balances.map((a) => a.id));
    return { balances, archived: all.filter((a) => !active.has(a.id)) };
  }, []);

  return (
    <Screen title={t('settings.title')} back testID="settings-screen">
      <ProfileSection />
      <ModeSection />
      <CurrenciesSection />
      <QueryView state={state}>
        {(data) => (
          <>
            <AccountsSection balances={data.balances} archived={data.archived} />
            <PreferencesSections />
            {/* Needs the open database, which is guaranteed once the query above has loaded. */}
            <DataSection />
            <AboutSection />
            <DeleteSection />
          </>
        )}
      </QueryView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

function ProfileSection() {
  const { t } = useTranslation();
  const { prefs, update } = usePreferences();
  const [name, setName] = useState(prefs.displayName);
  const commit = () => {
    const next = name.trim().slice(0, 80);
    if (next !== prefs.displayName) void update({ displayName: next });
  };
  return (
    <Section title={t('settings.profile.title')}>
      <TextField
        label={t('settings.profile.name')}
        help={t('settings.profile.nameHelp')}
        value={name}
        onChangeText={setName}
        onBlur={commit}
        onSubmitEditing={commit}
        maxLength={80}
        icon="user"
        testID="settings-name"
        autoComplete="name"
      />
    </Section>
  );
}

function ModeSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { locale } = usePreferences();
  const { mode, email, sync, syncNow, resetDemo, leaveDemo, signOut } = useSession();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  if (mode === 'demo') {
    return (
      <>
        <Card tone="accentSoft" style={styles.modeCard} testID="settings-mode">
          <View style={styles.modeHead}>
            <Icon name="sparkle" size={20} color={colors.accentText} />
            <Text variant="heading" style={styles.flex}>
              {t('settings.mode.demoTitle')}
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}>
              <Text variant="overline" color="warningText">
                {t('common.demoBadge')}
              </Text>
            </View>
          </View>
          <Text variant="body" color="textSecondary">
            {t('settings.mode.demoBody')}
          </Text>
          <View style={styles.buttons}>
            <Button label={t('settings.mode.reset')} variant="secondary" size="sm" onPress={() => setDialog('reset')} />
            <Button label={t('settings.mode.leave')} variant="danger" size="sm" onPress={() => setDialog('leave')} />
          </View>
        </Card>
        <ConfirmDialog
          visible={dialog === 'reset'}
          title={t('settings.mode.resetTitle')}
          body={t('settings.mode.resetBody')}
          confirmLabel={t('settings.mode.reset')}
          destructive={false}
          onCancel={close}
          onConfirm={() => {
            close();
            void resetDemo();
          }}
        />
        <ConfirmDialog
          visible={dialog === 'leave'}
          title={t('settings.mode.leaveTitle')}
          body={t('settings.mode.leaveBody')}
          confirmLabel={t('settings.mode.leave')}
          onCancel={close}
          onConfirm={() => {
            close();
            void leaveDemo().then(() => router.replace('/onboarding'));
          }}
        />
      </>
    );
  }

  if (mode === 'cloud') {
    const last = sync.lastAt
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sync.lastAt))
      : null;
    return (
      <>
        <Card style={styles.modeCard} testID="settings-mode">
          <View style={styles.modeHead}>
            <Icon name="cloud" size={20} color={colors.accentText} />
            <Text variant="heading" style={styles.flex}>
              {t('settings.mode.cloudTitle')}
            </Text>
          </View>
          {email ? (
            <Text variant="body" color="textSecondary">
              {email}
            </Text>
          ) : null}
          <Text variant="label">{t(`settings.mode.status.${sync.status}`)}</Text>
          <Text variant="caption" color="textSecondary">
            {last ? t('settings.mode.lastSynced', { time: last }) : t('settings.mode.neverSynced')}
          </Text>
          {sync.rejected > 0 ? (
            <View style={styles.statusLine}>
              <Icon name="alert" size={16} color={colors.warningText} />
              <Text variant="caption" color="warningText" style={styles.flex}>
                {t('settings.mode.rejected', { count: sync.rejected })}
              </Text>
            </View>
          ) : null}
          <View style={styles.buttons}>
            <Button
              label={t('settings.mode.syncNow')}
              variant="secondary"
              size="sm"
              icon="repeat"
              loading={sync.status === 'syncing'}
              onPress={() => void syncNow()}
            />
            <Button
              label={t('settings.mode.signOut')}
              variant="danger"
              size="sm"
              onPress={() => setDialog('signOut')}
            />
          </View>
        </Card>
        <ConfirmDialog
          visible={dialog === 'signOut'}
          title={t('settings.mode.signOutTitle')}
          body={t('settings.mode.signOutBody')}
          confirmLabel={t('settings.mode.signOut')}
          onCancel={close}
          onConfirm={() => {
            close();
            void signOut().then(() => router.replace('/onboarding'));
          }}
        />
      </>
    );
  }
  return null;
}

function CurrenciesSection() {
  const { t } = useTranslation();
  const { prefs, update } = usePreferences();
  return (
    <Section title={t('settings.currencies.title')}>
      <Text variant="label" color="textSecondary">
        {t('settings.currencies.primary')}
      </Text>
      <CurrencySelect
        testID="settings-currency"
        value={prefs.primaryCurrency}
        onChange={(primaryCurrency) => void update({ primaryCurrency })}
      />
      <Text variant="caption" color="textSecondary">
        {t('settings.currencies.primaryHelp')} {t('common.currency.noConversion')}
      </Text>
    </Section>
  );
}

function AccountsSection({
  balances,
  archived,
}: {
  balances: Awaited<ReturnType<typeof listAccountBalances>>;
  archived: Awaited<ReturnType<typeof listAccounts>>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const open = (id: string) => router.push({ pathname: '/account/edit/[id]', params: { id } });
  return (
    <View style={styles.section}>
      <SectionHeader title={t('settings.accounts.title')} />
      <Card padded={false} style={styles.listCard} testID="settings-accounts">
        {balances.length === 0 && archived.length === 0 ? (
          <Text variant="body" color="textSecondary" style={styles.pad}>
            {t('settings.accounts.empty')}
          </Text>
        ) : null}
        {balances.map((a, i) => (
          <View key={a.id}>
            {i > 0 ? <Divider inset={space.lg} /> : null}
            <ListRow
              leading={<CategoryBadge icon="wallet" color={colors.accent} />}
              title={a.name}
              subtitle={`${t(`common.accountKinds.${a.kind}`)} · ${currencyLabel(a.currency)}`}
              trailing={<Money amountMinor={a.balanceMinor} currency={a.currency} sensitive />}
              chevron
              onPress={() => open(a.id)}
              accessibilityLabel={a.name}
            />
          </View>
        ))}
        {archived.map((a) => (
          <View key={a.id}>
            <Divider inset={space.lg} />
            <ListRow
              leading={<CategoryBadge icon="wallet" color={colors.textMuted} />}
              title={a.name}
              subtitle={`${t('settings.accounts.archived')} · ${currencyLabel(a.currency)}`}
              chevron
              onPress={() => open(a.id)}
              accessibilityLabel={`${a.name}, ${t('settings.accounts.archived')}`}
            />
          </View>
        ))}
      </Card>
      <Button
        label={t('settings.accounts.add')}
        icon="plus"
        variant="secondary"
        onPress={() => router.push('/account/new')}
      />
    </View>
  );
}

function PreferencesSections() {
  const { t } = useTranslation();
  const { prefs, update } = usePreferences();
  const days = prefs.billReminderDays;
  const setDays = (n: number) => void update({ billReminderDays: Math.max(0, Math.min(14, n)) });
  return (
    <>
      <Section title={t('settings.appearance.title')}>
        <SegmentedControl<ThemePreference>
          testID="settings-theme"
          value={prefs.theme}
          options={[
            { value: 'system', label: t('settings.appearance.system') },
            { value: 'light', label: t('settings.appearance.light') },
            { value: 'dark', label: t('settings.appearance.dark') },
          ]}
          onChange={(theme) => void update({ theme })}
        />
      </Section>
      <Section title={t('settings.language.title')}>
        <SegmentedControl<AppLocale>
          testID="settings-language"
          value={prefs.locale}
          options={[
            { value: 'en', label: t('settings.language.en') },
            { value: 'fr', label: t('settings.language.fr') },
          ]}
          onChange={(locale) => void update({ locale })}
        />
      </Section>
      <Section title={t('settings.notifications.title')}>
        <SwitchRow
          testID="settings-notify-bills"
          label={t('settings.notifications.bills')}
          value={prefs.notifyBills}
          onValueChange={(notifyBills) => void update({ notifyBills })}
        />
        <Divider />
        <SwitchRow
          testID="settings-notify-budgets"
          label={t('settings.notifications.budgets')}
          value={prefs.notifyBudgets}
          onValueChange={(notifyBudgets) => void update({ notifyBudgets })}
        />
        <Divider />
        <View style={styles.stepper}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{t('settings.notifications.reminderDays')}</Text>
            <Text variant="caption" color="textSecondary" testID="settings-reminder-days">
              {days === 0 ? t('settings.notifications.onDueDay') : t('settings.notifications.days', { count: days })}
            </Text>
          </View>
          <IconButton
            icon="minus"
            label={t('settings.notifications.fewer')}
            tone="soft"
            testID="settings-days-less"
            onPress={() => days > 0 && setDays(days - 1)}
          />
          <IconButton
            icon="plus"
            label={t('settings.notifications.more')}
            tone="soft"
            testID="settings-days-more"
            onPress={() => days < 14 && setDays(days + 1)}
          />
        </View>
      </Section>
      <Section title={t('settings.privacy.title')}>
        <SwitchRow
          testID="settings-hide"
          label={t('settings.privacy.hide')}
          help={t('settings.privacy.hideHelp')}
          value={prefs.hideBalances}
          onValueChange={(hideBalances) => void update({ hideBalances })}
        />
      </Section>
    </>
  );
}

function DataSection() {
  const { t } = useTranslation();
  const db = useDb();
  const snackbar = useSnackbar();
  const [busy, setBusy] = useState(false);
  const exportCsv = async () => {
    setBusy(true);
    try {
      const [transactions, categories, accounts] = await Promise.all([
        listTransactions(db),
        categoryMap(db),
        listAccounts(db, { includeArchived: true }),
      ]);
      if (transactions.length === 0) {
        snackbar({ message: t('settings.data.exportEmpty') });
        return;
      }
      const csv = transactionsToCsv(transactions, categories, new Map(accounts.map((a) => [a.id, a])));
      await shareCsv(csv, `coplanner-transactions-${todayIso()}.csv`, t('settings.data.shareTitle'));
      snackbar({ message: t('settings.data.exportDone') });
    } catch {
      snackbar({ message: t('settings.data.exportFailed') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={t('settings.data.title')}>
      <Text variant="caption" color="textSecondary">
        {t('settings.data.exportHelp')}
      </Text>
      <Button
        label={t('settings.data.export')}
        icon="download"
        variant="secondary"
        loading={busy}
        onPress={() => void exportCsv()}
        testID="settings-export"
      />
    </Section>
  );
}

function AboutSection() {
  const { t } = useTranslation();
  return (
    <Section title={t('settings.about.title')}>
      <Text variant="body" color="textSecondary">
        {t('common.conceptNote')}
      </Text>
      <Text variant="caption" color="textMuted">
        {t('settings.about.version', { version: APP_VERSION })}
      </Text>
    </Section>
  );
}

function DeleteSection() {
  const { t } = useTranslation();
  const { mode, signOut } = useSession();
  const snackbar = useSnackbar();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (mode !== 'cloud') return null;

  const remove = async () => {
    setOpen(false);
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('unavailable');
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      await signOut();
      router.replace('/onboarding');
    } catch {
      snackbar({ message: t('settings.delete.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t('settings.delete.title')}>
      <Text variant="body" color="textSecondary">
        {t('settings.delete.body')}
      </Text>
      <Button
        label={t('settings.delete.title')}
        variant="danger"
        icon="trash"
        loading={busy}
        onPress={() => setOpen(true)}
        testID="settings-delete-account"
      />
      <ConfirmDialog
        visible={open}
        title={t('settings.delete.confirmTitle')}
        body={t('settings.delete.confirmBody')}
        confirmLabel={t('settings.delete.confirm')}
        onCancel={() => setOpen(false)}
        onConfirm={() => void remove()}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: space.sm },
  card: { gap: space.md },
  listCard: { paddingVertical: space.xs },
  pad: { padding: space.lg },
  modeCard: { gap: space.sm },
  modeHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badge: { borderRadius: radii.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
