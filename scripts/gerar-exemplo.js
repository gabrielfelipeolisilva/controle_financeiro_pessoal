/**
 * Gera exemplo-dados.json com dados fictícios (os mesmos do botão "Carregar dados de exemplo").
 * Uso: npm run exemplo            → usa a data fixa abaixo (arquivo estável no repositório)
 *      npm run exemplo -- hoje    → usa a data de hoje
 */
const fs = require('fs');
const path = require('path');
const F = require('../src/finance');

const ref = process.argv[2] === 'hoje' ? new Date() : new Date(2026, 10, 10); // 10/11/2026
const state = F.buildDemoState(ref);
const file = path.join(__dirname, '..', 'exemplo-dados.json');
fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
const c = F.countItems(state);
console.log(`exemplo-dados.json: ${c.meses} meses, ${c.lancamentos} lançamentos (referência ${F.toISODate(ref)})`);
