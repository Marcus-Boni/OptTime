/** Real agent/route regression checks with inert data sources and scripted AI. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import type { AppRole } from "@/lib/access-control";
import type { RunAgentOptions } from "@/lib/ai/agent";
import * as plans from "@/lib/ai/operator/plan";
import * as policy from "@/lib/ai/operator/policy";
import {
  DEFAULT_OPERATOR_SETTINGS,
  type OperatorSettings,
} from "@/lib/ai/operator/types";
import {
  type ChatProvider,
  ProviderError,
  type ProviderRequest,
  type ProviderStreamChunk,
} from "@/lib/ai/providers/base";
import type { AgentTool, ToolContext } from "@/lib/ai/tools/types";
import * as toolTypes from "@/lib/ai/tools/types";
import type { AgentEvent, ToolCall } from "@/lib/ai/types";
import * as validation from "@/lib/validations/ai.schema";

const requireDependency = createRequire(resolve("package.json"));

/** Fail closed on an unmocked application dependency: never open the real DB. */
function loadModule<T>(path: string, mocks: Record<string, unknown>): T {
  const exports = {};
  const source = ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: (name: string): unknown => {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/") || name.startsWith("./")) {
        throw new Error(`Unmocked application dependency: ${name}`);
      }
      return requireDependency(name);
    },
    AbortController,
    TextEncoder,
    ReadableStream,
    Response,
    // Expected provider failures are asserted below, without noisy stack traces.
    console: { ...console, error: (): void => {} },
  });
  return exports as T;
}

type AgentModule = {
  runAgent: (options: RunAgentOptions) => AsyncGenerator<AgentEvent>;
};
type RegistryModule = typeof import("@/lib/ai/tools/registry");
type Round = (request: ProviderRequest) => AsyncGenerator<ProviderStreamChunk>;

const user: RunAgentOptions["user"] = {
  userId: "synthetic-user",
  name: "Teste",
  email: "test@example.invalid",
  role: "member",
  weeklyCapacityHours: 40,
  timeZone: "America/Sao_Paulo",
  today: "2026-11-08",
};

function makeHarness(rounds: Round[]): {
  agent: AgentModule;
  requests: Omit<ProviderRequest, "signal">[];
  executions: string[];
  fallbackCalls: () => number;
} {
  const requests: Omit<ProviderRequest, "signal">[] = [];
  const executions: string[] = [];
  let fallbackCount = 0;

  function tool(
    name: string,
    roles?: AppRole[],
    actionKind?: "navigate",
  ): AgentTool<{ path: string }> {
    return {
      name,
      roles,
      actionKind,
      description: "Synthetic proposal only; no writes",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      schema: z.object({ path: z.string().startsWith("/dashboard") }),
      label: (): string => "Preparar navegação",
      execute: async (
        args,
        context: ToolContext,
      ): Promise<{ data: { path: string } }> => {
        executions.push(name);
        context.emitAction({
          kind: "navigate",
          id: "synthetic-proposal",
          path: args.path,
          label: "Abrir projetos",
          detail: "Solicitado no teste",
        });
        return { data: { path: args.path } };
      },
    };
  }

  const registry = loadModule<RegistryModule>("src/lib/ai/tools/registry.ts", {
    "./read-tools": { READ_TOOLS: [] },
    "./write-tools": { WRITE_TOOLS: [] },
    "./operator-tools": {
      OPERATOR_TOOLS: [
        tool("open_projects", undefined, "navigate"),
        tool("admin_only", ["admin"], "navigate"),
        // Deliberately lacks actionKind to exercise the final permission gate.
        tool("unguarded_proposal"),
      ],
    },
    "./types": toolTypes,
  });

  const provider: ChatProvider = {
    name: "foundry",
    model: "gpt-6-luna",
    async *streamChat(request): AsyncGenerator<ProviderStreamChunk> {
      const { signal: _signal, ...snapshot } = request;
      requests.push(structuredClone(snapshot));
      const round = rounds[requests.length - 1];
      assert.ok(round, "Agent must stay inside scripted round budget");
      yield* round(request);
    },
  };

  const agent = loadModule<AgentModule>("src/lib/ai/agent.ts", {
    "@/lib/ai/context": {
      buildAssistantSnapshot: async (): Promise<object> => ({}),
      renderSnapshotForPrompt: (): string => "Synthetic snapshot",
    },
    "@/lib/ai/fallback": {
      runFallbackAssistant: async (): Promise<{ text: string }> => {
        fallbackCount++;
        return { text: "Resposta local" };
      },
    },
    "@/lib/ai/operator/plan": plans,
    "@/lib/ai/operator/policy": policy,
    "@/lib/ai/operator/types": { DEFAULT_OPERATOR_SETTINGS },
    "@/lib/ai/prompts": {
      TIMEBOT_SYSTEM_PROMPT: "Synthetic assistant",
      TIMEBOT_OFFLINE_NOTICE: "Offline",
      renderAutonomyForPrompt: (): string => "Confirm proposals",
    },
    "@/lib/ai/providers": {
      ProviderError,
      resolveProviderChain: (): ChatProvider[] => [provider],
    },
    "@/lib/ai/tools/registry": registry,
    "./suggestions": { buildFollowUpSuggestions: (): string[] => [] },
  });
  return { agent, requests, executions, fallbackCalls: () => fallbackCount };
}

