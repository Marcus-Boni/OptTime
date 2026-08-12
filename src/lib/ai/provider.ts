import type { ChatMessage, ParsedTimeEntry } from "@/lib/validations/ai.schema";
import { TIMEBOT_SYSTEM_PROMPT } from "./prompts";

export interface AIResponse {
  content: string;
  providerUsed: "gemini" | "groq" | "openrouter" | "local_fallback";
  quickEntryPayload?: ParsedTimeEntry | null;
}

export interface UserContextInfo {
  userName?: string;
  userRole?: string;
  activePath?: string;
  projects?: Array<{ id: string; name: string; code: string }>;
}

/**
 * Executes a completion call trying providers in order:
 * 1. Google Gemini API (GEMINI_API_KEY)
 * 2. Groq API (GROQ_API_KEY)
 * 3. OpenRouter API (OPENROUTER_API_KEY)
 * 4. Local Smart Fallback Engine (Zero-setup / Offline / Quota exceeded)
 */
export async function generateTimeBotResponse(
  userMessage: string,
  history: ChatMessage[] = [],
  context: UserContextInfo = {},
): Promise<AIResponse> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  // 1. Try Google Gemini API
  if (geminiKey) {
    try {
      const response = await callGeminiAPI(
        geminiKey,
        userMessage,
        history,
        context,
      );
      if (response) {
        return {
          content: response,
          providerUsed: "gemini",
          quickEntryPayload: extractQuickEntryJson(response, context.projects),
        };
      }
    } catch (err: unknown) {
      console.error("[TimeBot Provider] Gemini API error, falling back:", err);
    }
  }

  // 2. Try Groq API
  if (groqKey) {
    try {
      const response = await callGroqAPI(
        groqKey,
        userMessage,
        history,
        context,
      );
      if (response) {
        return {
          content: response,
          providerUsed: "groq",
          quickEntryPayload: extractQuickEntryJson(response, context.projects),
        };
      }
    } catch (err: unknown) {
      console.error("[TimeBot Provider] Groq API error, falling back:", err);
    }
  }

  // 3. Try OpenRouter Free Models
  if (openRouterKey) {
    try {
      const response = await callOpenRouterAPI(
        openRouterKey,
        userMessage,
        history,
        context,
      );
      if (response) {
        return {
          content: response,
          providerUsed: "openrouter",
          quickEntryPayload: extractQuickEntryJson(response, context.projects),
        };
      }
    } catch (err: unknown) {
      console.error(
        "[TimeBot Provider] OpenRouter API error, falling back:",
        err,
      );
    }
  }

  // 4. Local Intelligent Fallback Engine
  const fallbackText = generateLocalSmartFallback(
    userMessage,
    context,
    history,
  );
  return {
    content: fallbackText,
    providerUsed: "local_fallback",
    quickEntryPayload: extractQuickEntryJson(fallbackText, context.projects),
  };
}

/**
 * Call Google Gemini API with fallback cascade between valid official models
 */
async function callGeminiAPI(
  apiKey: string,
  userMessage: string,
  history: ChatMessage[],
  context: UserContextInfo,
): Promise<string | null> {
  const models = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
  ];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const contextStr = formatContextPrompt(context);
      const contents = [
        {
          role: "user",
          parts: [
            {
              text: `${TIMEBOT_SYSTEM_PROMPT}\n\n${contextStr}\n\nInstrução: Responda a seguinte mensagem do usuário de forma concisa e útil em pt-BR.`,
            },
          ],
        },
        ...history.slice(-6).map((msg) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        })),
        {
          role: "user",
          parts: [{ text: userMessage }],
        },
      ];

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(
          `[TimeBot Gemini] Model ${model} returned ${res.status}: ${errorText.substring(0, 150)}`,
        );
        lastError = new Error(
          `Gemini (${model}) HTTP ${res.status}: ${errorText.substring(0, 150)}`,
        );
        continue; // Fallback to next Gemini model
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (lastError) throw lastError;
  return null;
}

/**
 * Call Groq API
 */
