const F = require('../src/finance');

describe('buildDemoState', () => {
  const ref = new Date(2026, 10, 10);
  const s = F.buildDemoState(ref);

  test('3 meses terminando no mês de referência', () => {
    expect(Object.keys(s.months)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect([s.currentYear, s.currentMonth]).toEqual([2026, 11]);
  });
  test('é determinístico', () => expect(F.buildDemoState(ref)).toEqual(s));
  test('passa na validação de importação', () => expect(F.normalizeState(s).ok).toBe(true));
  test('o mês atual mostra a última parcela de um 3x sendo cobrada', () => {
    const fone = s.months['2026-11'].parcelamentos.find((p) => p.descricao === 'Fone de ouvido');
    expect(fone).toMatchObject({ parcelaAtual: 3, totalParcelas: 3, status: 'Ativo' });
  });
  test('tem pelo menos um orçamento estourado e alertas de vencimento', () => {
    expect(F.categoryBreakdown(s.months['2026-11'], s.budgets).some((c) => c.nivel === 'estourado')).toBe(true);
    expect(F.upcomingDue(s.months['2026-11'], '2026-11', '2026-11-10', 3).length).toBeGreaterThan(0);
  });
  test('saldos coerentes ao longo dos meses', () => {
    const set = F.summarize(s, '2026-09');
    const nov = F.summarize(s, '2026-11');
    expect(nov.saldoFromPrev).toBe(true);
    expect(set.saldo).toBeGreaterThan(0);
    expect(nov.saldoVR).toBeGreaterThanOrEqual(0);
  });
  test('funciona em qualquer data (inclusive dia 31 e virada de ano)', () => {
    for (const d of [new Date(2026, 0, 31), new Date(2026, 2, 31), new Date(2027, 1, 28), new Date(2026, 11, 1)]) {
      const x = F.buildDemoState(d);
      expect(F.normalizeState(x).state).toEqual(x);
    }
  });
  test('usa só dados genéricos (sem marcas)', () => {
    const texto = JSON.stringify(s).toLowerCase();
    for (const marca of ['netflix', 'spotify', 'uber', 'ifood', 'nubank', 'itaú', 'amazon']) expect(texto).not.toContain(marca);
  });
});
