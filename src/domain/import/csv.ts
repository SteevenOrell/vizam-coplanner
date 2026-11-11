import { ImportLimitError, MAX_IMPORT_BYTES, type Delimiter, type ParsedFile } from './types';

const CANDIDATES: readonly Delimiter[] = ['\t', ';', ','];

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * RFC 4180 parser: quoted fields, "" escapes, line breaks inside quotes, CRLF / LF / CR. Lenient about a missing
 * closing quote (the rest of the text becomes the last field). A trailing line break does not create an empty row.
 * `lines[i]` is the 1-based physical line where row i starts, so errors can point at the right spot in the file.
 */
export function parseCsv(input: string, delimiter: Delimiter): { rows: string[][]; lines: number[] } {
  const text = stripBom(input);
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  let started = false; // something was read for the current row

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    lines.push(rowLine);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === '\n') line++;
        else if (c === '\r' && text[i + 1] !== '\n') line++;
        field += c;
      }
      continue;
    }
    if (!started) {
      rowLine = line;
      started = true;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      endField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
    } else {
      field += c;
    }
  }
  if (started || field !== '' || row.length > 0) endRow();
  return { rows, lines };
}

/** Picks the delimiter that gives the most rows of one consistent width (at least two columns). */
export function detectDelimiter(input: string): Delimiter {
  const sample = stripBom(input).slice(0, 20000);
  let best: Delimiter = ',';
  let bestScore = -1;
  let bestWidth = 0;
  for (const d of CANDIDATES) {
    const { rows } = parseCsv(sample, d);
    const widths = new Map<number, number>();
    for (const r of rows.slice(0, 40)) {
      if (r.length < 2) continue;
      widths.set(r.length, (widths.get(r.length) ?? 0) + 1);
    }
    let width = 0;
    let score = 0;
    for (const [w, n] of widths) {
      if (n > score || (n === score && w > width)) {
        score = n;
        width = w;
      }
    }
    if (score > bestScore || (score === bestScore && score > 0 && width > bestWidth)) {
      best = d;
      bestScore = score;
      bestWidth = width;
    }
  }
  return best;
}

/** Parses pasted text or a decoded file. Throws ImportLimitError when it is too big or has no rows. */
export function parseImportText(text: string, opts: { byteLength?: number; delimiter?: Delimiter } = {}): ParsedFile {
  if ((opts.byteLength ?? text.length) > MAX_IMPORT_BYTES) throw new ImportLimitError('tooLarge');
  const delimiter = opts.delimiter ?? detectDelimiter(text);
  const { rows, lines } = parseCsv(text, delimiter);
  if (!rows.some((r) => r.some((c) => c.trim() !== ''))) throw new ImportLimitError('noRows');
  return { rows, lines, delimiter };
}

// -------------------------------------------------------------------------------------------------------------
// Bytes -> text
// -------------------------------------------------------------------------------------------------------------

/** Windows-1252 code points for bytes 0x80..0x9F (the rest of the range matches Latin-1). */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d,
  0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d,
  0x017e, 0x0178,
];

function fromCodes(codes: number[]): string {
  let out = '';
  for (let i = 0; i < codes.length; i += 8192) out += String.fromCharCode(...codes.slice(i, i + 8192));
  return out;
}

/** Strict UTF-8: returns null on any invalid sequence (so the caller can fall back to Windows-1252). */
function decodeUtf8Strict(bytes: Uint8Array): string | null {
  const units: number[] = [];
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b = bytes[i]!;
    if (b < 0x80) {
      units.push(b);
      i++;
      continue;
    }
    let need = 0;
    let cp = 0;
    let min = 0;
    if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      cp = b & 0x1f;
      min = 0x80;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      cp = b & 0x0f;
      min = 0x800;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      cp = b & 0x07;
      min = 0x10000;
    } else {
      return null;
    }
    for (let k = 1; k <= need; k++) {
      const cb = bytes[i + k];
      if (cb === undefined || (cb & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (cb & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    if (cp >= 0x10000) {
      const v = cp - 0x10000;
      units.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else {
      units.push(cp);
    }
    i += need + 1;
  }
  return fromCodes(units);
}

function decodeCp1252(bytes: Uint8Array): string {
  const units: number[] = new Array<number>(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    units[i] = b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80]! : b;
  }
  return fromCodes(units);
}

/**
 * Bank exports are UTF-8 or (often, in French files) Windows-1252. Hermes' TextDecoder only knows UTF-8, so both
 * decoders are built in. The UTF-8 byte-order mark is dropped.
 */
export function decodeBytes(bytes: Uint8Array): string {
  const utf8 = decodeUtf8Strict(bytes);
  return stripBom(utf8 ?? decodeCp1252(bytes));
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 (as returned by native file reads) to bytes, without relying on atob. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]!);
    const b = B64.indexOf(clean[i + 1]!);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]!) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]!) : -1;
    if (o < out.length) out[o++] = (a << 2) | (b >> 4);
    if (c >= 0 && o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0 && o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
