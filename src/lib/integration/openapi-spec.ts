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
    integrationKey: {
      type: "string",
      nullable: true,
      description: "Chave de integração padronizada do projeto.",
      example: "MARCA-AMBIENTAL-INT",
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
    description: `API REST interna para integração serviço a serviço dentro do ecossistema OptSolv.

## Autenticação

Todos os endpoints (exceto \`/openapi.json\` e \`/docs\`) exigem um token Bearer, aceitando tanto o JWT M2M obtido via fluxo **client_credentials** do Microsoft Entra ID quanto a Chave de Integração Padronizada (API Key). Tokens delegados de usuário são rejeitados. A autenticação é estritamente de máquina para máquina utilizando identidades de serviço registradas.

#### Como Obter o Token de Acesso:
Para obter o token de acesso, envie uma requisição POST codificada em formulário (\`application/x-www-form-urlencoded\`) para o endpoint de token do Microsoft Entra ID da sua organização:

\`\`\`bash
curl -X POST \\
  "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=<YOUR_CLIENT_ID>" \\
  -d "client_secret=<YOUR_CLIENT_SECRET>" \\
  -d "scope=api://<OPT_TIME_CLIENT_ID>/.default" \\
  -d "grant_type=client_credentials"
\`\`\`

A resposta de sucesso retornará o token no campo \`access_token\` do payload JSON. Esse token JWT deve ser repassado em todas as requisições no cabeçalho HTTP:

\`\`\`http
Authorization: Bearer <seu_token_jwt_aqui>
\`\`\`

---

### 🔐 2. Escopos & App Roles

A autorização é controlada no nível das App Roles concedidas ao aplicativo cliente. Certifique-se de que a aplicação possua o escopo correspondente no Azure Portal:

| Escopo | Permissão | Descrição |
| :--- | :--- | :--- |
| \`opt-time.read\` | Leitura | Permite listar e ler registros de tempo, usuários, projetos e assinaturas de webhook. |
| \`opt-time.write\` | Escrita | Permite registrar, modificar ou excluir configurações de webhooks e integrações. |
| \`opt-time.admin\` | Admin | Operações administrativas completas, como envio de eventos de teste (\`test-dispatch\`). |

---

### 📈 3. Controle de Vazão (Rate Limiting)

Para preservar o desempenho e estabilidade dos servidores, os limites são definidos por aplicativo consumidor (\`client_id\`):

- **Limite padrão**: 600 requisições por minuto.
- **Cabeçalhos de Resposta**: Use os headers abaixo para monitorar sua cota:
  - \`X-RateLimit-Limit\`: Total de requisições permitidas na janela (600).
  - \`X-RateLimit-Remaining\`: Requisições restantes na janela atual.
  - \`X-RateLimit-Reset\`: Timestamp Unix (segundos) informando quando o limite será resetado.

Ao exceder o limite, o servidor responderá com \`429 Too Many Requests\` contendo a mensagem no formato padrão de erro.

---

### 🔄 4. Paginação baseada em Cursor

Para garantir alta performance em grandes listagens, as respostas são paginadas usando cursores. 

- As rotas de listagem suportam os parâmetros de busca \`limit\` (1 a 200, padrão 50) e \`cursor\` (opcional).
- O objeto retornado no sucesso possui o array \`data\` e a string \`nextCursor\` (ou \`null\` se não houver mais dados).
- Para ler a página seguinte, copie o valor de \`nextCursor\` e envie-o no parâmetro \`?cursor=\` na requisição seguinte.

---

### ⚡ 5. Webhooks & Notificações em Tempo Real

Assinaturas de webhook permitem receber eventos de apontamento de forma passiva no seu serviço receptor.

#### Registro e Segredo Compartilhado:
Ao criar uma assinatura via \`POST /webhooks/subscriptions\`, defina uma \`url\` HTTPS estável e insira um segredo (\`secret\`) de no mínimo 16 caracteres. O segredo será criptografado e servirá para assinar as requisições de entrega. Ele nunca mais será retornado em texto claro.

#### Validação de Assinatura (Segurança):
Toda notificação de webhook inclui o cabeçalho \`X-OptSolv-Signature: sha256=<assinatura-hexadecimal>\`.
**É mandatório** que o destinatário verifique esta assinatura utilizando o algoritmo HMAC-SHA256 sobre o corpo bruto (raw body) da requisição com a chave secreta cadastrada:

\`\`\`typescript
import { createHmac, timingSafeEqual } from "node:crypto";

function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const match = signatureHeader.match(/^sha256=(.+)$/);
  if (!match) return false;
  const hash = match[1];

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(hash, "hex");

  return expectedBuffer.length === signatureBuffer.length && 
         timingSafeEqual(expectedBuffer, signatureBuffer);
}
\`\`\`

#### Política de Retentativa (Backoff):
Se sua aplicação responder com status fora da faixa 2xx (ex: 500, 503) ou sofrer timeout, a notificação será reagendada:

| Tentativa | Atraso após falha |
| :---: | :--- |
| 1ª | Imediato (Primeira tentativa) |
| 2ª | 1 minuto |
| 3ª | 2 minutos |
| 4ª | 4 minutos |
| 5ª | 8 minutos |
| 6ª (final) | 16 minutos (se falhar, o status passa para \`failed\`) |

---

### ⚠️ 6. Estrutura de Erro Padrão

A API formata respostas de erro de maneira uniforme:

\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Parâmetros de entrada inválidos",
    "details": {
      "from": ["Formato de data inválido. Use YYYY-MM-DD."]
    }
  }
}
\`\`\`

Códigos de erro: \`UNAUTHORIZED\` (401), \`FORBIDDEN\` (403), \`NOT_FOUND\` (404), \`VALIDATION_ERROR\` (400), \`RATE_LIMITED\` (429), \`INTERNAL_ERROR\` (500).`,
    contact: { name: "OptSolv Engineering", email: "dev@optsolv.com.br" },
  },
  servers: [{ url: API_BASE, description: "Ambiente atual" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT / API Key",
        description:
          "Token M2M do Entra ID (concessão client_credentials) ou Chave de Integração Padronizada (definida via variável de ambiente).",
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