function calls(...items: ToolCall[]): Round {
  return async function* (): AsyncGenerator<ProviderStreamChunk> {
    for (const call of items) yield { type: "tool_call", call };
  };
}

async function* answer(): AsyncGenerator<ProviderStreamChunk> {
  yield { type: "text", text: "Proposta preparada." };
}

function call(
  name = "open_projects",
  path: unknown = "/dashboard/projects",
): ToolCall {
  return { id: `call_${name}`, name, args: { path } };
}

async function collect(
  harness: ReturnType<typeof makeHarness>,
  settings?: OperatorSettings,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of harness.agent.runAgent({
    message: "Abra os projetos",
    history: [],
    user,
    actor: { userId: user.userId, role: "member" },
    signal: new AbortController().signal,
    settings,
  })) {
    events.push(event);
  }
  return events;
}

async function verifyAgent(): Promise<void> {
  const providerOutput = [
    { type: "reasoning", id: "rs", encrypted_content: "synthetic" },
  ];
  const happy = makeHarness([
    async function* (): AsyncGenerator<ProviderStreamChunk> {
      yield { type: "continuation", items: providerOutput };
      yield { type: "tool_call", call: call() };
    },
    answer,
  ]);
  const events = await collect(happy);
  assert.equal(happy.requests.length, 2);
  assert.equal(happy.executions.length, 1);
  assert.equal(events.filter((event) => event.type === "action").length, 1);
  assert.equal(events.filter((event) => event.type === "tool_end").length, 1);
  assert.equal(events.at(-1)?.type, "done");
  const feedback = happy.requests[1].turns.find((turn) => turn.role === "tool");
  assert.equal(feedback?.toolCallId, "call_open_projects");
  assert.equal(
    (feedback?.toolResult as { path: string }).path,
    "/dashboard/projects",
  );
  assert.equal(happy.fallbackCalls(), 0);
  const assistant = happy.requests[1].turns.find(
    (turn) => turn.role === "assistant",
  );
  assert.deepEqual(assistant?.providerOutput, providerOutput);

  for (const forbidden of [call("admin_only"), call("unknown_tool")]) {
    const harness = makeHarness([calls(forbidden), answer]);
    await collect(harness);
    assert.equal(harness.executions.length, 0);
    assert.equal(
      harness.requests[0].tools.some((tool) => tool.name === forbidden.name),
      false,
    );
    const result = harness.requests[1].turns.at(-1)?.toolResult as {
      error: string;
    };
    assert.match(result.error, /não existe ou não está disponível/);
  }

  const invalid = makeHarness([calls(call("open_projects", 42)), answer]);
  await collect(invalid);
  assert.equal(invalid.executions.length, 0);
  assert.equal(
    (invalid.requests[1].turns.at(-1)?.toolResult as { error: string }).error,
    "Parâmetros inválidos.",
  );

  const duplicate = makeHarness([calls(call()), calls(call()), answer]);
  const duplicateEvents = await collect(duplicate);
  assert.equal(duplicate.executions.length, 1);
  assert.equal(
    duplicateEvents.filter((event) => event.type === "action").length,
    1,
  );
  assert.match(
    (duplicate.requests[2].turns.at(-1)?.toolResult as { note: string }).note,
    /já obtido/,
  );

  const disabledSettings: OperatorSettings = {
    ...DEFAULT_OPERATOR_SETTINGS,
    overrides: { navigate: "never" },
  };
  const disabled = makeHarness([
    calls(call(), call("unguarded_proposal")),
    answer,
  ]);
  const disabledEvents = await collect(disabled, disabledSettings);
  assert.equal(
    disabled.requests[0].tools.some((tool) => tool.name === "open_projects"),
    false,
  );
  assert.equal(disabled.executions.join(), "unguarded_proposal");
  assert.equal(
    disabledEvents.filter((event) => event.type === "action").length,
    0,
  );

  const outage = makeHarness([
    async function* (): AsyncGenerator<ProviderStreamChunk> {
      yield* [];
      throw new ProviderError("foundry", "Synthetic outage", 503);
    },
  ]);
  const outageEvents = await collect(outage);
  assert.equal(outage.fallbackCalls(), 1);
  assert.ok(
    outageEvents.some(
      (event) => event.type === "meta" && event.provider === "local_fallback",
    ),
  );

  const interrupted = makeHarness([
    async function* (): AsyncGenerator<ProviderStreamChunk> {
      yield { type: "text", text: "Parcial" };
      throw new ProviderError("foundry", "Synthetic interruption", 503);
    },
  ]);
  const interruptedEvents = await collect(interrupted);
  assert.equal(interrupted.requests.length, 1);
  assert.equal(interrupted.fallbackCalls(), 0);
  assert.equal(
    interruptedEvents.filter((event) => event.type === "text").length,
    1,
  );
  assert.ok(interruptedEvents.some((event) => event.type === "error"));
  assert.equal(interruptedEvents.at(-1)?.type, "done");
  console.log(
    "✓ Agent: tool round trip, role/schema gates, deduplication, policies and fallback",
  );
}

