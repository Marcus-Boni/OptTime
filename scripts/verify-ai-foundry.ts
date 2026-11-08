import assert from "node:assert/strict";
import { completeText } from "@/lib/ai/completion";
import {
  hasConfiguredProvider,
  resolveProviderChain,
} from "@/lib/ai/providers";
import {
  type ProviderRequest,
  type ProviderStreamChunk,
  withTimeout,
} from "@/lib/ai/providers/base";
import { createFoundryProvider } from "@/lib/ai/providers/foundry";
import { createFoundryAuth } from "@/lib/ai/providers/foundry-auth";
import { readFoundryConfig } from "@/lib/ai/providers/foundry-config";
import { isBenched, resetProviderHealth } from "@/lib/ai/providers/health";

const config = {
  endpoint: "https://ai-painel-estrategico.services.ai.azure.com/openai/v1",
  deployment: "gpt-6-luna",
  apiKey: "synthetic-test-key",
};
const request: ProviderRequest = {
  system: "Synthetic verification only",
  turns: [{ role: "user", content: "Olá" }],
  tools: [],
  signal: new AbortController().signal,
};
const message = { type: "message", role: "assistant", content: [] };
function completed(output: Record<string, unknown>[] = [message]): object {
  return {
    type: "response.completed",
    response: { status: "completed", output },
  };
}
function sse(events: object[]): Response {
  // Split UTF-8 and CRLF across arbitrary boundaries, as network reads do.
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""),
  );
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, offset + 7));
        offset += 7;
      },
    }),
  );
}
async function collect(
  input: ProviderRequest = request,
): Promise<ProviderStreamChunk[]> {
  const chunks: ProviderStreamChunk[] = [];
  for await (const chunk of createFoundryProvider(config).streamChat(input))
    chunks.push(chunk);
  return chunks;
}

