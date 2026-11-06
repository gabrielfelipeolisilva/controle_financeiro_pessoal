const F = require('../src/finance');

const v = (categoria, valor) => ({ data: '2026-11-02', categoria, descricao: categoria, valor, formaPgto: 'PIX', obs: '' });

describe('categoryBreakdown', () => {
  const m = { ...F.emptyMonth(), variaveis: [v('Mercado', 500), v('Mercado', 100), v('Delivery', 180), v('Lazer', 40)] };
  const budgets = { Mercado: 700, Delivery: 150, Lazer: 50, Beleza: 100 };
  const r = F.categoryBreakdown(m, budgets);
  const by = (c) => r.find((x) => x.categoria === c);

  test('soma por categoria, do maior para o menor', () => {
    expect(r.map((x) => x.categoria)).toEqual(['Mercado', 'Delivery', 'Lazer', 'Beleza']);
    expect(by('Mercado').gasto).toBe(600);
  });
  test('níveis: ok < 80% ≤ alerta ≤ 100% < estourado', () => {
    expect(by('Mercado')).toMatchObject({ pct: 86, nivel: 'alerta' });
    expect(by('Delivery')).toMatchObject({ pct: 120, nivel: 'estourado' });
    expect(by('Lazer')).toMatchObject({ pct: 80, nivel: 'alerta' });
    expect(by('Beleza')).toMatchObject({ gasto: 0, nivel: 'ok' });
  });
  test('categoria sem orçamento', () => {
    const x = F.categoryBreakdown({ ...F.emptyMonth(), variaveis: [v('Saúde', 30)] }, {});
    expect(x).toEqual([{ categoria: 'Saúde', gasto: 30, limite: 0, pct: null, nivel: 'sem' }]);
  });
  test('categoria personalizada (de um backup) também aparece', () => {
    const x = F.categoryBreakdown({ ...F.emptyMonth(), variaveis: [v('Pets', 80)] });
    expect(x[0].categoria).toBe('Pets');
  });
});

describe('upcomingDue', () => {
  const m = {
    ...F.emptyMonth(),
    fixas: [
      { descricao: 'Aluguel', valor: 1500, vencimento: 5, pago: 'Não' },
      { descricao: 'Internet', valor: 100, vencimento: 10, pago: 'Não' },
      { descricao: 'Luz', valor: 120, vencimento: 3, pago: 'Sim' },
      { descricao: 'Academia', valor: 90, vencimento: 20, pago: 'Não' },
      { descricao: 'Sem dia', valor: 10, vencimento: '', pago: 'Não' },
      { descricao: 'Fim do mês', valor: 10, vencimento: 31, pago: 'Não' }
    ],
    parcelamentos: [
      { descricao: 'Notebook', parcelaAtual: 6, totalParcelas: 10, valorParcela: 360, proxVcto: '2026-11-08', status: 'Ativo' },
      { descricao: 'Quitado', parcelaAtual: 2, totalParcelas: 2, valorParcela: 50, proxVcto: '2026-11-07', status: 'Finalizado' }
    ]
  };
  const r = F.upcomingDue(m, '2026-11', '2026-11-07', 3);

  test('lista atrasados e os que vencem em até 3 dias, ignorando pagos e finalizados', () => {
    expect(r.map((x) => [x.descricao, x.dias])).toEqual([['Aluguel', -2], ['Notebook (6/10)', 1], ['Internet', 3]]);
  });
  test('dia 31 em um mês de 30 dias vira o último dia', () => {
    const x = F.upcomingDue(m, '2026-11', '2026-11-29', 3).find((d) => d.descricao === 'Fim do mês');
    expect(x).toMatchObject({ data: '2026-11-30', dias: 1 });
  });
});

describe('busca', () => {
  const item = { descricao: 'Pão de Açúcar', categoria: 'Mercado', obs: 'compra do mês', formaPgto: 'Crédito' };
  test.each([['acucar', true], ['MERCADO', true], ['credito', true], ['  ', true], ['farmácia', false]])('"%s" → %s', (q, ok) => {
    expect(F.matchesSearch(item, q)).toBe(ok);
  });
});
