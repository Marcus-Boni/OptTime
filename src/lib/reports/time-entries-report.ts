import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { project, timeEntry, timesheet, user } from "@/lib/db/schema";
import { generateCollaboratorHoursPDFBuffer } from "@/lib/export/pdf";
import { ApiError } from "@/lib/integration/errors";
import { formatDuration, parseLocalDate } from "@/lib/utils";
import type { TeamHourEntry } from "@/types/team-hours";

export const reportStatusSchema = z.enum([
  "approved",
  "submitted",
  "draft",
  "rejected",
  "all",
]);

export type ReportStatusFilter = z.infer<typeof reportStatusSchema>;

export const timeEntriesReportQuerySchema = z.object({
  userEmail: z
    .string()
    .min(1, "userEmail is required")
    .email("userEmail must be a valid email address"),
  from: z
    .string()
    .min(1, "from is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be in YYYY-MM-DD format"),
  to: z
    .string()
    .min(1, "to is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to must be in YYYY-MM-DD format"),
  status: reportStatusSchema.optional().default("approved"),
  format: z.enum(["json", "pdf"]).optional().default("json"),
});

export type TimeEntriesReportQuery = z.infer<
  typeof timeEntriesReportQuerySchema
>;

export type TimeEntryReportStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected";

export interface TimeEntryReportItemDTO {
  id: string;
  date: string;
  dateFormatted: string;
  durationMinutes: number;
  durationFormatted: string;
  billable: boolean;
  status: TimeEntryReportStatus;
  description: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  clientName: string | null;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  externalId: string | null;
  source: string;
  createdAt: string;
}

export interface ProjectReportSummaryDTO {
  projectId: string;
  projectName: string;
  projectCode: string;
  clientName: string | null;
  color: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalDecimalHours: number;
  billableMinutes: number;
  billablePercentage: number;
  entryCount: number;
  sharePercentage: number;
}

export interface DailyReportSummaryDTO {
  date: string;
  dateFormatted: string;
  dayOfWeek: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  billableMinutes: number;
  entryCount: number;
}

export interface TimeEntriesReportDTO {
  user: {
    id: string;
    name: string;
    email: string;
    jobTitle: string | null;
    department: string | null;
  };
  period: {
    from: string;
    to: string;
    label: string;
  };
  filter: {
    status: ReportStatusFilter;
    approvedOnly: boolean;
    statusLabel: string;
    description: string;
  };
  summary: {
    totalMinutes: number;
    totalHoursFormatted: string;
    totalDecimalHours: number;
    billableMinutes: number;
    billableHoursFormatted: string;
    nonBillableMinutes: number;
    nonBillableHoursFormatted: string;
    billablePercentage: number;
    entryCount: number;
    activeDaysCount: number;
    projectCount: number;
  };
  byProject: ProjectReportSummaryDTO[];
  byDate: DailyReportSummaryDTO[];
  entries: TimeEntryReportItemDTO[];
  meta: {
    generatedAt: string;
    pdfUrl: string;
  };
}

function deriveEntryStatus(
  timesheetStatus: string | null,
): TimeEntryReportStatus {
  if (!timesheetStatus || timesheetStatus === "open") return "draft";
  if (
    timesheetStatus === "submitted" ||
    timesheetStatus === "approved" ||
    timesheetStatus === "rejected"
  ) {
    return timesheetStatus;
  }
  return "draft";
}

function getStatusDescription(status: ReportStatusFilter): {
  statusLabel: string;
  description: string;
  approvedOnly: boolean;
} {
  switch (status) {
    case "approved":
      return {
        statusLabel: "Aprovados",
        description:
          "Considerando exclusivamente lançamentos em timesheets aprovadas.",
        approvedOnly: true,
      };
    case "submitted":
      return {
        statusLabel: "Submetidos",
        description:
          "Considerando lançamentos em timesheets submetidas aguardando aprovação.",
        approvedOnly: false,
      };
    case "draft":
      return {
        statusLabel: "Rascunho",
        description:
          "Considerando lançamentos abertos em rascunho ainda não submetidos.",
        approvedOnly: false,
      };
    case "rejected":
      return {
        statusLabel: "Rejeitados",
        description: "Considerando lançamentos em timesheets rejeitadas.",
        approvedOnly: false,
      };
    case "all":
      return {
        statusLabel: "Todos os status",
        description:
          "Considerando lançamentos em qualquer status (rascunho, submetido, aprovado e rejeitado).",
        approvedOnly: false,
      };
  }
}