async function main(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let checks = 0;
  async function check(
    name: string,
    run: () => Promise<void> | void,
  ): Promise<void> {
    resetProviderHealth();
    await run();
    checks++;
    console.log(`✓ ${name}`);
  }
  try {
    await check("Only Foundry configuration selects a remote provider", () => {
      for (const name of Object.keys(process.env)) {
        if (name.startsWith("AZURE_FOUNDRY_") || name.startsWith("IDENTITY_"))
          delete process.env[name];
      }
      process.env.GEMINI_API_KEY = "old-key";
      process.env.GROQ_API_KEY = "old-key";
      process.env.NVIDIA_API_KEY = "old-key";
      process.env.OPENROUTER_API_KEY = "old-key";
      assert.deepEqual(resolveProviderChain(), []);
      process.env.AZURE_FOUNDRY_ENDPOINT = config.endpoint;
      process.env.AZURE_FOUNDRY_API_KEY = "$(AZURE_FOUNDRY_API_KEY)";
      assert.equal(hasConfiguredProvider(), false);
      process.env.AZURE_FOUNDRY_API_KEY = config.apiKey;
      assert.equal(resolveProviderChain()[0]?.name, "foundry");
      assert.equal(resolveProviderChain()[0]?.model, "gpt-6-luna");
      for (const invalid of [
        "http://example.com/openai/v1",
        "https://evil.example/openai/v1",
        `${config.endpoint}?key=secret`,
        "https://user:pass@a.openai.azure.com/openai/v1",
      ]) {
        process.env.AZURE_FOUNDRY_ENDPOINT = invalid;
        assert.equal(readFoundryConfig(), null);
      }
      process.env.AZURE_FOUNDRY_ENDPOINT = config.endpoint;
    });
    await check(
      "Responses request, UTF-8 stream, reasoning budget and optional tools",
      async () => {
        globalThis.fetch = async (url, init): Promise<Response> => {
          assert.equal(String(url), `${config.endpoint}/responses`);
          assert.equal(
            new Headers(init?.headers).get("api-key"),
            config.apiKey,
          );
          const body = JSON.parse(String(init?.body));
          assert.equal(body.model, "gpt-6-luna");
          assert.equal(body.store, false);
          assert.equal(body.stream, true);
          assert.equal(body.max_output_tokens, 4096);
          assert.deepEqual(body.reasoning, { effort: "low" });
          assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
          assert.equal("temperature" in body, false);
          assert.equal("max_tokens" in body, false);
          assert.equal(body.tools[0].strict, false);
          assert.deepEqual(body.tools[0].parameters.required, []);
          return sse([
            { type: "response.output_text.delta", delta: "Olá 👋" },
            completed(),
          ]);
        };
        const chunks = await collect({
          ...request,
          temperature: 0,
          maxTokens: 300,
          tools: [
            {
              name: "read",
              description: "Read",
              parameters: {
                type: "object",
                properties: { date: { type: "string" } },
                required: [],
              },
            },
          ],
        });
        assert.deepEqual(chunks[0], { type: "text", text: "Olá 👋" });
      },
    );
    await check(
      "Function call ID and encrypted reasoning survive a full tool round trip",
      async () => {
        const output = [
          {
            type: "reasoning",
            id: "rs_1",
            encrypted_content: "synthetic",
            summary: [],
          },
          {
            type: "function_call",
            id: "fc_1",
            call_id: "call_1",
            name: "read",
            arguments: '{"date":"2026-11-08"}',
          },
        ];
        let round = 0;
        globalThis.fetch = async (_url, init): Promise<Response> => {
          round++;
          if (round === 1)
            return sse([
              {
                type: "response.output_item.added",
                output_index: 1,
                item: { ...output[1], arguments: "" },
              },
              {
                type: "response.function_call_arguments.delta",
                delta: '{"date":',
              },
              {
                type: "response.function_call_arguments.delta",
                delta: '"2026-11-08"}',
              },
              completed(output),
            ]);
          const body = JSON.parse(String(init?.body));
          assert.deepEqual(body.input.slice(1, 3), output);
          assert.deepEqual(body.input.at(-1), {
            type: "function_call_output",
            call_id: "call_1",
            output: '{"minutes":90}',
          });
          return sse([
            { type: "response.output_text.delta", delta: "90 minutos" },
            completed(),
          ]);
        };
        const first = await collect();
        const continuation = first.find(
          (chunk) => chunk.type === "continuation",
        );
        const call = first.find((chunk) => chunk.type === "tool_call");
        assert.equal(call?.type, "tool_call");
        assert.equal(continuation?.type, "continuation");
        if (call?.type !== "tool_call" || continuation?.type !== "continuation")
          throw new Error("Missing round trip data");
        assert.equal(call.call.id, "call_1");
        const final = await collect({
          ...request,
          turns: [
            ...request.turns,
            {
              role: "assistant",
              toolCalls: [call.call],
              providerOutput: continuation.items,
            },
            {
              role: "tool",
              toolCallId: call.call.id,
              toolResult: { minutes: 90 },
            },
          ],
        });
        assert.deepEqual(final[0], { type: "text", text: "90 minutos" });
      },
    );
    await check(
      "Malformed, truncated, failed and incomplete responses never expose tools",
      async () => {
        for (const events of [
          [
            {
              type: "response.output_item.done",
              item: {
                type: "function_call",
                call_id: "unsafe",
                name: "write",
                arguments: "{}",
              },
            },
          ],
          [{ type: "response.incomplete", response: { status: "incomplete" } }],
          [{ type: "response.failed" }],
          [{ type: "error", message: "synthetic-secret-do-not-log" }],
          [{ type: "response.refusal.delta", delta: "refused" }],
          [
            completed([
              {
                type: "function_call",
                call_id: "call",
                name: "write",
                arguments: "[1]",
              },
            ]),
          ],
          [
            completed([
              {
                type: "function_call",
                call_id: "call",
                name: "write",
                arguments: "{",
              },
            ]),
          ],
          [completed([])],
          [completed([{ type: "reasoning", summary: [] }])],
          [completed()],
        ]) {
          globalThis.fetch = async (): Promise<Response> => sse(events);
          await assert.rejects(collect(), /Foundry/);
        }
        globalThis.fetch = async (): Promise<Response> =>
          new Response("data: {broken}\n\n");
        await assert.rejects(collect(), /inválido/);
      },
    );
    await check(
      "HTTP failure is sanitized, circuit breaker prevents repeated network calls",
      async () => {
        let calls = 0;
        globalThis.fetch = async (): Promise<Response> => {
          calls++;
          return new Response("secret prompt", { status: 429 });
        };
        assert.equal(
          await completeText({ system: "test", prompt: "test" }),
          null,
        );
        assert.equal(isBenched("foundry"), true);
        assert.deepEqual(resolveProviderChain(), []);
        assert.equal(
          await completeText({ system: "test", prompt: "test" }),
          null,
        );
        assert.equal(calls, 1);
      },
    );
    await check(
      "Authentication failures stay sanitized and corrected configuration recovers",
      async () => {
        for (const status of [401, 403, 404, 500, 503]) {
          globalThis.fetch = async (): Promise<Response> =>
            new Response("secret upstream body", { status });
          await assert.rejects(collect(), (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, new RegExp(`HTTP ${status}`));
            assert.equal(error.message.includes("secret"), false);
            return true;
          });
        }
        globalThis.fetch = async (): Promise<Response> =>
          new Response("", { status: 401 });
        assert.equal(
          await completeText({ system: "test", prompt: "test" }),
          null,
        );
        assert.equal(isBenched("foundry"), true);
        process.env.AZURE_FOUNDRY_API_KEY = "corrected-synthetic-key";
        assert.equal(resolveProviderChain().length, 1);
        assert.equal(isBenched("foundry"), false);
        process.env.AZURE_FOUNDRY_API_KEY = config.apiKey;
      },
    );
    await check(
      "Cancellation and timeout prevent outbound requests",
      async () => {
        const controller = new AbortController();
        controller.abort();
        globalThis.fetch = async (): Promise<Response> => {
          throw new Error("Must not fetch");
        };
        await assert.rejects(
          collect({ ...request, signal: controller.signal }),
          { name: "AbortError" },
        );
        const signal = withTimeout(new AbortController().signal, 1);
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(signal.aborted, true);
      },
    );
    await check(
      "Managed identity token scope, selector, cache, expiry and auth isolation",
      async () => {
        let calls = 0;
        let expires = Date.now() / 1000 + 3600;
        const authenticate = createFoundryAuth({
          ...config,
          apiKey: undefined,
          identityEndpoint: "http://127.0.0.1/identity",
          identityHeader: "synthetic-header",
          clientId: "synthetic-client",
        });
        globalThis.fetch = async (url, init): Promise<Response> => {
          calls++;
          const parsed = new URL(String(url));
          assert.equal(
            parsed.searchParams.get("resource"),
            "https://ai.azure.com",
          );
          assert.equal(parsed.searchParams.get("api-version"), "2019-08-01");
          assert.equal(
            parsed.searchParams.get("client_id"),
            "synthetic-client",
          );
          assert.equal(
            new Headers(init?.headers).get("X-IDENTITY-HEADER"),
            "synthetic-header",
          );
          return Response.json({
            access_token: "synthetic-token",
            expires_on: String(expires),
          });
        };
        assert.deepEqual(await authenticate(request.signal), {
          Authorization: "Bearer synthetic-token",
        });
        await authenticate(request.signal);
        assert.equal(calls, 1);
        expires = 1;
        const expiredAuth = createFoundryAuth({
          ...config,
          apiKey: undefined,
          identityEndpoint: "http://127.0.0.1/identity",
          identityHeader: "synthetic-header",
          clientId: "synthetic-client",
        });
        await assert.rejects(expiredAuth(request.signal), /expirado/);
      },
    );
    await check("Completion validators reject unusable output", async () => {
      globalThis.fetch = async (): Promise<Response> =>
        sse([
          { type: "response.output_text.delta", delta: "invalid JSON" },
          completed(),
        ]);
      assert.equal(
        await completeText({
          system: "test",
          prompt: "test",
          validate: () => false,
        }),
        null,
      );
    });
    console.log(
      `\n${checks} Foundry verification groups passed (no network or database).`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(process.env))
      if (!(name in originalEnv)) delete process.env[name];
    Object.assign(process.env, originalEnv);
    resetProviderHealth();
  }
}

main().catch((error: unknown) => {
  console.error("[verify-ai-foundry]", error);
  process.exitCode = 1;
});
