const API_BASE = "/api/v1";

// ─── Reusable schemas ────────────────────────────────────────────────────────

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "UNAUTHORIZED" },
        message: {
          type: "string",
          example: "Missing or invalid Authorization header",
        },
        details: { nullable: true },
      },
    },
  },
};

const paginatedMeta = {
  nextCursor: {
    type: "string",
    nullable: true,
    description:
      "Cursor opaco para a próxima página. Envie como ?cursor= na próxima requisição. Nulo quando não há mais páginas.",
    example:
      "eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTAxVDEwOjAwOjAwLjAwMFoiLCJpZCI6ImFiYzEyMyJ9",
  },
};

const timeEntryDTOSchema = {
  type: "object",
  required: [
    "id",
    "userId",
    "userEmail",
    "projectId",
    "projectCode",
    "date",
    "durationMinutes",
    "billable",
    "status",
    "description",
    "createdAt",
  ],
  properties: {
    id: { type: "string", example: "te_abc123" },
    userId: { type: "string", example: "usr_xyz789" },
    userEmail: {
      type: "string",
      format: "email",
      example: "dev@optsolv.com.br",
    },
    projectId: { type: "string", example: "proj_def456" },
    projectCode: { type: "string", example: "OPT-001" },
    date: { type: "string", format: "date", example: "2026-05-01" },
    durationMinutes: { type: "integer", minimum: 1, example: 90 },
    billable: { type: "boolean", example: true },
    status: {
      type: "string",
      enum: ["draft", "submitted", "approved", "rejected"],
      description:
        "Derivado do status do timesheet vinculado. draft = sem timesheet ou timesheet em aberto.",
      example: "approved",
    },
    description: {
      type: "string",
      example: "Implementação do módulo de relatórios",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      example: "2026-05-01T14:30:00.000Z",
    },
  },
};

const userDTOSchema = {
  type: "object",
  required: ["id", "email", "displayName", "role"],
  properties: {
    id: { type: "string", example: "usr_xyz789" },
    email: { type: "string", format: "email", example: "dev@optsolv.com.br" },
    displayName: { type: "string", example: "Marcus Boni" },
    role: {
      type: "string",
      enum: ["admin", "manager", "member"],
      example: "member",
    },
  },
};

const projectDTOSchema = {
  type: "object",
  required: ["id", "name", "code", "color", "status", "billable", "createdAt"],
  properties: {
    id: { type: "string", example: "proj_def456" },
    name: { type: "string", example: "OptSolv Time Tracker" },
    code: { type: "string", example: "OPT-001" },
    color: { type: "string", example: "#6366f1" },
    status: {
      type: "string",
      enum: ["open", "active", "archived", "completed"],
      example: "active",
    },
    billable: { type: "boolean", example: true },
    createdAt: {
      type: "string",
      format: "date-time",
      example: "2026-01-15T09:00:00.000Z",
    },
  },
};

const webhookSubscriptionDTOSchema = {
  type: "object",
  required: ["id", "subscriberAppId", "url", "events", "active", "createdAt"],
  properties: {
    id: { type: "string", example: "sub_ghi012" },
    subscriberAppId: {
      type: "string",
      description: "client_id Entra do app assinante",
      example: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    },
    url: {
      type: "string",
      format: "uri",
      example: "https://opt-pms.azurewebsites.net/webhooks/opt-time",
    },
    events: {
      type: "array",
      items: { type: "string" },
      example: ["ping", "timesheet.approved"],
    },
    active: { type: "boolean", example: true },
    createdAt: {
      type: "string",
      format: "date-time",
      example: "2026-04-01T08:00:00.000Z",
    },
  },
};

// ─── Reusable parameters ─────────────────────────────────────────────────────

const cursorParam = {
  name: "cursor",
  in: "query",
  required: false,
  schema: { type: "string" },
  description:
    "Cursor de paginação opaco retornado por uma resposta anterior como nextCursor.",
};

const limitParam = {
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  description: "Número máximo de itens a retornar (1–200).",
};

// ─── Responses ───────────────────────────────────────────────────────────────

