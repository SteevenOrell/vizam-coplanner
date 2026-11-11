import { allocate, percent, sumByCurrency, sumSameCurrency } from '../money/aggregate';
import { assertMinor, isCurrencyCode, MAX_AMOUNT_MINOR } from '../money/currency';
import { amountToInput, formatMoney, minorToDecimalString, parseAmount } from '../money/format';

describe('parseAmount', () => {
  it.each([
    ['12', 'CAD', 1200],
    ['12.5', 'CAD', 1250],
    ['12.50', 'CAD', 1250],
    ['0.01', 'CAD', 1],
    ['.5', 'CAD', 50],
    ['12.', 'CAD', 1200],
    ['1,23', 'CAD', 123],
    ['1 234,56', 'CAD', 123456],
    ['1 234,56', 'CAD', 123456],
    ['1,234.56', 'CAD', 123456],
    ['1.234,56', 'CAD', 123456],
    ['1,234', 'CAD', 123400],
    ['1,234,567.89', 'CAD', 123456789],
    ['1500', 'XOF', 1500],
    ['1 500', 'XOF', 1500],
    ['1.500', 'XOF', 1500],
    ['1,500', 'XOF', 1500],
    ['25 000 000', 'XOF', 25000000],
    ['12.00', 'XOF', 12],
    ['12.345', 'CAD', 1234500],
  ] as const)('%s %s -> %d', (input, currency, expected) => {
    expect(parseAmount(input, currency)).toEqual({ ok: true, amountMinor: expected });
  });

  it.each([
    ['', 'CAD', 'empty'],
    ['   ', 'CAD', 'empty'],
    ['abc', 'CAD', 'invalid'],
    ['-12', 'CAD', 'invalid'],
    ['1e5', 'CAD', 'invalid'],
    ['1.2.3', 'CAD', 'invalid'],
    ['12,34,5', 'CAD', 'invalid'],
    ['1,2345.6', 'CAD', 'invalid'],
    ['.', 'CAD', 'invalid'],
    ['12.3456', 'CAD', 'precision'],
    ['1234.567', 'CAD', 'invalid'],
    ['1500.5', 'XOF', 'precision'],
    ['1500,25', 'XOF', 'precision'],
    ['99999999999999999999', 'CAD', 'range'],
    ['10000000000000.01', 'CAD', 'range'],
  ] as const)('%j %s -> %s', (input, currency, error) => {
    expect(parseAmount(input, currency)).toEqual({ ok: false, error });
  });

  it('accepts the maximum exactly', () => {
    expect(parseAmount('10000000000000', 'CAD')).toEqual({ ok: true, amountMinor: MAX_AMOUNT_MINOR });
    expect(parseAmount('1000000000000000', 'XOF')).toEqual({ ok: true, amountMinor: MAX_AMOUNT_MINOR });
  });
});

describe('minorToDecimalString', () => {
  it.each([
    [0, 'CAD', '0.00'],
    [5, 'CAD', '0.05'],
    [-5, 'CAD', '-0.05'],
    [123456, 'CAD', '1234.56'],
    [-123400, 'CAD', '-1234.00'],
    [1500, 'XOF', '1500'],
    [-25, 'XOF', '-25'],
    [MAX_AMOUNT_MINOR, 'CAD', '10000000000000.00'],
  ] as const)('%d %s -> %s', (minor, currency, expected) => {
    expect(minorToDecimalString(minor, currency)).toBe(expected);
  });

  it('round-trips with parseAmount', () => {
    for (const n of [1, 99, 100, 101, 123456789, 999999999999]) {
      for (const c of ['CAD', 'XOF'] as const) {
        expect(parseAmount(minorToDecimalString(n, c), c)).toEqual({ ok: true, amountMinor: n });
      }
    }
  });

  it('rejects non-integers', () => {
    expect(() => minorToDecimalString(1.5, 'CAD')).toThrow(RangeError);
    expect(() => assertMinor(Number.NaN)).toThrow(RangeError);
    expect(() => assertMinor(MAX_AMOUNT_MINOR + 1)).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  const norm = (s: string) => s.replace(/[  ]/g, ' ');

  it('uses the currency precision', () => {
    expect(formatMoney(123456, 'CAD', { locale: 'en-CA' })).toBe('$1,234.56');
    const xof = norm(formatMoney(1500, 'XOF', { locale: 'en-CA' }));
    expect(xof).toMatch(/1,500/);
    expect(xof).not.toMatch(/\./);
  });

  it('formats French locales with French grouping', () => {
    expect(norm(formatMoney(123456, 'CAD', { locale: 'fr-CA' }))).toBe('1 234,56 $');
  });

  it('signs and hides the currency on request', () => {
    expect(formatMoney(1250, 'CAD', { signed: true })).toBe('+$12.50');
    expect(formatMoney(-1250, 'CAD', { signed: true })).toBe('-$12.50');
    expect(formatMoney(0, 'CAD', { signed: true })).toBe('$0.00');
    expect(formatMoney(123456, 'CAD', { hideCurrency: true })).toBe('1,234.56');
  });

  it('is exact for large values', () => {
    expect(formatMoney(999999999999999, 'CAD', { hideCurrency: true })).toBe('9,999,999,999,999.99');
    expect(formatMoney(123456789012345, 'CAD', { hideCurrency: true })).toBe('1,234,567,890,123.45');
  });

  it('compact notation for axes', () => {
    expect(formatMoney(1250000, 'CAD', { compact: true, hideCurrency: true })).toBe('12.5K');
  });

  it('amountToInput drops the sign', () => {
    expect(amountToInput(-1250, 'CAD')).toBe('12.50');
    expect(amountToInput(1500, 'XOF')).toBe('1500');
  });
});

describe('aggregation', () => {
  it('sums per currency without mixing', () => {
    expect(
      sumByCurrency([
        { amountMinor: 100, currency: 'CAD' },
        { amountMinor: 5000, currency: 'XOF' },
        { amountMinor: 250, currency: 'CAD' },
      ]),
    ).toEqual({ CAD: 350, XOF: 5000 });
  });

  it('refuses to add different currencies into one total', () => {
    expect(() =>
      sumSameCurrency(
        [
          { amountMinor: 100, currency: 'CAD' },
          { amountMinor: 5000, currency: 'XOF' },
        ],
        'CAD',
      ),
    ).toThrow(/exchange-rate/);
  });

  it('allocate keeps the exact total', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1001, [3, 1])).toEqual([751, 250]);
    expect(allocate(7, [0, 1])).toEqual([0, 7]);
    const parts = allocate(123457, [5, 3, 2, 7]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(123457);
    expect(() => allocate(10, [0, 0])).toThrow(RangeError);
  });

  it('percent rounds', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 0)).toBe(0);
  });

  it('currency guard', () => {
    expect(isCurrencyCode('CAD')).toBe(true);
    expect(isCurrencyCode('EUR')).toBe(false);
    expect(isCurrencyCode('toString')).toBe(false);
  });
});
