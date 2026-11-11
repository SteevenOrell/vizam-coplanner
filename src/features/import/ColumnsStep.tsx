import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  analyzeDateColumn,
  columnValues,
  dataRowIndexes,
  headerSignature,
  tableWidth,
} from '../../domain/import/layout';
import {
  DATE_FORMAT_LABEL,
  type DateFormat,
  type DraftsResult,
  type ImportMapping,
  type ParsedFile,
} from '../../domain/import/types';
import { Card } from '../../ui/Card';
import { SegmentedControl } from '../../ui/Chip';
import { SelectField } from '../../ui/Field';
import { SelectSheet, type SelectOption } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { radii, space } from '../../ui/theme/tokens';
import { useTheme } from '../../ui/theme/ThemeProvider';
import { Notice, SwitchRow } from './parts';

const NONE = 'none';
const PREVIEW_ROWS = 5;
const COL_WIDTH = 132;

type Which = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'format';

/** Whether the mapping is complete enough to continue. */
export function columnsReady(m: ImportMapping, dateAmbiguousUnconfirmed: boolean): boolean {
  const money = m.amountMode === 'signed' ? m.amountCol !== null : m.debitCol !== null || m.creditCol !== null;
  return m.dateCol !== null && money && !dateAmbiguousUnconfirmed;
}

