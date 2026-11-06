const F = require('../src/finance');

describe('escapeHtml', () => {
  test('neutraliza HTML e atributos', () => {
    expect(F.escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(F.escapeHtml("O'Neil & cia")).toBe('O&#39;Neil &amp; cia');
    expect(F.escapeHtml(null)).toBe('');
    expect(F.escapeHtml(12)).toBe('12');
  });
});

describe('normalizeState', () => {
  test('rejeita arquivos que não são backup', () => {
    for (const x of [null, 42, 'texto', [], {}, { months: [] }, { months: 'x' }]) {
      expect(F.normalizeState(x).ok).toBe(false);
    }
  });
  test('rejeita quando nenhum mês é válido', () => {
    expect(F.normalizeState({ months: { banana: {}, '2026-13': {} } })).toMatchObject({ ok: false });
  });
  test('aceita um estado vazio', () => {
    expect(F.normalizeState({ version: 2, months: {} }).ok).toBe(true);
  });

  test('migra o formato da v1 mantendo os saldos digitados como manuais', () => {
    const v1 = {
      currentYear: 2026, currentMonth: 6,
      months: {
        '2026-06': {
          saldoInicial: 250.5,
          entradas: [{ data: '2026-06-05', tipo: 'Salário', descricao: 'Salário mensal', valor: 4500, recebido: false, obs: '' }],
          fixas: [{ categoria: 'Moradia', descricao: 'Aluguel', valor: 1800, vencimento: 5, pago: 'Não', formaPgto: 'Transferência' }],
          variaveis: [], parcelamentos: []
        }
      }
    };
    const r = F.normalizeState(v1);
    expect(r).toMatchObject({ ok: true, migrated: true });
    expect(r.state.version).toBe(F.VERSION);
    expect(r.state.budgets).toEqual({});
    expect(r.state.months['2026-06']).toMatchObject({ saldoInicial: 250.5, saldoAuto: false });
    expect(r.state.months['2026-06'].fixas[0].descricao).toBe('Aluguel');
  });

  test('limpa valores inválidos e campos desconhecidos', () => {
    const r = F.normalizeState({
      version: 2, currentYear: 'x', currentMonth: 99,
      months: {
        '2026-11': {
          saldoInicial: 'abc', saldoAuto: 1,
          entradas: [{ descricao: 'A', valor: '-50', recebido: 'sim', data: 'ontem', hack: '<script>' }, null, 'lixo'],
          fixas: [{ descricao: 'B', valor: '10.555', vencimento: 99, pago: 'talvez' }],
          variaveis: 'não é lista',
          parcelamentos: [{ descricao: 'C', valorTotal: 300, totalParcelas: 0, parcelaAtual: 7 }]
        },
        'chave-invalida': { entradas: [] }
      },
      budgets: { Mercado: '500', Lazer: -1, Delivery: 'abc' }
    }, new Date(2026, 10, 3));
    expect(r.ok).toBe(true);
    const m = r.state.months['2026-11'];
    expect(Object.keys(r.state.months)).toEqual(['2026-11']);
    expect(r.state.currentYear).toBe(2026);
    expect(r.state.currentMonth).toBe(11);
    expect(m.saldoInicial).toBe(0);
    expect(m.saldoAuto).toBe(true);
    expect(m.entradas).toEqual([{ data: '', tipo: 'Outros', descricao: 'A', valor: 0, recebido: true, obs: '' }]);
    expect(m.fixas[0]).toMatchObject({ valor: 10.56, vencimento: 31, pago: 'Não' });
    expect(m.variaveis).toEqual([]);
    expect(m.parcelamentos[0]).toMatchObject({ totalParcelas: 1, parcelaAtual: 1, valorParcela: 300, status: 'Ativo' });
    expect(r.state.budgets).toEqual({ Mercado: 500 });
  });

  test('textos longos são cortados', () => {
    const r = F.normalizeState({ version: 2, months: { '2026-11': { variaveis: [{ descricao: 'x'.repeat(5000), obs: 'y'.repeat(5000) }] } } });
    const it = r.state.months['2026-11'].variaveis[0];
    expect(it.descricao).toHaveLength(120);
    expect(it.obs).toHaveLength(200);
  });

  test('ida e volta: exportar e importar não muda nada', () => {
    const s = F.buildDemoState(new Date(2026, 10, 10));
    const r = F.normalizeState(JSON.parse(JSON.stringify(s)));
    expect(r.state).toEqual(s);
    expect(r.migrated).toBe(false);
  });
});

describe('toCSV', () => {
  const s = F.buildDemoState(new Date(2026, 10, 10));
  const csv = F.toCSV(s, '2026-11');
  const linhas = csv.replace(/^﻿/, '').split('\r\n');

  test('tem BOM, cabeçalho e uma linha por lançamento', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(linhas[0]).toBe('Mês;Tipo;Data;Categoria;Descrição;Valor (R$);Forma de pagamento;Status;Observações');
    const m = s.months['2026-11'];
    expect(linhas).toHaveLength(1 + m.entradas.length + m.fixas.length + m.variaveis.length + m.parcelamentos.length);
  });
  test('valores com vírgula decimal e despesas negativas', () => {
    expect(linhas.find((l) => l.includes('Aluguel'))).toContain(';-1500,00;');
    expect(linhas.find((l) => l.includes('Salário mensal'))).toContain(';4200,00;');
  });
  test('protege contra injeção de fórmulas e escapa aspas e ";"', () => {
    const st = F.emptyState();
    st.months['2026-11'] = { ...F.emptyMonth(), variaveis: [{ data: '2026-11-01', categoria: 'Outros', descricao: '=HYPERLINK("x")', valor: 1, formaPgto: 'PIX', obs: 'a;b' }] };
    const l = F.toCSV(st, '2026-11').split('\r\n')[1];
    expect(l).toContain(`"'=HYPERLINK(""x"")"`);
    expect(l).toContain('"a;b"');
  });
  test('mês inexistente gera só o cabeçalho', () => {
    expect(F.toCSV(F.emptyState(), '2026-01').split('\r\n')).toHaveLength(1);
  });
});
