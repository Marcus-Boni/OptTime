import type { JsonSchemaObject } from "./tools";

/**
 * `outputSchema` of the tools whose result an assistant consumes in code, not
 * just in prose. They are published in `tools/list`; the verification scripts
 * validate real `structuredContent` against them, so a schema that drifts from
 * the data fails a test instead of a client.
 *
 * Every property is described: the schema doubles as the documentation an
 * agent reads, and it is the contract the desktop assistant parses.
 */

const string = (description: string) => ({ type: "string", description });
const nullableString = (description: string) => ({
  type: ["string", "null"],
  description,
});
const integer = (description: string) => ({ type: "integer", description });
const nullableInteger = (description: string) => ({
  type: ["integer", "null"],
  description,
});
const nullableNumber = (description: string) => ({
  type: ["number", "null"],
  description,
});
const boolean = (description: string) => ({ type: "boolean", description });
const stringList = (description: string) => ({
  type: "array",
  description,
  items: { type: "string" },
});

const PROJECT_REF_PROPERTIES = {
  id: string("ID do projeto."),
  name: string("Nome do projeto."),
  code: string("Código do projeto, ex.: OPT-001."),
  color: string("Cor do projeto em hexadecimal."),
};

const TIME_ENTRY_OUTPUT = {
  type: "object",
  description: "Lançamento de tempo.",
  required: [
    "id",
    "date",
    "durationMinutes",
    "durationLabel",
    "description",
    "billable",
    "locked",
    "project",
  ],
  properties: {
    id: string("ID do lançamento."),
    date: string("Dia trabalhado, YYYY-MM-DD."),
    durationMinutes: integer("Duração em minutos."),
    durationLabel: string("Duração legível, ex.: 2h30."),
    description: string("O que foi feito."),
    billable: boolean("Se as horas são faturáveis."),
    azureWorkItemId: nullableInteger("Work Item do Azure DevOps vinculado."),
    azureWorkItemTitle: nullableString("Título do Work Item vinculado."),
    locked: boolean("Semana submetida ou aprovada: não pode mais ser editada."),
    project: {
      type: "object",
      required: ["id", "name", "code"],
      properties: PROJECT_REF_PROPERTIES,
    },
  },
};

const ACTIVE_TIMER_OUTPUT = {
  type: ["object", "null"],
  description: "Timer em execução, ou null quando não há.",
  properties: {
    id: string("ID do timer."),
    description: string("O que está sendo feito."),
    billable: boolean("Se as horas são faturáveis."),
    startedAt: string("Início, ISO 8601 UTC."),
    pausedAt: nullableString("Instante da pausa, ou null se está rodando."),
    isPaused: boolean("Se está pausado."),
    elapsedMinutes: integer("Minutos acumulados."),
    elapsedLabel: string("Tempo acumulado legível."),
    azureWorkItemId: nullableInteger("Work Item vinculado."),
    azureWorkItemTitle: nullableString("Título do Work Item."),
    project: { type: "object", properties: PROJECT_REF_PROPERTIES },
  },
};

export const WHOAMI_OUTPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: [
    "userId",
    "name",
    "email",
    "role",
    "scopes",
    "timezone",
    "weeklyCapacityMinutes",
    "today",
    "microsoft",
    "azureDevOps",
    "eveningDigestEnabled",
  ],
  properties: {
    userId: string("ID do usuário."),
    name: string("Nome do usuário."),
    email: string("E-mail do usuário."),
    role: {
      type: "string",
      enum: ["member", "manager", "admin"],
      description: "Papel do usuário.",
    },
    scopes: stringList("Escopos concedidos ao token."),
    tokenName: string("Nome dado ao token."),
    timezone: string("Fuso em que datas e horas são interpretadas."),
    weeklyCapacityMinutes: integer("Capacidade semanal em minutos."),
    today: {
      type: "object",
      required: ["date", "totalMinutes", "dailyCapacityMinutes"],
      properties: {
        date: string("Hoje, YYYY-MM-DD."),
        totalMinutes: integer("Minutos já registrados hoje."),
        dailyCapacityMinutes: integer("Capacidade diária em minutos."),
      },
    },
    microsoft: {
      type: "object",
      required: ["connected", "needsReconnect"],
      properties: {
        connected: boolean("Se há conta Microsoft vinculada."),
        needsReconnect: boolean("Se a conexão expirou e exige novo login."),
      },
    },
    azureDevOps: {
      type: "object",
      required: ["configured"],
      properties: {
        configured: boolean("Se a integração com o Azure DevOps está ativa."),
      },
    },
    eveningDigestEnabled: boolean("Se o resumo noturno do Teams está ligado."),
  },
};

