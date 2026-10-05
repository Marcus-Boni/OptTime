# Capacidade semanal e jornadas menores

A capacidade semanal do perfil é a referência de carga horária individual.
O padrão continua sendo 40h. Pessoas com jornadas menores usam o mesmo fluxo,
sem precisar de um perfil de acesso específico para estágio.

Em cinco dias úteis:

| Capacidade semanal | Meta diária | Aviso de dia incompleto (abaixo de 75%) |
| --- | --- | --- |
| 20h | 4h | 3h |
| 30h | 6h | 4h30 |
| 40h | 8h | 6h |

O aviso de submissão é uma tolerância proporcional à meta. O progresso do dia
continua completo somente ao atingir a meta individual. A capacidade é uma
referência para indicadores, não um limite que impede registrar horas reais.

Os cálculos compartilhados ficam em `src/lib/capacity.ts`. Registro de tempo,
timesheets, assistente, resumo semanal e indicadores de equilíbrio devem usar
a capacidade da pessoa a que os dados pertencem. Ao revisar uma folha, a
capacidade do gestor não substitui a do titular.

Na integração de colaboração, o horário do Outlook informa dias e janela de
disponibilidade. A quantidade de horas continua derivada da capacidade do
perfil; a janela pode limitar essa quantidade quando for menor.

Os indicadores de equilíbrio preservam as proporções existentes: excesso
diário acima de 125% da meta e total semanal acima de 112,5% da capacidade.
Essas tolerâncias não são metas de trabalho nem regras legais de jornada.

A capacidade atual é usada ao consultar os períodos, conforme o comportamento
existente. Não há vigência histórica da capacidade armazenada por semana.
Alterar o perfil não altera os minutos registrados ou aprovações existentes.
