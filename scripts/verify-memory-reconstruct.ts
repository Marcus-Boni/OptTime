import {
  type BuildDayPlanInput,
  buildDeterministicDayPlan,
} from "../src/lib/time-assistant/reconstruct";

const base: BuildDayPlanInput = {
  date: "2026-09-22",
  targetMinutes: 480,
  existingMinutes: 0,
  existingDescriptions: [],
  existingWorkItemIds: [],
  events: [],
  documents: [],
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

console.log("microsoft memory reconstruction rules OK");