export const TODAY_SUMMARY_OUTPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: [
    "date",
    "weekday",
    "totalMinutes",
    "totalLabel",
    "billableMinutes",
    "entryCount",
    "dailyCapacityMinutes",
    "remainingMinutes",
    "isComplete",
    "byProject",
    "entries",
    "activeTimer",
    "weekTotalMinutes",
    "weeklyCapacityMinutes",
    "isWorkday",
    "targetMinutes",
  ],
  properties: {
    date: string("Dia resumido, YYYY-MM-DD."),
    weekday: string("Dia da semana por extenso."),
    totalMinutes: integer("Minutos registrados no dia."),
    totalLabel: string("Total legível."),
    billableMinutes: integer("Minutos faturáveis."),
    entryCount: integer("Quantidade de lançamentos."),
    dailyCapacityMinutes: integer("Capacidade diária (semanal ÷ 5)."),
    remainingMinutes: integer("Minutos que faltam para a capacidade diária."),
    remainingLabel: string("Quanto falta, legível."),
    isComplete: boolean("Se a capacidade diária foi atingida."),
    isWorkday: boolean(
      "False em fim de semana, dia não útil do calendário do Outlook ou período de ausência.",
    ),
    targetMinutes: integer(
      "Meta do dia: a capacidade ajustada pelo expediente do Outlook; 0 quando não é dia útil.",
    ),
    byProject: {
      type: "array",
      items: {
        type: "object",
        required: ["projectId", "projectName", "projectCode", "minutes"],
        properties: {
          projectId: string("ID do projeto."),
          projectName: string("Nome do projeto."),
          projectCode: string("Código do projeto."),
          minutes: integer("Minutos no projeto."),
          label: string("Duração legível."),
        },
      },
    },
    entries: { type: "array", items: TIME_ENTRY_OUTPUT },
    activeTimer: ACTIVE_TIMER_OUTPUT,
    weekTotalMinutes: integer("Minutos da semana até aqui."),
    weekTotalLabel: string("Total da semana legível."),
    weeklyCapacityMinutes: integer("Capacidade semanal em minutos."),
  },
};

const SUGGESTION_OUTPUT = {
  type: "object",
  required: [
    "id",
    "source",
    "sourceRef",
    "projectId",
    "projectName",
    "description",
    "date",
    "durationMinutes",
    "durationLabel",
    "billable",
    "confidence",
    "evidence",
  ],
  properties: {
    id: string(
      "Identificador estável da sugestão: o mesmo dia reconstruído gera o mesmo id. Use em opt_time_apply_suggestions.",
    ),
    source: {
      type: "string",
      enum: [
        "calendar",
        "teams_call",
        "commits",
        "work_item",
        "pattern",
        "document",
      ],
      description: "Origem da evidência.",
    },
    sourceRef: nullableString(
      "Evento da agenda, sessão de commits (ou pr<id>), chamada do Teams ou work item que originou a sugestão.",
    ),
    projectId: nullableString(
      "Projeto sugerido; null quando a evidência não identifica um: informe 'projectId' ao aplicar.",
    ),
    projectName: nullableString("Nome do projeto sugerido."),
    description: string("Descrição sugerida do lançamento."),
    date: string("Dia da sugestão, YYYY-MM-DD."),
    startsAt: nullableString(
      "Início da atividade, ISO 8601 com offset, quando ancorada no tempo.",
    ),
    durationMinutes: integer("Duração sugerida em minutos."),
    durationLabel: string("Duração legível."),
    billable: boolean("Se as horas são faturáveis."),
    azureWorkItemId: nullableInteger("Work Item vinculado, se houver."),
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Confiança na sugestão.",
    },
    evidence: string("Por que isto foi sugerido, em uma linha."),
    reasons: stringList("Mesmo conteúdo de 'evidence', para clientes antigos."),
  },
};

