import type { IsoDate } from '../dates';
import type { TxKind } from '../models';

/** Hard limits per import (clear errors, never silent truncation). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_DESCRIPTION = 120;

export class ImportLimitError extends Error {
  constructor(public readonly code: 'tooLarge' | 'tooManyRows' | 'noRows') {
    super(code);
    this.name = 'ImportLimitError';
  }
}

export type Delimiter = ',' | ';' | '\t';

/**
 * Date layouts the importer understands. `text` covers month names in English and French in either order
 * ("3 Nov 2026", "03 nov. 2026", "Nov 3, 2026"). Any time part is ignored.
 */
export type DateFormat = 'iso' | 'ymd-slash' | 'ymd-compact' | 'dmy-slash' | 'mdy-slash' | 'dmy-dash' | 'dmy-dot' | 'text';
export const DATE_FORMATS: readonly DateFormat[] = [
  'iso',
  'ymd-slash',
  'ymd-compact',
  'dmy-slash',
  'mdy-slash',
  'dmy-dash',
  'dmy-dot',
  'text',
];
export const DATE_FORMAT_LABEL: Record<DateFormat, string> = {
  iso: 'YYYY-MM-DD',
  'ymd-slash': 'YYYY/MM/DD',
  'ymd-compact': 'YYYYMMDD',
  'dmy-slash': 'DD/MM/YYYY',
  'mdy-slash': 'MM/DD/YYYY',
  'dmy-dash': 'DD-MM-YYYY',
  'dmy-dot': 'DD.MM.YYYY',
  text: '3 Nov 2026',
};

export type DecimalMark = '.' | ',';

/** The user's column choices. Plain JSON: it is stored as-is in import_profiles.mapping. */
export interface ImportMapping {
  version: 1;
  /** Index of the first row that belongs to the table (the header, or the first data row). Rows above are preamble. */
  startRow: number;
  hasHeader: boolean;
  dateCol: number | null;
  descriptionCol: number | null;
  amountMode: 'signed' | 'split';
  amountCol: number | null;
  debitCol: number | null;
  creditCol: number | null;
  dateFormat: DateFormat;
  decimalMark: DecimalMark;
  /** Banks that show expenses as positive numbers (or debit/credit the other way round). */
  invertSign: boolean;
  /** Normalised header cells, used to recognise the same layout next time. */
  signature: string;
}

export type DraftError = 'date' | 'amount' | 'precision' | 'empty';

export interface ImportDraft {
  /** 1-based line in the file where the record starts. Unique per draft. */
  line: number;
  occurredOn: IsoDate | null;
  description: string;
  /** Always positive minor units of the account currency (0 when the row has an error). */
  amountMinor: number;
  kind: TxKind;
  error: DraftError | null;
}

export interface DraftsResult {
  drafts: ImportDraft[];
  skippedEmpty: number;
  skippedZero: number;
  errorCount: number;
}

export interface ParsedFile {
  rows: string[][];
  /** Line number (1-based) where each row starts. */
  lines: number[];
  delimiter: Delimiter;
}