export function ColumnsStep({
  file,
  mapping,
  onChange,
  result,
  dateConfirmed,
  onDateConfirmed,
  remember,
  onRemember,
  usingSaved,
}: {
  file: ParsedFile;
  mapping: ImportMapping;
  onChange: (m: ImportMapping) => void;
  result: DraftsResult | null;
  dateConfirmed: boolean;
  onDateConfirmed: () => void;
  remember: boolean;
  onRemember: (v: boolean) => void;
  usingSaved: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [sheet, setSheet] = useState<Which | null>(null);
  const width = tableWidth(file, mapping);
  const header = mapping.hasHeader ? (file.rows[mapping.startRow] ?? []) : [];
  const dates = useMemo(() => analyzeDateColumn(file, mapping), [file, mapping]);
  const ambiguous = dates.ambiguous && !dateConfirmed;

  const colLabel = (c: number) => header[c]?.trim() || t('import.columns.columnN', { n: c + 1 });
  const columnOptions: SelectOption<string>[] = [
    { value: NONE, label: t('import.columns.notUsed') },
    ...Array.from({ length: width }, (_, c) => ({
      value: String(c),
      label: colLabel(c),
      subtitle: columnValues(file, mapping, c, 1)[0] ?? '',
    })),
  ];
  const colText = (c: number | null) => (c === null ? t('import.columns.notUsed') : colLabel(c));
  const set = (patch: Partial<ImportMapping>) => onChange({ ...mapping, ...patch });
  const pickCol = (key: 'dateCol' | 'descriptionCol' | 'amountCol' | 'debitCol' | 'creditCol') => (v: string) => {
    const next = { ...mapping, [key]: v === NONE ? null : Number(v) };
    // A new date column may use another date format.
    if (key === 'dateCol') next.dateFormat = analyzeDateColumn(file, next).format ?? mapping.dateFormat;
    onChange(next);
  };

  const formatOptions: SelectOption<string>[] = (
    dates.formats.length > 0 ? dates.formats : (Object.keys(DATE_FORMAT_LABEL) as DateFormat[])
  ).map((f) => ({ value: f, label: DATE_FORMAT_LABEL[f] }));

  const preview = dataRowIndexes(file, mapping).slice(0, PREVIEW_ROWS);
  const mapped = new Set(
    [mapping.dateCol, mapping.descriptionCol, mapping.amountCol, mapping.debitCol, mapping.creditCol].filter(
      (c): c is number => c !== null,
    ),
  );

  return (
    <>
      {usingSaved ? <Notice tone="info" title={t('import.columns.savedLayout')} testID="import-saved-layout" /> : null}

      <Card padded={false} style={styles.previewCard}>
        <Text variant="bodyStrong" style={styles.previewTitle}>
          {t('import.columns.previewTitle')}
        </Text>
        <ScrollView
          horizontal
          style={styles.previewScroll}
          showsHorizontalScrollIndicator
          accessibilityLabel={t('import.columns.previewTitle')}
          testID="import-preview"
        >
          <View>
            {mapping.hasHeader ? (
              <View style={[styles.tr, { backgroundColor: colors.surfaceAlt }]}>
                {Array.from({ length: width }, (_, c) => (
                  <Text key={c} variant="label" numberOfLines={1} style={styles.td}>
                    {colLabel(c)}
                  </Text>
                ))}
              </View>
            ) : null}
            {preview.map((i) => (
              <View key={i} style={[styles.tr, { borderTopColor: colors.border }]}>
                {Array.from({ length: width }, (_, c) => (
                  <Text
                    key={c}
                    variant="caption"
                    color={mapped.has(c) ? 'text' : 'textMuted'}
                    numberOfLines={1}
                    style={styles.td}
                  >
                    {file.rows[i]![c] ?? ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>

      <SwitchRow
        label={t('import.columns.hasHeader')}
        value={mapping.hasHeader}
        onChange={(v) => {
          const next = { ...mapping, hasHeader: v };
          next.signature = v ? headerSignature(file.rows[mapping.startRow] ?? []) : `cols:${width}`;
          onChange(next);
        }}
        testID="import-has-header"
      />

      <SelectField
        testID="import-date-col"
        label={t('import.columns.date')}
        value={colText(mapping.dateCol)}
        onPress={() => setSheet('date')}
        icon="calendar"
      />
      <SelectField
        testID="import-description-col"
        label={t('import.columns.description')}
        value={colText(mapping.descriptionCol)}
        onPress={() => setSheet('description')}
        icon="tag"
      />

      <Text variant="bodyStrong">{t('import.columns.amountMode')}</Text>
      <SegmentedControl
        testID="import-amount-mode"
        value={mapping.amountMode}
        options={[
          { value: 'signed', label: t('import.columns.modeSigned') },
          { value: 'split', label: t('import.columns.modeSplit') },
        ]}
        onChange={(v) => set({ amountMode: v })}
      />
      {mapping.amountMode === 'signed' ? (
        <SelectField
          testID="import-amount-col"
          label={t('import.columns.amount')}
          value={colText(mapping.amountCol)}
          onPress={() => setSheet('amount')}
          icon="wallet"
        />
      ) : (
        <>
          <SelectField
            testID="import-debit-col"
            label={t('import.columns.debit')}
            value={colText(mapping.debitCol)}
            onPress={() => setSheet('debit')}
            icon="arrowDown"
          />
          <SelectField
            testID="import-credit-col"
            label={t('import.columns.credit')}
            value={colText(mapping.creditCol)}
            onPress={() => setSheet('credit')}
            icon="arrowUp"
          />
        </>
      )}

      {ambiguous ? (
        <Notice
          tone="warning"
          title={t('import.columns.ambiguousTitle')}
          body={t('import.columns.ambiguousBody', {
            formats: dates.formats.map((f) => DATE_FORMAT_LABEL[f]).join(' / '),
          })}
          testID="import-date-ambiguous"
        />
      ) : null}
      <SelectField
        testID="import-date-format"
        label={t('import.columns.dateFormat')}
        value={DATE_FORMAT_LABEL[mapping.dateFormat]}
        onPress={() => setSheet('format')}
        icon="calendar"
        error={ambiguous ? t('import.columns.ambiguousPick') : null}
      />

      <Text variant="bodyStrong">{t('import.columns.decimalMark')}</Text>
      <SegmentedControl
        testID="import-decimal-mark"
        value={mapping.decimalMark}
        options={[
          { value: '.', label: t('import.columns.markDot') },
          { value: ',', label: t('import.columns.markComma') },
        ]}
        onChange={(v) => set({ decimalMark: v })}
      />
      <SwitchRow
        label={t('import.columns.invertSign')}
        help={t('import.columns.invertHelp')}
        value={mapping.invertSign}
        onChange={(v) => set({ invertSign: v })}
        testID="import-invert"
      />
      <SwitchRow label={t('import.columns.remember')} value={remember} onChange={onRemember} testID="import-remember" />

      {result ? (
        result.errorCount > 0 ? (
          <Notice
            tone="warning"
            title={t('import.columns.errors', { count: result.errorCount })}
            body={t('import.columns.errorsHelp')}
            testID="import-error-count"
          />
        ) : (
          <Notice
            tone="info"
            title={t('import.columns.allGood', { count: result.drafts.length })}
            testID="import-error-count"
          />
        )
      ) : null}

      <SelectSheet
        visible={
          sheet === 'date' || sheet === 'description' || sheet === 'amount' || sheet === 'debit' || sheet === 'credit'
        }
        onClose={() => setSheet(null)}
        title={t(`import.columns.${sheet === 'format' || sheet === null ? 'date' : sheet}` as 'import.columns.date')}
        value={String(
          sheet === 'date'
            ? (mapping.dateCol ?? NONE)
            : sheet === 'description'
              ? (mapping.descriptionCol ?? NONE)
              : sheet === 'amount'
                ? (mapping.amountCol ?? NONE)
                : sheet === 'debit'
                  ? (mapping.debitCol ?? NONE)
                  : (mapping.creditCol ?? NONE),
        )}
        options={columnOptions}
        onSelect={(v) => {
          if (sheet === 'date') pickCol('dateCol')(v);
          else if (sheet === 'description') pickCol('descriptionCol')(v);
          else if (sheet === 'amount') pickCol('amountCol')(v);
          else if (sheet === 'debit') pickCol('debitCol')(v);
          else if (sheet === 'credit') pickCol('creditCol')(v);
        }}
      />
      <SelectSheet
        visible={sheet === 'format'}
        onClose={() => setSheet(null)}
        title={t('import.columns.dateFormat')}
        value={mapping.dateFormat}
        options={formatOptions}
        onSelect={(v) => {
          set({ dateFormat: v as DateFormat });
          onDateConfirmed();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  previewCard: { overflow: 'hidden', width: '100%' },
  previewTitle: { padding: space.md },
  previewScroll: { width: '100%' },
  tr: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderRadius: radii.sm },
  td: { width: COL_WIDTH, paddingHorizontal: space.sm, paddingVertical: space.sm },
});