const unauthorizedResponse = {
  description: "Token M2M ausente ou inválido.",
  content: { "application/json": { schema: errorSchema } },
};
const forbiddenResponse = {
  description: "Token válido, mas sem o escopo necessário.",
  content: { "application/json": { schema: errorSchema } },
};
const rateLimitedResponse = {
  description:
    "Limite de requisições excedido. Tente novamente após a janela ser reiniciada.",
  headers: {
    "X-RateLimit-Limit": { schema: { type: "integer" } },
    "X-RateLimit-Remaining": { schema: { type: "integer" } },
    "X-RateLimit-Reset": {
      schema: { type: "integer" },
      description: "Timestamp Unix de quando a janela será reiniciada.",
    },
  },
  content: { "application/json": { schema: errorSchema } },
};

// ─── Full spec object ────────────────────────────────────────────────────────

export const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "OptSolv Time Tracker — API de Integração",
    version: "1.0.0",
    description: [
      "API REST interna para integração serviço a serviço dentro do ecossistema OptSolv.",
      "",
      "## Autenticação",
      "Todos os endpoints (exceto `/openapi.json` e `/docs`) exigem um JWT Bearer obtido via",
      "fluxo **client_credentials** do Microsoft Entra ID. Tokens delegados de usuário são rejeitados.",
      "",
      "## Escopos",
      "| Escopo | Descrição |",
      "|--------|-----------|",
      "| `opt-time.read` | Acesso somente leitura a entradas de tempo, usuários e projetos |",
      "| `opt-time.write` | Criar e gerenciar assinaturas de webhook |",
      "| `opt-time.admin` | Operações administrativas (teste de envio, gerenciamento de assinaturas) |",
      "",
      "## Limite de Requisições",
      "Padrão: 600 requisições/minuto por `client_id`. Os headers `X-RateLimit-Limit`,",
      "`X-RateLimit-Remaining` e `X-RateLimit-Reset` são incluídos em todas as respostas.",
      "",
      "## Paginação",
      "Os endpoints de listagem usam paginação baseada em cursor. Passe o valor `nextCursor` de uma resposta",
      "como o parâmetro de query `cursor` na próxima requisição.",
    ].join("\n"),
    contact: { name: "OptSolv Engineering", email: "dev@optsolv.com.br" },
  },
  servers: [{ url: API_BASE, description: "Ambiente atual" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Token M2M do Entra ID (concessão client_credentials). As App Roles definem os escopos disponíveis.",
      },
    },
    schemas: {
      Error: errorSchema,
      TimeEntryDTO: timeEntryDTOSchema,
      UserDTO: userDTOSchema,
      ProjectDTO: projectDTOSchema,
      WebhookSubscriptionDTO: webhookSubscriptionDTOSchema,
    },
  },
  paths: {
    "/time-entries": {
      get: {
        operationId: "listTimeEntries",
        summary: "Listar entradas de tempo",
        description:
          "Retorna uma lista paginada de entradas de tempo. Requer o escopo `opt-time.read`.",
        tags: ["Entradas de Tempo"],
        parameters: [
          cursorParam,
          limitParam,
          {
            name: "userId",
            in: "query",
            schema: { type: "string" },
            description: "Filtrar por ID do usuário.",
          },
          {
            name: "projectId",
            in: "query",
            schema: { type: "string" },
            description: "Filtrar por ID do projeto.",
          },
          {
            name: "projectCode",
            in: "query",
            schema: { type: "string" },
            description: "Filtrar por código do projeto (ex: OPT-001).",
          },
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date" },
            description: "Data de início (YYYY-MM-DD, inclusivo).",
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date" },
            description: "Data de fim (YYYY-MM-DD, inclusivo).",
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["draft", "submitted", "approved", "rejected"],
            },
            description: "Filtrar por status derivado.",
          },
          {
            name: "billable",
            in: "query",
            schema: { type: "string", enum: ["true", "false"] },
            description: "Filtrar pelo flag de faturável.",
          },
        ],
        responses: {
          200: {
            description: "Lista paginada de entradas de tempo.",
            headers: {
              "Cache-Control": {
                schema: { type: "string" },
                example: "private, max-age=30",
              },
              ETag: { schema: { type: "string" } },
              "X-Request-Id": { schema: { type: "string" } },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "nextCursor"],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/TimeEntryDTO" },
                    },
                    ...paginatedMeta,
                  },
                },
              },
            },
          },
          400: {
            description: "Parâmetros de query inválidos.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          401: unauthorizedResponse,
          403: forbiddenResponse,
          429: rateLimitedResponse,
        },
      },
    },
    "/time-entries/{id}": {
      get: {
        operationId: "getTimeEntry",
        summary: "Obter uma entrada de tempo",
        tags: ["Entradas de Tempo"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "ID da entrada de tempo.",
          },
        ],
        responses: {
          200: {
            description: "A entrada de tempo.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TimeEntryDTO" },
              },
            },
          },
          401: unauthorizedResponse,
          403: forbiddenResponse,
          404: {
            description: "Entrada de tempo não encontrada.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          429: rateLimitedResponse,
        },
      },
    },
    "/users": {
      get: {
        operationId: "listUsers",
        summary: "Listar usuários ativos (resumido)",
        description:
          "Retorna id, email, displayName e role de todos os usuários ativos. Requer `opt-time.read`.",
        tags: ["Usuários"],
        parameters: [cursorParam, limitParam],
        responses: {
          200: {
            description: "Lista paginada de usuários.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "nextCursor"],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/UserDTO" },
                    },
                    ...paginatedMeta,
                  },
                },
              },
            },
          },
          401: unauthorizedResponse,
          403: forbiddenResponse,
          429: rateLimitedResponse,
        },
      },
    },
    "/projects": {
      get: {
        operationId: "listProjects",
        summary: "Listar projetos",
        description: "Retorna projetos ativos. Requer `opt-time.read`.",
        tags: ["Projetos"],
        parameters: [
          cursorParam,
          limitParam,
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["open", "active", "archived", "completed"],
            },
            description: "Filtrar por status.",
          },
        ],
        responses: {
          200: {
            description: "Lista paginada de projetos.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "nextCursor"],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ProjectDTO" },
                    },
                    ...paginatedMeta,
                  },
                },
              },
            },
          },
          401: unauthorizedResponse,
          403: forbiddenResponse,
          429: rateLimitedResponse,
        },
      },
    },
    "/webhooks/subscriptions": {
      get: {
        operationId: "listWebhookSubscriptions",
        summary: "Listar assinaturas de webhook",
        description:
          "Retorna assinaturas pertencentes à aplicação chamante. Requer `opt-time.read`.",
        tags: ["Webhooks"],
        parameters: [cursorParam, limitParam],
        responses: {
          200: {
            description: "Lista paginada de assinaturas.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "nextCursor"],
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/WebhookSubscriptionDTO",
                      },
                    },
                    ...paginatedMeta,
                  },
                },
              },
            },
          },
          401: unauthorizedResponse,
          403: forbiddenResponse,
          429: rateLimitedResponse,
        },
      },
      post: {
        operationId: "createWebhookSubscription",
        summary: "Registrar uma assinatura de webhook",
        description:
          "Cria uma nova assinatura. O `secret` é usado para verificar o `X-OptSolv-Signature` nas entregas. Requer `opt-time.admin`.",
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url", "secret", "events"],
                properties: {
                  url: {
                    type: "string",
                    format: "uri",
                    example:
                      "https://opt-pms.azurewebsites.net/webhooks/opt-time",
                  },
                  secret: {
                    type: "string",
                    minLength: 16,
                    description:
                      "Segredo compartilhado para verificação de assinatura HMAC-SHA256.",
                    example: "super-secret-value",
                  },
                  events: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                    example: ["ping"],
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "Assinatura criada. O segredo é armazenado criptografado e nunca é retornado novamente.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WebhookSubscriptionDTO" },
              },
            },
          },
          400: {
            description: "Corpo da requisição inválido.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          401: unauthorizedResponse,
          403: forbiddenResponse,
          429: rateLimitedResponse,
        },
      },
    },
    "/webhooks/test-dispatch": {
      post: {
        operationId: "testDispatch",
        summary: "Disparar um evento ping de teste",
        description:
          "Envia um evento `ping` para uma URL específica para fins de teste. Não requer uma assinatura registrada. Requer `opt-time.admin`.",
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url", "secret"],
                properties: {
                  url: {
                    type: "string",
                    format: "uri",
                    example:
                      "https://opt-pms.azurewebsites.net/webhooks/opt-time",
                  },
                  secret: {
                    type: "string",
                    minLength: 16,
                    example: "super-secret-value",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Resultado da entrega.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["deliveryId", "success", "responseStatus"],
                  properties: {
                    deliveryId: { type: "string", example: "a1b2c3d4-..." },
                    success: { type: "boolean" },
                    responseStatus: {
                      type: "integer",
                      nullable: true,
                      example: 200,
                    },
                    error: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          400: {
            description: "Corpo da requisição inválido.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          401: unauthorizedResponse,
          403: forbiddenResponse,
          429: rateLimitedResponse,
        },
      },
    },
  },
} as const;
