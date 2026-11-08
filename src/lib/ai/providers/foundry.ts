import { z } from "zod";
import {
  type ChatProvider,
  ProviderError,
  type ProviderRequest,
  type ProviderStreamChunk,
  readSseData,
  withTimeout,
} from "@/lib/ai/providers/base";
import { createFoundryAuth } from "@/lib/ai/providers/foundry-auth";
import type { FoundryConfig } from "@/lib/ai/providers/foundry-config";
import type { ToolCall } from "@/lib/ai/types";

const eventSchema = z.object({ type: z.string() }).passthrough();
const outputSchema = z.array(z.record(z.string(), z.unknown()));
const callSchema = z.object({
  call_id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.string(),
});

function toInput(request: ProviderRequest): Record<string, unknown>[] {
  const input: Record<string, unknown>[] = [];
  for (const turn of request.turns) {
    if (turn.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: turn.toolCallId,
        output: JSON.stringify(turn.toolResult ?? null),
      });
    } else if (turn.role === "assistant" && turn.providerOutput) {
      // Reasoning (including encrypted content), messages and calls must be
      // replayed together with function outputs when store:false is used.
      input.push(...turn.providerOutput);
    } else {
      if (turn.content) input.push({ role: turn.role, content: turn.content });
      for (const call of turn.toolCalls ?? []) {
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.args),
        });
      }
    }
  }
  return input;
}

/** Azure OpenAI v1 Responses, shared by chat and every background completion. */
export function createFoundryProvider(
  config: FoundryConfig,
  authenticate = createFoundryAuth(config),
): ChatProvider {
  return {
    name: "foundry",
    model: config.deployment,
    async *streamChat(
      request: ProviderRequest,
    ): AsyncGenerator<ProviderStreamChunk> {
      const signal = withTimeout(request.signal, 45_000);
      const headers = await authenticate(signal);
      const response = await fetch(`${config.endpoint}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          model: config.deployment,
          instructions: request.system,
          input: toInput(request),
          stream: true,
          store: false,
          include: ["reasoning.encrypted_content"],
          reasoning: { effort: "low" },
          // The budget includes hidden reasoning. A 300-token parser budget
          // otherwise exhausts before the model can produce its JSON answer.
          max_output_tokens: Math.max(request.maxTokens ?? 4096, 4096),
          ...(request.tools.length > 0 && {
            tools: request.tools.map((tool) => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              // Existing tools have optional arguments; Responses defaults
              // to strict schemas, which would silently make them required.
              strict: false,
            })),
            tool_choice: "auto",
            parallel_tool_calls: false,
          }),
        }),
        signal,
        cache: "no-store",
        redirect: "error",
      });

      if (!response.ok || !response.body) {
        await response.body?.cancel();
        // Upstream bodies can contain user prompts or sensitive metadata.
        throw new ProviderError(
          "foundry",
          `Foundry Responses: HTTP ${response.status}.`,
          response.status,
        );
      }

      let hasVisibleText = false;
      for await (const payload of readSseData(response.body)) {
        signal.throwIfAborted();
        let raw: unknown;
        try {
          raw = JSON.parse(payload);
        } catch {
          throw new ProviderError("foundry", "Evento Foundry inválido.");
        }
        const parsed = eventSchema.safeParse(raw);
        if (!parsed.success) {
          throw new ProviderError("foundry", "Evento Foundry inválido.");
        }
        const event = parsed.data;

        if (event.type === "response.output_text.delta") {
          if (typeof event.delta !== "string") {
            throw new ProviderError("foundry", "Delta Foundry inválido.");
          }
          hasVisibleText ||= event.delta.trim().length > 0;
          yield { type: "text", text: event.delta };
        } else if (event.type === "response.completed") {
          const final = z
            .object({ status: z.literal("completed"), output: outputSchema })
            .safeParse(event.response);
          if (!final.success || final.data.output.length === 0) {
            throw new ProviderError(
              "foundry",
              "Resposta Foundry vazia ou inválida.",
            );
          }
          // Validate ALL function calls before exposing any executable call.
          const calls: ToolCall[] = [];
          for (const item of final.data.output) {
            if (item.type !== "function_call") continue;
            const call = callSchema.safeParse(item);
            let args: unknown;
            try {
              args = call.success ? JSON.parse(call.data.arguments) : null;
            } catch {
              args = null;
            }
            const object = z.record(z.string(), z.unknown()).safeParse(args);
            if (!call.success || !object.success) {
              throw new ProviderError(
                "foundry",
                "Chamada de ferramenta Foundry inválida.",
              );
            }
            calls.push({
              id: call.data.call_id,
              name: call.data.name,
              args: object.data,
            });
          }
          if (!hasVisibleText && calls.length === 0) {
            throw new ProviderError(
              "foundry",
              "Resposta Foundry sem texto ou ferramentas.",
            );
          }
          yield { type: "continuation", items: final.data.output };
          for (const call of calls) yield { type: "tool_call", call };
          return;
        } else if (
          event.type === "error" ||
          event.type === "response.failed" ||
          event.type === "response.incomplete" ||
          event.type === "response.refusal.delta"
        ) {
          throw new ProviderError(
            "foundry",
            "Foundry não concluiu a resposta.",
          );
        }
      }
      throw new ProviderError(
        "foundry",
        "Stream Foundry interrompido antes da conclusão.",
      );
    },
  };
}
