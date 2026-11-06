import assert from "node:assert/strict";
import { GET as getReportPDF } from "../src/app/api/v1/reports/time-entries/pdf/route";
import { GET as getReportJSON } from "../src/app/api/v1/reports/time-entries/route";
import {
  generateTimeEntriesReportPDF,
  type TimeEntriesReportDTO,
  timeEntriesReportQuerySchema,
} from "../src/lib/reports/time-entries-report";
import type { TeamHourEntry } from "../src/types/team-hours";

async function main() {
  process.stdout.write("Starting time entries report verification...\n");

  // 1. Query Schema Validation Tests
  {
    // Valid query with defaults
    const valid = timeEntriesReportQuerySchema.safeParse({
      userEmail: "colaborador@optsolv.com",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    assert.equal(valid.success, true);
    if (valid.success) {
      assert.equal(valid.data.status, "approved");
      assert.equal(valid.data.format, "json");
    }

    // Valid query with all status and pdf format
    const validAll = timeEntriesReportQuerySchema.safeParse({
      userEmail: "colaborador@optsolv.com",
      from: "2026-10-01",
      to: "2026-10-31",
      status: "all",
      format: "pdf",
    });
    assert.equal(validAll.success, true);
    if (validAll.success) {
      assert.equal(validAll.data.status, "all");
      assert.equal(validAll.data.format, "pdf");
    }

    // Missing userEmail
    const missingEmail = timeEntriesReportQuerySchema.safeParse({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    assert.equal(missingEmail.success, false);

    // Invalid email format
    const invalidEmail = timeEntriesReportQuerySchema.safeParse({
      userEmail: "nao-e-email",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    assert.equal(invalidEmail.success, false);

    // Invalid date format
    const invalidDate = timeEntriesReportQuerySchema.safeParse({
      userEmail: "colaborador@optsolv.com",
      from: "01-10-2026",
      to: "2026-10-31",
    });
    assert.equal(invalidDate.success, false);

    process.stdout.write("✓ Schema validation tests passed\n");
  }

  // 2. PDF Generator Unit Test
  {
    const mockReport: TimeEntriesReportDTO = {
      user: {
        id: "usr_1",
        name: "Marcão Colaborador",
        email: "marcao@optsolv.com",
        jobTitle: "Engenheiro de Software",
        department: "Tecnologia",
      },
      period: {
        from: "2026-10-01",
        to: "2026-10-31",
        label: "01/10/2026 a 31/10/2026",
      },
      filter: {
        status: "approved",
        approvedOnly: true,
        statusLabel: "Aprovados",
        description:
          "Considerando exclusivamente lançamentos em timesheets aprovadas.",
      },
      summary: {
        totalMinutes: 9600,
        totalHoursFormatted: "160h",
        totalDecimalHours: 160,
        billableMinutes: 8160,
        billableHoursFormatted: "136h",
        nonBillableMinutes: 1440,
        nonBillableHoursFormatted: "24h",
        billablePercentage: 85,
        entryCount: 2,
        activeDaysCount: 2,
        projectCount: 1,
      },
      byProject: [
        {
          projectId: "proj_1",
          projectName: "OptSolv Platform",
          projectCode: "OPT-PLAT",
          clientName: "Interno",
          color: "#f97316",
          totalMinutes: 9600,
          totalHoursFormatted: "160h",
          totalDecimalHours: 160,
          billableMinutes: 8160,
          billablePercentage: 85,
          entryCount: 2,
          sharePercentage: 100,
        },
      ],
      byDate: [
        {
          date: "2026-10-01",
          dateFormatted: "01/10/2026",
          dayOfWeek: "Quinta-feira",
          totalMinutes: 480,
          totalHoursFormatted: "8h",
          billableMinutes: 480,
          entryCount: 1,
        },
      ],
      entries: [
        {
          id: "te_1",
          date: "2026-10-01",
          dateFormatted: "01/10/2026",
          durationMinutes: 480,
          durationFormatted: "8h",
          billable: true,
          status: "approved",
          description: "Desenvolvimento do relatório para o OPT RH",
          projectId: "proj_1",
          projectName: "OptSolv Platform",
          projectCode: "OPT-PLAT",
          clientName: "Interno",
          azureWorkItemId: 1234,
          azureWorkItemTitle: "Relatório de Horas M2M",
          externalId: null,
          source: "manual",
          createdAt: "2026-10-01T17:00:00.000Z",
        },
      ],
      meta: {
        generatedAt: "2026-11-06T13:00:00.000Z",
        pdfUrl:
          "/api/v1/reports/time-entries/pdf?userEmail=marcao%40optsolv.com&from=2026-10-01&to=2026-10-31&status=approved",
      },
    };

    const rawEntries: TeamHourEntry[] = [
      {
        id: "te_1",
        date: "2026-10-01",
        description: "Desenvolvimento do relatório para o OPT RH",
        duration: 480,
        billable: true,
        azdoSyncStatus: "synced",
        createdAt: "2026-10-01T17:00:00.000Z",
        user: {
          id: "usr_1",
          name: "Marcão Colaborador",
          email: "marcao@optsolv.com",
          image: null,
        },
        project: {
          id: "proj_1",
          name: "OptSolv Platform",
          color: "#f97316",
          clientName: "Interno",
        },
      },
    ];

    const pdfBytes = await generateTimeEntriesReportPDF({
      report: mockReport,
      rawEntries,
      pdfFilename: "relatorio-horas-marcao-2026-10-01-2026-10-31.pdf",
    });

    assert.ok(
      pdfBytes.length > 1000,
      "PDF buffer must be greater than 1000 bytes",
    );
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    assert.equal(header, "%PDF-", "PDF signature must be %PDF-");
    process.stdout.write("✓ PDF generator unit test passed\n");
  }

  // 3. Route Handler Auth and Validation Tests
  {
    // Test Unauthorized without Bearer token
    const reqNoAuth = new Request(
      "http://localhost/api/v1/reports/time-entries?userEmail=test@optsolv.com&from=2026-10-01&to=2026-10-31",
    );
    const resNoAuth = await getReportJSON(reqNoAuth);
    assert.equal(resNoAuth.status, 401);
    const jsonNoAuth = (await resNoAuth.json()) as { error: { code: string } };
    assert.equal(jsonNoAuth.error.code, "UNAUTHORIZED");

    // Test PDF route unauthorized
    const reqPdfNoAuth = new Request(
      "http://localhost/api/v1/reports/time-entries/pdf?userEmail=test@optsolv.com&from=2026-10-01&to=2026-10-31",
    );
    const resPdfNoAuth = await getReportPDF(reqPdfNoAuth);
    assert.equal(resPdfNoAuth.status, 401);

    process.stdout.write("✓ Route handler auth tests passed\n");
  }

  process.stdout.write("All time entries report verifications succeeded!\n");
}

main().catch((err: unknown) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