function formatDayOfWeek(date: Date): string {
  const raw = format(date, "EEEE", { locale: ptBR });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export async function getTimeEntriesReportData(
  query: TimeEntriesReportQuery,
): Promise<{
  report: TimeEntriesReportDTO;
  rawEntries: TeamHourEntry[];
  pdfFilename: string;
}> {
  if (query.from > query.to) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `A data inicial (${query.from}) deve ser anterior ou igual à data final (${query.to}).`,
      400,
      { from: query.from, to: query.to },
    );
  }

  // 1. Find user by email (case-insensitive)
  const normalizedEmail = query.userEmail.trim().toLowerCase();
  const [foundUser] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      jobTitle: user.jobTitle,
      department: user.department,
    })
    .from(user)
    .where(eq(sql`lower(${user.email})`, normalizedEmail))
    .limit(1);

  if (!foundUser) {
    throw new ApiError(
      "NOT_FOUND",
      `Colaborador com o e-mail "${query.userEmail}" não foi encontrado.`,
      404,
      { userEmail: query.userEmail },
    );
  }

  // 2. Build time entries conditions
  const conditions = [
    eq(timeEntry.userId, foundUser.id),
    isNull(timeEntry.deletedAt),
    gte(timeEntry.date, query.from),
    lte(timeEntry.date, query.to),
  ];

  if (query.status === "draft") {
    const draftCond = or(
      isNull(timeEntry.timesheetId),
      eq(timesheet.status, "open"),
    );
    if (draftCond) conditions.push(draftCond);
  } else if (query.status === "all") {
    // No timesheet status filter
  } else {
    // "approved", "submitted", "rejected"
    conditions.push(eq(timesheet.status, query.status));
  }

  // 3. Query records with projects and timesheets
  const rows = await db
    .select({
      id: timeEntry.id,
      date: timeEntry.date,
      duration: timeEntry.duration,
      billable: timeEntry.billable,
      description: timeEntry.description,
      azureWorkItemId: timeEntry.azureWorkItemId,
      azureWorkItemTitle: timeEntry.azureWorkItemTitle,
      externalId: timeEntry.externalId,
      source: timeEntry.source,
      createdAt: timeEntry.createdAt,
      azdoSyncStatus: timeEntry.azdoSyncStatus,
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
      projectColor: project.color,
      clientName: project.clientName,
      timesheetStatus: timesheet.status,
    })
    .from(timeEntry)
    .innerJoin(project, eq(timeEntry.projectId, project.id))
    .leftJoin(timesheet, eq(timeEntry.timesheetId, timesheet.id))
    .where(and(...conditions))
    .orderBy(asc(timeEntry.date), asc(timeEntry.createdAt), asc(timeEntry.id));

  // 4. Return 404 if no entries found for the period
  if (rows.length === 0) {
    throw new ApiError(
      "NOT_FOUND",
      `Nenhum lançamento de horas encontrado para ${foundUser.name} (${foundUser.email}) no período informado.`,
      404,
      {
        userEmail: foundUser.email,
        from: query.from,
        to: query.to,
        status: query.status,
        approvedOnly: query.status === "approved",
      },
    );
  }

  // 5. Aggregate calculations
  const fromDate = parseLocalDate(query.from);
  const toDate = parseLocalDate(query.to);
  const periodLabel = `${format(fromDate, "dd/MM/yyyy")} a ${format(toDate, "dd/MM/yyyy")}`;
  const statusMeta = getStatusDescription(query.status);

  let totalMinutes = 0;
  let billableMinutes = 0;

  const projectMap = new Map<
    string,
    {
      projectId: string;
      projectName: string;
      projectCode: string;
      clientName: string | null;
      color: string;
      totalMinutes: number;
      billableMinutes: number;
      entryCount: number;
    }
  >();

  const dailyMap = new Map<
    string,
    {
      date: string;
      totalMinutes: number;
      billableMinutes: number;
      entryCount: number;
    }
  >();

  const entries: TimeEntryReportItemDTO[] = [];
  const rawEntries: TeamHourEntry[] = [];

  for (const row of rows) {
    totalMinutes += row.duration;
    if (row.billable) {
      billableMinutes += row.duration;
    }

    // By Project
    const pCurrent = projectMap.get(row.projectId) ?? {
      projectId: row.projectId,
      projectName: row.projectName,
      projectCode: row.projectCode,
      clientName: row.clientName,
      color: row.projectColor,
      totalMinutes: 0,
      billableMinutes: 0,
      entryCount: 0,
    };
    pCurrent.totalMinutes += row.duration;
    if (row.billable) {
      pCurrent.billableMinutes += row.duration;
    }
    pCurrent.entryCount += 1;
    projectMap.set(row.projectId, pCurrent);

    // By Day
    const dCurrent = dailyMap.get(row.date) ?? {
      date: row.date,
      totalMinutes: 0,
      billableMinutes: 0,
      entryCount: 0,
    };
    dCurrent.totalMinutes += row.duration;
    if (row.billable) {
      dCurrent.billableMinutes += row.duration;
    }
    dCurrent.entryCount += 1;
    dailyMap.set(row.date, dCurrent);

    const derivedStatus = deriveEntryStatus(row.timesheetStatus ?? null);
    const rowDateObj = parseLocalDate(row.date);

    entries.push({
      id: row.id,
      date: row.date,
      dateFormatted: format(rowDateObj, "dd/MM/yyyy"),
      durationMinutes: row.duration,
      durationFormatted: formatDuration(row.duration),
      billable: row.billable,
      status: derivedStatus,
      description: row.description,
      projectId: row.projectId,
      projectName: row.projectName,
      projectCode: row.projectCode,
      clientName: row.clientName,
      azureWorkItemId: row.azureWorkItemId,
      azureWorkItemTitle: row.azureWorkItemTitle,
      externalId: row.externalId,
      source: row.source,
      createdAt: new Date(row.createdAt).toISOString(),
    });

    rawEntries.push({
      id: row.id,
      description: row.description,
      date: row.date,
      duration: row.duration,
      billable: row.billable,
      azdoSyncStatus: row.azdoSyncStatus,
      createdAt: new Date(row.createdAt).toISOString(),
      user: {
        id: foundUser.id,
        name: foundUser.name,
        email: foundUser.email,
        image: foundUser.image,
      },
      project: {
        id: row.projectId,
        name: row.projectName,
        color: row.projectColor,
        clientName: row.clientName,
      },
    });
  }

  const nonBillableMinutes = Math.max(totalMinutes - billableMinutes, 0);
  const billablePercentage =
    totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;

  const byProject: ProjectReportSummaryDTO[] = Array.from(projectMap.values())
    .map((p) => ({
      ...p,
      totalHoursFormatted: formatDuration(p.totalMinutes),
      totalDecimalHours: Number((p.totalMinutes / 60).toFixed(2)),
      billablePercentage:
        p.totalMinutes > 0
          ? Math.round((p.billableMinutes / p.totalMinutes) * 100)
          : 0,
      sharePercentage:
        totalMinutes > 0
          ? Number(((p.totalMinutes / totalMinutes) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const byDate: DailyReportSummaryDTO[] = Array.from(dailyMap.values())
    .map((d) => {
      const dObj = parseLocalDate(d.date);
      return {
        date: d.date,
        dateFormatted: format(dObj, "dd/MM/yyyy"),
        dayOfWeek: formatDayOfWeek(dObj),
        totalMinutes: d.totalMinutes,
        totalHoursFormatted: formatDuration(d.totalMinutes),
        billableMinutes: d.billableMinutes,
        entryCount: d.entryCount,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const userSlug = foundUser.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const pdfFilename = `relatorio-horas-${userSlug}-${query.from}-${query.to}.pdf`;

  const pdfUrl = `/api/v1/reports/time-entries/pdf?userEmail=${encodeURIComponent(
    foundUser.email,
  )}&from=${encodeURIComponent(query.from)}&to=${encodeURIComponent(
    query.to,
  )}&status=${encodeURIComponent(query.status)}`;

  const report: TimeEntriesReportDTO = {
    user: {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      jobTitle: foundUser.jobTitle,
      department: foundUser.department,
    },
    period: {
      from: query.from,
      to: query.to,
      label: periodLabel,
    },
    filter: {
      status: query.status,
      approvedOnly: statusMeta.approvedOnly,
      statusLabel: statusMeta.statusLabel,
      description: statusMeta.description,
    },
    summary: {
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
      totalDecimalHours: Number((totalMinutes / 60).toFixed(2)),
      billableMinutes,
      billableHoursFormatted: formatDuration(billableMinutes),
      nonBillableMinutes,
      nonBillableHoursFormatted: formatDuration(nonBillableMinutes),
      billablePercentage,
      entryCount: rows.length,
      activeDaysCount: dailyMap.size,
      projectCount: projectMap.size,
    },
    byProject,
    byDate,
    entries,
    meta: {
      generatedAt: new Date().toISOString(),
      pdfUrl,
    },
  };

  return {
    report,
    rawEntries,
    pdfFilename,
  };
}

export async function generateTimeEntriesReportPDF(
  reportData: Awaited<ReturnType<typeof getTimeEntriesReportData>>,
): Promise<Uint8Array> {
  const { report, rawEntries, pdfFilename } = reportData;

  return generateCollaboratorHoursPDFBuffer({
    userName: report.user.name,
    userEmail: report.user.email,
    entries: rawEntries,
    period: report.period.label,
    statusLabel: report.filter.statusLabel,
    filename: pdfFilename.replace(/\.pdf$/i, ""),
  });
}