export const SUGGEST_OUTPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: [
    "date",
    "suggestions",
    "alreadyLoggedMinutes",
    "targetMinutes",
    "gapMinutes",
    "sources",
    "warnings",
    "notes",
  ],
  properties: {
    date: string("Dia analisado, YYYY-MM-DD."),
    suggestions: { type: "array", items: SUGGESTION_OUTPUT },
    alreadyLoggedMinutes: integer("Minutos já registrados no dia."),
    alreadyLoggedLabel: string("Já registrado, legível."),
    targetMinutes: integer("Meta diária em minutos."),
    gapMinutes: integer("Quanto falta para a meta."),
    sources: {
      type: "object",
      required: ["outlook", "teamsCalls", "azureDevOps", "history"],
      properties: {
        outlook: boolean("A agenda do Outlook foi lida."),
        teamsCalls: boolean("As chamadas do Teams foram lidas."),
        azureDevOps: boolean("O Azure DevOps foi consultado."),
        history: boolean("O histórico da semana gerou sugestão."),
        commits: integer("Sugestões nascidas de sessões de commits."),
      },
    },
    warnings: stringList(
      "Fontes que falharam ou estão indisponíveis; o plano segue sem elas.",
    ),
    notes: stringList("Orientações para o agente."),
  },
};

export const LOG_TIME_OUTPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: ["entry", "dayTotalMinutes", "dayTotalLabel"],
  properties: {
    entry: TIME_ENTRY_OUTPUT,
    dayTotalMinutes: integer("Total do dia após o lançamento."),
    dayTotalLabel: string("Total do dia legível."),
    replayed: boolean(
      "True quando a idempotencyKey já havia sido aplicada: nada foi gravado de novo.",
    ),
  },
};

export const AGENDA_OUTPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: ["timezone", "range", "sources", "warnings", "events"],
  properties: {
    timezone: string("Fuso das datas, ex.: America/Sao_Paulo."),
    range: {
      type: "object",
      required: ["start", "end"],
      properties: {
        start: string("Início do intervalo, ISO 8601 com offset."),
        end: string("Fim (exclusivo) do intervalo, ISO 8601 com offset."),
      },
    },
    sources: {
      type: "object",
      required: ["outlook"],
      properties: { outlook: boolean("A agenda do Outlook foi lida.") },
    },
    warnings: stringList("Avisos sobre a leitura."),
    events: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "iCalUId",
          "type",
          "subject",
          "start",
          "end",
          "durationMinutes",
          "isAllDay",
          "isOnline",
          "organizer",
          "isOrganizer",
          "responseStatus",
          "attendeeCount",
          "attendees",
          "showAs",
          "sensitivity",
          "loggedMinutes",
          "attendance",
        ],
        properties: {
          id: string("ID do evento no Graph."),
          iCalUId: string("Identificador estável entre séries e instâncias."),
          seriesMasterId: nullableString(
            "Série a que pertence, se recorrente.",
          ),
          type: {
            type: "string",
            enum: ["singleInstance", "occurrence", "exception", "seriesMaster"],
            description: "Tipo do evento.",
          },
          subject: string("Assunto."),
          start: string("Início, ISO 8601 com offset."),
          end: string("Fim, ISO 8601 com offset."),
          durationMinutes: integer("Duração em minutos."),
          isAllDay: boolean("Evento de dia inteiro (férias, feriado)."),
          isOnline: boolean("Reunião online."),
          joinUrl: nullableString("Link para entrar na reunião."),
          organizer: {
            type: "object",
            required: ["name", "email"],
            properties: {
              name: nullableString("Nome do organizador."),
              email: nullableString("E-mail do organizador."),
            },
          },
          isOrganizer: boolean("O usuário organiza o evento."),
          responseStatus: {
            type: "string",
            enum: [
              "organizer",
              "accepted",
              "tentativelyAccepted",
              "declined",
              "notResponded",
              "none",
            ],
            description: "Resposta do usuário ao convite.",
          },
          attendeeCount: integer("Total de convidados."),
          attendees: {
            type: "array",
            description: "No máximo 20 convidados.",
            items: {
              type: "object",
              required: ["name", "email", "type"],
              properties: {
                name: nullableString("Nome."),
                email: nullableString("E-mail."),
                type: {
                  type: "string",
                  enum: ["required", "optional", "resource"],
                  description: "Papel no convite.",
                },
              },
            },
          },
          location: nullableString("Local do evento."),
          showAs: {
            type: "string",
            enum: [
              "free",
              "tentative",
              "busy",
              "oof",
              "workingElsewhere",
              "unknown",
            ],
            description: "Como o evento aparece na disponibilidade.",
          },
          sensitivity: {
            type: "string",
            enum: ["normal", "personal", "private", "confidential"],
            description: "Sensibilidade do evento.",
          },
          webLink: nullableString("Link para abrir no Outlook."),
          description: nullableString(
            "Descrição em texto puro (até 500 caracteres); só com includeDescription.",
          ),
          suggestedProject: {
            type: ["object", "null"],
            description: "Projeto sugerido pelo assunto do evento.",
            properties: {
              id: string("ID do projeto."),
              code: nullableString("Código do projeto."),
              name: string("Nome do projeto."),
            },
          },
          loggedMinutes: integer("Minutos já registrados para este evento."),
          attendance: {
            type: ["object", "null"],
            description:
              "Presença medida pelos registros de chamada do Teams; null quando nenhum registro corresponde ao evento (os registros chegam com atraso).",
            properties: {
              joined: boolean("O usuário entrou na reunião."),
              minutes: integer("Minutos medidos no Teams."),
            },
          },
        },
      },
    },
  },
};

