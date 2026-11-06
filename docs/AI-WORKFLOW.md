# Como este projeto foi feito com IA

Este repositório faz parte de um portfólio sobre **usar IA para construir software**. Este documento registra o processo: de onde o projeto partiu, como a IA trabalhou, o que a revisão encontrou e as decisões tomadas.

O trabalho foi feito com o Claude (Anthropic) atuando como agente: ele leu o código existente, escreveu o novo código, rodou os testes e conferiu as telas em um navegador automatizado. Uma pessoa definiu os objetivos, escolheu o escopo e revisou o resultado.

---

## 1. Ponto de partida

A v1 eram **dois arquivos HTML independentes**, um para o computador e outro para o celular. Cada um tinha cerca de 40 KB, com CSS e JavaScript embutidos e praticamente a mesma lógica duplicada. O pedido foi em duas etapas:

1. *"O que seria interessante adicionar, mudar ou criar para subir este projeto ao repositório?"* A IA leu os dois arquivos e devolveu um diagnóstico: 4 bugs, 2 mudanças de estrutura, os arquivos que faltavam e ideias de funcionalidades.
2. *"Tudo. Lembre-se de deixar os dados sempre genéricos, não pessoais."* A partir daí, a IA implementou o diagnóstico inteiro.

## 2. O que a leitura do código encontrou

Os bugs foram encontrados **lendo o código**, antes de qualquer teste. Depois, cada um virou um teste automatizado.

| Bug | Causa | Teste que prova a correção |
|---|---|---|
| A última parcela não era cobrada | `status: nova >= total ? 'Finalizado' : 'Ativo'` finalizava no mês da última parcela | "um parcelamento de 3x é cobrado exatamente 3 vezes" |
| Gastos com VR saíam do saldo da conta | A entrada de VR era excluída do saldo, mas os gastos pagos com VR não | "gasto pago com VR sai do saldo do VR, não da conta" |
| Saldo inicial congelado | Copiado uma vez na criação do mês | "editar um mês passado atualiza os meses seguintes" |
| XSS | Texto do usuário (e do JSON importado) direto no `innerHTML` | testes de `escapeHtml` e de `normalizeState`, mais um teste no navegador com `<img onerror>` |

## 3. Como o trabalho foi feito

1. **Lista de tarefas visível:** unificar → corrigir → funcionalidades e PWA → testes e documentação → verificação.
2. **Uma fonte de verdade para as regras.** Toda a lógica (virada de mês, saldos, orçamentos, vencimentos, importação, CSV, dados de exemplo) está em `src/finance.js`, um módulo sem DOM que roda no navegador e no Node. A interface (`src/app.js`) só desenha e reage a eventos.
3. **Testes escritos junto com o código:** 73 testes Jest, com cerca de 97% de cobertura do módulo de regras.
4. **Verificação no navegador:** um script com o Chrome automatizado (Playwright) percorreu o app no computador (1440 px) e no celular (390 px): dados de exemplo, todas as seções, injeção de `<img onerror>`, validação de formulário, busca, exportação de CSV, criação de mês, saldo manual ou automático, importação de um backup da v1 e de um arquivo inválido, persistência após recarregar e registro do service worker. Nenhum erro apareceu no console.
5. **Revisão visual das capturas de tela,** que encontrou problemas invisíveis no código (veja abaixo).

## 4. O que a verificação encontrou

| Achado | Como apareceu | O que foi feito |
|---|---|---|
| **A proteção contra fórmulas no CSV estragava os números negativos.** Toda célula começando com `-` recebia `'` na frente, então `-1500,00` virava texto no Excel. | Teste do CSV falhando | A proteção agora ignora números. Um teste cobre os dois casos. |
| Os valores do gráfico de categorias apareciam longe das barras, depois da marca do orçamento | Captura de tela | O valor fica logo após a barra e só pula a marca quando ela cairia em cima do texto. |
| O eixo do gráfico mostrava "R$ 3,8 mil" e "R$ 1,3 mil" | Captura de tela | As divisões do eixo agora usam passos redondos (1, 2, 2,5 ou 5 × 10ⁿ). |
| O ícone do calendário nos campos de data ficava preto no tema escuro | Captura de tela no celular | `color-scheme: dark`. |
| O selo "última parcela" era cortado no celular | Captura de tela no celular | O selo foi para a coluna de status. |

## 5. Decisões

- **Dados sempre fictícios.** Os dados de exemplo são gerados por uma função determinística (`buildDemoState`). Um teste garante que não aparecem marcas reais (os exemplos da v1 citavam serviços de streaming pelo nome).
- **Compatibilidade com a v1:** a mesma chave do `localStorage`, migração automática, e os saldos que o usuário tinha digitado são mantidos como manuais, para os números não mudarem sozinhos.
- **Sem bibliotecas:** os gráficos são SVG gerados em JS, seguindo boas práticas de visualização (um eixo só, cor por função e não por ordem, marca de status sempre com ícone e texto, tooltip e visão em tabela).
- **Saldo final x previsto:** o saldo final mantém a regra da v1 (só entradas recebidas, todas as saídas). O previsto foi adicionado em vez de mudar o significado do número que o usuário já conhecia.

## 6. Limites honestos

- Os dados ficam só no navegador. Limpar os dados do site apaga tudo, então é preciso fazer backup em JSON.
- O roteiro de verificação no navegador foi usado durante o desenvolvimento, mas não está no repositório. Portá-lo para Playwright Test no CI está nos próximos passos.

## 7. Aprendizados

- **Pedir um diagnóstico antes da implementação** deu escopo claro e deixou a pessoa escolher ("tudo").
- **Transformar cada bug em teste** prova a correção e evita que ele volte.
- **A IA conferindo o próprio trabalho com ferramentas** (testes, navegador, capturas de tela) achou um bug que ela mesma introduziu (CSV) e quatro problemas visuais que a leitura do código não mostrava.
