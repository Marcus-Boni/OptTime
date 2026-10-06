import assert from "node:assert/strict";
import {
  buildDayPlanApplyPayload,
  getReconstructDayCacheKey,
} from "@/hooks/use-reconstruct-day";
import {
  type BuildDayPlanInput,
  buildDeterministicDayPlan,
} from "@/lib/time-assistant/reconstruct";
import { applyDayPlanSchema } from "@/lib/validations/reconstruct.schema";

const projects: BuildDayPlanInput["projects"] = [
  {
    id: "perfil",
    name: "PERFIL ALUMINIO – Portal do Cliente",
    code: "PA-01",
    clientName: "Perfil",
    color: "orange",
    billable: true,
    azureProjectId: null,
  },
  {
    id: "portfolio",
    name: "Portfólio",
    code: "PORT-02",
    clientName: "OptSolv",
    color: "blue",
    billable: false,
    azureProjectId: null,
  },
  {
    id: "gestao",
    name: "Gestão de Projetos",
    code: "GP-03",
    clientName: "OptSolv",
    color: "green",
    billable: true,
    azureProjectId: null,
  },
];
const base: BuildDayPlanInput = {
  date: "2026-10-05",
  targetMinutes: 480,
  existingMinutes: 0,
  existingDescriptions: [],
  existingWorkItemIds: [],
  events: [],
  documents: [],
  calls: [],
  commitSessions: [],
  pullRequests: [],
  workItemProposals: [],
  dismissedFingerprints: [],
  patterns: [
    {
      projectId: "perfil",
      projectName: projects[0].name,
      projectColor: "orange",
      billable: true,
      description: "Portal",
      weight: 10,
    },
  ],
  projects,
  defaultBillable: true,
  warnings: [],
  sources: {
    calendar: true,
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
};
function meeting(subject: string): BuildDayPlanInput["events"][number] {
  return {
    subject,
    startIso: "2026-10-05T13:00:00Z",
    endIso: "2026-10-05T14:00:00Z",
    minutes: 60,
  };
}
function projectFor(
  subject: string,
  overrides: Partial<BuildDayPlanInput> = {},
): string | null | undefined {
  return buildDeterministicDayPlan({
    ...base,
    ...overrides,
    events: [meeting(subject)],
  }).items.find((item) => item.source === "calendar")?.projectId;
}

assert.equal(
  projectFor("Weekly Júnio"),
  null,
  "Unrelated meetings must not inherit the most frequent or first project",
);
assert.equal(projectFor("Weekly Júnio", { patterns: [] }), null);
assert.equal(
  projectFor("Weekly Júnio", { projects: [projects[0]] }),
  null,
  "A single available project is not evidence",
);
assert.equal(
  projectFor("PORTFOLIO – Preparando material."),
  "portfolio",
  "Accent differences must not hide a unique project",
);
assert.equal(
  projectFor("GESTÃO DE PROJETOS – Alinhamento com a Maria"),
  "gestao",
);
assert.equal(
  projectFor("PA-01 – Alinhamento"),
  "perfil",
  "Explicit codes must identify a project",
);
assert.equal(
  projectFor("PERFIL ALUMINIO – Alinhamento"),
  "perfil",
  "Unique project-name prefixes must identify the project",
);
assert.equal(
  projectFor("OptSolv – Alinhamento"),
  null,
  "A shared client is ambiguous",
);
assert.equal(
  projectFor("PORT-020 – Alinhamento"),
  null,
  "Partial codes must not match",
);
assert.equal(
  projectFor("Portfólio e Gestão de Projetos"),
  null,
  "Two explicit projects require manual review",
);
assert.equal(
  projectFor("PERFIL ALUMINIO – Alinhamento", {
    projects: [
      ...projects,
      {
        ...projects[0],
        id: "perfil-2",
        name: "PERFIL ALUMINIO – ERP",
        code: "PA-02",
      },
    ],
  }),
  null,
);
for (const targetMinutes of [240, 360, 480]) {
  const plan = buildDeterministicDayPlan({
    ...base,
    targetMinutes,
    events: [
      meeting("PORTFOLIO – Material"),
      meeting("GESTÃO DE PROJETOS – Maria"),
      meeting("Weekly Júnio"),
    ],
  });
  assert.deepEqual(
    plan.items
      .filter((item) => item.source === "calendar")
      .map((item) => item.projectId),
    ["portfolio", "gestao", null],
  );
  assert.equal(
    plan.planMinutes,
    targetMinutes,
    "4h/6h/8h fitting must remain intact",
  );
}

const review = buildDeterministicDayPlan({
  ...base,
  events: [meeting("Weekly Júnio"), meeting("Portfólio")],
});
const draft = review.items.map((item) => ({ ...item, included: true }));
assert.throws(
  () => buildDayPlanApplyPayload(base.date, draft),
  /Selecione o projeto/,
);
assert.equal(
  applyDayPlanSchema.safeParse({
    date: base.date,
    items: [{ ...draft[0], projectId: null }],
  }).success,
  false,
);
const assigned = draft.map((item) =>
  item.projectId === null
    ? { ...item, projectId: "gestao", projectName: projects[2].name }
    : item,
);
assert.deepEqual(
  buildDayPlanApplyPayload(base.date, assigned).items.map(
    (item) => item.projectId,
  ),
  ["portfolio", "gestao", "perfil"],
);
const excluded = draft.map((item) => ({
  ...item,
  included: item.projectId !== null,
}));
assert.equal(buildDayPlanApplyPayload(base.date, excluded).items.length, 2);
assert.throws(
  () =>
    buildDayPlanApplyPayload(
      base.date,
      assigned.map((item, index) =>
        index === 0 ? { ...item, description: "  " } : item,
      ),
    ),
  /Revise/,
);
assert.notEqual(
  getReconstructDayCacheKey(base.date, 40, "user-1"),
  getReconstructDayCacheKey(base.date, 40, "user-2"),
);
assert.equal(
  projectFor("Revisão do perfil de acesso"),
  null,
  "Generic prose is not a client reference",
);
assert.equal(
  projectFor("Perfil – Alinhamento"),
  "perfil",
  "A unique client label can identify the meeting",
);
