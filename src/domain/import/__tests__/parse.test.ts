import { detectDecimalMark, parseImportAmount } from '../amount';
import { base64ToBytes, decodeBytes, detectDelimiter, parseCsv, parseImportText } from '../csv';
import { detectDateFormat, parseDateWith } from '../dates';
import { ImportLimitError, MAX_IMPORT_BYTES } from '../types';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, newlines in quotes and CRLF', () => {
    const { rows, lines } = parseCsv('a,"b ""x"" , y","line1\r\nline2"\r\nc,d,e\r\n', ',');
    expect(rows).toEqual([
      ['a', 'b "x" , y', 'line1\r\nline2'],
      ['c', 'd', 'e'],
    ]);
    expect(lines).toEqual([1, 3]);
  });

  it('strips a UTF-8 BOM and keeps empty fields and blank lines', () => {
    const { rows } = parseCsv('﻿a,,c\n\nd,e,\n', ',');
    expect(rows).toEqual([['a', '', 'c'], [''], ['d', 'e', '']]);
  });

  it('accepts a final row without a line break and a lone CR as a line break', () => {
    expect(parseCsv('a;b\rc;d', ';').rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('detects , ; and tab', () => {
    expect(detectDelimiter('a,b,c\n1,2,3\n')).toBe(',');
    expect(detectDelimiter('Date;Libellé;Montant\n01/11/2026;X;-1,50\n02/11/2026;Y;-2,50\n')).toBe(';');
    expect(detectDelimiter('Date\tName\tAmount\n2026-11-01\tShop, Inc\t5.00\n')).toBe('\t');
  });

  it('parses spreadsheet-pasted tab text', () => {
    const f = parseImportText('Date\tDescription\tAmount\n2026-11-01\tCoffee\t-3.50\n');
    expect(f.delimiter).toBe('\t');
    expect(f.rows[1]).toEqual(['2026-11-01', 'Coffee', '-3.50']);
  });

  it('rejects empty and oversized input with clear codes', () => {
    expect(() => parseImportText('  \n ')).toThrow(ImportLimitError);
    expect(() => parseImportText('a', { byteLength: MAX_IMPORT_BYTES + 1 })).toThrow(ImportLimitError);
  });
});

describe('decodeBytes', () => {
  it('decodes UTF-8 including a BOM and astral characters', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('Café 😀', 'utf8')]);
    expect(decodeBytes(bytes)).toBe('Café 😀');
  });

  it('falls back to Windows-1252 for invalid UTF-8', () => {
    const bytes = Uint8Array.from(Buffer.from('Libellé ÉPICERIE', 'latin1'));
    expect(decodeBytes(bytes)).toBe('Libellé ÉPICERIE');
    expect(decodeBytes(new Uint8Array([0x80, 0x92, 0xe9]))).toBe('€’é');
  });

  it('rejects overlong and truncated sequences as UTF-8', () => {
    expect(decodeBytes(new Uint8Array([0xc0, 0x80]))).toBe('À€');
    expect(decodeBytes(new Uint8Array([0x41, 0xe2, 0x82]))).toBe('Aâ‚');
  });

  it('decodes base64', () => {
    expect(Buffer.from(base64ToBytes('SGVsbG8sIHdvcmxkIQ==')).toString()).toBe('Hello, world!');
    expect(Buffer.from(base64ToBytes('QQ==')).toString()).toBe('A');
    expect(Buffer.from(base64ToBytes('QUI=')).toString()).toBe('AB');
  });
});

describe('parseDateWith / detectDateFormat', () => {
  it.each([
    ['2026-11-03', 'iso', '2026-11-03'],
    ['2026/11/03', 'ymd-slash', '2026-11-03'],
    ['20261103', 'ymd-compact', '2026-11-03'],
    ['03/11/2026', 'dmy-slash', '2026-11-03'],
    ['11/03/2026', 'mdy-slash', '2026-11-03'],
    ['03-11-2026', 'dmy-dash', '2026-11-03'],
    ['03.11.2026', 'dmy-dot', '2026-11-03'],
    ['3 Nov 2026', 'text', '2026-11-03'],
    ['03 nov. 2026', 'text', '2026-11-03'],
    ['Nov 3, 2026', 'text', '2026-11-03'],
    ['3 février 2026', 'text', '2026-02-03'],
    ['2026-11-03 14:35:10', 'iso', '2026-11-03'],
    ['11/03/2026 2:35 PM', 'mdy-slash', '2026-11-03'],
  ] as const)('%s as %s', (value, format, expected) => {
    expect(parseDateWith(value, format)).toBe(expected);
  });

  it('rejects impossible dates', () => {
    expect(parseDateWith('31/02/2026', 'dmy-slash')).toBeNull();
    expect(parseDateWith('13/13/2026', 'mdy-slash')).toBeNull();
    expect(parseDateWith('2026-02-30', 'iso')).toBeNull();
  });

  it('reports ambiguity when day and month are both 12 or less', () => {
    const d = detectDateFormat(['03/11/2026', '05/10/2026', '12/01/2026']);
    expect(d.ambiguous).toBe(true);
    expect(d.formats).toEqual(['dmy-slash', 'mdy-slash']);
  });

  it('settles it when one value has a day above 12', () => {
    expect(detectDateFormat(['03/11/2026', '25/10/2026'])).toMatchObject({ format: 'dmy-slash', ambiguous: false });
    expect(detectDateFormat(['11/03/2026', '10/25/2026'])).toMatchObject({ format: 'mdy-slash', ambiguous: false });
  });

  it('finds no format when a value does not fit', () => {
    expect(detectDateFormat(['2026-11-03', 'soon']).format).toBeNull();
    expect(detectDateFormat([]).format).toBeNull();
  });
});

