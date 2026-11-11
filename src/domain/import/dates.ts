import { isIsoDate, toIsoDate, type IsoDate } from '../dates';
import { DATE_FORMATS, type DateFormat } from './types';

/** English and French month names and abbreviations, accents and dots removed. */
const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, january: 1, janvier: 1,
  feb: 2, fev: 2, fevr: 2, february: 2, fevrier: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, april: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, july: 7, juillet: 7,
  aug: 8, aou: 8, aout: 8, august: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, decembre: 12,
}; // prettier-ignore

function monthNumber(token: string): number | null {
  const key = token.toLowerCase().normalize('NFD').replace(/[̀-ͯ.]/g, '');
  return MONTHS[key] ?? null;
}

const TIME_TAIL = /[T\s]+\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:[ap]\.?m\.?)?\s*(?:z|[+-]\d{2}:?\d{2})?$/i;

const RE = {
  iso: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  'ymd-slash': /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  'ymd-compact': /^(\d{4})(\d{2})(\d{2})$/,
  slash: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  'dmy-dash': /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  'dmy-dot': /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
  dayFirst: /^(\d{1,2})(?:st|nd|rd|th|er)?[\s\-.]+([^\d\s\-.,]+)\.?[\s\-,.]+(\d{4})$/i,
  monthFirst: /^([^\d\s\-.,]+)\.?[\s\-.]+(\d{1,2})(?:st|nd|rd|th)?[\s,\-]+(\d{4})$/i,
};

function build(y: number, m: number, d: number): IsoDate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = toIsoDate(y, m, d);
  return isIsoDate(iso) && +iso.slice(5, 7) === m && +iso.slice(8, 10) === d ? iso : null;
}

/** Parses one cell with one format. Any time of day is ignored. Returns null when the text does not fit. */
export function parseDateWith(value: string, format: DateFormat): IsoDate | null {
  const v = value.trim().replace(TIME_TAIL, '').trim();
  if (v === '') return null;
  let m: RegExpExecArray | null;
  switch (format) {
    case 'iso':
    case 'ymd-slash':
    case 'ymd-compact':
      m = RE[format].exec(v);
      return m ? build(+m[1]!, +m[2]!, +m[3]!) : null;
    case 'dmy-slash':
      m = RE.slash.exec(v);
      return m ? build(+m[3]!, +m[2]!, +m[1]!) : null;
    case 'mdy-slash':
      m = RE.slash.exec(v);
      return m ? build(+m[3]!, +m[1]!, +m[2]!) : null;
    case 'dmy-dash':
    case 'dmy-dot':
      m = RE[format].exec(v);
      return m ? build(+m[3]!, +m[2]!, +m[1]!) : null;
    case 'text': {
      m = RE.dayFirst.exec(v);
      if (m) {
        const mo = monthNumber(m[2]!);
        return mo ? build(+m[3]!, mo, +m[1]!) : null;
      }
      m = RE.monthFirst.exec(v);
      if (m) {
        const mo = monthNumber(m[1]!);
        return mo ? build(+m[3]!, mo, +m[2]!) : null;
      }
      return null;
    }
  }
}

export interface DateDetection {
  /** Every format under which all non-empty values are valid dates. */
  formats: DateFormat[];
  /** First fitting format, or null when none fits. */
  format: DateFormat | null;
  /** More than one format fits (for example every day is 12 or less): the user must choose. */
  ambiguous: boolean;
}

export function detectDateFormat(values: readonly string[]): DateDetection {
  const cells = values.map((v) => v.trim()).filter((v) => v !== '');
  if (cells.length === 0) return { formats: [], format: null, ambiguous: false };
  const formats = DATE_FORMATS.filter((f) => cells.every((c) => parseDateWith(c, f) !== null));
  return { formats, format: formats[0] ?? null, ambiguous: formats.length > 1 };
}
