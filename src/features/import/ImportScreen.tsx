import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDb, useDbQuery } from '../../data/hooks';
import { listAccounts, listCategories } from '../../data/repos/core';
import {
  findDuplicates,
  findImportProfile,
  importTransactions,
  listCategoryRules,
  listImportBatches,
  saveImportProfile,
  upsertCategoryRule,
  type CategoryRule,
  type ImportBatch,
} from '../../data/repos/import';
import { parseImportText } from '../../domain/import/csv';
import { buildDrafts } from '../../domain/import/drafts';
import type { DuplicateKind } from '../../domain/import/duplicates';
import { analyzeDateColumn, detectLayout, mappingFits } from '../../domain/import/layout';
import type { DraftsResult, ImportMapping, ParsedFile } from '../../domain/import/types';
import type { Account, Category } from '../../domain/models';
import { usePreferences } from '../../state/preferences';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { QueryView } from '../../ui/states';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme/tokens';
import { ColumnsStep, columnsReady } from './ColumnsStep';
import { DoneStep } from './DoneStep';
import { importErrorMessage, Notice } from './parts';
import { ReviewStep, selectedRows, useReview } from './ReviewStep';
import { SourceStep } from './SourceStep';

type Step = 'source' | 'columns' | 'review' | 'done';
const STEP_NUMBER: Record<Step, number> = { source: 1, columns: 2, review: 3, done: 3 };

interface Loaded {
  file: ParsedFile;
  name: string;
  mapping: ImportMapping;
  usingSaved: boolean;
}

const NO_RESULT: DraftsResult = { drafts: [], skippedEmpty: 0, skippedZero: 0, errorCount: 0 };
const NO_DUPLICATES = new Map<number, DuplicateKind>();

export function ImportScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ accountId?: string }>();
  const state = useDbQuery(
    async (db) => {
      const [accounts, categories, rules, batches] = await Promise.all([
        listAccounts(db),
        listCategories(db),
        listCategoryRules(db),
        listImportBatches(db),
      ]);
      return { accounts, categories, rules, batches };
    },
    [],
    { keepPrevious: true },
  );
  if (state.status !== 'success') {
    return (
      <Screen title={t('import.title')} back testID="import-screen">
        <QueryView state={state}>{() => null}</QueryView>
      </Screen>
    );
  }
  const initialAccount = typeof params.accountId === 'string' ? params.accountId : '';
  return <Flow data={state.data} initialAccountId={initialAccount} />;
}

interface ImportData {
  accounts: Account[];
  categories: Category[];
  rules: CategoryRule[];
  batches: ImportBatch[];
}

