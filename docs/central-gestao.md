# Central de Gestão — melhorias de leitura e decisão

## Comportamento entregue

- **Radar:** orçamento de horas em destaque no portfólio e em cada projeto; contratado, consumido, saldo positivo, excedente individual e previsão. Horas de projetos sem orçamento ficam fora do percentual. Orçamento zero é um limite explícito. Busca, filtro de risco, ordenação e acesso ao projeto permitem revisar o planejamento.
- **Capacidade:** resumo da próxima semana, demanda por projeto e pessoas em atenção. A matriz distingue registros históricos e atuais de alocações futuras. Horas não registradas não representam disponibilidade. Percentuais consideram apenas pessoas com capacidade configurada; totais de horas mantêm toda a cobertura.
- **Aprovações:** busca, filtros por status/projeto/período e ordenação da fila. Cards mostram idade da submissão, alertas e distribuição por projeto. O lote exige seleção e confirmação da lista de conformes visíveis. O detalhe abre os lançamentos reais e retorna para a Central de Gestão. Rejeição exige orientação e aprovação com alertas exige confirmação.

Todos os seletores de projeto da Central usam o `ProjectCombobox` existente, com busca: filtro de aprovações, planejamento de capacidade e criação de portal. O filtro de aprovações mantém a opção “Todos os projetos”; as opções continuam limitadas aos dados autorizados pelas APIs.

## Arquivos alterados

| Arquivo | Responsabilidade |
| --- | --- |
| `src/components/hq/hq-client.tsx` | Cabeçalho, tabs responsivas, sincronização com URL e movimento reduzido |
| `src/components/hq/HealthRadarTab.tsx` | Resumo de orçamento, filtros, ordenação e estados |
| `src/components/hq/ProjectHealthCard.tsx` | Orçamento por projeto, contexto da previsão e próxima ação |
| `src/components/hq/WorkloadMatrixTab.tsx` | Resumo de capacidade, busca, atenção e leitura da matriz |
| `src/components/hq/ApprovalsTab.tsx` | Triagem, seleção explícita e confirmação de aprovação |
| `src/components/ui/progress.tsx` | Valor real exposto também à semântica acessível |
| `src/app/(dashboard)/dashboard/timesheets/[id]/page.tsx` | Nome correto do retorno para a Central |
| `src/lib/hq/budget-summary.ts` | Comparação de orçamento com cobertura consistente |
| `src/lib/hq/capacity-summary.ts` | Capacidade, saldo, excedente e cobertura dos percentuais |
| `src/lib/hq/burndown.ts` | Limite zero e distinção entre esgotamento e estouro |
| `src/lib/onboarding/tours.ts` | Passos de orçamento, matriz e fila com rotas e perfis |
| `scripts/verify-hq-budget.ts` | Regressões de orçamento, ausência e zero |
| `scripts/verify-hq-capacity.ts` | Regressões de período, saldo e capacidade indefinida |
| `package.json` | Comando `verify:hq` |
| `DESIGN.md` | Contrato visual e decisões de produto |
| `docs/central-gestao.md` | Registro da entrega e seus limites |

As fórmulas foram centralizadas em funções puras para manter a mesma cobertura entre indicadores. Foram reutilizados os componentes, APIs de leitura, editor de alocação e endpoints de aprovação existentes, sem dependências novas ou migrações. A checklist de onboarding já cobre a Central; não houve novo marco de adoção nem necessidade de incrementar a versão de conteúdo.

## Verificação

- Regressões de orçamento e capacidade, TypeScript, contrato de onboarding e Biome dos arquivos alterados.
- Build de produção com as fontes oficiais já usadas pelo projeto.
- Prévia isolada com os componentes reais e dados fictícios: desktop 1280px e celular 375px, filtros, busca, abertura de alocação, confirmação de alertas e lote filtrado. No teste do lote, duas pessoas foram selecionadas, a busca restringiu a uma, a confirmação listou apenas essa pessoa e a outra permaneceu pendente.
- Revisão independente dos cálculos, autorização existente e caminhos de retorno.

O Biome global ainda encontra problemas anteriores fora desta entrega, inclusive exemplos das skills e `src/components/projects/ProjectProgressBar.tsx`. O login local não tinha sessão disponível: mutações reais, acesso de admin/manager com dados de produção e tours autenticados não foram executados. Não houve publicação ou alteração de dados reais.

## Referências de produto

Os conceitos de contratado/consumido/saldo seguem a leitura de [orçamentos do Harvest](https://support.getharvest.com/hc/en-us/articles/360048686811-How-to-Use-Budgets). A separação entre capacidade, alocação e tempo registrado segue a distinção apresentada no [relatório de pessoas do Float](https://support.float.com/en/articles/4385599-people-report). A implementação usa os contratos e unidades já existentes no OptSolv.
