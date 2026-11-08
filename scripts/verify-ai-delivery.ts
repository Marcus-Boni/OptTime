/** Offline digest delivery through the real narrative, Foundry and presenter. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { resetProviderHealth } from "@/lib/ai/providers/health";
import * as appUrl from "@/lib/app-url";
import { digestLog } from "@/lib/db/schema";
import * as narrative from "@/lib/digest/narrative";
import * as presenter from "@/lib/digest/presenter";
import type { DigestRecipient } from "@/lib/digest/send";
import type { MemberDigest } from "@/lib/digest/types";
import type { sendWeeklyDigestBatch } from "@/lib/email";

const digest: MemberDigest = {
  audience: "member",
  userId: "synthetic-user",
  userName: "Pessoa de Verificação",
  email: "verification@example.invalid",
  role: "member",
  period: {
    period: "2026-W45",
    from: "2026-11-02",
    to: "2026-11-06",
    label: "2 a 6 de novembro de 2026",
  },
  totalMinutes: 2400,
  previousTotalMinutes: 2400,
  deltaMinutes: 0,
  deltaPercentage: 0,
  billableMinutes: 2400,
  targetMinutes: 2400,
  entryCount: 5,
  projects: [],
  days: [],
  categories: [
    {
      category: "feature",
      label: "Desenvolvimento",
      minutes: 2400,
      percentage: 100,
    },
  ],
  mostProductiveDay: null,
  timesheetStatus: "approved",
  incompleteDays: 0,
  incompleteDayThresholdMinutes: 360,
};

const recipient: DigestRecipient = {
  userId: digest.userId,
  name: digest.userName,
  email: digest.email,
  role: digest.role,
  weeklyCapacity: 40,
};
const summary =
  "Você registrou 40 horas nesta semana, concentradas em desenvolvimento. O total se manteve igual ao da semana anterior, com o timesheet aprovado.";
const endpoint = "https://synthetic-delivery.services.ai.azure.com/openai/v1";
const requireDependency = createRequire(resolve("package.json"));
type DigestModule = typeof import("@/lib/digest/send");
type EmailBatch = Parameters<typeof sendWeeklyDigestBatch>[0];
type MailMode = "success" | "refused" | "throw";

/** Fail closed on unmocked application modules; never load a database client. */
function loadDelivery(mocks: Record<string, unknown>): DigestModule {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(resolve("src/lib/digest/send.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(source, {
    exports,
    require: (name: string): unknown => {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/") || name.startsWith("./")) {
        throw new Error(`Unmocked delivery dependency: ${name}`);
      }
      return requireDependency(name);
    },
    crypto: { randomUUID },
    Error,
    console: { ...console, error: (): void => {} },
  });
  return exports as DigestModule;
}

function makeHarness(): {
  delivery: DigestModule;
  batches: EmailBatch[];
  updates: Record<string, unknown>[];
  row: () => Record<string, unknown> | undefined;
  setMailMode: (mode: MailMode) => void;
} {
  let row: Record<string, unknown> | undefined;
  let mailMode: MailMode = "success";
  const batches: EmailBatch[] = [];
  const updates: Record<string, unknown>[] = [];
  const delivery = loadDelivery({
    "@/lib/app-url": appUrl,
    "@/lib/db/schema": { digestLog },
    "./presenter": presenter,
    "./narrative": narrative,
    "./build": {
      buildMemberDigest: async (): Promise<MemberDigest> => digest,
      buildManagerDigest: (): never => {
        throw new Error("Unexpected manager fixture request");
      },
    },
    "@/lib/db": {
      db: {
        insert: (table: unknown) => {
          assert.equal(table, digestLog);
          return {
            values: (values: Record<string, unknown>) => ({
              onConflictDoNothing: () => ({
                returning: async (): Promise<Array<{ id: unknown }>> => {
                  if (row) return [];
                  row = { ...values };
                  return [{ id: row.id }];
                },
              }),
            }),
          };
        },
        query: {
          digestLog: {
            findFirst: async (): Promise<unknown> => row,
          },
        },
        update: (table: unknown) => {
          assert.equal(table, digestLog);
          return {
            set: (values: Record<string, unknown>) => ({
              where: async (): Promise<void> => {
                assert.ok(row, "Updates require a reserved delivery slot");
                updates.push({ ...values });
                Object.assign(row, values);
              },
            }),
          };
        },
      },
    },
    "@/lib/email": {
      sendWeeklyDigestBatch: async (
        batch: EmailBatch,
      ): Promise<{ sent: number; failed: number }> => {
        assert.equal(row?.status, "pending", "Reserve before mailing");
        batches.push(batch);
        if (mailMode === "throw") throw new Error("Synthetic mail outage");
        return mailMode === "refused"
          ? { sent: 0, failed: 1 }
          : { sent: 1, failed: 0 };
      },
    },
  });
  return {
    delivery,
    batches,
    updates,
    row: () => row,
    setMailMode: (mode): void => {
      mailMode = mode;
    },
  };
}