async function verifyRoute(): Promise<void> {
  const harness = makeHarness([calls(call()), answer]);
  let authenticated = false;
  let limited = false;
  let profileQueries = 0;
  const route = loadModule<{ POST: (req: Request) => Promise<Response> }>(
    "src/app/api/ai/chat/route.ts",
    {
      "@/lib/access-control": {
        getActiveSession: async (): Promise<unknown> =>
          authenticated
            ? { user: { id: user.userId, name: user.name, email: user.email } }
            : null,
        getActorContext: (): RunAgentOptions["actor"] => ({
          userId: user.userId,
          role: "member",
        }),
      },
      "@/lib/ai/agent": harness.agent,
      "@/lib/ai/context": {
        normalizeTimeZone: (): string => user.timeZone,
        resolveTodayInTimeZone: (): string => user.today,
      },
      "@/lib/ai/operator/policy": policy,
      "@/lib/ai/rate-limit": {
        checkRateLimit: (): {
          allowed: boolean;
          retryAfterSeconds: number;
        } => ({
          allowed: !limited,
          retryAfterSeconds: 30,
        }),
      },
      "@/lib/db": {
        db: {
          query: {
            user: {
              findFirst: async (): Promise<object> => {
                profileQueries++;
                return {
                  name: user.name,
                  email: user.email,
                  weeklyCapacity: 40,
                };
              },
            },
          },
        },
      },
      "@/lib/db/schema": { user: { id: "synthetic-id-column" } },
      "@/lib/validations/ai.schema": validation,
    },
  );
  function request(body: unknown): Request {
    return new Request("https://example.invalid/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  assert.equal((await route.POST(request({ message: "Olá" }))).status, 401);
  authenticated = true;
  limited = true;
  const rateLimited = await route.POST(request({ message: "Olá" }));
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.headers.get("Retry-After"), "30");
  limited = false;
  assert.equal((await route.POST(request({ message: "" }))).status, 400);
  assert.equal(profileQueries, 0);
  assert.equal(harness.requests.length, 0);

  const response = await route.POST(request({ message: "Abra os projetos" }));
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("Content-Type") ?? "",
    /text\/event-stream/,
  );
  const events = (await response.text())
    .split("\n\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line.slice(6)) as AgentEvent);
  assert.equal(profileQueries, 1);
  assert.equal(harness.requests.length, 2);
  assert.ok(
    events.some(
      (event) => event.type === "meta" && event.provider === "foundry",
    ),
  );
  assert.ok(events.some((event) => event.type === "action"));
  assert.ok(events.some((event) => event.type === "text"));
  assert.equal(events.at(-1)?.type, "done");
  console.log(
    "✓ Chat route: 401/429/400 gates and authenticated SSE → agent → tools → final response",
  );
}

async function main(): Promise<void> {
  await verifyAgent();
  await verifyRoute();
}

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
