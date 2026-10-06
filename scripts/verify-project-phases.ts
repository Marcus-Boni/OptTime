import assert from "node:assert/strict";
import { getUniqueViolationConstraint } from "@/lib/db/errors";
import {
  buildPhaseCode,
  buildPhaseName,
  ensureUniqueCode,
  getNextPhaseNumber,
  getPhaseLineageId,
  isLiveProjectStatus,
  PROJECT_CODE_MAX_LENGTH,
  pickCurrentPhase,
  stripPhaseSuffix,
  suggestNextIntegrationKey,
  summarizePhaseBudget,
} from "@/lib/projects/phases";
import { createProjectPhaseSchema } from "@/lib/validations/project-phase.schema";

// ─── Naming ────────────────────────────────────────────────────────────────────

assert.equal(buildPhaseName("Marca Ambiental", 2), "Marca Ambiental — Fase 2");
assert.equal(
  buildPhaseName("Marca Ambiental — Fase 2", 3),
  "Marca Ambiental — Fase 3",
  "the next phase replaces the suffix instead of stacking it",
);
assert.equal(buildPhaseName("Marca Ambiental - fase 2", 1), "Marca Ambiental");
assert.equal(stripPhaseSuffix("Portal · Fase 12"), "Portal");
assert.equal(
  stripPhaseSuffix("Fase Zero do Cliente"),
  "Fase Zero do Cliente",
  "only a trailing 'Fase N' is a suffix",
);

// ─── Codes ─────────────────────────────────────────────────────────────────────

assert.equal(buildPhaseCode("MARCA-AMB", 2), "MARCA-AMB-F2");
assert.equal(buildPhaseCode("MARCA-AMB-F2", 3), "MARCA-AMB-F3");
assert.equal(buildPhaseCode("marca amb", 2), "MARCA-AMB-F2");

const longCode = buildPhaseCode("MARCA-AMBIENTAL-1A2B3C", 10);
assert.ok(longCode.length <= PROJECT_CODE_MAX_LENGTH, longCode);
assert.ok(longCode.endsWith("-F10"));
assert.ok(!longCode.includes("--"), "no dangling hyphen before the suffix");

assert.equal(ensureUniqueCode("MARCA-F2", new Set()), "MARCA-F2");
assert.equal(ensureUniqueCode("MARCA-F2", new Set(["MARCA-F2"])), "MARCA-F2-2");
assert.equal(
  ensureUniqueCode("MARCA-F2", new Set(["MARCA-F2", "MARCA-F2-2"])),
  "MARCA-F2-3",
);
const fullWidth = "ABCDEFGHIJKLMNOPQ-F2"; // 20 chars
const disambiguated = ensureUniqueCode(fullWidth, new Set([fullWidth]));
assert.ok(disambiguated.length <= PROJECT_CODE_MAX_LENGTH, disambiguated);

// ─── Integration key: each phase gets its own ──────────────────────────────────

assert.equal(suggestNextIntegrationKey("MARAM_PORCL_0001"), "MARAM_PORCL_0002");
assert.equal(suggestNextIntegrationKey("ARCEL_OCRRR_01"), "ARCEL_OCRRR_02");
assert.equal(suggestNextIntegrationKey("OPTTT-ALESO_0009"), "OPTTT-ALESO_0010");
assert.equal(
  suggestNextIntegrationKey("KEY_99"),
  "KEY_100",
  "overflow grows instead of wrapping",
);
assert.equal(suggestNextIntegrationKey("SEM-NUMERO"), null);
assert.equal(suggestNextIntegrationKey(null), null);
assert.equal(
  suggestNextIntegrationKey("  MARAM_PORCL_0001  "),
  "MARAM_PORCL_0002",
);

// ─── Current phase selection ───────────────────────────────────────────────────