function Flow({ data, initialAccountId }: { data: ImportData; initialAccountId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const { prefs } = usePreferences();
  const { accounts, categories, rules, batches } = data;

  const [step, setStep] = useState<Step>('source');
  const [accountId, setAccountId] = useState(
    () =>
      accounts.find((a) => a.id === initialAccountId)?.id ??
      (accounts.find((a) => a.currency === prefs.primaryCurrency) ?? accounts[0])?.id ??
      '',
  );
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const currency = account?.currency ?? prefs.primaryCurrency;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Map<number, DuplicateKind>>(NO_DUPLICATES);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ batchId: string; count: number } | null>(null);

  const built = useMemo(() => {
    if (!loaded) return null;
    try {
      return { ok: true as const, result: buildDrafts(loaded.file, loaded.mapping, currency) };
    } catch (e) {
      return { ok: false as const, error: importErrorMessage(t, e) };
    }
  }, [loaded, currency, t]);
  const result = built?.ok ? built.result : NO_RESULT;
  const review = useReview(result, duplicates, rules, categories);

  const begin = async (text: string, name: string) => {
    setError(null);
    try {
      const file = parseImportText(text);
      const guess = detectLayout(file, currency);
      let mapping = guess.mapping;
      let usingSaved = false;
      const profile = await findImportProfile(db, accountId, mapping.signature);
      if (profile && mappingFits(file, profile.mapping)) {
        mapping = profile.mapping;
        usingSaved = true;
      }
      setLoaded({ file, name, mapping, usingSaved });
      setDateConfirmed(usingSaved || !guess.dates.ambiguous);
      setRemember(usingSaved);
      setStep('columns');
    } catch (e) {
      setError(importErrorMessage(t, e));
    }
  };

  const changeMapping = (mapping: ImportMapping) => {
    if (!loaded) return;
    // Picking another date column restarts the "is the date format right?" question.
    if (mapping.dateCol !== loaded.mapping.dateCol) setDateConfirmed(false);
    setLoaded({ ...loaded, mapping, usingSaved: false });
  };

  const startOver = () => {
    setStep('source');
    setLoaded(null);
    setDone(null);
    setError(null);
    setDuplicates(NO_DUPLICATES);
    review.reset();
  };

  const goReview = async () => {
    if (!built?.ok) return;
    setBusy(true);
    setError(null);
    try {
      setDuplicates(await findDuplicates(db, accountId, built.result.drafts));
      review.reset();
      setStep('review');
    } catch (e) {
      setError(importErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    try {
      const rows = selectedRows(review.items).map((i) => ({
        occurredOn: i.draft.occurredOn!,
        description: i.draft.description,
        amountMinor: i.draft.amountMinor,
        kind: i.draft.kind,
        categoryId: i.categoryId,
      }));
      const res = await importTransactions(db, accountId, rows, loaded.name);
      if (remember) await saveImportProfile(db, accountId, loaded.mapping).catch(() => undefined);
      setDone({ batchId: res.batchId, count: res.count });
      setStep('done');
    } catch (e) {
      setError(importErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const createRule = (rule: { pattern: string; kind: 'income' | 'expense'; categoryId: string }) => {
    upsertCategoryRule(db, rule).catch((e: unknown) => setError(importErrorMessage(t, e)));
  };

  // Ambiguous dates (day and month both 12 or less everywhere) must be confirmed by the user before going on.
  const dateAmbiguous = !!loaded && !dateConfirmed && analyzeDateColumn(loaded.file, loaded.mapping).ambiguous;
  const columnsOk =
    !!loaded && !!built?.ok && built.result.drafts.length > 0 && columnsReady(loaded.mapping, dateAmbiguous);
  const importCount = selectedRows(review.items).length;

  let footer: ReactNode = null;
  if (step === 'columns') {
    footer = (
      <View style={styles.footer}>
        {error ? <Notice tone="danger" title={error} /> : null}
        <View style={styles.footerRow}>
          <Button
            label={t('common.actions.back')}
            variant="secondary"
            onPress={() => setStep('source')}
            style={styles.flex}
            testID="import-back"
          />
          <Button
            label={t('common.actions.next')}
            onPress={() => void goReview()}
            disabled={!columnsOk}
            loading={busy}
            style={styles.flex2}
            testID="import-next"
          />
        </View>
      </View>
    );
  } else if (step === 'review') {
    footer = (
      <View style={styles.footer}>
        {error ? <Notice tone="danger" title={error} testID="import-error" /> : null}
        <View style={styles.footerRow}>
          <Button
            label={t('common.actions.back')}
            variant="secondary"
            onPress={() => setStep('columns')}
            style={styles.flex}
            testID="import-back"
          />
          <Button
            label={t('import.review.importN', { count: importCount })}
            onPress={() => void runImport()}
            disabled={importCount === 0}
            loading={busy}
            style={styles.flex2}
            testID="import-confirm"
          />
        </View>
      </View>
    );
  }

  return (
    <Screen
      title={t('import.title')}
      back
      testID="import-screen"
      scroll={step !== 'review'}
      contentStyle={step === 'review' ? styles.fill : undefined}
      footer={footer}
    >
      {step !== 'done' ? (
        <Text variant="caption" color="textSecondary" testID="import-step">
          {t('import.stepOf', { n: STEP_NUMBER[step], total: 3 })} ·{' '}
          {t(`import.steps.${step}` as 'import.steps.source')}
        </Text>
      ) : null}
      {step === 'source' ? (
        <SourceStep
          accounts={accounts}
          accountId={accountId}
          onAccount={setAccountId}
          batches={batches}
          error={error}
          onText={(text, name) => void begin(text, name)}
          onError={setError}
        />
      ) : null}
      {step === 'columns' && loaded ? (
        <>
          {built && !built.ok ? <Notice tone="danger" title={built.error} testID="import-limit-error" /> : null}
          <ColumnsStep
            file={loaded.file}
            mapping={loaded.mapping}
            onChange={changeMapping}
            result={built?.ok ? built.result : null}
            dateConfirmed={dateConfirmed}
            onDateConfirmed={() => setDateConfirmed(true)}
            remember={remember}
            onRemember={setRemember}
            usingSaved={loaded.usingSaved}
          />
        </>
      ) : null}
      {step === 'review' ? (
        <ReviewStep
          items={review.items}
          result={result}
          duplicateCount={duplicates.size}
          currency={currency}
          categories={categories}
          rules={rules}
          onToggle={review.toggle}
          onChoose={review.choose}
          onCreateRule={createRule}
        />
      ) : null}
      {step === 'done' && done ? <DoneStep batchId={done.batchId} count={done.count} onReset={startOver} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },
  fill: { flex: 1 },
  footer: { gap: space.sm },
  footerRow: { flexDirection: 'row', gap: space.sm },
});