function streamedSummary(text: string): Response {
  const events = [
    { type: "response.output_text.delta", delta: text.slice(0, 45) },
    { type: "response.output_text.delta", delta: text.slice(45) },
    {
      type: "response.completed",
      response: {
        status: "completed",
        output: [
          {
            id: "msg_synthetic",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text, annotations: [] }],
          },
        ],
      },
    },
  ];
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

async function main(): Promise<void> {
  const settings = {
    AZURE_FOUNDRY_ENDPOINT: endpoint,
    AZURE_FOUNDRY_DEPLOYMENT: "gpt-6-luna",
    AZURE_FOUNDRY_API_KEY: "synthetic-delivery-key",
    BETTER_AUTH_URL: "https://synthetic-app.example.invalid",
  };
  const previous = new Map(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, settings);
  const nativeFetch = globalThis.fetch;
  let modelMode: "success" | "unavailable" = "success";
  let modelCalls = 0;
  globalThis.fetch = async (input, init): Promise<Response> => {
    assert.equal(
      input instanceof Request ? input.url : String(input),
      `${endpoint}/responses`,
      "Only the intercepted synthetic Foundry endpoint is allowed",
    );
    assert.ok(init);
    assert.equal(init.method, "POST");
    assert.equal(typeof init.body, "string");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.store, false);
    assert.ok(JSON.stringify(body.input).includes(digest.userName));
    modelCalls++;
    return modelMode === "unavailable"
      ? new Response("Synthetic Foundry outage", { status: 503 })
      : streamedSummary(summary);
  };

  try {
    resetProviderHealth();
    const success = makeHarness();
    const outcome = await success.delivery.sendDigest(
      recipient,
      "member",
      "2026-11-09",
    );
    assert.equal(outcome.status, "sent");
    assert.equal(success.batches.length, 1);
    const email = success.batches[0][0];
    const presentation = presenter.presentDigest(digest);
    assert.equal(email.to, recipient.email);
    assert.equal(email.subject, presentation.subject);
    assert.equal(email.data.narrative, summary);
    assert.equal(email.data.headline, presentation.headline);
    assert.equal(email.data.periodLabel, presentation.periodLabel);
    assert.deepEqual(email.data.metrics, presentation.metrics);
    assert.deepEqual(email.data.bars, presentation.bars);
    assert.equal(
      email.data.appUrl,
      "https://synthetic-app.example.invalid/dashboard/time",
    );
    assert.equal(success.row()?.status, "sent");
    assert.equal(success.row()?.provider, "foundry");
    assert.equal(success.row()?.narrative, summary);
    assert.equal(success.row()?.totalMinutes, digest.totalMinutes);
    assert.equal(success.row()?.stats, JSON.stringify(digest));
    assert.equal(modelCalls, 1, "Use the real Foundry completion path");

    const duplicate = await success.delivery.sendDigest(
      recipient,
      "member",
      "2026-11-09",
    );
    assert.equal(duplicate.status, "skipped");
    assert.equal(
      success.batches.length,
      1,
      "Never mail a delivered slot twice",
    );
    assert.equal(success.updates.length, 1, "Keep the successful delivery log");

    const refused = makeHarness();
    refused.setMailMode("refused");
    const failed = await refused.delivery.sendDigest(
      recipient,
      "member",
      "2026-11-09",
    );
    assert.equal(failed.status, "failed");
    assert.equal(refused.row()?.status, "failed");
    assert.match(String(refused.row()?.errorMessage), /Envio recusado/);
    assert.equal(refused.row()?.provider, undefined);
    refused.setMailMode("success");
    const retried = await refused.delivery.sendDigest(
      recipient,
      "member",
      "2026-11-09",
    );
    assert.equal(retried.status, "sent");
    assert.equal(refused.batches.length, 2);
    assert.equal(refused.updates[1]?.status, "pending");
    assert.equal(refused.row()?.provider, "foundry");
    assert.equal(refused.row()?.errorMessage, null);

    const thrown = makeHarness();
    thrown.setMailMode("throw");
    const transportFailure = await thrown.delivery.sendDigest(
      recipient,
      "member",
      "2026-11-09",
    );
    assert.equal(transportFailure.status, "failed");
    assert.equal(thrown.row()?.status, "failed");
    assert.equal(thrown.row()?.errorMessage, "Synthetic mail outage");

    modelMode = "unavailable";
    resetProviderHealth();
    const fallback = makeHarness();
    const fallbackOutcome = await fallback.delivery.sendDigest(
      recipient,
      "member",
      "2026-11-09",
    );
    assert.equal(fallbackOutcome.status, "sent");
    assert.equal(fallback.row()?.provider, "deterministic");
    assert.equal(
      fallback.batches[0][0].data.narrative,
      narrative.writeDeterministicNarrative(digest),
    );
    assert.equal(fallback.row()?.status, "sent");
    console.log(
      "AI digest delivery passed: Foundry narrative, presenter, logging, duplicate protection, mail failure/retry and deterministic fallback (offline).",
    );
  } finally {
    globalThis.fetch = nativeFetch;
    resetProviderHealth();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error: unknown) => {
  console.error("[verify-ai-delivery]", error);
  process.exitCode = 1;
});