const phase1 = {
  id: "p1",
  status: "archived",
  phase: 1,
  createdAt: "2026-01-10",
};
const phase2 = {
  id: "p2",
  status: "active",
  phase: 2,
  createdAt: "2026-10-06",
};
const phase3Open = {
  id: "p3",
  status: "open",
  phase: 3,
  createdAt: "2026-10-07",
};

assert.equal(pickCurrentPhase([]), null);
assert.equal(pickCurrentPhase([phase1])?.id, "p1");
assert.equal(pickCurrentPhase([phase1, phase2])?.id, "p2");
assert.equal(
  pickCurrentPhase([phase1, phase2, phase3Open])?.id,
  "p2",
  "the active phase wins over a later, not-yet-active one",
);
assert.equal(
  pickCurrentPhase([phase1, { ...phase2, status: "archived" }])?.id,
  "p2",
  "with no live phase, the latest one is current",
);
assert.equal(
  pickCurrentPhase([
    { ...phase1, status: "open" },
    { ...phase2, status: "archived" },
  ])?.id,
  "p1",
  "an open phase is still live and wins over a later archived one",
);
assert.ok(isLiveProjectStatus("open"));
assert.ok(isLiveProjectStatus("active"));
assert.ok(!isLiveProjectStatus("archived"));
assert.ok(!isLiveProjectStatus("completed"));

assert.equal(getNextPhaseNumber([phase1]), 2);
assert.equal(getNextPhaseNumber([phase1, phase2, phase3Open]), 4);
assert.equal(getPhaseLineageId({ id: "p1", phaseRootId: null }), "p1");
assert.equal(getPhaseLineageId({ id: "p2", phaseRootId: "p1" }), "p1");

// ─── Budget: each phase starts from zero ───────────────────────────────────────

assert.deepEqual(summarizePhaseBudget(100, 0), {
  budgetHours: 100,
  consumedHours: 0,
  usageRatio: 0,
});
assert.equal(summarizePhaseBudget(100, 90 * 60).usageRatio, 0.9);
assert.equal(summarizePhaseBudget(10, 15 * 60).usageRatio, 1.5);
assert.deepEqual(summarizePhaseBudget(null, 125), {
  budgetHours: null,
  consumedHours: 2.1,
  usageRatio: null,
});
assert.equal(summarizePhaseBudget(0, 60).usageRatio, null);

// ─── Input validation ──────────────────────────────────────────────────────────

const validInput = {
  name: "Marca Ambiental — Fase 2",
  code: "MARCA-AMB-F2",
  budget: 320,
  startDate: "2026-10-06",
  endDate: "2026-12-18",
  copyMembers: true,
};
assert.ok(createProjectPhaseSchema.safeParse(validInput).success);
assert.ok(
  createProjectPhaseSchema.safeParse({
    ...validInput,
    integrationKey: "MARAM_PORCL_0002",
  }).success,
);
assert.ok(
  createProjectPhaseSchema.safeParse({
    ...validInput,
    budget: null,
    code: null,
  }).success,
  "budget and code are optional",
);
assert.ok(
  !createProjectPhaseSchema.safeParse({ ...validInput, endDate: "2026-10-01" })
    .success,
  "end date before start date is rejected",
);
assert.ok(
  !createProjectPhaseSchema.safeParse({ ...validInput, budget: -1 }).success,
);
assert.ok(
  !createProjectPhaseSchema.safeParse({ ...validInput, code: "marca f2" })
    .success,
);
assert.ok(
  !createProjectPhaseSchema.safeParse({
    ...validInput,
    startDate: "06/10/2026",
  }).success,
);

// ─── Unique-violation detection through Drizzle's error wrapper ────────────────

assert.equal(
  getUniqueViolationConstraint({
    message: "Failed query",
    cause: { code: "23505", constraint: "project_azure_id_live_unique" },
  }),
  "project_azure_id_live_unique",
);
assert.equal(getUniqueViolationConstraint({ code: "23503" }), null);
assert.equal(getUniqueViolationConstraint(new Error("boom")), null);
assert.equal(getUniqueViolationConstraint(null), null);

console.log("project phases OK");
