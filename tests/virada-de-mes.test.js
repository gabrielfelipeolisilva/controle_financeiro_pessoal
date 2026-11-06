const F = require('../src/finance');

const parcela = (atual, total, extra) => ({ descricao: 'Fone de ouvido', categoria: 'Eletrônicos', valorTotal: total * 90, totalParcelas: total, parcelaAtual: atual, valorParcela: 90, proxVcto: '2026-10-15', status: 'Ativo', ...extra });

function mes(extra) { return { ...F.emptyMonth(), ...extra }; }

describe('createMonthFromPrev', () => {
  const prev = mes({
    entradas: [
      { data: '2026-10-05', tipo: 'Salário', descricao: 'Salário', valor: 3000, recebido: true, obs: '' },
      { data: '2026-10-05', tipo: 'Vale Refeição', descricao: 'VR', valor: 500, recebido: true, obs: '' },
      { data: '2026-10-20', tipo: 'Freelance', descricao: 'Projeto avulso', valor: 700, recebido: true, obs: '' }
    ],
    fixas: [{ categoria: 'Moradia', descricao: 'Aluguel', valor: 1500, vencimento: 5, pago: 'Sim', formaPgto: 'PIX' }],
    variaveis: [{ data: '2026-10-02', categoria: 'Mercado', descricao: 'Mercado', valor: 300, formaPgto: 'Débito', obs: '' }],
    parcelamentos: [parcela(1, 3)]
  });
  const next = F.createMonthFromPrev(prev);

  test('copia só as entradas recorrentes, como "a receber" e com data +1 mês', () => {
    expect(next.entradas.map((e) => e.tipo)).toEqual(['Salário', 'Vale Refeição']);
    expect(next.entradas.every((e) => e.recebido === false)).toBe(true);
    expect(next.entradas[0].data).toBe('2026-11-05');
  });
  test('copia as fixas como pendentes e não copia variáveis', () => {
    expect(next.fixas).toHaveLength(1);
    expect(next.fixas[0].pago).toBe('Não');
    expect(next.variaveis).toEqual([]);
  });
  test('o saldo inicial fica automático', () => expect(next.saldoAuto).toBe(true));
  test('não altera o mês anterior', () => {
    expect(prev.fixas[0].pago).toBe('Sim');
    expect(prev.parcelamentos[0].parcelaAtual).toBe(1);
  });
  test('sem mês anterior devolve um mês vazio', () => expect(F.createMonthFromPrev(null).entradas).toEqual([]));
});

describe('parcelamentos na virada de mês (correção da última parcela)', () => {
  test('a última parcela continua ativa e é cobrada no mês dela', () => {
    const m = F.createMonthFromPrev(mes({ parcelamentos: [parcela(2, 3)] }));
    expect(m.parcelamentos).toHaveLength(1);
    expect(m.parcelamentos[0]).toMatchObject({ parcelaAtual: 3, status: 'Ativo', proxVcto: '2026-11-15' });
    expect(F.computeTotals(m, 0, 0).parcs).toBe(90);
  });
  test('depois da última parcela o parcelamento sai da lista', () => {
    const m = F.createMonthFromPrev(mes({ parcelamentos: [parcela(3, 3)] }));
    expect(m.parcelamentos).toHaveLength(0);
  });
  test('um parcelamento de 3x é cobrado exatamente 3 vezes', () => {
    let m = mes({ parcelamentos: [parcela(1, 3)] });
    let cobrancas = 0;
    for (let i = 0; i < 6; i++) { cobrancas += F.computeTotals(m, 0, 0).parcs; m = F.createMonthFromPrev(m); }
    expect(cobrancas).toBe(270);
  });
  test('parcelamento finalizado manualmente não passa para o mês seguinte', () => {
    const m = F.createMonthFromPrev(mes({ parcelamentos: [parcela(1, 10, { status: 'Finalizado' })] }));
    expect(m.parcelamentos).toHaveLength(0);
  });
});

describe('ensureMonth', () => {
  test('cria a partir do mês anterior quando existe', () => {
    const s = F.emptyState(new Date(2026, 10, 1));
    s.months['2026-10'] = mes({ fixas: [{ categoria: 'Moradia', descricao: 'Aluguel', valor: 1000, vencimento: 5, pago: 'Sim', formaPgto: 'PIX' }] });
    const m = F.ensureMonth(s, '2026-11');
    expect(m.fixas).toHaveLength(1);
    expect(m.saldoAuto).toBe(true);
    expect(F.ensureMonth(s, '2026-11')).toBe(m);
  });
  test('cria vazio e manual quando não há mês anterior', () => {
    const s = F.emptyState();
    const m = F.ensureMonth(s, '2030-01');
    expect(m).toMatchObject({ saldoAuto: false, fixas: [] });
  });
});
