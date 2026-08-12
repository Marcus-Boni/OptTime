import type {
  JsonSchemaObject,
  JsonSchemaProperty,
  ToolSpec,
} from "@/lib/ai/types";
import {
  type ChatProvider,
  ProviderError,
  type ProviderRequest,
  type ProviderStreamChunk,
  readSseData,
  safeJsonParse,
  toolSpecHasParameters,
  withTimeout,
} from "./base";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 45_000;

interface GeminiPart {
  text?: string;
  /** Reasoning traces on thinking models — never shown to the user. */
  thought?: boolean;
  /** Must be replayed verbatim with the matching functionCall part. */
  thoughtSignature?: string;
  functionCall?: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiStreamChunk {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string };
}

/** Gemini accepts an OpenAPI subset with uppercase type names. */
function toGeminiSchema(
  schema: JsonSchemaProperty | JsonSchemaObject,
): Record<string, unknown> {
  const output: Record<string, unknown> = {
    type: schema.type.toUpperCase(),
  };

  if ("description" in schema && schema.description) {
    output.description = schema.description;
  }
  if ("enum" in schema && schema.enum) {
    output.enum = schema.enum;
  }
  if ("items" in schema && schema.items) {
    output.items = toGeminiSchema(schema.items);
  }
  if (schema.properties) {
    output.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        toGeminiSchema(value),
      ]),
    );
  }
  if (schema.required && schema.required.length > 0) {
    output.required = schema.required;
  }

  return output;
}

function toFunctionDeclarations(tools: ToolSpec[]) {
  return tools.map((tool) => {
    const declaration: Record<string, unknown> = {
      name: tool.name,
      description: tool.description,
    };

    // Gemini rejects OBJECT schemas with an empty `properties` map.
    if (toolSpecHasParameters(tool)) {
      declaration.parameters = toGeminiSchema(tool.parameters);
    }

    return declaration;
  });
}

function toContents(request: ProviderRequest) {
  const contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }> = [];

  for (const turn of request.turns) {
    if (turn.role === "user") {
      contents.push({ role: "user", parts: [{ text: turn.content ?? "" }] });
      continue;
    }

    if (turn.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (turn.content) parts.push({ text: turn.content });

      for (const call of turn.toolCalls ?? []) {
        parts.push({
          functionCall: {
            id: call.id.startsWith("gemini_") ? undefined : call.id,
            name: call.name,
            args: call.args,
          },
          // Thinking models reject the follow-up turn without this token.
          thoughtSignature: call.signature,
        });
      }

      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    // Tool results are sent back as user-role functionResponse parts.
    contents.push({
      role: "user",
      parts: [
        {
          functionResponse: {
            id:
              turn.toolCallId && !turn.toolCallId.startsWith("gemini_")
                ? turn.toolCallId
                : undefined,
            name: turn.toolName ?? "tool",
            response: { result: turn.toolResult ?? null },
          },
        },
      ],
    });
  }

  return contents;
}

export function createGeminiProvider(
  apiKey: string,
  model = process.env.GEMINI_MODEL || "gemini-3.5-flash",
): ChatProvider {
  return {
    name: "gemini",
    model,
    async *streamChat(
      request: ProviderRequest,
    ): AsyncGenerator<ProviderStreamChunk> {
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: toContents(request),
        generationConfig: {
          temperature: request.temperature ?? 0.4,
          maxOutputTokens: 2048,
        },
      };

      if (request.tools.length > 0) {
        body.tools = [
          { functionDeclarations: toFunctionDeclarations(request.tools) },
        ];
      }

      const response = await fetch(
        `${BASE_URL}/${model}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: withTimeout(request.signal, REQUEST_TIMEOUT_MS),
        },
      );

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new ProviderError(
          "gemini",
          `Gemini HTTP ${response.status}: ${detail.slice(0, 200)}`,
          response.status,
        );
      }

      let callIndex = 0;

      for await (const payload of readSseData(response.body)) {
        const chunk = safeJsonParse<GeminiStreamChunk>(payload);
        if (!chunk) continue;

        if (chunk.error?.message) {
          throw new ProviderError("gemini", chunk.error.message);
        }

        const parts = chunk.candidates?.[0]?.content?.parts ?? [];

        for (const part of parts) {
          if (part.thought) continue;

          if (part.text) {
            yield { type: "text", text: part.text };
          }

          if (part.functionCall?.name) {
            callIndex += 1;
            yield {
              type: "tool_call",
              call: {
                id: part.functionCall.id ?? `gemini_${Date.now()}_${callIndex}`,
                name: part.functionCall.name,
                args: part.functionCall.args ?? {},
                signature: part.thoughtSignature,
              },
            };
          }
        }
      }
    },
  };
}