export const MY_WORK_ITEMS_OUTPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: ["sources", "warnings", "items"],
  properties: {
    sources: {
      type: "object",
      required: ["azureDevOps"],
      properties: { azureDevOps: boolean("O Azure DevOps foi consultado.") },
    },
    warnings: stringList("Avisos sobre a consulta."),
    items: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "title",
          "type",
          "state",
          "teamProject",
          "changedAt",
          "url",
          "loggedMinutesInOptTime",
        ],
        properties: {
          id: integer("ID do work item."),
          title: string("Título."),
          type: string("Tipo: Task, Bug, User Story…"),
          state: string("Estado no processo da organização."),
          teamProject: string("Team project do Azure DevOps."),
          areaPath: nullableString("Area path."),
          iterationPath: nullableString("Iteration path."),
          priority: nullableInteger("Prioridade."),
          originalEstimateHours: nullableNumber(
            "Estimativa original em horas.",
          ),
          remainingWorkHours: nullableNumber("Trabalho restante em horas."),
          completedWorkHours: nullableNumber("Trabalho concluído em horas."),
          changedAt: string("Última alteração, ISO 8601 com offset."),
          url: string("Link do work item."),
          parentId: nullableInteger("Work item pai."),
          optTimeProject: {
            type: ["object", "null"],
            description: "Projeto do OptTime ligado ao team project.",
            properties: {
              id: string("ID do projeto."),
              name: string("Nome do projeto."),
            },
          },
          loggedMinutesInOptTime: integer(
            "Minutos já lançados neste work item no OptTime.",
          ),
          lastLoggedAt: nullableString(
            "Quando o último lançamento foi criado, ISO 8601 com offset.",
          ),
        },
      },
    },
  },
};

export const APPLY_SUGGESTIONS_OUTPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  required: [
    "date",
    "createdEntryIds",
    "dayTotalMinutes",
    "dailyCapacityMinutes",
    "remainingMinutes",
    "replayed",
  ],
  properties: {
    date: string("Dia aplicado, YYYY-MM-DD."),
    createdEntryIds: stringList("IDs dos lançamentos criados."),
    dayTotalMinutes: integer("Total do dia após aplicar."),
    dailyCapacityMinutes: integer("Capacidade diária em minutos."),
    remainingMinutes: integer("Quanto falta para a capacidade diária."),
    replayed: boolean(
      "True quando a idempotencyKey já havia sido aplicada: nada foi gravado de novo.",
    ),
  },
};
