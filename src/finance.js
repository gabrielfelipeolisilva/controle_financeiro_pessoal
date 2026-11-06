/**
 * Controle Financeiro — regras de negócio (módulo puro, sem DOM).
 *
 * Roda no navegador (expõe `window.Finance`) e no Node (module.exports),
 * para que os testes Jest verifiquem exatamente o código usado pela interface.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Finance = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── CONSTANTES ──────────────────────────────────────────────────────────────
  const VERSION = 2;
  const STORAGE_KEY = 'cf_data'; // mesma chave da v1: os dados antigos continuam abrindo

  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MESES_A = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const VR = 'Vale Refeição';

  const OPCOES = {
    tiposEntrada: ['Salário', VR, 'Freelance', 'Outros'],
    recorrentes: ['Salário', VR], // copiadas automaticamente para o mês seguinte
    categoriasFixas: ['Moradia', 'Assinaturas', 'Saúde', 'Transporte', 'Educação', 'Alimentação', 'Outros'],
    categoriasVariaveis: ['Alimentação', 'Mercado', 'Delivery', 'Transporte', 'Saúde', 'Lazer', 'Compras', 'Educação', 'Beleza', 'Outros'],
    categoriasParcelas: ['Eletrônicos', 'Vestuário', 'Lazer', 'Viagem', 'Saúde', 'Educação', 'Outros'],
    formasFixas: ['Débito automático', 'Transferência', 'Crédito', 'PIX', 'Boleto', 'Pré-pago', 'Dinheiro'],
    formasVariaveis: ['Débito', 'Crédito', 'PIX', 'Dinheiro', VR]
  };

  const COLECOES = ['entradas', 'fixas', 'variaveis', 'parcelamentos'];
  const KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // ── DATAS E CHAVES DE MÊS ───────────────────────────────────────────────────
  const pad2 = (n) => String(n).padStart(2, '0');

  function monthKey(year, month) { return `${year}-${pad2(month)}`; }

  function parseKey(key) {
    const [y, m] = String(key).split('-').map(Number);
    return { year: y, month: m };
  }

  /** Desloca uma chave "AAAA-MM" em `delta` meses. */
  function shiftKey(key, delta) {
    const { year, month } = parseKey(key);
    const idx = year * 12 + (month - 1) + delta;
    return monthKey(Math.floor(idx / 12), (idx % 12 + 12) % 12 + 1);
  }

  function keyLabel(key, longo) {
    const { year, month } = parseKey(key);
    return `${(longo ? MESES : MESES_A)[month - 1]} ${year}`;
  }

  function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

  function lastDayOf(year, month) { return new Date(year, month, 0).getDate(); }

  /** Avança uma data ISO em `delta` meses, ajustando o dia ao fim do mês (31/01 → 28/02). */
  function advanceDate(iso, delta) {
    if (!iso || !DATE_RE.test(iso)) return iso;
    const [y, m, d] = iso.split('-').map(Number);
    const { year, month } = parseKey(shiftKey(monthKey(y, m), delta));
    return `${year}-${pad2(month)}-${pad2(Math.min(d, lastDayOf(year, month)))}`;
  }

  /** Diferença em dias entre duas datas ISO (b − a). */
  function daysBetween(a, b) {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }

  // ── FORMATAÇÃO E SEGURANÇA ──────────────────────────────────────────────────
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function fmt(n) { return brl.format(Number(n) || 0).replace(/ /g, ' '); }

  function fmtDate(iso, curto) {
    if (!iso || !DATE_RE.test(iso)) return '—';
    const [y, m, d] = iso.split('-');
    return curto ? `${d}/${m}` : `${d}/${m}/${y}`;
  }

  /** Escapa texto do usuário antes de ir para innerHTML (evita XSS, inclusive vindo de um JSON importado). */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const sum = (arr, fn) => round2(arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0));

  // ── MESES ───────────────────────────────────────────────────────────────────
  function emptyMonth() {
    return { saldoInicial: 0, saldoAuto: false, entradas: [], fixas: [], variaveis: [], parcelamentos: [] };
  }

  function emptyState(today) {
    const d = today || new Date();
    return { version: VERSION, currentYear: d.getFullYear(), currentMonth: d.getMonth() + 1, months: {}, budgets: {} };
  }

  /**
   * Cria o mês seguinte a partir de `prev`:
   * - entradas recorrentes (Salário / VR) copiadas como "a receber", com data +1 mês;
   * - despesas fixas copiadas como pendentes;
   * - parcelamentos ativos avançam +1 parcela. Só saem da lista DEPOIS da última parcela
   *   (correção da v1, que marcava a última parcela como "Finalizado" e não a cobrava);
   * - o saldo inicial fica automático (vem do saldo final do mês anterior).
   */
  function createMonthFromPrev(prev) {
    const m = emptyMonth();
    m.saldoAuto = true;
    if (!prev) return m;
    m.entradas = prev.entradas
      .filter((e) => OPCOES.recorrentes.includes(e.tipo))
      .map((e) => ({ ...e, recebido: false, data: advanceDate(e.data, 1) }));
    m.fixas = prev.fixas.map((f) => ({ ...f, pago: 'Não' }));
    m.parcelamentos = prev.parcelamentos
      .filter((p) => p.status === 'Ativo' && Number(p.parcelaAtual) < Number(p.totalParcelas))
      .map((p) => ({ ...p, parcelaAtual: Number(p.parcelaAtual) + 1, proxVcto: advanceDate(p.proxVcto, 1), status: 'Ativo' }));
    return m;
  }

  /** Garante que o mês `key` existe; cria a partir do mês anterior quando ele existe. */
  function ensureMonth(state, key) {
    if (!state.months[key]) {
      const prev = state.months[shiftKey(key, -1)];
      state.months[key] = prev ? createMonthFromPrev(prev) : emptyMonth();
    }
    return state.months[key];
  }

  // ── CÁLCULOS ────────────────────────────────────────────────────────────────
  /** Totais de um mês dado o saldo inicial (dinheiro) e o saldo inicial do VR. */
  function computeTotals(m, saldoInicial, saldoInicialVR) {
    const isVR = (e) => e.tipo === VR;
    const pagoComVR = (v) => v.formaPgto === VR;

    const entD = sum(m.entradas.filter((e) => !isVR(e) && e.recebido), (e) => e.valor);
    const entDPend = sum(m.entradas.filter((e) => !isVR(e) && !e.recebido), (e) => e.valor);
    const entVR = sum(m.entradas.filter((e) => isVR(e) && e.recebido), (e) => e.valor);
    const entPend = sum(m.entradas.filter((e) => !e.recebido), (e) => e.valor);

    const fixas = sum(m.fixas, (f) => f.valor);
    const fixPend = sum(m.fixas.filter((f) => f.pago !== 'Sim'), (f) => f.valor);
    const vars = sum(m.variaveis, (v) => v.valor);
    const varsVR = sum(m.variaveis.filter(pagoComVR), (v) => v.valor);
    const varsDinheiro = round2(vars - varsVR);
    const parcs = sum(m.parcelamentos.filter((p) => p.status === 'Ativo'), (p) => p.valorParcela);

    // Saídas que saem da conta. Gastos pagos com VR saem do saldo do VR, não da conta
    // (correção da v1, que descontava da conta um gasto feito com o cartão VR).
    const saidas = round2(fixas + varsDinheiro + parcs);
    const saldo = round2(saldoInicial + entD - saidas);
    const saldoPrevisto = round2(saldo + entDPend);
    const saldoVR = round2(saldoInicialVR + entVR - varsVR);

    return { saldoInicial: round2(saldoInicial), saldoInicialVR: round2(saldoInicialVR), entD, entDPend, entVR, entPend, fixas, fixPend, vars, varsVR, varsDinheiro, parcs, saidas, saldo, saldoPrevisto, saldoVR };
  }

  /**
   * Resumo do mês `key`, resolvendo o saldo inicial:
   * - `saldoAuto` + mês anterior existente → saldo final do mês anterior (recalculado sempre,
   *   então editar um mês passado atualiza os seguintes — na v1 o valor ficava congelado);
   * - caso contrário → o valor digitado.
   * O saldo do VR sempre continua do mês anterior quando ele existe.
   */
  function summarize(state, key, cache) {
    cache = cache || new Map();
    if (cache.has(key)) return cache.get(key);
    const m = state.months[key];
    if (!m) return null;
    const prevKey = shiftKey(key, -1);
    const prev = state.months[prevKey] ? summarize(state, prevKey, cache) : null;
    const saldoInicial = m.saldoAuto && prev ? prev.saldo : Number(m.saldoInicial) || 0;
    const saldoInicialVR = prev ? prev.saldoVR : Number(m.saldoInicialVR) || 0;
    const result = { ...computeTotals(m, saldoInicial, saldoInicialVR), saldoFromPrev: Boolean(m.saldoAuto && prev), hasPrev: Boolean(prev) };
    cache.set(key, result);
    return result;
  }

  function parcelValue(total, n) { return n > 0 ? round2(total / n) : 0; }

  /** Últimos `n` meses existentes até `key` (inclusive), para o gráfico de evolução. */
  function history(state, key, n) {
    const cache = new Map();
    const keys = Object.keys(state.months).filter((k) => k <= key).sort().slice(-(n || 6));
    return keys.map((k) => {
      const s = summarize(state, k, cache);
      return { key: k, label: keyLabel(k), entradas: round2(s.entD + s.entDPend), saidas: s.saidas, saldo: s.saldo };
    });
  }

  /** Gastos variáveis por categoria, com o orçamento (se houver), do maior para o menor. */
  function categoryBreakdown(m, budgets) {
    budgets = budgets || {};
    const cats = new Set([...OPCOES.categoriasVariaveis, ...m.variaveis.map((v) => v.categoria)]);
    return [...cats]
      .map((cat) => {
        const gasto = sum(m.variaveis.filter((v) => v.categoria === cat), (v) => v.valor);
        const limite = Number(budgets[cat]) > 0 ? Number(budgets[cat]) : 0;
        const pct = limite ? Math.round((gasto / limite) * 100) : null;
        const nivel = !limite ? 'sem' : pct > 100 ? 'estourado' : pct >= 80 ? 'alerta' : 'ok';
        return { categoria: cat, gasto, limite, pct, nivel };
      })
      .filter((c) => c.gasto > 0 || c.limite > 0)
      .sort((a, b) => b.gasto - a.gasto || a.categoria.localeCompare(b.categoria));
  }

  /**
   * Vencimentos de despesas fixas pendentes e parcelas ativas do mês `key`,
   * em relação a `todayISO`: atrasados, hoje ou nos próximos `dias` dias.
   */
  function upcomingDue(m, key, todayISO, dias) {
    const janela = dias == null ? 3 : dias;
    const { year, month } = parseKey(key);
    const out = [];
    m.fixas.forEach((f, i) => {
      const dia = parseInt(f.vencimento, 10);
      if (f.pago === 'Sim' || !dia) return;
      const data = `${year}-${pad2(month)}-${pad2(Math.min(dia, lastDayOf(year, month)))}`;
      out.push({ tipo: 'fixa', index: i, descricao: f.descricao, valor: Number(f.valor) || 0, data, dias: daysBetween(todayISO, data) });
    });
    m.parcelamentos.forEach((p, i) => {
      if (p.status !== 'Ativo' || !DATE_RE.test(p.proxVcto || '')) return;
      out.push({ tipo: 'parcela', index: i, descricao: `${p.descricao} (${p.parcelaAtual}/${p.totalParcelas})`, valor: Number(p.valorParcela) || 0, data: p.proxVcto, dias: daysBetween(todayISO, p.proxVcto) });
    });
    return out.filter((x) => x.dias <= janela).sort((a, b) => a.dias - b.dias);
  }

  /** Busca sem diferenciar maiúsculas e acentos. */
  function normalizeText(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

  function matchesSearch(item, query) {
    const q = normalizeText(query);
    if (!q) return true;
    return ['descricao', 'categoria', 'tipo', 'obs', 'formaPgto'].some((f) => normalizeText(item[f]).includes(q));
  }

  // ── IMPORTAÇÃO / MIGRAÇÃO ───────────────────────────────────────────────────
  const str = (v, max) => String(v == null ? '' : v).slice(0, max || 120);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? round2(n) : 0; };
  const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min; };
  const date = (v) => (typeof v === 'string' && DATE_RE.test(v) ? v : '');

  const normalizers = {
    entradas: (e) => ({ data: date(e.data), tipo: str(e.tipo, 40) || 'Outros', descricao: str(e.descricao), valor: num(e.valor), recebido: Boolean(e.recebido), obs: str(e.obs, 200) }),
    fixas: (f) => ({ categoria: str(f.categoria, 40) || 'Outros', descricao: str(f.descricao), valor: num(f.valor), vencimento: f.vencimento === '' || f.vencimento == null ? '' : int(f.vencimento, 1, 31), pago: f.pago === 'Sim' ? 'Sim' : 'Não', formaPgto: str(f.formaPgto, 40) }),
    variaveis: (v) => ({ data: date(v.data), categoria: str(v.categoria, 40) || 'Outros', descricao: str(v.descricao), valor: num(v.valor), formaPgto: str(v.formaPgto, 40), obs: str(v.obs, 200) }),
    parcelamentos: (p) => {
      const total = int(p.totalParcelas, 1, 480);
      const valorTotal = num(p.valorTotal);
      return { descricao: str(p.descricao), categoria: str(p.categoria, 40) || 'Outros', valorTotal, totalParcelas: total, parcelaAtual: int(p.parcelaAtual, 1, total), valorParcela: p.valorParcela != null ? num(p.valorParcela) : parcelValue(valorTotal, total), proxVcto: date(p.proxVcto), status: p.status === 'Finalizado' ? 'Finalizado' : 'Ativo' };
    }
  };

  /**
   * Valida e normaliza um estado vindo do localStorage ou de um arquivo importado.
   * Aceita o formato da v1 (sem `version`): os saldos já digitados são mantidos como manuais.
   * Retorna { ok: true, state, migrated } ou { ok: false, error }.
   */
  function normalizeState(raw, today) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.months || typeof raw.months !== 'object' || Array.isArray(raw.months)) {
      return { ok: false, error: 'O arquivo não é um backup do Controle Financeiro.' };
    }
    const legacy = raw.version == null;
    const base = emptyState(today);
    const months = {};
    for (const [key, m] of Object.entries(raw.months)) {
      if (!KEY_RE.test(key) || !m || typeof m !== 'object') continue;
      const out = { saldoInicial: Number.isFinite(Number(m.saldoInicial)) ? round2(m.saldoInicial) : 0, saldoAuto: legacy ? false : Boolean(m.saldoAuto) };
      if (m.saldoInicialVR != null) out.saldoInicialVR = num(m.saldoInicialVR);
      for (const col of COLECOES) {
        out[col] = Array.isArray(m[col]) ? m[col].filter((x) => x && typeof x === 'object').map(normalizers[col]) : [];
      }
      months[key] = out;
    }
    if (Object.keys(raw.months).length && !Object.keys(months).length) {
      return { ok: false, error: 'Nenhum mês válido encontrado no arquivo.' };
    }
    const budgets = {};
    if (raw.budgets && typeof raw.budgets === 'object') {
      for (const [cat, v] of Object.entries(raw.budgets)) if (num(v) > 0) budgets[str(cat, 40)] = num(v);
    }
    const y = int(raw.currentYear, 1970, 9999);
    const mo = int(raw.currentMonth, 1, 12);
    const validCurrent = Number.isFinite(parseInt(raw.currentYear, 10)) && Number.isFinite(parseInt(raw.currentMonth, 10));
    return {
      ok: true,
      migrated: legacy,
      state: { version: VERSION, currentYear: validCurrent ? y : base.currentYear, currentMonth: validCurrent ? mo : base.currentMonth, months, budgets }
    };
  }

  function countItems(state) {
    let n = 0;
    for (const m of Object.values(state.months)) for (const c of COLECOES) n += m[c].length;
    return { meses: Object.keys(state.months).length, lancamentos: n };
  }

  // ── EXPORTAÇÃO CSV ──────────────────────────────────────────────────────────
  /** Célula CSV: aspas escapadas e proteção contra fórmulas (=, +, -, @) ao abrir no Excel. */
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = "'" + s; // números negativos ficam como estão
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const csvNum = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');

  /** CSV do mês (separador ";" e vírgula decimal, como o Excel em português espera). */
  function toCSV(state, key) {
    const m = state.months[key];
    const head = ['Mês', 'Tipo', 'Data', 'Categoria', 'Descrição', 'Valor (R$)', 'Forma de pagamento', 'Status', 'Observações'];
    const rows = [];
    if (m) {
      const { year, month } = parseKey(key);
      m.entradas.forEach((e) => rows.push([key, 'Entrada', fmtDate(e.data), e.tipo, e.descricao, csvNum(e.valor), '', e.recebido ? 'Recebido' : 'A receber', e.obs]));
      m.fixas.forEach((f) => {
        const dia = parseInt(f.vencimento, 10);
        const data = dia ? `${pad2(Math.min(dia, lastDayOf(year, month)))}/${pad2(month)}/${year}` : '';
        rows.push([key, 'Despesa fixa', data, f.categoria, f.descricao, csvNum(-f.valor), f.formaPgto, f.pago === 'Sim' ? 'Pago' : 'Pendente', '']);
      });
      m.variaveis.forEach((v) => rows.push([key, 'Despesa variável', fmtDate(v.data), v.categoria, v.descricao, csvNum(-v.valor), v.formaPgto, '', v.obs]));
      m.parcelamentos.forEach((p) => rows.push([key, 'Parcela', fmtDate(p.proxVcto), p.categoria, `${p.descricao} (${p.parcelaAtual}/${p.totalParcelas})`, csvNum(p.status === 'Ativo' ? -p.valorParcela : 0), '', p.status, '']));
    }
    return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  }

  // ── DADOS DE EXEMPLO (fictícios) ────────────────────────────────────────────
  /**
   * Gera 3 meses de dados fictícios terminando no mês de `today`.
   * Determinístico: a mesma data gera sempre os mesmos dados (usado nos testes e no exemplo-dados.json).
   */
  function buildDemoState(today) {
    const ref = today || new Date();
    const state = emptyState(ref);
    const cur = monthKey(ref.getFullYear(), ref.getMonth() + 1);
    const k0 = shiftKey(cur, -2);
    const day = (key, d) => { const { year, month } = parseKey(key); return `${key}-${pad2(Math.min(d, lastDayOf(year, month)))}`; };

    state.months[k0] = {
      saldoInicial: 1200, saldoAuto: false, saldoInicialVR: 0,
      entradas: [
        { data: day(k0, 5), tipo: 'Salário', descricao: 'Salário mensal', valor: 4200, recebido: true, obs: '' },
        { data: day(k0, 5), tipo: VR, descricao: 'Vale Refeição', valor: 650, recebido: true, obs: 'Cartão VR' }
      ],
      fixas: [
        { categoria: 'Moradia', descricao: 'Aluguel', valor: 1500, vencimento: 5, pago: 'Sim', formaPgto: 'Transferência' },
        { categoria: 'Moradia', descricao: 'Conta de luz', valor: 140, vencimento: 12, pago: 'Sim', formaPgto: 'Boleto' },
        { categoria: 'Moradia', descricao: 'Internet', valor: 99.9, vencimento: 10, pago: 'Sim', formaPgto: 'Débito automático' },
        { categoria: 'Assinaturas', descricao: 'Streaming de vídeo', valor: 39.9, vencimento: 18, pago: 'Sim', formaPgto: 'Crédito' },
        { categoria: 'Assinaturas', descricao: 'Plano de celular', valor: 59.9, vencimento: 20, pago: 'Sim', formaPgto: 'Débito automático' },
        { categoria: 'Saúde', descricao: 'Academia', valor: 99.9, vencimento: 1, pago: 'Sim', formaPgto: 'Crédito' }
      ],
      variaveis: [
        { data: day(k0, 3), categoria: 'Mercado', descricao: 'Supermercado do mês', valor: 520.4, formaPgto: 'Débito', obs: '' },
        { data: day(k0, 9), categoria: 'Alimentação', descricao: 'Almoços no trabalho', valor: 410, formaPgto: VR, obs: '' },
        { data: day(k0, 14), categoria: 'Transporte', descricao: 'Aplicativo de transporte', valor: 86.5, formaPgto: 'Crédito', obs: '' },
        { data: day(k0, 21), categoria: 'Lazer', descricao: 'Cinema', valor: 64, formaPgto: 'PIX', obs: '' },
        { data: day(k0, 26), categoria: 'Mercado', descricao: 'Feira', valor: 92.3, formaPgto: 'Dinheiro', obs: '' }
      ],
      parcelamentos: [
        { descricao: 'Notebook', categoria: 'Eletrônicos', valorTotal: 3600, totalParcelas: 10, parcelaAtual: 4, valorParcela: 360, proxVcto: day(k0, 15), status: 'Ativo' },
        { descricao: 'Fone de ouvido', categoria: 'Eletrônicos', valorTotal: 270, totalParcelas: 3, parcelaAtual: 1, valorParcela: 90, proxVcto: day(k0, 15), status: 'Ativo' }
      ]
    };

    // Mês 2: criado pela própria regra de virada de mês.
    const k1 = shiftKey(cur, -1);
    const m1 = createMonthFromPrev(state.months[k0]);
    m1.entradas.forEach((e) => { e.recebido = true; });
    m1.entradas.push({ data: day(k1, 18), tipo: 'Freelance', descricao: 'Projeto de site freelance', valor: 800, recebido: true, obs: '' });
    m1.fixas.forEach((f) => { f.pago = 'Sim'; });
    m1.variaveis = [
      { data: day(k1, 4), categoria: 'Mercado', descricao: 'Supermercado do mês', valor: 610.2, formaPgto: 'Débito', obs: '' },
      { data: day(k1, 8), categoria: 'Alimentação', descricao: 'Almoços no trabalho', valor: 480, formaPgto: VR, obs: '' },
      { data: day(k1, 12), categoria: 'Delivery', descricao: 'Pedido de pizza', valor: 72, formaPgto: 'Crédito', obs: 'Aniversário' },
      { data: day(k1, 16), categoria: 'Saúde', descricao: 'Farmácia', valor: 48.9, formaPgto: 'PIX', obs: '' },
      { data: day(k1, 23), categoria: 'Compras', descricao: 'Presente de aniversário', valor: 150, formaPgto: 'Crédito', obs: '' }
    ];
    m1.parcelamentos.push({ descricao: 'Curso online', categoria: 'Educação', valorTotal: 600, totalParcelas: 6, parcelaAtual: 1, valorParcela: 100, proxVcto: day(k1, 20), status: 'Ativo' });
    state.months[k1] = m1;

    // Mês atual: parte paga, parte pendente — mostra alertas de vencimento e orçamento.
    const m2 = createMonthFromPrev(m1);
    const hoje = ref.getDate();
    m2.entradas.forEach((e) => { e.recebido = true; });
    m2.fixas.forEach((f) => { f.pago = Number(f.vencimento) < hoje ? 'Sim' : 'Não'; });
    m2.variaveis = [
      { data: day(cur, 2), categoria: 'Mercado', descricao: 'Supermercado do mês', valor: 548.7, formaPgto: 'Débito', obs: '' },
      { data: day(cur, Math.max(1, hoje - 3)), categoria: 'Alimentação', descricao: 'Almoços no trabalho', valor: 260, formaPgto: VR, obs: '' },
      { data: day(cur, Math.max(1, hoje - 2)), categoria: 'Delivery', descricao: 'Lanche de sábado', valor: 95, formaPgto: 'Crédito', obs: '' },
      { data: day(cur, Math.max(1, hoje - 1)), categoria: 'Delivery', descricao: 'Jantar por aplicativo', valor: 78.5, formaPgto: 'PIX', obs: '' },
      { data: day(cur, hoje), categoria: 'Transporte', descricao: 'Combustível', valor: 180, formaPgto: 'Crédito', obs: '' }
    ];
    state.months[cur] = m2;

    state.budgets = { Mercado: 700, Delivery: 150, Lazer: 200, Transporte: 300, Alimentação: 600 };
    return state;
  }

  return {
    VERSION, STORAGE_KEY, MESES, MESES_A, VR, OPCOES, COLECOES,
    monthKey, parseKey, shiftKey, keyLabel, toISODate, advanceDate, daysBetween,
    fmt, fmtDate, escapeHtml, round2, parcelValue,
    emptyMonth, emptyState, createMonthFromPrev, ensureMonth,
    computeTotals, summarize, history, categoryBreakdown, upcomingDue,
    normalizeText, matchesSearch, normalizeState, countItems, toCSV, buildDemoState
  };
});
