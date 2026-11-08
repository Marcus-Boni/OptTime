/**
 * Opt-in live checks of the actual background AI consumers with synthetic data.
 * No customer records, Graph requests, e-mails or application writes are used.
 *
 * tsx --env-file=.env.local scripts/verify-ai-workloads.ts --live
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as completion from "@/lib/ai/completion";
import * as duration from "@/lib/ai/duration";
import { hasConfiguredProvider } from "@/lib/ai/providers";
import { buildPeriodNarrative } from "@/lib/collaboration/narrative";
import { buildDigestNarrative } from "@/lib/digest/narrative";
import type { MemberDigest } from "@/lib/digest/types";
import type { MeetingTranscriptSummary } from "@/lib/microsoft-memory/graph-evidence";
import { refineDayPlanWithAI } from "@/lib/time-assistant/reconstruct";
import * as timezone from "@/lib/timezone";
import type { CollaborationPeriod } from "@/types/collaboration";
import type { DayPlan, DayPlanItem } from "@/types/reconstruct";

const project = {
  id: "synthetic-project",
  name: "Projeto de Verificação",
  code: "SYN-001",
  color: "#64748b",
};

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
  projects: [
    { ...project, projectId: project.id, minutes: 2400, percentage: 100 },
  ],
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

const period: CollaborationPeriod = {
  from: digest.period.from,
  to: digest.period.to,
  label: digest.period.label,
  days: [],
  totals: {
    loggedMinutes: 2400,
    targetMinutes: 2400,
    meetingMinutes: 90,
    collaborationMinutes: 90,
    focusMinutes: 1200,
    loggedMeetingMinutes: 90,
    workingDays: 5,
    awayDays: 0,
  },
  ledger: {
    attended: { count: 2, minutes: 90 },
    rescheduled: { count: 0, minutes: 0 },
    cancelled: { count: 0, minutes: 0 },
    declined: { count: 0, minutes: 0 },
    overlapped: { count: 0, minutes: 0 },
    tentative: { count: 0, minutes: 0 },
    not_responded: { count: 0, minutes: 0 },
    skipped: { count: 0, minutes: 0 },
  },
  meetings: [],
  collaborators: [],
  rituals: [],
  shape: {
    backToBackCount: 0,
    longestFocusBlockMinutes: 240,
    longestFocusBlockDate: "2026-11-03",
    afterHoursMinutes: 0,
    weekendMinutes: 0,
    meetingLoadPercent: 4,
    meetingMinutesInWindow: 90,
    windowStartMinute: 540,
    windowEndMinute: 1080,
    windowMinutes: 540,
    windowCapacityMinutes: 2700,
    contractedMinutes: 2400,
    organizerPercent: 0,
    externalMinutes: 0,
    heaviestWeekday: 1,
  },
  allocations: [
    {
      projectId: project.id,
      name: project.name,
      color: project.color,
      minutes: 2400,
      billableMinutes: 2400,
    },
  ],
  slices: [],
  sources: { calendar: true, portrait: true, mailbox: true },
  statuses: [],
  warnings: [],
  needsReauth: false,
};

function dayItem(overrides: Partial<DayPlanItem>): DayPlanItem {
  return {
    id: "synthetic-pattern",
    projectId: project.id,
    projectName: project.name,
    projectColor: project.color,
    description: "Revisão de documentação técnica",
    minutes: 60,
    estimatedMinutes: 60,
    startsAt: null,
    billable: true,
    azureWorkItemId: null,
    azureWorkItemTitle: null,
    source: "pattern",
    confidence: "medium",
    evidence: "Bloco de documentação presente no padrão sintético do dia.",
    ...overrides,
  };
}

const plan: DayPlan = {
  projects: [{ ...project, billable: true }],
  defaultBillable: true,
  date: "2026-11-06",
  targetMinutes: 480,
  existingMinutes: 383,
  gapMinutes: 97,
  planMinutes: 97,
  items: [
    dayItem({}),
    dayItem({
      id: "synthetic-call",
      source: "teams_call",
      minutes: 37,
      estimatedMinutes: 37,
      description: "Chamada técnica de verificação",
      evidence:
        "Participação medida de 37 minutos em chamada sintética do Teams.",
    }),
  ],
  refinedBy: null,
  narrative: null,
  sources: {
    calendar: false,
    calls: true,
    documents: false,
    attendance: false,
    transcripts: false,
    documentsNeedsConsent: false,
    attendanceNeedsConsent: false,
    transcriptsNeedsConsent: false,
    azureDevops: false,
    commits: false,
    patterns: true,
  },
  warnings: [],
  generatedAt: "2026-11-08T12:00:00.000Z",
};

/** Fail closed on data dependencies while retaining the real workload code. */
function loadWorkload<T>(
  path: string,
  extra = "",
  mocks: Record<string, unknown> = {},
): T {
  const exports: Record<string, unknown> = {};
  const source = ts.transpileModule(
    `${readFileSync(resolve(path), "utf8")}\n${extra}`,
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
      if (name === "@/lib/ai/completion") return completion;
      if (name === "@/lib/timezone") return timezone;
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected workload dependency: ${name}`);
    },
  });
  return exports as T;
}

async function main(): Promise<void> {
  if (!process.argv.includes("--live")) {
    console.log(
      "Skipped live workload checks. Pass --live to send synthetic prompts to Foundry.",
    );
    return;
  }
  assert.ok(
    hasConfiguredProvider(),
    "Configure corporate Foundry authentication first",
  );
  const endpoint = new URL(process.env.AZURE_FOUNDRY_ENDPOINT ?? "");
  const nativeFetch = globalThis.fetch;
  let foundryCalls = 0;
  const identityEndpoint = process.env.IDENTITY_ENDPOINT;
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin === endpoint.origin &&
      url.pathname === `${endpoint.pathname.replace(/\/$/, "")}/responses`
    ) {
      foundryCalls++;
    } else {
      assert.ok(
        identityEndpoint &&
          url.origin === new URL(identityEndpoint).origin &&
          url.pathname === new URL(identityEndpoint).pathname,
        "Synthetic workload verification blocks all non-Foundry business network requests",
      );
    }
    return nativeFetch(input, init);
  };

  async function check(name: string, run: () => Promise<void>): Promise<void> {
    const before = foundryCalls;
    await run();
    assert.ok(foundryCalls > before, `${name} must actually call Foundry`);
    console.log(
      `✓ ${name}: live Foundry response accepted by real workload validator`,
    );
  }

  try {
    await check("Teams intent", async (): Promise<void> => {
      const { interpretMessage } = loadWorkload<
        typeof import("@/lib/teams/bot/intent")
      >("src/lib/teams/bot/intent.ts", "", {
        zod: { z },
        "@/lib/ai/duration": duration,
        "@/lib/teams/commands": {
          // forceLog bypasses commands. Never import its database executors.
          parseTeamsCommand: (): never => {
            throw new Error(
              "Synthetic draft verification must not execute commands",
            );
          },
        },
      });
      const result = await interpretMessage(
        "Registre hoje 1h30 de revisão técnica no projeto SYN-001",
        {
          today: "2026-11-06",
          managerName: null,
          projects: [{ ...project, billable: true, clientName: null }],
          recentProjectIds: [project.id],
        },
        { forceLog: true, timeoutMs: 25_000 },
      );
      assert.equal(result.kind, "log_time");
      if (result.kind !== "log_time")
        throw new Error("Expected a synthetic draft");
      assert.equal(
        result.draft.source,
        "ai",
        "Rules fallback cannot pass this live check",
      );
      assert.equal(result.draft.projectId, project.id);
      assert.equal(result.draft.durationMinutes, 90);
      assert.equal(result.draft.date, "2026-11-06");
      assert.ok(result.draft.description.length > 3);
    });

    await check("Weekly digest narrative", async (): Promise<void> => {
      const result = await buildDigestNarrative(digest);
      assert.equal(
        result.provider,
        "foundry",
        "Deterministic fallback cannot pass",
      );
      assert.ok(result.text.length >= 60 && result.text.length <= 1500);
    });

    await check("Meu Tempo period narrative", async (): Promise<void> => {
      const result = await buildPeriodNarrative({ period, insights: [] });
      assert.equal(result.source, "ai", "Deterministic fallback cannot pass");
      assert.ok(result.text.length >= 50 && result.text.length <= 420);
    });

    await check("Day plan refinement", async (): Promise<void> => {
      const original = structuredClone(plan);
      const result = await refineDayPlanWithAI(original);
      assert.equal(
        result.refinedBy,
        "foundry",
        "Rejected model output cannot pass",
      );
      assert.deepEqual(
        result.items.map((item) => item.id).sort(),
        plan.items.map((item) => item.id).sort(),
      );
      assert.ok(result.planMinutes <= original.planMinutes + 15);
      assert.deepEqual(
        original,
        plan,
        "Refinement must not mutate input evidence",
      );
      for (const item of result.items) {
        const before = plan.items.find((candidate) => candidate.id === item.id);
        assert.ok(before);
        assert.equal(item.projectId, before.projectId);
        assert.equal(item.source, before.source);
        assert.equal(item.evidence, before.evidence);
        if (item.source === "teams_call") {
          assert.equal(item.minutes, 37);
          assert.equal(item.description, before.description);
        } else {
          assert.equal(item.minutes % 15, 0);
        }
      }
    });

    await check("Meeting transcript summary", async (): Promise<void> => {
      const { summarizeTranscriptText } = loadWorkload<{
        summarizeTranscriptText: (
          transcript: string,
        ) => Promise<MeetingTranscriptSummary | null>;
      }>(
        "src/lib/microsoft-memory/graph-evidence.ts",
        "exports.summarizeTranscriptText = summarizeTranscriptText;",
      );
      const summary = await summarizeTranscriptText(
        "WEBVTT\n\n1\n00:00:00.000 --> 00:00:10.000\n<v Teste>Revisamos a documentação técnica do projeto sintético e alinhamos a revisão dos testes.</v>",
      );
      assert.ok(summary, "Rejected or absent summary cannot pass");
      assert.equal(summary.provider, "foundry");
      assert.equal(summary.source, "teams_transcript");
      assert.ok(summary.text.length >= 12 && summary.text.length <= 220);
    });

    console.log(
      `Validated 5 real AI workloads with ${foundryCalls} Foundry request(s), synthetic input only.`,
    );
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

main().catch((error: unknown): void => {
  console.error(
    error instanceof Error ? error.message : "Workload verification failed",
  );
  process.exitCode = 1;
});
