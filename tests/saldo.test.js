const F = require('../src/finance');

function estado(months) { return { ...F.emptyState(new Date(2026, 10, 1)), months }; }

const out = {
  saldoInicial: 1000, saldoAuto: false,
  entradas: [
    { data: '2026-10-05', tipo: 'Salário', descricao: 'Salário', valor: 3000, recebido: true, obs: '' },
    { data: '2026-10-20', tipo: 'Freelance', descricao: 'Freela', valor: 500, recebido: false, obs: '' },
    { data: '2026-10-05', tipo: 'Vale Refeição', descricao: 'VR', valor: 600, recebido: true, obs: '' }
  ],
  fixas: [
    { categoria: 'Moradia', descricao: 'Aluguel', valor: 1500, vencimento: 5, pago: 'Sim', formaPgto: 'PIX' },
    { categoria: 'Moradia', descricao: 'Luz', valor: 100, vencimento: 20, pago: 'Não', formaPgto: 'Boleto' }
  ],
  variaveis: [
    { data: '2026-10-03', categoria: 'Mercado', descricao: 'Mercado', valor: 400, formaPgto: 'Débito', obs: '' },
    { data: '2026-10-09', categoria: 'Alimentação', descricao: 'Almoço', valor: 250, formaPgto: 'Vale Refeição', obs: '' }
  ],
  parcelamentos: [
    { descricao: 'Notebook', categoria: 'Eletrônicos', valorTotal: 3000, totalParcelas: 10, parcelaAtual: 2, valorParcela: 300, proxVcto: '2026-10-15', status: 'Ativo' },
    { descricao: 'Quitado', categoria: 'Outros', valorTotal: 500, totalParcelas: 5, parcelaAtual: 5, valorParcela: 100, proxVcto: '2026-10-15', status: 'Finalizado' }
  ]
};

describe('computeTotals', () => {
  const t = F.computeTotals(out, 1000, 0);
  test('entradas em dinheiro: só as recebidas e sem VR', () => {
    expect(t.entD).toBe(3000);
    expect(t.entDPend).toBe(500);
    expect(t.entVR).toBe(600);
  });
  test('saídas da conta = fixas + variáveis sem VR + parcelas ativas', () => {
    expect(t.fixas).toBe(1600);
    expect(t.varsDinheiro).toBe(400);
    expect(t.parcs).toBe(300);
    expect(t.saidas).toBe(2300);
  });
  test('gasto pago com VR sai do saldo do VR, não da conta (correção da v1)', () => {
    expect(t.varsVR).toBe(250);
    expect(t.saldoVR).toBe(350);
    expect(t.saldo).toBe(1000 + 3000 - 2300);
  });
  test('saldo previsto inclui o que falta receber', () => expect(t.saldoPrevisto).toBe(1700 + 500));
  test('fixas pendentes', () => expect(t.fixPend).toBe(100));
  test('evita erro de ponto flutuante', () => {
    const m = { ...F.emptyMonth(), variaveis: [0.1, 0.2].map((valor) => ({ valor, formaPgto: 'PIX' })) };
    expect(F.computeTotals(m, 0, 0).vars).toBe(0.3);
  });
});

describe('summarize — saldo inicial automático em cadeia', () => {
  test('o saldo final de um mês vira o saldo inicial do seguinte', () => {
    const nov = F.createMonthFromPrev(out);
    const s = estado({ '2026-10': out, '2026-11': nov });
    const out10 = F.summarize(s, '2026-10');
    const s11 = F.summarize(s, '2026-11');
    expect(s11.saldoFromPrev).toBe(true);
    expect(s11.saldoInicial).toBe(out10.saldo);
    expect(s11.saldoInicialVR).toBe(out10.saldoVR);
  });
  test('editar um mês passado atualiza os meses seguintes (na v1 ficava congelado)', () => {
    const s = estado({ '2026-10': JSON.parse(JSON.stringify(out)), '2026-11': F.createMonthFromPrev(out), '2026-12': F.createMonthFromPrev(out) });
    const antes = F.summarize(s, '2026-12').saldoInicial;
    s.months['2026-10'].variaveis.push({ data: '2026-10-30', categoria: 'Lazer', descricao: 'Show', valor: 200, formaPgto: 'PIX', obs: '' });
    expect(F.summarize(s, '2026-12').saldoInicial).toBe(F.round2(antes - 200));
  });
  test('saldo digitado (manual) não é sobrescrito', () => {
    const nov = { ...F.createMonthFromPrev(out), saldoAuto: false, saldoInicial: 42 };
    const s = estado({ '2026-10': out, '2026-11': nov });
    const r = F.summarize(s, '2026-11');
    expect(r.saldoInicial).toBe(42);
    expect(r.saldoFromPrev).toBe(false);
    expect(r.hasPrev).toBe(true);
  });
  test('mês sem anterior usa o valor digitado', () => {
    expect(F.summarize(estado({ '2026-10': out }), '2026-10').saldoInicial).toBe(1000);
  });
  test('mês inexistente devolve null', () => expect(F.summarize(estado({}), '2026-10')).toBeNull());
  test('aguenta uma cadeia longa de meses', () => {
    const months = {};
    let k = '2010-01';
    months[k] = { ...F.emptyMonth(), saldoInicial: 0, entradas: [{ tipo: 'Salário', valor: 10, recebido: true }] };
    for (let i = 0; i < 240; i++) { const n = F.shiftKey(k, 1); months[n] = F.createMonthFromPrev(months[k]); months[n].entradas.forEach((e) => { e.recebido = true; }); k = n; }
    expect(F.summarize(estado(months), k).saldo).toBe(2410);
  });
});

describe('history', () => {
  test('últimos N meses existentes até o mês visto, em ordem', () => {
    const s = estado({ '2026-08': F.emptyMonth(), '2026-09': F.emptyMonth(), '2026-10': out, '2026-12': F.emptyMonth() });
    const h = F.history(s, '2026-10', 2);
    expect(h.map((x) => x.key)).toEqual(['2026-09', '2026-10']);
    expect(h[1]).toMatchObject({ entradas: 3500, saidas: 2300 });
  });
});
