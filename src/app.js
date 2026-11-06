/* Controle Financeiro — interface (DOM). As regras de negócio ficam em src/finance.js. */
(function () {
  'use strict';
  const F = window.Finance;
  const E = F.escapeHtml;
  const $ = (id) => document.getElementById(id);

  // ── ESTADO ──────────────────────────────────────────────────────────────────
  let state = load();
  let active = 'resumo';
  const search = { entradas: '', fixas: '', variaveis: '', parcelamentos: '' };
  let form = null; // { col, index }
  const tips = [];

  function load() {
    try {
      const raw = localStorage.getItem(F.STORAGE_KEY);
      if (raw) {
        const res = F.normalizeState(JSON.parse(raw));
        if (res.ok) return res.state;
      }
    } catch (e) { /* armazenamento indisponível ou corrompido: começa vazio */ }
    return F.emptyState();
  }

  function save() {
    try { localStorage.setItem(F.STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Não foi possível salvar no navegador. Faça um backup em JSON.', 'err'); }
  }

  const curKey = () => F.monthKey(state.currentYear, state.currentMonth);
  const hasData = () => Object.keys(state.months).length > 0;
  const today = () => F.toISODate(new Date());
  const currentMonth = () => (hasData() ? F.ensureMonth(state, curKey()) : null);
  const viewMonth = () => currentMonth() || F.emptyMonth();

  /** Data padrão de um novo lançamento: hoje, se estiver vendo o mês atual; senão, o mesmo dia no mês visto. */
  function defaultDate() {
    const t = today();
    if (t.slice(0, 7) === curKey()) return t;
    const { year, month } = F.parseKey(curKey());
    const d = Math.min(Number(t.slice(8)), new Date(year, month, 0).getDate());
    return `${curKey()}-${String(d).padStart(2, '0')}`;
  }

  // ── ÍCONES ──────────────────────────────────────────────────────────────────
  const ICONS = {
    tipo: { 'Salário': '💼', 'Vale Refeição': '🍽️', Freelance: '⚡', Outros: '💰' },
    fixas: { Moradia: '🏠', Assinaturas: '📱', 'Saúde': '❤️', Transporte: '🚌', 'Educação': '📚', 'Alimentação': '🍳', Outros: '📋' },
    variaveis: { 'Alimentação': '🍽️', Mercado: '🛒', Delivery: '📦', Transporte: '🚗', 'Saúde': '💊', Lazer: '🎉', Compras: '🛍️', 'Educação': '📚', Beleza: '💅', Outros: '📋' },
    parcelas: { 'Eletrônicos': '💻', 'Vestuário': '👕', Lazer: '🎉', Viagem: '✈️', 'Saúde': '💊', 'Educação': '🎓', Outros: '📋' }
  };
  const TITLES = { resumo: 'Resumo', entradas: 'Entradas', fixas: 'Despesas Fixas', variaveis: 'Despesas Variáveis', parcelas: 'Parcelamentos', relatorios: 'Relatórios' };
  const SECTION_COL = { entradas: 'entradas', fixas: 'fixas', variaveis: 'variaveis', parcelas: 'parcelamentos' };

  // ── NAVEGAÇÃO ───────────────────────────────────────────────────────────────
  function navTo(id) {
    active = id;
    document.querySelectorAll('[data-section]').forEach((b) => b.classList.toggle('active', b.dataset.section === id));
    document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === 'section-' + id));
    $('hdr-title').textContent = TITLES[id];
    $('fab').classList.toggle('show', Boolean(SECTION_COL[id]));
    $('content').scrollTop = 0;
    render();
  }

  async function changeMonth(delta) {
    const target = F.shiftKey(curKey(), delta);
    if (hasData() && !state.months[target]) {
      const prev = state.months[F.shiftKey(target, -1)];
      const label = F.keyLabel(target, true);
      const ok = await askConfirm(`Criar ${label}?`, prev
        ? 'As despesas fixas e as entradas recorrentes (Salário e VR) serão copiadas do mês anterior, e os parcelamentos ativos avançam uma parcela.\n\nO saldo inicial continua do saldo final do mês anterior.'
        : 'Este mês não tem mês anterior cadastrado, então começa vazio.', 'Criar mês');
      if (!ok) return;
    }
    const { year, month } = F.parseKey(target);
    state.currentYear = year; state.currentMonth = month;
    const created = hasData() && !state.months[target];
    if (hasData()) F.ensureMonth(state, target);
    save();
    if (created) toast('Mês criado ✓', 'ok');
    render();
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  function render() {
    $('month-display').textContent = F.keyLabel(curKey());
    tips.length = 0;
    const R = { resumo: renderResumo, entradas: renderEntradas, fixas: renderFixas, variaveis: renderVariaveis, parcelas: renderParcelas, relatorios: renderRelatorios };
    R[active]();
  }

  const statCard = (label, value, cls, hint, extra) =>
    `<div class="stat-card ${extra || ''}"><div class="s-label">${label}</div><div class="s-value ${cls}">${value}</div>${hint ? `<div class="s-hint">${hint}</div>` : ''}</div>`;

  function panel(title, body, headExtra) {
    return `<div class="panel"><div class="panel-head"><h2>${title}</h2>${headExtra || ''}</div>${body}</div>`;
  }

  // ── RESUMO ──────────────────────────────────────────────────────────────────
  function renderResumo() {
    const el = $('section-resumo');
    if (!hasData()) {
      el.innerHTML = `<div class="panel welcome">
        <div class="ei" style="font-size:40px;margin-bottom:10px">💰</div>
        <h2>Bem-vindo ao Controle Financeiro</h2>
        <p>Registre entradas, despesas fixas e variáveis e parcelamentos mês a mês. Os dados ficam só neste navegador — faça backup em JSON quando quiser.</p>
        <div class="btns">
          <button class="btn btn-primary" data-action="start">Começar do zero</button>
          <button class="btn btn-ghost" data-action="demo">Ver com dados de exemplo</button>
        </div></div>`;
      return;
    }
    const key = curKey();
    const m = currentMonth();
    const s = F.summarize(state, key);
    const prevLabel = F.keyLabel(F.shiftKey(key, -1));

    const saldoHint = s.saldoFromPrev
      ? `Saldo final de ${prevLabel}`
      : s.hasPrev ? `Valor digitado · <button class="link-btn" data-action="use-prev-saldo">usar saldo de ${prevLabel}</button>` : 'Digite o saldo da conta no início do mês';

    const cards1 = `
      <div class="stat-card saldo-card"><label class="s-label" for="saldo-inicial">Saldo inicial</label>
        <input id="saldo-inicial" type="text" inputmode="decimal" autocomplete="off" value="${E(F.fmt(s.saldoInicial))}" aria-describedby="saldo-hint">
        <div class="s-hint" id="saldo-hint">${saldoHint}</div></div>
      ${statCard('Entradas recebidas', F.fmt(s.entD), 's-pos', s.entDPend ? `+ ${F.fmt(s.entDPend)} a receber` : 'sem o Vale Refeição')}
      ${statCard('Saídas da conta', F.fmt(s.saidas), 's-neg', 'fixas + variáveis + parcelas')}
      ${statCard('Saldo final', F.fmt(s.saldo), s.saldo >= 0 ? 's-pos' : 's-neg', s.entDPend ? `Previsto com o que falta receber: ${F.fmt(s.saldoPrevisto)}` : 'Tudo recebido', s.saldo >= 0 ? 'card-pos' : 'card-neg')}`;
    const cards2 = `
      ${statCard('Despesas fixas', F.fmt(s.fixas), 's-neg', s.fixPend ? `${F.fmt(s.fixPend)} pendente` : 'Todas pagas ✓')}
      ${statCard('Despesas variáveis', F.fmt(s.vars), 's-neg', s.varsVR ? `${F.fmt(s.varsDinheiro)} conta · ${F.fmt(s.varsVR)} VR` : '')}
      ${statCard('Parcelas do mês', F.fmt(s.parcs), 's-neg', `${m.parcelamentos.filter((p) => p.status === 'Ativo').length} parcelamento(s) ativo(s)`)}
      ${statCard('Saldo do Vale Refeição', F.fmt(s.saldoVR), s.saldoVR >= 0 ? 's-pos' : 's-neg', `${F.fmt(s.saldoInicialVR)} + ${F.fmt(s.entVR)} − ${F.fmt(s.varsVR)}`)}`;

    // Alertas: vencimentos + orçamentos
    const due = F.upcomingDue(m, key, today(), 3);
    const cats = F.categoryBreakdown(m, state.budgets).filter((c) => c.nivel === 'alerta' || c.nivel === 'estourado');
    const alerts = [
      ...due.map((d) => {
        const [cls, icon, txt] = d.dias < 0 ? ['br', '⚠️', `Venceu há ${-d.dias} dia(s)`] : d.dias === 0 ? ['by', '⏰', 'Vence hoje'] : ['bb', '📅', `Vence em ${d.dias} dia(s)`];
        return `<div class="alert"><span class="ai" aria-hidden="true">${icon}</span><span class="at">${E(d.descricao)} <span class="badge ${cls}">${txt}</span></span><span class="av s-neg">${F.fmt(d.valor)}</span></div>`;
      }),
      ...cats.map((c) => `<div class="alert"><span class="ai" aria-hidden="true">${c.nivel === 'estourado' ? '⛔' : '⚠️'}</span><span class="at">Orçamento de ${E(c.categoria)} <span class="badge ${c.nivel === 'estourado' ? 'br' : 'by'}">${c.nivel === 'estourado' ? 'estourado' : 'quase no limite'} · ${c.pct}%</span></span><span class="av">${F.fmt(c.gasto)} / ${F.fmt(c.limite)}</span></div>`)
    ];

    const fp = m.fixas.filter((f) => f.pago !== 'Sim');
    const ep = m.entradas.filter((e) => !e.recebido);
    const pend = !fp.length && !ep.length
      ? '<div class="pend-item" style="color:var(--green)">✓ Sem pendências</div>'
      : fp.map((f) => `<div class="pend-item"><span class="pl">${E(f.descricao)} <span class="badge bx">dia ${E(f.vencimento || '—')}</span></span><span class="pv s-neg">${F.fmt(f.valor)}</span></div>`).join('') +
        ep.map((e) => `<div class="pend-item"><span class="pl">${E(e.descricao)} <span class="badge by">a receber</span></span><span class="pv s-yellow">${F.fmt(e.valor)}</span></div>`).join('');

    const last = [...m.entradas.map((e) => ({ data: e.data, desc: e.descricao, val: e.valor, t: 'e' })), ...m.variaveis.map((v) => ({ data: v.data, desc: v.descricao, val: v.valor, t: 's' }))]
      .sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 8);
    const lastHtml = last.length
      ? last.map((l) => `<div class="pend-item"><span class="pl">${E(l.desc || '—')} <span style="color:var(--muted);font-size:11.5px">${F.fmtDate(l.data, true)}</span></span><span class="pv ${l.t === 'e' ? 's-pos' : 's-neg'}">${l.t === 'e' ? '+' : '−'}${F.fmt(l.val)}</span></div>`).join('')
      : '<div class="empty">Nenhum lançamento ainda.</div>';

    el.innerHTML = `<div class="grid grid-4">${cards1}</div><div class="grid grid-4">${cards2}</div>
      ${alerts.length ? panel('Atenção', alerts.join(''), `<span class="badge br">${alerts.length}</span>`) : ''}
      <div class="panels-2">${panel('Pendências do mês', pend)}${panel('Últimos lançamentos', lastHtml)}</div>`;
  }

  /** Aceita "1.234,56", "1234,56" e "1234.56". */
  function parseMoney(v) {
    let s = String(v).replace(/[R$\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? F.round2(n) : null;
  }

  // ── LISTAS ──────────────────────────────────────────────────────────────────
  function listHeader(sectionId, title, addLabel) {
    const col = SECTION_COL[sectionId];
    return `<input class="search" type="search" placeholder="Buscar…" aria-label="Buscar em ${title}" data-search="${col}" value="${E(search[col])}">
      <button class="btn btn-add" data-action="add" data-col="${col}">+ ${addLabel}</button>`;
  }

  function itemHtml(col, i, icon, iconBg, title, sub, val, valCls, statusBtn, extra) {
    return `<div class="item">
      <div class="it-icon" style="background:${iconBg}" aria-hidden="true">${icon}</div>
      <div class="it-body"><div class="it-title">${title}</div><div class="it-sub">${sub}</div>${extra || ''}</div>
      <div class="it-right"><div class="it-val ${valCls}">${val}</div>${statusBtn || ''}</div>
      <div class="it-actions">
        <button class="ia-btn" data-action="edit" data-col="${col}" data-i="${i}" aria-label="Editar">✎</button>
        <button class="ia-btn ia-del" data-action="del" data-col="${col}" data-i="${i}" aria-label="Remover">✕</button>
      </div></div>`;
  }

  /** Itens filtrados pela busca, com o índice original (para editar/remover o item certo). */
  function filtered(col, sorter) {
    const arr = viewMonth()[col].map((item, i) => ({ item, i }));
    if (sorter) arr.sort((a, b) => sorter(a.item, b.item));
    return arr.filter(({ item }) => F.matchesSearch(item, search[col]));
  }

  const emptyList = (col, txt) => search[col]
    ? `<div class="empty">Nada encontrado para “${E(search[col])}”.</div>`
    : `<div class="empty"><div class="ei">○</div>${txt} <button class="link-btn" data-action="add" data-col="${col}">Adicionar</button></div>`;

  const sub = (...parts) => parts.filter(Boolean).map(E).join(' · ');

  function renderEntradas() {
    const m = viewMonth();
    const rows = filtered('entradas', (a, b) => (a.data || '').localeCompare(b.data || ''));
    const body = rows.length ? rows.map(({ item: e, i }) => itemHtml('entradas', i, ICONS.tipo[e.tipo] || '💰', e.recebido ? 'var(--green-bg)' : 'var(--yellow-bg)',
      E(e.descricao), sub(F.fmtDate(e.data), e.tipo, e.obs), '+' + F.fmt(e.valor), 's-pos',
      `<button class="badge ${e.recebido ? 'bg' : 'by'}" data-action="toggle" data-col="entradas" data-i="${i}" aria-label="Alternar status">${e.recebido ? 'Recebido' : 'A receber'}</button>`)).join('')
      : emptyList('entradas', 'Nenhuma entrada registrada.');
    const rec = F.round2(m.entradas.filter((e) => e.recebido).reduce((a, e) => a + e.valor, 0));
    const prec = F.round2(m.entradas.filter((e) => !e.recebido).reduce((a, e) => a + e.valor, 0));
    const vr = F.round2(m.entradas.filter((e) => e.tipo === F.VR).reduce((a, e) => a + e.valor, 0));
    $('section-entradas').innerHTML = panel('Entradas', body, listHeader('entradas', 'entradas', 'Nova entrada')) +
      `<div class="grid grid-3">${statCard('Total recebido', F.fmt(rec), 's-pos')}${statCard('A receber', F.fmt(prec), 's-yellow')}${statCard('Vale Refeição no mês', F.fmt(vr), 's-pos', 'não entra no saldo da conta')}</div>`;
  }

  function renderFixas() {
    const m = viewMonth();
    const rows = filtered('fixas', (a, b) => (Number(a.vencimento) || 99) - (Number(b.vencimento) || 99));
    const body = rows.length ? rows.map(({ item: f, i }) => itemHtml('fixas', i, ICONS.fixas[f.categoria] || '📋', f.pago === 'Sim' ? 'var(--green-bg)' : 'var(--red-bg)',
      E(f.descricao), sub(f.vencimento ? `vence dia ${f.vencimento}` : 'sem vencimento', f.categoria, f.formaPgto), F.fmt(f.valor), 's-neg',
      `<button class="badge ${f.pago === 'Sim' ? 'bg' : 'br'}" data-action="toggle" data-col="fixas" data-i="${i}" aria-label="Alternar status">${f.pago === 'Sim' ? 'Pago' : 'Pendente'}</button>`)).join('')
      : emptyList('fixas', 'Nenhuma despesa fixa.');
    const tot = F.round2(m.fixas.reduce((a, f) => a + f.valor, 0));
    const pago = F.round2(m.fixas.filter((f) => f.pago === 'Sim').reduce((a, f) => a + f.valor, 0));
    $('section-fixas').innerHTML = panel('Despesas fixas', body, listHeader('fixas', 'despesas fixas', 'Nova fixa')) +
      `<div class="grid grid-3">${statCard('Total fixas', F.fmt(tot), 's-neg')}${statCard('Já pago', F.fmt(pago), 's-pos')}${statCard('Pendente', F.fmt(F.round2(tot - pago)), 's-yellow')}</div>`;
  }

  function budgetRows(m) {
    const cats = F.categoryBreakdown(m, state.budgets);
    if (!cats.length) return '<div class="empty">Sem gastos variáveis neste mês.</div>';
    const max = Math.max(...cats.map((c) => Math.max(c.gasto, c.limite)));
    return cats.map((c) => {
      const pct = c.limite ? Math.min(100, (c.gasto / c.limite) * 100) : (c.gasto / max) * 100;
      const status = c.nivel === 'estourado' ? `<span class="badge br">⛔ estourou ${F.fmt(F.round2(c.gasto - c.limite))}</span>`
        : c.nivel === 'alerta' ? `<span class="badge by">⚠ ${c.pct}% do orçamento</span>`
        : c.nivel === 'ok' ? `<span class="badge bx">${c.pct}% do orçamento</span>` : '';
      return `<div class="cat-row"><div class="cr-top"><span>${ICONS.variaveis[c.categoria] || '📋'} ${E(c.categoria)} ${status}</span>
        <span class="cr-val">${F.fmt(c.gasto)}${c.limite ? ` <span style="color:var(--muted)">/ ${F.fmt(c.limite)}</span>` : ''}</span></div>
        <div class="prog ${c.nivel === 'sem' ? 'ok' : c.nivel}"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
    }).join('');
  }

  function renderVariaveis() {
    const m = viewMonth();
    const rows = filtered('variaveis', (a, b) => (b.data || '').localeCompare(a.data || ''));
    const pg = { 'Débito': 'ba', 'Crédito': 'bb', PIX: 'bg', Dinheiro: 'bx', 'Vale Refeição': 'by' };
    const body = rows.length ? rows.map(({ item: v, i }) => itemHtml('variaveis', i, ICONS.variaveis[v.categoria] || '📋', 'var(--red-bg)',
      E(v.descricao), sub(F.fmtDate(v.data), v.categoria, v.obs), F.fmt(v.valor), 's-neg',
      `<span class="badge ${pg[v.formaPgto] || 'bx'}">${E(v.formaPgto)}</span>`)).join('')
      : emptyList('variaveis', 'Nenhuma despesa variável.');
    const s = F.summarize(state, curKey()) || F.computeTotals(m, 0, 0);
    $('section-variaveis').innerHTML = panel('Despesas variáveis', body, listHeader('variaveis', 'despesas variáveis', 'Nova despesa')) +
      `<div class="grid grid-3">${statCard('Total variáveis', F.fmt(s.vars), 's-neg')}${statCard('Pago pela conta', F.fmt(s.varsDinheiro), 's-neg')}${statCard('Pago com VR', F.fmt(s.varsVR), 's-yellow', 'sai do saldo do VR')}</div>` +
      panel('Por categoria e orçamento', budgetRows(m), '<button class="btn btn-ghost" data-action="budgets">◎ Orçamentos</button>');
  }

  function renderParcelas() {
    const m = viewMonth();
    const rows = filtered('parcelamentos', (a, b) => (a.status === b.status ? 0 : a.status === 'Ativo' ? -1 : 1));
    const body = rows.length ? rows.map(({ item: p, i }) => {
      const pct = Math.min(100, Math.round((p.parcelaAtual / p.totalParcelas) * 100));
      const ultima = p.status === 'Ativo' && p.parcelaAtual === p.totalParcelas ? '<span class="badge by">última parcela</span>' : '';
      return itemHtml('parcelamentos', i, ICONS.parcelas[p.categoria] || '📋', p.status === 'Ativo' ? 'var(--accent-dim)' : 'var(--green-bg)',
        E(p.descricao), sub(`${p.parcelaAtual}/${p.totalParcelas}`, `total ${F.fmt(p.valorTotal)}`, p.proxVcto ? `vence ${F.fmtDate(p.proxVcto)}` : ''),
        F.fmt(p.valorParcela), p.status === 'Ativo' ? 's-neg' : 's-neu',
        ultima + `<button class="badge ${p.status === 'Ativo' ? 'ba' : 'bg'}" data-action="toggle" data-col="parcelamentos" data-i="${i}" aria-label="Alternar status">${p.status}</button>`,
        `<div class="prog" style="max-width:220px"><i style="width:${pct}%"></i></div>`);
    }).join('') : emptyList('parcelamentos', 'Nenhum parcelamento.');
    const ativos = m.parcelamentos.filter((p) => p.status === 'Ativo');
    const tot = F.round2(ativos.reduce((a, p) => a + p.valorParcela, 0));
    const restante = F.round2(ativos.reduce((a, p) => a + p.valorParcela * (p.totalParcelas - p.parcelaAtual), 0));
    $('section-parcelas').innerHTML = panel('Parcelamentos', body, listHeader('parcelas', 'parcelamentos', 'Novo parcelamento')) +
      `<div class="grid grid-3">${statCard('Parcelas deste mês', F.fmt(tot), 's-accent')}${statCard('Ainda a pagar depois deste mês', F.fmt(restante), 's-neg')}${statCard('Parcelamentos ativos', String(ativos.length), 's-neu')}</div>`;
  }

  // ── RELATÓRIOS (gráficos SVG feitos à mão, sem bibliotecas) ───────────────────
  function tip(title, lines) { tips.push({ title, lines }); return tips.length - 1; }

  function compact(n) {
    const a = Math.abs(n);
    if (a >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${Math.round(n)}`;
  }

  /** Passo "redondo" (1, 2, 2,5 ou 5 × 10ⁿ) para ~4 divisões até v. */
  function niceStep(v) {
    const raw = Math.max(v, 1) / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function niceMax(v) { const st = niceStep(v); return Math.ceil(Math.max(v, 1) / st) * st; }
  const ticksTo = (max) => { const st = niceStep(max); const t = []; for (let v = 0; v <= max + 1e-9; v += st) t.push(v); return t; };

  /** Barras horizontais: gasto por categoria (uma cor só) + marca do orçamento. */
  function chartCategorias(cats, width) {
    if (!cats.length) return '<div class="empty">Sem gastos variáveis neste mês.</div>';
    const labelW = Math.min(130, width * 0.3), valueW = 120, rowH = 34, barH = 14, top = 6;
    const plotW = Math.max(60, width - labelW - valueW);
    const max = Math.max(...cats.map((c) => Math.max(c.gasto, c.limite))) || 1;
    const x = (v) => labelW + (v / max) * plotW;
    // Valor logo após a barra; só pula a marca do orçamento quando ela cairia em cima do texto.
    const labelX = (c) => { const lx = x(c.gasto) + 8; return c.limite && x(c.limite) > lx - 6 && x(c.limite) < lx + 112 ? x(c.limite) + 8 : lx; };
    const h = top + cats.length * rowH;
    const rows = cats.map((c, i) => {
      const y = top + i * rowH, cy = y + rowH / 2;
      const w = Math.max(c.gasto > 0 ? 4 : 0, x(c.gasto) - labelW);
      const color = c.nivel === 'estourado' ? 'var(--critical)' : 'var(--series-1)';
      const status = c.nivel === 'estourado' ? ' ⛔' : c.nivel === 'alerta' ? ' ⚠' : '';
      const t = tip(c.categoria, [`Gasto: ${F.fmt(c.gasto)}`, c.limite ? `Orçamento: ${F.fmt(c.limite)} (${c.pct}%)` : 'Sem orçamento definido']);
      const bar = w > 0 ? `<path class="mark" fill="${color}" d="M${labelW},${cy - barH / 2} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v${barH - 8} a4,4 0 0 1 -4,4 h${-Math.max(0, w - 4)} z"/>` : '';
      const lim = c.limite ? `<line x1="${x(c.limite)}" x2="${x(c.limite)}" y1="${cy - 11}" y2="${cy + 11}" stroke="var(--text)" stroke-width="2" stroke-linecap="round"/>` : '';
      return `<g data-tip="${t}"><rect class="hit" x="0" y="${y}" width="${width}" height="${rowH}"/>
        <text x="${labelW - 10}" y="${cy + 4}" text-anchor="end">${E(c.categoria)}</text>${bar}${lim}
        <text class="val" x="${labelX(c)}" y="${cy + 4}">${F.fmt(c.gasto)}${status}</text></g>`;
    }).join('');
    return `<svg class="chart" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Gastos variáveis por categoria">
      <line class="base-line" x1="${labelW}" x2="${labelW}" y1="0" y2="${h}"/>${rows}</svg>`;
  }

  /** Colunas agrupadas: entradas x saídas por mês (mesma escala, um eixo só). */
  function chartEvolucao(hist, width) {
    const h = 230, left = 64, right = 8, top = 12, bottom = 28;
    const plotW = width - left - right, plotH = h - top - bottom;
    const max = niceMax(Math.max(...hist.map((d) => Math.max(d.entradas, d.saidas)), 1));
    const y = (v) => top + plotH - (v / max) * plotH;
    const band = plotW / hist.length;
    const bw = Math.min(24, (band - 14) / 2);
    const grid = ticksTo(max).map((v) => `<line class="${v ? 'grid-line' : 'base-line'}" x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`).join('');
    const col = (x0, v, color) => {
      const hh = Math.max(v > 0 ? 4 : 0, top + plotH - y(v));
      if (!hh) return '';
      const yy = top + plotH - hh;
      return `<path class="mark" fill="${color}" d="M${x0},${top + plotH} v${-(hh - 4)} a4,4 0 0 1 4,-4 h${bw - 8} a4,4 0 0 1 4,4 v${hh - 4} z" data-y="${yy}"/>`;
    };
    const cols = hist.map((d, i) => {
      const cx = left + band * i + band / 2;
      const t = tip(F.keyLabel(d.key, true), [`Entradas: ${F.fmt(d.entradas)}`, `Saídas: ${F.fmt(d.saidas)}`, `Saldo final: ${F.fmt(d.saldo)}`]);
      return `<g class="col" data-tip="${t}"><rect class="hit" x="${left + band * i}" y="${top}" width="${band}" height="${plotH + bottom}"/>
        ${col(cx - bw - 1, d.entradas, 'var(--series-1)')}${col(cx + 1, d.saidas, 'var(--series-2)')}
        <text x="${cx}" y="${h - 8}" text-anchor="middle">${E(d.label)}</text></g>`;
    }).join('');
    return `<div class="legend"><span><i style="background:var(--series-1)"></i>Entradas (dinheiro)</span><span><i style="background:var(--series-2)"></i>Saídas da conta</span></div>
      <svg class="chart" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Entradas e saídas por mês">${grid}${cols}</svg>`;
  }

  /** Linha: saldo final de cada mês. */
  function chartSaldo(hist, width) {
    const h = 190, left = 64, right = 70, top = 14, bottom = 28;
    const plotW = width - left - right, plotH = h - top - bottom;
    const vals = hist.map((d) => d.saldo);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    { const st = niceStep(hi - lo || 1); hi = Math.ceil(hi / st) * st || st; lo = Math.floor(lo / st) * st; }
    const y = (v) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
    const step = hist.length > 1 ? plotW / (hist.length - 1) : 0;
    const x = (i) => left + (hist.length > 1 ? step * i : plotW / 2);
    const st = niceStep(hi - lo); const ticks = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) ticks.push(v);
    const grid = ticks.map((v) => `<line class="grid-line" x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`).join('') +
      (lo < 0 ? `<line class="base-line" x1="${left}" x2="${width - right}" y1="${y(0)}" y2="${y(0)}"/>` : '');
    const path = hist.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.saldo)}`).join(' ');
    const pts = hist.map((d, i) => {
      const t = tip(F.keyLabel(d.key, true), [`Saldo final: ${F.fmt(d.saldo)}`]);
      return `<g data-tip="${t}"><circle class="hit" cx="${x(i)}" cy="${y(d.saldo)}" r="16"/><circle cx="${x(i)}" cy="${y(d.saldo)}" r="4.5" fill="var(--series-1)" stroke="var(--card)" stroke-width="2"/>
        <text x="${x(i)}" y="${h - 8}" text-anchor="middle">${E(d.label)}</text></g>`;
    }).join('');
    const lastI = hist.length - 1;
    return `<svg class="chart" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Saldo final por mês">${grid}
      <path d="${path}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${pts}
      <text class="val" x="${x(lastI) + 10}" y="${y(hist[lastI].saldo) + 4}">${compact(hist[lastI].saldo)}</text></svg>`;
  }

  function renderRelatorios() {
    const el = $('section-relatorios');
    if (!hasData()) { el.innerHTML = '<div class="panel"><div class="empty">Adicione lançamentos para ver os gráficos.</div></div>'; return; }
    const key = curKey();
    const m = currentMonth();
    const cats = F.categoryBreakdown(m, state.budgets).filter((c) => c.gasto > 0);
    const hist = F.history(state, key, 6);

    // Mede a largura disponível antes de desenhar, para o texto não encolher no celular.
    el.innerHTML = '<div class="panel"><div class="panel-body" id="measure"></div></div>';
    const width = Math.max(260, $('measure').clientWidth);

    const tableCats = `<table class="data-table"><thead><tr><th>Categoria</th><th>Gasto</th><th>Orçamento</th><th>%</th></tr></thead><tbody>${cats.map((c) => `<tr><td>${E(c.categoria)}</td><td>${F.fmt(c.gasto)}</td><td>${c.limite ? F.fmt(c.limite) : '—'}</td><td>${c.pct != null ? c.pct + '%' : '—'}</td></tr>`).join('')}</tbody></table>`;
    const tableHist = `<table class="data-table"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo final</th></tr></thead><tbody>${hist.map((d) => `<tr><td>${E(F.keyLabel(d.key, true))}</td><td>${F.fmt(d.entradas)}</td><td>${F.fmt(d.saidas)}</td><td>${F.fmt(d.saldo)}</td></tr>`).join('')}</tbody></table>`;
    const tv = (t) => `<details class="table-view"><summary>Ver como tabela</summary><div class="table-scroll">${t}</div></details>`;

    el.innerHTML =
      panel(`Gastos variáveis por categoria · ${E(F.keyLabel(key, true))}`, `<div class="panel-body">${chartCategorias(cats, width)}${cats.some((c) => c.limite) ? '<div class="s-hint">A marca vertical é o orçamento da categoria. ⛔ = acima do orçamento.</div>' : ''}</div>${cats.length ? tv(tableCats) : ''}`,
        '<button class="btn btn-ghost" data-action="budgets">◎ Orçamentos</button>') +
      panel('Entradas x saídas · últimos meses', `<div class="panel-body">${chartEvolucao(hist, width)}</div>${tv(tableHist)}`) +
      (hist.length > 1 ? panel('Saldo final por mês', `<div class="panel-body">${chartSaldo(hist, width)}</div>`) : '');
  }

  // Tooltip (mouse e toque)
  function showTip(target, evt) {
    const t = tips[Number(target.dataset.tip)];
    if (!t) return;
    const el = $('tooltip');
    el.innerHTML = `<b>${E(t.title)}</b>${t.lines.map((l) => `<div class="tv">${E(l)}</div>`).join('')}`;
    el.hidden = false;
    const r = el.getBoundingClientRect();
    let x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - 14;
    el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
  }
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t, e); else if (e.pointerType === 'mouse') $('tooltip').hidden = true;
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t, e); else $('tooltip').hidden = true;
  });
  $('content').addEventListener('scroll', () => { $('tooltip').hidden = true; });

  // ── FORMULÁRIOS ─────────────────────────────────────────────────────────────
  const O = F.OPCOES;
  const FORMS = {
    entradas: { title: 'entrada', fields: [
      { id: 'data', label: 'Data', type: 'date' }, { id: 'tipo', label: 'Tipo', type: 'select', opts: O.tiposEntrada },
      { id: 'descricao', label: 'Descrição', type: 'text', ph: 'Ex.: Salário mensal', req: true, full: true },
      { id: 'valor', label: 'Valor (R$)', type: 'money', req: true }, { id: 'recebido', label: 'Status', type: 'select', opts: ['Recebido', 'A receber'] },
      { id: 'obs', label: 'Observações', type: 'text', ph: 'Opcional', full: true }] },
    fixas: { title: 'despesa fixa', fields: [
      { id: 'descricao', label: 'Descrição', type: 'text', ph: 'Ex.: Aluguel', req: true, full: true },
      { id: 'categoria', label: 'Categoria', type: 'select', opts: O.categoriasFixas }, { id: 'valor', label: 'Valor (R$)', type: 'money', req: true },
      { id: 'vencimento', label: 'Dia de vencimento', type: 'day', ph: '1 a 31' }, { id: 'pago', label: 'Status', type: 'select', opts: ['Não', 'Sim'], labels: ['Pendente', 'Pago'] },
      { id: 'formaPgto', label: 'Forma de pagamento', type: 'select', opts: O.formasFixas, full: true }] },
    variaveis: { title: 'despesa variável', fields: [
      { id: 'descricao', label: 'Descrição', type: 'text', ph: 'Ex.: Supermercado', req: true, full: true },
      { id: 'data', label: 'Data', type: 'date' }, { id: 'valor', label: 'Valor (R$)', type: 'money', req: true },
      { id: 'categoria', label: 'Categoria', type: 'select', opts: O.categoriasVariaveis }, { id: 'formaPgto', label: 'Forma de pagamento', type: 'select', opts: O.formasVariaveis },
      { id: 'obs', label: 'Observações', type: 'text', ph: 'Opcional', full: true }] },
    parcelamentos: { title: 'parcelamento', fields: [
      { id: 'descricao', label: 'Descrição', type: 'text', ph: 'Ex.: Notebook', req: true, full: true },
      { id: 'categoria', label: 'Categoria', type: 'select', opts: O.categoriasParcelas }, { id: 'valorTotal', label: 'Valor total (R$)', type: 'money', req: true },
      { id: 'totalParcelas', label: 'Nº de parcelas', type: 'int', ph: '6', req: true }, { id: 'parcelaAtual', label: 'Parcela deste mês', type: 'int', ph: '1', req: true },
      { id: 'proxVcto', label: 'Vencimento', type: 'date' }, { id: 'status', label: 'Status', type: 'select', opts: ['Ativo', 'Finalizado'] }] }
  };

  function fieldHtml(f, val) {
    const id = 'ff-' + f.id;
    let input;
    if (f.type === 'select') {
      const opts = [...f.opts];
      if (val && !opts.includes(val)) opts.push(val); // mantém valores antigos/personalizados
      input = `<select id="${id}" name="${f.id}">${opts.map((o, i) => `<option value="${E(o)}"${o === val ? ' selected' : ''}>${E(f.labels ? f.labels[i] || o : o)}</option>`).join('')}</select>`;
    } else {
      const attrs = { text: 'type="text" maxlength="120"', date: 'type="date"', money: 'type="number" step="0.01" min="0" inputmode="decimal"', int: 'type="number" step="1" min="1" inputmode="numeric"', day: 'type="number" step="1" min="1" max="31" inputmode="numeric"' }[f.type];
      input = `<input id="${id}" name="${f.id}" ${attrs} value="${E(val)}" placeholder="${E(f.ph || '')}"${f.req ? ' required' : ''}>`;
    }
    return `<div class="form-row"${f.full ? ' style="grid-column:1/-1"' : ''}><label for="${id}">${f.label}${f.req ? ' *' : ''}</label>${input}${f.id === 'valorTotal' ? '<div class="form-hint" id="parc-hint"></div>' : ''}</div>`;
  }

  function openForm(col, index) {
    if (col === 'budgets') return openBudgets();
    const def = FORMS[col];
    const ex = index != null ? viewMonth()[col][index] : null;
    form = { col, index: index != null ? index : null };
    $('modal-title').textContent = (ex ? 'Editar ' : 'Nova ') + def.title;
    if (!ex && col === 'parcelamentos') $('modal-title').textContent = 'Novo parcelamento';
    const defaults = { data: defaultDate(), proxVcto: defaultDate(), recebido: 'Recebido', pago: 'Não', status: 'Ativo', parcelaAtual: 1 };
    const fields = def.fields.map((f) => {
      let val = ex ? ex[f.id] : defaults[f.id];
      if (f.id === 'recebido') val = ex ? (ex.recebido ? 'Recebido' : 'A receber') : 'Recebido';
      return fieldHtml(f, val == null ? '' : val);
    });
    $('modal-body').innerHTML = `<div class="form-grid">${fields.join('')}</div>`;
    $('modal-submit').textContent = 'Salvar';
    openModal();
    if (col === 'parcelamentos') { $('modal-body').addEventListener('input', parcHint); parcHint(); }
  }

  function parcHint() {
    const h = $('parc-hint');
    if (!h) return;
    const tot = parseFloat($('ff-valorTotal').value), n = parseInt($('ff-totalParcelas').value, 10);
    h.textContent = tot > 0 && n > 0 ? `${n}× de ${F.fmt(F.parcelValue(tot, n))}` : '';
  }

  function openBudgets() {
    form = { col: 'budgets' };
    $('modal-title').textContent = 'Orçamentos por categoria';
    $('modal-body').innerHTML = `<p class="form-hint" style="margin:0">Limite mensal de gastos variáveis por categoria. Deixe em branco para não acompanhar. Você recebe um alerta a partir de 80%.</p>
      <div class="form-grid">${O.categoriasVariaveis.map((c, i) => `<div class="form-row"><label for="bud-${i}">${ICONS.variaveis[c] || ''} ${E(c)}</label>
      <input id="bud-${i}" data-cat="${E(c)}" type="number" min="0" step="10" inputmode="decimal" placeholder="—" value="${state.budgets[c] ? E(state.budgets[c]) : ''}"></div>`).join('')}</div>`;
    $('modal-submit').textContent = 'Salvar orçamentos';
    openModal();
  }

  function openModal() {
    $('form-error').hidden = true;
    $('modal-bg').classList.add('open');
    setTimeout(() => { const f = $('modal-body').querySelector('input:not([type=date]),select'); if (f && matchMedia('(min-width: 900px)').matches) f.focus(); }, 30);
  }
  function closeModal() { $('modal-bg').classList.remove('open'); $('modal-body').removeEventListener('input', parcHint); form = null; }

  function submitForm(e) {
    e.preventDefault();
    if (!form) return;
    if (form.col === 'budgets') {
      const b = {};
      $('modal-body').querySelectorAll('input[data-cat]').forEach((i) => { const v = parseFloat(i.value); if (v > 0) b[i.dataset.cat] = F.round2(v); });
      state.budgets = b; save(); closeModal(); render(); toast('Orçamentos salvos ✓', 'ok');
      return;
    }
    const def = FORMS[form.col];
    const obj = {}; const errors = [];
    $('modal-body').querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    for (const f of def.fields) {
      const el = $('ff-' + f.id);
      const raw = el.value.trim();
      const bad = (msg) => { errors.push(msg); el.setAttribute('aria-invalid', 'true'); };
      if (f.type === 'money') { const v = parseFloat(raw); if (!(v > 0)) bad(`${f.label.replace(' (R$)', '')} precisa ser maior que zero.`); obj[f.id] = F.round2(v || 0); }
      else if (f.type === 'int') { const v = parseInt(raw, 10); if (!(v >= 1)) bad(`${f.label} precisa ser 1 ou mais.`); obj[f.id] = v || 1; }
      else if (f.type === 'day') { if (raw === '') obj[f.id] = ''; else { const v = parseInt(raw, 10); if (!(v >= 1 && v <= 31)) bad('O dia de vencimento vai de 1 a 31.'); obj[f.id] = v; } }
      else if (f.id === 'recebido') obj.recebido = raw === 'Recebido';
      else { if (f.req && !raw) bad(`Preencha ${f.label.toLowerCase()}.`); obj[f.id] = raw; }
    }
    if (form.col === 'parcelamentos') {
      if (obj.parcelaAtual > obj.totalParcelas) { errors.push('A parcela deste mês não pode passar do número de parcelas.'); $('ff-parcelaAtual').setAttribute('aria-invalid', 'true'); }
      obj.valorParcela = F.parcelValue(obj.valorTotal, obj.totalParcelas);
    }
    if (errors.length) { $('form-error').textContent = errors[0]; $('form-error').hidden = false; return; }
    const m = F.ensureMonth(state, curKey());
    if (form.index != null) m[form.col][form.index] = obj; else m[form.col].push(obj);
    save(); closeModal(); render(); toast('Salvo ✓', 'ok');
  }

  // ── CONFIRMAÇÃO (substitui o confirm() do navegador) ─────────────────────────
  function askConfirm(title, msg, okLabel, danger) {
    return new Promise((resolve) => {
      $('confirm-title').textContent = title;
      $('confirm-msg').textContent = msg;
      const ok = $('confirm-ok'), cancel = $('confirm-cancel'), bg = $('confirm-bg');
      ok.textContent = okLabel || 'Confirmar';
      ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
      bg.classList.add('open'); ok.focus();
      const done = (v) => { bg.classList.remove('open'); ok.onclick = cancel.onclick = bg.onclick = null; document.removeEventListener('keydown', key, true); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      ok.onclick = () => done(true); cancel.onclick = () => done(false);
      bg.onclick = (e) => { if (e.target === bg) done(false); };
      document.addEventListener('keydown', key, true);
    });
  }

  // ── AÇÕES ───────────────────────────────────────────────────────────────────
  function toggle(col, i) {
    const it = viewMonth()[col][i];
    if (!it) return;
    if (col === 'entradas') it.recebido = !it.recebido;
    if (col === 'fixas') it.pago = it.pago === 'Sim' ? 'Não' : 'Sim';
    if (col === 'parcelamentos') it.status = it.status === 'Ativo' ? 'Finalizado' : 'Ativo';
    save(); render();
  }

  async function del(col, i) {
    const it = viewMonth()[col][i];
    if (!it || !(await askConfirm('Remover item?', `“${it.descricao || 'Sem descrição'}” será removido deste mês.`, 'Remover', true))) return;
    viewMonth()[col].splice(i, 1); save(); render(); toast('Removido.', 'ok');
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  async function importFile(file) {
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch (e) { toast('Não foi possível ler o arquivo (JSON inválido).', 'err'); return; }
    const res = F.normalizeState(parsed);
    if (!res.ok) { toast(res.error, 'err'); return; }
    const now = F.countItems(state), novo = F.countItems(res.state);
    const ok = await askConfirm('Substituir os dados?', `Agora: ${now.meses} mês(es), ${now.lancamentos} lançamento(s).\nNo arquivo: ${novo.meses} mês(es), ${novo.lancamentos} lançamento(s).${res.migrated ? '\n\nO arquivo é da versão anterior e será convertido.' : ''}\n\nOs dados atuais serão substituídos.`, 'Substituir', true);
    if (!ok) return;
    state = res.state; save(); render(); toast('Dados carregados ✓', 'ok');
  }

  async function runAction(btn) {
    const a = btn.dataset.action;
    const col = btn.dataset.col, i = btn.dataset.i != null ? Number(btn.dataset.i) : null;
    closeMenu();
    switch (a) {
      case 'add': openForm(col); break;
      case 'edit': openForm(col, i); break;
      case 'del': del(col, i); break;
      case 'toggle': toggle(col, i); break;
      case 'budgets': openBudgets(); break;
      case 'import': $('file-input').click(); break;
      case 'export-json': download(`financas_${today()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Backup salvo ✓', 'ok'); break;
      case 'export-csv':
        if (!hasData()) { toast('Ainda não há dados para exportar.', 'err'); break; }
        download(`financas_${curKey()}.csv`, F.toCSV(state, curKey()), 'text/csv;charset=utf-8'); toast('CSV exportado ✓', 'ok'); break;
      case 'start': F.ensureMonth(state, curKey()); save(); render(); break;
      case 'demo':
        if (hasData() && !(await askConfirm('Carregar dados de exemplo?', 'Os dados atuais serão substituídos por 3 meses de dados fictícios. Faça um backup antes se quiser guardá-los.', 'Carregar exemplo', true))) break;
        state = F.buildDemoState(new Date()); save(); navTo('resumo'); toast('Dados de exemplo carregados ✓', 'ok'); break;
      case 'reset':
        if (!(await askConfirm('Apagar todos os dados?', 'Todos os meses, lançamentos e orçamentos deste navegador serão apagados. Esta ação não pode ser desfeita.', 'Apagar tudo', true))) break;
        state = F.emptyState(); try { localStorage.removeItem(F.STORAGE_KEY); } catch (e) { /* nada */ } navTo('resumo'); toast('Dados apagados.', 'ok'); break;
      case 'use-prev-saldo': { const m = currentMonth(); m.saldoAuto = true; save(); render(); break; }
    }
  }

  // ── MENU ────────────────────────────────────────────────────────────────────
  function closeMenu() { $('menu').hidden = true; $('menu-btn').setAttribute('aria-expanded', 'false'); }
  $('menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $('menu').hidden;
    $('menu').hidden = !open; $('menu-btn').setAttribute('aria-expanded', String(open));
    if (open) $('menu').querySelector('button').focus();
  });

  // ── EVENTOS ─────────────────────────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-section]');
    if (nav) { navTo(nav.dataset.section); return; }
    const act = e.target.closest('[data-action]');
    if (act) { runAction(act); return; }
    if (e.target.closest('[data-close]')) { closeModal(); return; }
    if (!e.target.closest('.menu')) closeMenu();
  });
  document.addEventListener('input', (e) => {
    const col = e.target.dataset && e.target.dataset.search;
    if (!col) return;
    search[col] = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const again = document.querySelector(`.section.active [data-search="${col}"]`);
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'saldo-inicial') return;
    const v = parseMoney(e.target.value);
    if (v == null) { toast('Valor inválido. Use, por exemplo, 1.234,56', 'err'); render(); return; }
    const m = currentMonth(); m.saldoInicial = v; m.saldoAuto = false; save(); render();
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'saldo-inicial' && e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') { if ($('modal-bg').classList.contains('open')) closeModal(); closeMenu(); }
  });
  document.addEventListener('focusin', (e) => { if (e.target.id === 'saldo-inicial') e.target.select(); });

  $('modal-form').addEventListener('submit', submitForm);
  $('modal-bg').addEventListener('click', (e) => { if (e.target === $('modal-bg')) closeModal(); });
  $('prev-month').addEventListener('click', () => changeMonth(-1));
  $('next-month').addEventListener('click', () => changeMonth(1));
  $('fab').addEventListener('click', () => SECTION_COL[active] && openForm(SECTION_COL[active]));
  $('file-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });

  let resizeT;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (active === 'relatorios') render(); }, 150); });
  addEventListener('storage', (e) => { if (e.key === F.STORAGE_KEY) { state = load(); render(); } }); // outra aba alterou os dados

  // ── TOAST ───────────────────────────────────────────────────────────────────
  function toast(msg, type) {
    const t = $('toast');
    t.textContent = msg; t.className = 'show ' + (type || 'ok');
    clearTimeout(t._t); t._t = setTimeout(() => { t.className = ''; }, 2800);
  }

  // ── PWA ─────────────────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ── INÍCIO ──────────────────────────────────────────────────────────────────
  if (hasData()) save(); // grava já no formato novo (migração da v1)
  navTo('resumo');
})();
