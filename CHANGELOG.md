# Changelog

Todas as mudanças relevantes deste projeto ficam registradas aqui.

## [2.0.0] — 2026-11-03

### Adicionado
- **Um único app responsivo** (`index.html`) no lugar das duas versões separadas (PC e celular): barra lateral no computador, barra inferior e botão flutuante no celular.
- **PWA:** `manifest.webmanifest`, service worker com cache offline e ícones. Pode ser instalado no celular.
- **Relatórios** com três gráficos em SVG (gastos por categoria com a marca do orçamento, entradas × saídas dos últimos 6 meses, saldo final por mês), com tooltip e "Ver como tabela".
- **Orçamento mensal por categoria** de despesa variável, com alerta a partir de 80% e aviso de orçamento estourado.
- Painel **Atenção** no resumo: contas atrasadas, que vencem hoje ou nos próximos 3 dias, e orçamentos no limite.
- **Saldo do Vale Refeição** separado do saldo da conta, continuando de um mês para o outro.
- **Saldo previsto** (incluindo o que ainda falta receber).
- **Busca** em cada lista, sem diferenciar maiúsculas e acentos.
- **Exportar mês em CSV**, compatível com o Excel em português.
- **Dados de exemplo** fictícios, gerados de forma determinística (`exemplo-dados.json` e o botão no app).
- Validação nos formulários e diálogo de confirmação próprio (no lugar do `confirm()` do navegador).
- Regras de negócio em um módulo puro (`src/finance.js`) com **73 testes Jest**, mais o CI no GitHub Actions.
- Arquivos do repositório: `README.md`, `LICENSE`, `.gitignore`, `.nojekyll`, `docs/AI-WORKFLOW.md` e screenshots.

### Corrigido
- **A última parcela não era cobrada.** Na virada de mês, o parcelamento era marcado como "Finalizado" já no mês da última parcela, que ficava fora das saídas. Agora a última parcela é cobrada, e o parcelamento só sai da lista no mês seguinte.
- **Gastos pagos com Vale Refeição reduziam o saldo da conta,** mas a entrada do VR não era somada a ela. Agora esses gastos saem do saldo do VR.
- **O saldo inicial ficava congelado.** Ele era copiado quando o mês era criado, então editar um mês anterior não atualizava os seguintes. Agora é recalculado sempre (a menos que seja digitado manualmente).
- **XSS:** descrições e observações iam para o `innerHTML` sem escape, inclusive as que vinham de um JSON importado. Agora todo texto do usuário é escapado.
- A importação aceitava qualquer JSON que tivesse a chave `months`. Agora o arquivo é validado e normalizado (tipos, limites, datas, tamanho dos textos).
- Criar um mês anterior ao primeiro mostrava a mensagem de "copiar do mês anterior" mesmo sem mês anterior.
- Um novo lançamento usava a data de hoje mesmo quando se estava vendo outro mês.

### Alterado
- Os dados de exemplo usam só nomes genéricos (por exemplo, "Streaming de vídeo" no lugar de marcas).
- A chave do `localStorage` continua `cf_data`. Os dados da v1 são convertidos automaticamente na primeira abertura, e os saldos digitados nela são mantidos como manuais.

## [1.0.0] — 2026-06-30

### Adicionado
- Duas versões separadas, `controle-financeiro_PC.html` e `controle-financeiro_CELULAR.html`, com resumo, entradas, despesas fixas, despesas variáveis, parcelamentos, virada de mês e backup em JSON.