describe('parseImportAmount', () => {
  const ok = (raw: string, cur: 'CAD' | 'XOF', mark: '.' | ',', minor: number) =>
    expect(parseImportAmount(raw, cur, mark)).toEqual({ ok: true, minor });

  it('reads plain, signed and grouped numbers exactly', () => {
    ok('12.50', 'CAD', '.', 1250);
    ok('-12.50', 'CAD', '.', -1250);
    ok('+12.5', 'CAD', '.', 1250);
    ok('1,234.56', 'CAD', '.', 123456);
    ok('1 234,56', 'CAD', ',', 123456);
    ok('1.234,56', 'CAD', ',', 123456);
    ok('1 234,56', 'CAD', ',', 123456);
    ok('.5', 'CAD', '.', 50);
    ok('0.10', 'CAD', '.', 10);
    ok('1,500', 'CAD', '.', 150000);
    ok('1,5', 'CAD', ',', 150);
  });

  it('reads symbols, codes, parentheses, trailing minus and CR/DR', () => {
    ok('$12.50', 'CAD', '.', 1250);
    ok('CA$12.50', 'CAD', '.', 1250);
    ok('CAD 12.50', 'CAD', '.', 1250);
    ok('12,50 €', 'CAD', ',', 1250);
    ok('(12.50)', 'CAD', '.', -1250);
    ok('12.50-', 'CAD', '.', -1250);
    ok('−12.50', 'CAD', '.', -1250);
    ok('12.50 DR', 'CAD', '.', -1250);
    ok('12.50 CR', 'CAD', '.', 1250);
    ok('1 500 FCFA', 'XOF', '.', 1500);
    ok('-$1,234.50', 'CAD', '.', -123450);
  });

  it('never rounds: extra decimals are a precision error', () => {
    expect(parseImportAmount('12.505', 'CAD', '.')).toEqual({ ok: false, error: 'precision' });
    expect(parseImportAmount('100.5', 'XOF', '.')).toEqual({ ok: false, error: 'precision' });
    expect(parseImportAmount('1,5', 'XOF', ',')).toEqual({ ok: false, error: 'precision' });
  });

  it('allows trailing zero decimals for whole-unit currencies', () => {
    ok('1500.00', 'XOF', '.', 1500);
    ok('1500,00', 'XOF', ',', 1500);
    ok('1.500', 'XOF', ',', 1500);
    ok('-75000', 'XOF', '.', -75000);
  });

  it('rejects text, empty cells, misplaced separators and huge numbers', () => {
    expect(parseImportAmount('', 'CAD', '.')).toEqual({ ok: false, error: 'empty' });
    expect(parseImportAmount('   ', 'CAD', '.')).toEqual({ ok: false, error: 'empty' });
    expect(parseImportAmount('abc', 'CAD', '.')).toEqual({ ok: false, error: 'invalid' });
    expect(parseImportAmount('12,50', 'CAD', '.')).toEqual({ ok: false, error: 'invalid' });
    expect(parseImportAmount('1,23,456.00', 'CAD', '.')).toEqual({ ok: false, error: 'invalid' });
    expect(parseImportAmount('1.2.3', 'CAD', '.')).toEqual({ ok: false, error: 'invalid' });
    expect(parseImportAmount('9'.repeat(30), 'CAD', '.')).toEqual({ ok: false, error: 'range' });
  });

  it('treats -0 as zero', () => {
    ok('-0.00', 'CAD', '.', 0);
  });
});

describe('detectDecimalMark', () => {
  it('reads the mark from the values', () => {
    expect(detectDecimalMark(['12.50', '3.00'], 'CAD')).toBe('.');
    expect(detectDecimalMark(['12,50', '1 234,00'], 'CAD')).toBe(',');
    expect(detectDecimalMark(['1.234,56', '5,00'], 'CAD')).toBe(',');
    expect(detectDecimalMark(['1,234.56'], 'CAD')).toBe('.');
    expect(detectDecimalMark(['1,234,567'], 'CAD')).toBe('.');
  });

  it('treats a lone three-digit group as grouping for whole-unit currencies', () => {
    expect(detectDecimalMark(['1.500', '25.000'], 'XOF')).toBe(',');
    expect(detectDecimalMark(['1,500'], 'XOF')).toBe('.');
    expect(detectDecimalMark(['350000', '-50000'], 'XOF')).toBe('.');
  });
});