async function callGroqAPI(
  apiKey: string,
  userMessage: string,
  history: ChatMessage[],
  context: UserContextInfo,
): Promise<string | null> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const contextStr = formatContextPrompt(context);

  const messages = [
    {
      role: "system",
      content: `${TIMEBOT_SYSTEM_PROMPT}\n\n${contextStr}`,
    },
    ...history.slice(-6).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content || null;
}

/**
 * Call OpenRouter API
 */
async function callOpenRouterAPI(
  apiKey: string,
  userMessage: string,
  history: ChatMessage[],
  context: UserContextInfo,
): Promise<string | null> {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const contextStr = formatContextPrompt(context);

  const messages = [
    {
      role: "system",
      content: `${TIMEBOT_SYSTEM_PROMPT}\n\n${contextStr}`,
    },
    ...history.slice(-6).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://optsolv.com",
      "X-Title": "OptSolv Time Tracker",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-lite-001:free",
      messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content || null;
}

/**
 * Formats context into system message
 */
function formatContextPrompt(context: UserContextInfo): string {
  const parts: string[] = [];
  if (context.userName) parts.push(`Usuário atual: ${context.userName}`);
  if (context.userRole) parts.push(`Função/Role: ${context.userRole}`);
  if (context.activePath) parts.push(`Página ativa: ${context.activePath}`);
  if (context.projects && context.projects.length > 0) {
    const projList = context.projects
      .map((p) => `${p.name} (ID: ${p.id}, Código: ${p.code})`)
      .join(", ");
    parts.push(`Projetos disponíveis para o usuário: ${projList}`);
  }
  return parts.join("\n");
}

/**
 * Extracts optional JSON quick entry block from LLM output
 */
function extractQuickEntryJson(
  text: string,
  availableProjects: Array<{ id: string; name: string; code: string }> = [],
): ParsedTimeEntry | null {
  const match = text.match(/```json:quick_entry\s*([\s\S]*?)\s*```/);
  if (!match || !match[1]) return null;

  try {
    const raw = JSON.parse(match[1]) as {
      projectName?: string;
      description?: string;
      durationMinutes?: number;
      azureWorkItemId?: number;
    };

    let matchedProjectId: string | null = null;
    let matchedProjectName: string | null = raw.projectName || null;

    if (raw.projectName && availableProjects.length > 0) {
      const search = raw.projectName.toLowerCase();
      const found = availableProjects.find(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.code.toLowerCase().includes(search),
      );
      if (found) {
        matchedProjectId = found.id;
        matchedProjectName = found.name;
      } else {
        matchedProjectId = availableProjects[0].id;
        matchedProjectName = availableProjects[0].name;
      }
    } else if (availableProjects.length > 0) {
      matchedProjectId = availableProjects[0].id;
      matchedProjectName = availableProjects[0].name;
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    return {
      projectId: matchedProjectId,
      projectName: matchedProjectName,
      description: raw.description || "Atividade registrada via TimeBot",
      durationMinutes: raw.durationMinutes || 60,
      date: todayStr,
      azureWorkItemId: raw.azureWorkItemId || null,
      confidence: 0.9,
      explanation: "Registro interpretado pelo TimeBot.",
    };
  } catch {
    return null;
  }
}

/**
 * Fallback AI Engine: Pure typescript intelligent responder for offline/zero-API-key mode
 */
function generateLocalSmartFallback(
  input: string,
  context: UserContextInfo,
  _history: ChatMessage[],
): string {
  const lower = input.toLowerCase();
  const userName = context.userName ? `, ${context.userName}` : "";

  // Check for time entry pattern (e.g., "trabalhei 2h", "lancei 30m", "2h30 no projeto X")
  const hasTimeKeywords =
    /(\d+[.,]?\d*\s*(h|horas?|m|min|minutos?))|trabalhei|lancei|registre|ajustei|desenvolvi/i.test(
      lower,
    );

  if (hasTimeKeywords) {
    // Attempt parse duration
    let durationMinutes = 60;
    const hourMatch = lower.match(/(\d+)\s*(h|horas?)/);
    const minMatch = lower.match(/(\d+)\s*(m|min|minutos?)/);
    const comboMatch = lower.match(/(\d+)h(\d+)?/);

    if (comboMatch) {
      const h = Number.parseInt(comboMatch[1], 10) || 0;
      const m = Number.parseInt(comboMatch[2] || "0", 10) || 0;
      durationMinutes = h * 60 + m;
    } else if (hourMatch) {
      durationMinutes = Number.parseInt(hourMatch[1], 10) * 60;
    } else if (minMatch) {
      durationMinutes = Number.parseInt(minMatch[1], 10);
    }

    // Extract Azure Work Item
    const azMatch = lower.match(/#?(\d{3,6})/);
    const azureWorkItemId = azMatch ? Number.parseInt(azMatch[1], 10) : null;

    // Project matching
    let projName = context.projects?.[0]?.name || "OptSolv Time Tracker";
    if (context.projects) {
      for (const p of context.projects) {
        if (
          lower.includes(p.name.toLowerCase()) ||
          lower.includes(p.code.toLowerCase())
        ) {
          projName = p.name;
          break;
        }
      }
    }

    const durationFormatted = `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? `${durationMinutes % 60}m` : ""}`;

    return `Entendi perfeitamente${userName}! Identifiquei uma nova intenção de registro de tempo:

- **Projeto**: \`${projName}\`
- **Duração**: \`${durationFormatted}\` (${durationMinutes} min)
- **Work Item**: ${azureWorkItemId ? `\`#${azureWorkItemId}\`` : "_Nenhum_"}

Você pode confirmar o registro abaixo com 1-clique:

\`\`\`json:quick_entry
{
  "projectName": "${projName}",
  "description": "${input.replace(/"/g, "'")}",
  "durationMinutes": ${durationMinutes},
  "azureWorkItemId": ${azureWorkItemId || "null"}
}
\`\`\``;
  }

  // Question about Timesheets / Approvals
  if (lower.includes("timesheet") || lower.includes("aprova")) {
    return `### 📅 Como funciona o fluxo de Timesheets no OptSolv Time Tracker:

1. **Registro**: Insira suas horas diariamente via Timer ou formulário (meta de **40h/semana**).
2. **Submissão**: Clique no botão **"Submeter Semana"** ao final do período.
   > ⚠️ *Importante:* Se houver algum dia útil com menos de 6h, o sistema emitirá um alerta.
3. **Aprovação**: O seu gestor direto receberá uma notificação para **Aprovar** ou **Rejeitar**.
4. **Status**:
   - \`DRAFT\` (Rascunho)
   - \`SUBMITTED\` (Enviado para análise)
   - \`APPROVED\` (Aprovado e fechado)
   - \`REJECTED\` (Retorna a draft com justificativa para correção)`;
  }

  // Question about Azure DevOps
  if (
    lower.includes("azure") ||
    lower.includes("devops") ||
    lower.includes("task") ||
    lower.includes("work item")
  ) {
    return `### 🛠️ Integração Azure DevOps (AzDO):

No OptSolv Time Tracker, você pode vincular qualquer entrada de tempo diretamente a um Work Item (Bug, Task, Story):
- Digite o ID com **#** no registro (ex: \`#1234\`).
- As horas concluídas são sincronizadas automaticamente com o campo **Completed Work** no Azure DevOps!
- Admins podem configurar a integração em **Configurações > Integrações**.`;
  }

  // Generic greeting / help
  return `Olá${userName}! Sou o **TimeBot**, seu assistente inteligente no OptSolv Time Tracker. 🚀

Como posso te ajudar hoje?
- ⏱️ **Lançar Horas**: *"Trabalhei 2h30 no projeto OptSolv ajustando a issue #102"*
- 📅 **Timesheets**: *"Como funciona o processo de envio e aprovação?"*
- 📊 **Relatórios**: *"Como exportar meu relatório mensal em Excel/PDF?"*
- 🛠️ **Azure DevOps**: *"Como vincular minhas horas às tasks do Azure?"*`;
}
