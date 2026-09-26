import {
  buildDocumentSearchRequest,
  buildMicrosoftMemoryDayWindow,
  deriveSelfAttendance,
  mapSearchDocuments,
  pickTranscriptForEvent,
  sanitizeTranscriptForSummary,
} from "../src/lib/microsoft-memory";

const problems: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (!condition) {
    problems.push(detail ? `${label} - ${detail}` : label);
  }
}

function verifyDayWindow(): void {
  const window = buildMicrosoftMemoryDayWindow(
    "2026-09-22",
    "America/Sao_Paulo",
  );

  check(
    "local day window starts at Sao Paulo midnight converted to UTC",
    window.startIso === "2026-09-22T03:00:00.000Z",
    window.startIso,
  );
  check(
    "local day window ends at next Sao Paulo midnight converted to UTC",
    window.endIso === "2026-09-23T03:00:00.000Z",
    window.endIso,
  );
}

function verifyDocumentSearchRequest(): void {
  const request = buildDocumentSearchRequest("2026-09-22", {
    limit: 80,
    timeZone: "America/Sao_Paulo",
  });
  const requests = request.requests as Array<{
    entityTypes: string[];
    query: { queryString: string };
    sortProperties: Array<{ name: string; isDescending: boolean }>;
    size: number;
  }>;
  const first = requests[0];

  check(
    "search is scoped to driveItem",
    first?.entityTypes.includes("driveItem") === true,
  );
  check("search size is capped", first?.size === 50, `size=${first?.size}`);
  check(
    "search shows the newest modified files first",
    first?.sortProperties[0]?.name === "LastModifiedTime" &&
      first.sortProperties[0].isDescending,
  );
  check(
    "search query includes lower date boundary",
    first?.query.queryString.includes(
      "LastModifiedTime>=2026-09-22T03:00:00.000Z",
    ) === true,
  );
  check(
    "search query includes upper date boundary",
    first?.query.queryString.includes(
      "LastModifiedTime<2026-09-23T03:00:00.000Z",
    ) === true,
  );
  check(
    "search query avoids risky filetype OR fallback",
    !first?.query.queryString.includes("filetype:"),
  );
}

function verifyDocumentMapping(): void {
  const documents = mapSearchDocuments(
    {
      value: [
        {
          hitsContainers: [
            {
              hits: [
                {
                  hitId: "doc-1-hit",
                  resource: {
                    id: "doc-1",
                    name: "Relatorio_Tecnico_ClienteX.xlsx",
                    webUrl: "https://contoso.sharepoint.com/doc-1",
                    lastModifiedDateTime: "2026-09-22T14:30:00.000Z",
                    lastModifiedBy: {
                      user: {
                        displayName: "Maria Galvao",
                        email: "maria@optsolv.com.br",
                      },
                    },
                    parentReference: {
                      siteId: "site-1",
                      driveId: "drive-1",
                    },
                  },
                },
                {
                  hitId: "doc-2-hit",
                  resource: {
                    id: "doc-2",
                    name: "Outro autor.docx",
                    webUrl: "https://contoso.sharepoint.com/doc-2",
                    lastModifiedDateTime: "2026-09-22T16:00:00.000Z",
                    lastModifiedBy: {
                      user: {
                        email: "outra.pessoa@optsolv.com.br",
                      },
                    },
                  },
                },
                {
                  hitId: "doc-3-hit",
                  resource: {
                    id: "doc-3",
                    name: "Editor desconhecido.pptx",
                    lastModifiedDateTime: "2026-09-22T18:00:00.000Z",
                  },
                },
                {
                  hitId: "doc-4-hit",
                  resource: {
                    id: "doc-4",
                    name: "Documento com ID do editor.docx",
                    lastModifiedDateTime: "2026-09-22T19:00:00.000Z",
                    lastModifiedBy: { user: { id: "entra-123" } },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    "2026-09-22",
    "Maria@OptSolv.com.br",
    "America/Sao_Paulo",
    "entra-123",
  );

  check(
    "only signed-in user's document remains",
    documents.length === 2,
    `count=${documents.length}`,
  );
  check(
    "document evidence uses timestamp, not duration",
    !("minutes" in (documents[0] ?? {})),
  );
  check(
    "document editor is matched case-insensitively",
    documents[0]?.editedBySignedInUser === true,
  );
}

function verifySelfAttendance(): void {
  const result = deriveSelfAttendance(
    [
      {
        emailAddress: "maria@optsolv.com.br",
        attendanceIntervals: [
          {
            joinDateTime: "2026-09-22T14:05:00.000Z",
            leaveDateTime: "2026-09-22T14:25:00.000Z",
          },
          {
            joinDateTime: "2026-09-22T14:20:00.000Z",
            leaveDateTime: "2026-09-22T15:00:00.000Z",
          },
        ],
      },
      {
        emailAddress: "cliente@empresa.com",
        attendanceIntervals: [
          {
            joinDateTime: "2026-09-22T14:00:00.000Z",
            leaveDateTime: "2026-09-22T15:00:00.000Z",
          },
        ],
      },
    ],
    "MARIA@optsolv.com.br",
  );

  check(
    "attendance sums only signed-in user's merged intervals",
    result.totalMinutes === 55,
    `minutes=${result.totalMinutes}`,
  );
  check(
    "attendance merges overlapping intervals",
    result.intervals.length === 1,
    `intervals=${result.intervals.length}`,
  );
  check(
    "attendance intervals are chronological",
    result.intervals[0]?.joinedAt === "2026-09-22T14:05:00.000Z",
  );
}

function verifyTranscriptSanitization(): void {
  const sanitized = sanitizeTranscriptForSummary(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
<v Maria>Alinhamos a migracao do banco.

NOTE confidence metadata
00:00:03.000 --> 00:00:04.000
<v Joao>Definimos proximos passos.</v>`);

  check(
    "transcript sanitization removes VTT header",
    !sanitized.includes("WEBVTT"),
  );
  check(
    "transcript sanitization removes timestamps",
    !sanitized.includes("-->"),
  );
  check(
    "transcript sanitization removes speaker tags",
    !sanitized.includes("<v"),
  );
  check(
    "transcript sanitization keeps meeting content",
    sanitized.includes("Alinhamos a migracao do banco") &&
      sanitized.includes("Definimos proximos passos"),
  );
}

function verifyTranscriptOccurrence(): void {
  const chosen = pickTranscriptForEvent(
    [
      { id: "old", createdDateTime: "2026-09-15T14:00:00.000Z" },
      { id: "correct", createdDateTime: "2026-09-22T14:00:00.000Z" },
      { id: "newer", createdDateTime: "2026-09-29T14:00:00.000Z" },
    ],
    "2026-09-22T13:00:00.000Z",
  );
  check(
    "transcript belongs to requested recurring occurrence",
    chosen?.id === "correct",
  );
}

function main(): void {
  verifyDayWindow();
  verifyDocumentSearchRequest();
  verifyDocumentMapping();
  verifySelfAttendance();
  verifyTranscriptSanitization();
  verifyTranscriptOccurrence();

  if (problems.length > 0) {
    console.error("\nMicrosoft memory evidence rules failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log("microsoft memory evidence rules OK");
}

main();
