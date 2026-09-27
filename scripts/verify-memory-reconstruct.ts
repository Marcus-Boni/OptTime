import {
  type BuildDayPlanInput,
  buildDeterministicDayPlan,
} from "../src/lib/time-assistant/reconstruct";
import { applyDayPlanSchema } from "../src/lib/validations/reconstruct.schema";

const base: BuildDayPlanInput = {
  date: "2026-09-22",
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
  patterns: [],
  projects: [
    {
      id: "project-1",
      name: "Implantação ERP",
      clientName: "Cliente X",
      code: "OPT-42",
      color: "#000000",
      billable: true,
      azureProjectId: null,
    },
  ],
  defaultBillable: true,
  warnings: [],
  sources: {
    calendar: true,
    calls: true,
    documents: true,
    attendance: true,
    transcripts: true,
    documentsNeedsConsent: false,
    attendanceNeedsConsent: false,
    transcriptsNeedsConsent: false,
    azureDevops: false,
    commits: false,
    patterns: false,
  },
};

const documentPlan = buildDeterministicDayPlan({
  ...base,
  documents: [
    {
      id: "doc-1",
      name: "Relatorio_Tecnico_ClienteX.xlsx",
      path: null,
      modifiedAt: "2026-09-22T14:30:00.000Z",
    },
  ],
});
const document = documentPlan.items.find((item) => item.source === "document");
if (!document || document.minutes !== 15 || document.confidence !== "low") {
  throw new Error(
    "Document modification must remain a low-confidence editable clue",
  );
}
if (!document.evidence.includes("ponto de partida")) {
  throw new Error("Document evidence must not claim measured editing duration");
}

const unrelatedPlan = buildDeterministicDayPlan({
  ...base,
  documents: [
    {
      id: "doc-2",
      name: "Documento_pessoal.docx",
      path: null,
      modifiedAt: "2026-09-22T14:30:00.000Z",
    },
  ],
});
if (unrelatedPlan.items.some((item) => item.source === "document")) {
  throw new Error("Unmatched personal documents must not be suggested");
}

const meetingPlan = buildDeterministicDayPlan({
  ...base,
  events: [
    {
      subject: "Implantação ERP",
      startIso: "2026-09-22T13:00:00.000Z",
      endIso: "2026-09-22T14:00:00.000Z",
      minutes: 60,
      attendanceMinutes: 20,
      attendedFromIso: "2026-09-22T13:10:00.000Z",
      summary: "Alinhamento sobre a migração do banco de dados",
      evidence: "Convite confirmado no Outlook.",
    },
  ],
});
const meeting = meetingPlan.items.find(
  (item) => item.source === "teams_attendance",
);
if (!meeting || meeting.minutes !== 20) {
  throw new Error("Teams attendance must override the scheduled duration");
}
if (meeting.description !== "Alinhamento sobre a migração do banco de dados") {
  throw new Error("Transcript summary must become the editable description");
}

const callPlan = buildDeterministicDayPlan({
  ...base,
  targetMinutes: 360,
  calls: [
    {
      id: "call-1",
      startIso: "2026-09-22T10:00:00.000Z",
      endIso: "2026-09-22T10:02:00.000Z",
      minutes: 2,
      otherParticipantName: "Ana Silva",
      callerName: "Mario",
      calleeName: "Ana Silva",
      callType: "peerToPeer",
      mediaTypes: ["audio"],
    },
    {
      id: "call-2",
      startIso: "2026-09-22T11:00:00.000Z",
      endIso: "2026-09-22T11:07:00.000Z",
      minutes: 7,
      otherParticipantName: "Time de Produto",
      callerName: "Mario",
      calleeName: null,
      callType: "groupCall",
      mediaTypes: ["audio", "video"],
    },
    {
      id: "call-long",
      startIso: "2026-09-22T13:00:00.000Z",
      endIso: "2026-09-22T18:05:00.000Z",
      minutes: 305,
      otherParticipantName: "Comitê Executivo",
      callerName: "Mario",
      calleeName: null,
      callType: "groupCall",
      mediaTypes: ["audio", "video"],
    },
  ],
  documents: [
    {
      id: "doc-3",
      name: "Relatorio_Tecnico_ClienteX.xlsx",
      path: null,
      modifiedAt: "2026-09-22T12:30:00.000Z",
    },
  ],
});
const calls = callPlan.items.filter((item) => item.source === "teams_call");
if (calls.length !== 3) {
  throw new Error("Teams calls must become their own reconstruction source");
}
if (calls[0]?.minutes !== 2 || calls[1]?.minutes !== 7) {
  throw new Error(
    "Teams call minutes must remain exact, with no quarter-hour inflation",
  );
}
if (calls[2]?.minutes !== 305) {
  throw new Error("Measured Teams calls above 240 minutes must be preserved");
}
if ((calls[0] as { sourceId?: string }).sourceId !== "call-1") {
  throw new Error("Teams calls must keep the original source id");
}
if (
  calls.some(
    (item) =>
      !item.description.startsWith("Chamada Teams:") ||
      !item.evidence.includes("Projeto sugerido"),
  )
) {
  throw new Error(
    "Teams calls must show measured participation and suggested project evidence",
  );
}
if (callPlan.items.find((item) => item.source === "document")?.minutes !== 15) {
  throw new Error(
    "Estimated sources must absorb fitting without inflating measured calls",
  );
}

const loggedCallPlan = buildDeterministicDayPlan({
  ...base,
  existingDescriptions: [calls[0]?.description ?? ""],
  calls: [
    {
      id: "call-1",
      startIso: "2026-09-22T10:00:00.000Z",
      endIso: "2026-09-22T10:02:00.000Z",
      minutes: 2,
      otherParticipantName: "Ana Silva",
      callerName: "Mario",
      calleeName: "Ana Silva",
      callType: "peerToPeer",
      mediaTypes: ["audio"],
    },
  ],
});
if (loggedCallPlan.items.some((item) => item.source === "teams_call")) {
  throw new Error(
    "Already logged Teams calls must be skipped by stable description",
  );
}

const shortCallApply = applyDayPlanSchema.safeParse({
  date: "2026-09-22",
  items: [
    {
      projectId: "project-1",
      description: calls[0]?.description ?? "Chamada Teams: Ana Silva",
      minutes: 1,
      billable: true,
      source: "teams_call",
    },
  ],
});
if (!shortCallApply.success) {
  throw new Error("Applying a measured Teams call must accept 1 minute");
}

const shortDocumentApply = applyDayPlanSchema.safeParse({
  date: "2026-09-22",
  items: [
    {
      projectId: "project-1",
      description: "Trabalho no documento curto",
      minutes: 1,
      billable: true,
      source: "document",
    },
  ],
});
if (shortDocumentApply.success) {
  throw new Error("Only Teams calls may be applied below 5 minutes");
}

console.log("microsoft memory reconstruction rules OK");
