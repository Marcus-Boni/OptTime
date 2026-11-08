/** Synthetic Foundry smoke: no app/database writes or customer data. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import type {
  ProviderRequest,
  ProviderStreamChunk,
} from "@/lib/ai/providers/base";
import { createFoundryProvider } from "@/lib/ai/providers/foundry";
import { readFoundryConfig } from "@/lib/ai/providers/foundry-config";

async function main(): Promise<void> {
  let config = readFoundryConfig();
  let authenticate:
    | ((signal: AbortSignal) => Promise<Record<string, string>>)
    | undefined;
  if (!config) {
    // The development smoke can use an existing Azure CLI login, without
    // persisting tokens or introducing CLI dependencies into application code.
    const args = [
      "account",
      "get-access-token",
      "--resource",
      "https://ai.azure.com",
      "--output",
      "json",
    ];
    const raw =
      process.platform === "win32"
        ? execFileSync(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `az ${args.join(" ")}`,
            ],
            {
              encoding: "utf8",
              timeout: 30_000,
              stdio: ["ignore", "pipe", "pipe"],
            },
          )
        : execFileSync("az", args, {
            encoding: "utf8",
            timeout: 30_000,
            stdio: ["ignore", "pipe", "pipe"],
          });
    const token = z
      .object({ accessToken: z.string().min(1) })
      .parse(JSON.parse(raw));
    config = {
      endpoint:
        process.env.AZURE_FOUNDRY_ENDPOINT ??
        "https://ai-painel-estrategico.services.ai.azure.com/openai/v1",
      deployment: process.env.AZURE_FOUNDRY_DEPLOYMENT ?? "gpt-6-luna",
    };
    // Validate the same endpoint allowlist before attaching any bearer token.
    const originalKey = process.env.AZURE_FOUNDRY_API_KEY;
    const originalEndpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
    process.env.AZURE_FOUNDRY_ENDPOINT = config.endpoint;
    process.env.AZURE_FOUNDRY_API_KEY = "validation-only";
    const validated = readFoundryConfig();
    if (originalKey === undefined) delete process.env.AZURE_FOUNDRY_API_KEY;
    else process.env.AZURE_FOUNDRY_API_KEY = originalKey;
    if (originalEndpoint === undefined)
      delete process.env.AZURE_FOUNDRY_ENDPOINT;
    else process.env.AZURE_FOUNDRY_ENDPOINT = originalEndpoint;
    assert.ok(validated, "Invalid Foundry endpoint");
    config.endpoint = validated.endpoint;
    authenticate = async (signal): Promise<Record<string, string>> => {
      signal.throwIfAborted();
      return { Authorization: `Bearer ${token.accessToken}` };
    };
  }

  const provider = createFoundryProvider(config, authenticate);
  const request: ProviderRequest = {
    system:
      "Follow the synthetic verification instruction exactly. Reply in Portuguese.",
    turns: [{ role: "user", content: "Responda somente: FOUNDRY_OK" }],
    tools: [],
    signal: AbortSignal.timeout(60_000),
  };
  async function collect(
    input: ProviderRequest,
  ): Promise<ProviderStreamChunk[]> {
    const chunks: ProviderStreamChunk[] = [];
    for await (const chunk of provider.streamChat(input)) chunks.push(chunk);
    return chunks;
  }
  const text = (chunks: ProviderStreamChunk[]): string =>
    chunks
      .flatMap((chunk) => (chunk.type === "text" ? [chunk.text] : []))
      .join("");
  assert.match(text(await collect(request)), /FOUNDRY_OK/);
  console.log(`✓ Live text streaming: ${provider.model}`);

  const first = await collect({
    ...request,
    system:
      "You must call synthetic_lookup once with code SYNTHETIC. After the result, reply with its marker. This is a synthetic test.",
    turns: [
      {
        role: "user",
        content: "Consulte synthetic_lookup e devolva o marker.",
      },
    ],
    tools: [
      {
        name: "synthetic_lookup",
        description: "Gets a synthetic verification marker",
        parameters: {
          type: "object",
          properties: { code: { type: "string" } },
          required: ["code"],
        },
      },
    ],
  });
  const invocation = first.find((chunk) => chunk.type === "tool_call");
  const continuation = first.find((chunk) => chunk.type === "continuation");
  assert.ok(
    invocation?.type === "tool_call" && continuation?.type === "continuation",
    "Model must request synthetic function",
  );
  assert.equal(invocation.call.name, "synthetic_lookup");
  assert.equal(invocation.call.args.code, "SYNTHETIC");
  const final = await collect({
    ...request,
    system:
      "The lookup is complete. Reply with the exact marker in its result; do not call more functions.",
    turns: [
      {
        role: "user",
        content: "Consulte synthetic_lookup e devolva o marker.",
      },
      {
        role: "assistant",
        toolCalls: [invocation.call],
        providerOutput: continuation.items,
      },
      {
        role: "tool",
        toolCallId: invocation.call.id,
        toolResult: { marker: "SYNTHETIC_TOOL_OK" },
      },
    ],
  });
  assert.match(text(final), /SYNTHETIC_TOOL_OK/);
  console.log(
    "✓ Live function call → synthetic result → final answer (store:false)",
  );

  const json = text(
    await collect({
      ...request,
      system:
        'Return ONLY a JSON object with durationMinutes=90 and description="Revisão de código".',
      turns: [{ role: "user", content: "Registre 1h30 revisando código." }],
      maxTokens: 300,
      temperature: 0,
    }),
  );
  const parsed = z
    .object({ durationMinutes: z.literal(90), description: z.string().min(1) })
    .parse(JSON.parse(json));
  assert.equal(parsed.durationMinutes, 90);
  console.log("✓ Live short JSON parser output (300-token caller budget)");
}

main().catch((error: unknown) => {
  // CLI failures can carry stdout containing a token. Do not print the object.
  console.error(
    "[verify-ai-live]",
    error instanceof Error
      ? error.message.split("\n")[0]
      : "Live verification failed",
  );
  process.exitCode = 1;
});
