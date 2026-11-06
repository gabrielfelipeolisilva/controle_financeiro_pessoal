const F = require('../src/finance');

describe('chaves de mês', () => {
  test('monthKey preenche com zero', () => expect(F.monthKey(2026, 3)).toBe('2026-03'));
  test.each([
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-06', 0, '2026-06'],
    ['2026-02', -14, '2024-12'],
    ['2026-11', 25, '2028-12']
  ])('shiftKey(%s, %i) = %s', (k, d, esperado) => expect(F.shiftKey(k, d)).toBe(esperado));
  test('keyLabel curto e longo', () => {
    expect(F.keyLabel('2026-03')).toBe('Mar 2026');
    expect(F.keyLabel('2026-03', true)).toBe('Março 2026');
  });
});

describe('advanceDate', () => {
  test.each([
    ['2026-01-15', 1, '2026-02-15'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-12-10', 1, '2027-01-10'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-08-31', 1, '2026-09-30']
  ])('%s + %i mês = %s', (d, n, esperado) => expect(F.advanceDate(d, n)).toBe(esperado));
  test('mantém valores vazios ou inválidos', () => {
    expect(F.advanceDate('', 1)).toBe('');
    expect(F.advanceDate(undefined, 1)).toBeUndefined();
    expect(F.advanceDate('31/01/2026', 1)).toBe('31/01/2026');
  });
});

describe('daysBetween', () => {
  test('conta dias corridos, inclusive entre meses', () => {
    expect(F.daysBetween('2026-11-03', '2026-11-05')).toBe(2);
    expect(F.daysBetween('2026-11-05', '2026-11-03')).toBe(-2);
    expect(F.daysBetween('2026-01-30', '2026-02-02')).toBe(3);
  });
});

describe('formatação', () => {
  test('fmt em reais', () => {
    expect(F.fmt(1234.5)).toBe('R$ 1.234,50');
    expect(F.fmt(-10)).toBe('-R$ 10,00');
    expect(F.fmt(undefined)).toBe('R$ 0,00');
  });
  test('fmtDate', () => {
    expect(F.fmtDate('2026-11-03')).toBe('03/11/2026');
    expect(F.fmtDate('2026-11-03', true)).toBe('03/11');
    expect(F.fmtDate('')).toBe('—');
  });
  test('parcelValue arredonda em centavos', () => {
    expect(F.parcelValue(100, 3)).toBe(33.33);
    expect(F.parcelValue(100, 0)).toBe(0);
  });
});
