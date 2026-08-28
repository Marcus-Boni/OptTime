import type { TourDefinition, TourId } from "@/lib/onboarding/types";
import type { UserRole } from "@/types/user";

const ALL_ROLES: readonly UserRole[] = ["member", "manager", "admin"];
const LEADERSHIP: readonly UserRole[] = ["manager", "admin"];
const ADMIN_ONLY: readonly UserRole[] = ["admin"];

/**
 * The guided product tours.
 *
 * Content contract — read before touching this file:
 *  1. Every step that points at the UI uses the `data-tour` attribute contract.
 *     Never anchor on a class name or on a DOM position.
 *  2. Steps are filtered by role before the tour runs, so a step visible only
 *     to managers just declares `roles`.
 *  3. A missing target never breaks a tour: the engine skips optional steps
 *     whose element does not appear. Mark a step `optional: false` only when
 *     the element is guaranteed to exist for every role.
 *  4. New screen or feature? Add it here. See `docs/onboarding.md`.
 */
export const TOURS: readonly TourDefinition[] = [
  {
    id: "welcome",
    title: "Boas-vindas ao OptSolv Time",
    description:
      "O tour essencial: navegação, registro rápido, busca universal e onde pedir ajuda.",
    icon: "compass",
    estimatedMinutes: 3,
    roles: ALL_ROLES,
    entryRoute: "/dashboard",
    steps: [
      {
        id: "intro",
        title: "Bem-vindo(a) ao OptSolv Time",
        description:
          "Em menos de três minutos você vai saber registrar horas, acompanhar sua semana e encontrar qualquer coisa na plataforma. Pode sair quando quiser com Esc — o tour continua de onde parou.",
        placement: "center",
        route: "/dashboard",
        hint: "Use as setas do teclado para navegar entre os passos.",
        optional: false,
      },
      {
        id: "sidebar",
        title: "Seu mapa da plataforma",
        description:
          "Tudo que você usa no dia a dia mora nesta barra lateral. Ela pode ser recolhida para ganhar espaço — sua preferência fica salva.",
        target: '[data-tour="sidebar-nav"]',
        placement: "right",
        optional: false,
      },
      {
        id: "nav-time",
        title: "Registrar Tempo",
        description:
          "O coração do produto. Aqui você lança horas por dia, semana ou mês, revisa o que já foi apontado e fecha o timesheet da semana.",
        target: '[data-tour="nav-time"]',
        placement: "right",
        hint: "Atalho: G depois T.",
      },
      {
        id: "nav-journey",
        title: "Minha Jornada",
        description:
          "Constância, conquistas e insights pessoais. Nada aqui premia trabalhar mais — só registrar melhor e com equilíbrio.",
        target: '[data-tour="nav-journey"]',
        placement: "right",
      },
      {
        id: "nav-projects",
        title: "Projetos",
        description:
          "Consulte os projetos em que você está alocado, o consumo de budget e o escopo acordado com o cliente.",
        target: '[data-tour="nav-projects"]',
        placement: "right",
      },
      {
        id: "nav-management",
        title: "Área de Gestão",
        description:
          "Como líder, você também tem a Central de Gestão, aprovações da equipe, horas consolidadas e o cadastro de pessoas.",
        target: '[data-tour="sidebar-management"]',
        placement: "right",
        roles: LEADERSHIP,
      },
      {
        id: "quick-entry",
        title: "Registro em um clique",
        description:
          "O botão Novo Registro abre o formulário rápido de qualquer tela. Aceita horas em formato natural: 2, 2.5, 2h30 ou 150m.",
        target: '[data-tour="header-quick-entry"]',
        placement: "bottom",
        hint: "Atalho: N.",
      },
      {
        id: "quick-timer",
        title: "Ou deixe o timer contar",
        description:
          "Com Timer inicia um cronômetro persistido no servidor. Você pode fechar a aba ou trocar de máquina que ele continua rodando.",
        target: '[data-tour="header-quick-timer"]',
        placement: "bottom",
        hint: "Atalho: T.",
      },
      {
        id: "search",
        title: "Busca universal",
        description:
          "A paleta de comandos encontra páginas, dispara ações e ainda conversa com a IA quando você digita uma frase livre.",
        target: '[data-tour="header-search"]',
        placement: "bottom",
        hint: "Atalho: Ctrl/Cmd + K.",
      },
      {
        id: "timebot",
        title: "TimeBot, seu assistente",
        description:
          "Peça em português: lançar 2h no projeto X ontem, ou como está minha semana. Ele entende contexto e executa com a sua confirmação.",
        target: '[data-tour="timebot-launcher"]',
        placement: "left",
      },
      {
        id: "help",
        title: "Ajuda sempre por perto",
        description:
          "Este botão reúne todos os tours, os atalhos de teclado e as novidades de cada versão. Você pode repetir qualquer tour quando quiser.",
        target: '[data-tour="header-help"]',
        placement: "bottom",
        optional: false,
      },
      {
        id: "outro",
        title: "É isso. Bom trabalho!",
        description:
          "Na Central de Ajuda ficam seus Primeiros Passos — uma lista curta que marca sozinha o que você já fez — e todos os tours, para refazer quando quiser.",
        placement: "center",
        route: "/dashboard",
        optional: false,
      },
    ],
  },
  {
    id: "time-tracking",
    title: "Registrar horas em 2 minutos",
    description:
      "Visões de dia, semana e mês, timer persistente e o preenchimento assistido por IA.",
    icon: "clock",
    estimatedMinutes: 3,
    roles: ALL_ROLES,
    entryRoute: "/dashboard/time",
    steps: [
      {
        id: "intro",
        title: "A tela onde você passa 2 minutos por dia",
        description:
          "A meta do produto é essa: registrar o dia inteiro em menos de dois minutos. Vamos ver os quatro caminhos para chegar lá.",
        placement: "center",
        route: "/dashboard/time",
        optional: false,
      },
      {
        id: "views",
        title: "Dia, Semana, Mês e Timesheets",
        description:
          "Alterne a granularidade sem perder o contexto. A visão de semana é a mais usada para revisar tudo antes de submeter.",
        target: '[data-tour="time-view-tabs"]',
        placement: "bottom",
        route: "/dashboard/time",
      },
      {
        id: "fill-day",
        title: "Preencher meu dia",
        description:
          "A IA reconstrói seu dia a partir de reuniões do Outlook, work items do Azure DevOps e do seu histórico. Você revisa e aprova antes de salvar.",
        target: '[data-tour="time-fill-day"]',
        placement: "bottom",
        hint: "Nada é salvo sem a sua confirmação.",
      },
      {
        id: "workspace",
        title: "Sua grade de lançamentos",
        description:
          "Edite inline, duplique o dia anterior e reorganize entradas entre dias. Lançamentos já submetidos ficam bloqueados para preservar a auditoria.",
        target: '[data-tour="time-workspace"]',
        placement: "top",
      },
      {
        id: "manual",
        title: "Lançamento manual",
        description:
          "Projeto, descrição, data e duração. Vincular um work item do Azure DevOps é opcional, mas garante o sync automático de Completed Work.",
        target: '[data-tour="header-quick-entry"]',
        placement: "bottom",
      },
      {
        id: "timer",
        title: "Timer em tempo real",
        description:
          "Ao parar o cronômetro, o lançamento é criado com a duração exata. Só um timer roda por vez — iniciar um novo encerra o anterior.",
        target: '[data-tour="header-quick-timer"]',
        placement: "bottom",
      },
      {
        id: "outro",
        title: "Regras que valem lembrar",
        description:
          "Você pode lançar até 30 dias no passado, nunca no futuro, com no mínimo 1 minuto e no máximo 24 horas por entrada.",
        placement: "center",
        optional: false,
      },
    ],
  },
  {
    id: "timesheets",
    title: "Fechar e submeter a semana",
    description:
      "O fluxo de aprovação de ponta a ponta: rascunho, submissão, aprovação e correção.",
    icon: "check-square",
    estimatedMinutes: 2,
    roles: ALL_ROLES,
    entryRoute: "/dashboard/time?view=timesheets",
    steps: [
      {
        id: "intro",
        title: "Sua semana precisa ser fechada",
        description:
          "Horas registradas só viram horas pagas depois de submetidas e aprovadas. É um fluxo de quatro estados, todo auditável.",
        placement: "center",
        route: "/dashboard/time?view=timesheets",
        optional: false,
      },
      {
        id: "tab",
        title: "A aba Timesheets",
        description:
          "Aqui ficam todas as suas semanas, com total de horas, status e o histórico de quem aprovou o quê e quando.",
        target: '[data-tour="time-view-tabs"]',
        placement: "bottom",
      },
      {
        id: "list",
        title: "Semana a semana",
        description:
          "Cada cartão mostra o período, o total apontado e alertas — como dias com menos de 6 horas registradas.",
        target: '[data-tour="timesheets-list"]',
        placement: "top",
      },
      {
        id: "submit",
        title: "Submeter",
        description:
          "Ao submeter, os lançamentos da semana são travados e enviados ao seu gestor. Se algo for rejeitado, você recebe o motivo e pode editar e reenviar.",
        target: '[data-tour="timesheets-submit"]',
        placement: "left",
      },
      {
        id: "outro",
        title: "Aberto, Submetido, Aprovado",
        description:
          "Rejeitado devolve tudo para edição com o motivo em destaque. Uma semana aprovada não pode mais ser alterada — é o que garante a conformidade de pagamento.",
        placement: "center",
        optional: false,
      },
    ],
  },
  {
    id: "journey",
    title: "Sua jornada e conquistas",
    description:
      "Constância, insights de bem-estar e o mural da equipe — sem premiar excesso de horas.",
    icon: "trophy",
    estimatedMinutes: 2,
    roles: ALL_ROLES,
    entryRoute: "/dashboard/journey",
    steps: [
      {
        id: "intro",
        title: "Uma gamificação que não pede horas extras",
        description:
          "Regra de produto: nenhum XP é dado por trabalhar mais. Tudo aqui premia registrar em dia, com constância e equilíbrio.",
        placement: "center",
        route: "/dashboard/journey",
        optional: false,
      },
      {
        id: "level",
        title: "Nível e sequência",
        description:
          "Sua sequência conta semanas fechadas sem pular nenhuma. Fechar a semana no prazo é o que move o ponteiro.",
        target: '[data-tour="journey-level"]',
        placement: "bottom",
      },
      {
        id: "insights",
        title: "Insights pessoais",
        description:
          "Padrões do seu registro nas últimas semanas: distribuição por projeto, dias mais fortes e o que costuma ficar para trás.",
        target: '[data-tour="journey-insights"]',
        placement: "top",
      },
      {
        id: "balance",
        title: "Equilíbrio",
        description:
          "Um termômetro de bem-estar. Se ele apontar sobrecarga, é um sinal para conversar com seu gestor — não uma meta a superar.",
        target: '[data-tour="journey-balance"]',
        placement: "left",
      },
      {
        id: "achievements",
        title: "Conquistas",
        description:
          "Medalhas de bronze a platina por constância, detalhamento e pontualidade. Elas se desbloqueiam sozinhas conforme você usa o produto.",
        target: '[data-tour="journey-achievements"]',
        placement: "top",
      },
      {
        id: "mural",
        title: "Mural da equipe",
        description:
          "Aparecer no mural é opt-in. Você controla isso em Configurações e pode sair a qualquer momento sem perder suas conquistas.",
        target: '[data-tour="journey-mural"]',
        placement: "top",
      },
    ],
  },
  {
    id: "ai-assistant",
    title: "IA, voz e automações",
    description:
      "TimeBot, comandos de voz, resumo semanal e os níveis de autonomia do Operador.",
    icon: "bot",
    estimatedMinutes: 2,
    roles: ALL_ROLES,
    entryRoute: "/dashboard",
    steps: [
      {
        id: "intro",
        title: "A IA trabalha para você, com a sua permissão",
        description:
          "Nada é executado sem confirmação, a menos que você mesmo eleve o nível de autonomia. Toda ação fica registrada no histórico.",
        placement: "center",
        route: "/dashboard",
        optional: false,
      },
      {
        id: "timebot",
        title: "TimeBot",
        description:
          "Converse em português. Ele lança horas, responde sobre sua semana, monta relatórios e explica regras do produto.",
        target: '[data-tour="timebot-launcher"]',
        placement: "left",
        hint: "Atalho: Ctrl/Cmd + J.",
      },
      {
        id: "voice",
        title: "Comando de voz",
        description:
          "Fale o lançamento em vez de digitar. Útil quando você está saindo de uma reunião e precisa registrar antes de esquecer.",
        target: '[data-tour="header-voice"]',
        placement: "bottom",
        hint: "Atalho: Shift + Ctrl/Cmd + V.",
      },
      {
        id: "digest",
        title: "Resumo semanal",
        description:
          "Uma narrativa curta do que você fez na semana, gerada por IA. Também chega por e-mail nas segundas, se você quiser.",
        target: '[data-tour="header-digest"]',
        placement: "bottom",
      },
      {
        id: "settings",
        title: "Você define os limites",
        description:
          "Em Configurações, na aba Operador IA, você escolhe entre sempre perguntar, modo inteligente ou piloto automático — ação por ação.",
        target: '[data-tour="nav-settings"]',
        placement: "right",
      },
    ],
  },
  {
    id: "management",
    title: "Central de Gestão",
    description:
      "Radar de risco dos projetos, capacidade da equipe, aprovação em lote e portais de cliente.",
    icon: "radar",
    estimatedMinutes: 3,
    roles: LEADERSHIP,
    entryRoute: "/dashboard/hq",
    steps: [
      {
        id: "intro",
        title: "Tudo que um líder precisa, em uma tela",
        description:
          "A Central de Gestão junta saúde de projeto, capacidade, aprovações e transparência com o cliente. Vamos por abas.",
        placement: "center",
        route: "/dashboard/hq",
        optional: false,
      },
      {
        id: "radar",
        title: "Radar de Projetos",
        description:
          "Cada projeto recebe um nível de risco a partir de consumo de budget, desvio de cronograma e escopo. Filtre por risco para atacar o que dói.",
        target: '[data-tour="hq-tab-radar"]',
        placement: "bottom",
      },
      {
        id: "capacity",
        title: "Capacidade",
        description:
          "A matriz mostra horas planejadas versus registradas por pessoa e semana — sobrecarga e ociosidade aparecem antes de virarem problema.",
        target: '[data-tour="hq-tab-capacity"]',
        placement: "bottom",
      },
      {
        id: "approvals",
        title: "Aprovações inteligentes",
        description:
          "Timesheets conformes podem ser aprovados em lote; os que têm exceção ficam separados para revisão individual. Rejeição sempre exige motivo.",
        target: '[data-tour="hq-tab-approvals"]',
        placement: "bottom",
      },
      {
        id: "portal",
        title: "Portal do Cliente",
        description:
          "Gere um link somente-leitura, com senha opcional, para o cliente acompanhar horas e escopo sem precisar de conta.",
        target: '[data-tour="hq-tab-portal"]',
        placement: "bottom",
      },
      {
        id: "team-hours",
        title: "Horas da Equipe",
        description:
          "A visão consolidada para conferência e exportação: filtre por pessoa, projeto e período e leve para Excel ou PDF.",
        target: '[data-tour="nav-team-hours"]',
        placement: "right",
      },
      {
        id: "team-hours-period",
        title: "Comece pelo período",
        description:
          "Os atalhos 7d, 30d e 90d cobrem a maioria das conferências; o calendário abre um intervalo livre. Todo o resto da tela responde a esta escolha.",
        target: '[data-tour="team-hours-period"]',
        placement: "bottom",
        route: "/dashboard/team-hours",
        hint: "Períodos mais curtos carregam mais rápido.",
      },
      {
        id: "team-hours-filters",
        title: "Refine sem perder o total",
        description:
          "Busca, projeto, pessoa e ordenação rodam no banco — os indicadores acima recalculam junto e a tabela nunca carrega mais que uma página.",
        target: '[data-tour="team-hours-filters"]',
        placement: "bottom",
        route: "/dashboard/team-hours",
      },
      {
        id: "team-hours-views",
        title: "Duas leituras da mesma seleção",
        description:
          "Por colaborador mostra a semana e a divisão por projeto de quem você selecionar na lista. Registros detalhados é a conferência linha a linha.",
        target: '[data-tour="team-hours-views"]',
        placement: "bottom",
        route: "/dashboard/team-hours",
      },
      {
        id: "people",
        title: "Equipe",
        description:
          "Cadastro de pessoas: papel, gestor direto, capacidade semanal e status. Admins também convidam novos usuários por aqui.",
        target: '[data-tour="nav-people"]',
        placement: "right",
      },
      {
        id: "outro",
        title: "Uma regra importante",
        description:
          "Gestores não aprovam o próprio timesheet — ele sobe para o nível acima. Admins podem aprovar qualquer um, inclusive o próprio.",
        placement: "center",
        optional: false,
      },
    ],
  },
  {
    id: "admin-setup",
    title: "Configuração da plataforma",
    description:
      "Integrações, convites, automações e publicação de novidades para toda a empresa.",
    icon: "settings",
    estimatedMinutes: 3,
    roles: ADMIN_ONLY,
    entryRoute: "/dashboard/settings?tab=integrations",
    steps: [
      {
        id: "intro",
        title: "O que só o admin enxerga",
        description:
          "Integrações, automações e comunicação com a empresa inteira. Vale conferir tudo antes do primeiro ciclo de fechamento.",
        placement: "center",
        route: "/dashboard/settings?tab=integrations",
        optional: false,
      },
      {
        id: "tabs",
        title: "Configurações por área",
        description:
          "Experiência, produtividade, Operador IA, integrações e operações. A aba Operações é exclusiva de gestores e admins.",
        target: '[data-tour="settings-tabs"]',
        placement: "bottom",
      },
      {
        id: "integrations",
        title: "Azure DevOps, Teams e MCP",
        description:
          "Conecte o Azure DevOps para vincular work items, o Teams para notificações e digests, e o MCP para operar o tracker de dentro do seu editor.",
        target: '[data-tour="settings-integrations"]',
        placement: "top",
      },
      {
        id: "people",
        title: "Convidar pessoas",
        description:
          "Convites saem por e-mail e criam a conta no primeiro acesso. O papel padrão é membro — promova a gestor ou admin quando necessário.",
        target: '[data-tour="nav-people"]',
        placement: "right",
      },
      {
        id: "changelog",
        title: "Publicar novidades",
        description:
          "Cada versão publicada vira um aviso único para a equipe. Bem usado, é o canal mais eficiente para elevar a adesão do produto.",
        target: '[data-tour="header-changelog"]',
        placement: "bottom",
      },
      {
        id: "outro",
        title: "Antes de liberar para todos",
        description:
          "Confira o agendamento de lembretes, o digest semanal e o remetente de e-mail em Configurações, na aba Operações.",
        placement: "center",
        optional: false,
      },
    ],
  },
];

const TOUR_BY_ID = new Map<TourId, TourDefinition>(
  TOURS.map((tour) => [tour.id, tour]),
);

export function getTour(id: string): TourDefinition | null {
  return TOUR_BY_ID.get(id as TourId) ?? null;
}

export function isTourId(value: unknown): value is TourId {
  return typeof value === "string" && TOUR_BY_ID.has(value as TourId);
}

/** Tours the role is allowed to run, in catalogue order. */
export function getToursForRole(role: UserRole): TourDefinition[] {
  return TOURS.filter((tour) => tour.roles.includes(role));
}

/** Steps of a tour that apply to the role, in order. */
export function getStepsForRole(
  tour: TourDefinition,
  role: UserRole,
): TourDefinition["steps"] {
  return tour.steps.filter((step) => !step.roles || step.roles.includes(role));
}
