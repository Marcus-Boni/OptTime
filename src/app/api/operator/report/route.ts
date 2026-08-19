import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import {
  canManageProject,
  getActiveSession,
  getActorContext,
  getDirectReportIds,
  getManagedProjectIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { projectMember, timeEntry } from "@/lib/db/schema";
import { operatorReportSchema } from "@/lib/validations/operator.schema";

const MAX_ROWS = 3000;

async function resolveScopedUserIds(
  actor: ReturnType<typeof getActorContext>,
): Promise<string[] | null> {
  if (actor.role === "admin") return null;

  const [directReports, managedProjectIds] = await Promise.all([
    getDirectReportIds(actor.userId),
    getManagedProjectIds(actor),
  ]);

  const ids = new Set([actor.userId, ...directReports]);

  if (managedProjectIds && managedProjectIds.length > 0) {
    const members = await db.query.projectMember.findMany({
      where: inArray(projectMember.projectId, managedProjectIds),
      columns: { userId: true },
    });
    for (const member of members) ids.add(member.userId);
  }

  return [...ids];
}

/**
 * POST - Report rows for the assistant's export card.
 *
 * The file itself is produced in the browser with the existing export helpers;
 * this route only supplies the rows the caller is allowed to see.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = operatorReportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  try {
    const actor = getActorContext(session.user);
    const { scope, projectId, from, to } = parsed.data;

    if (from > to) {
      return Response.json(
        { error: "O início do período é posterior ao fim." },
        { status: 400 },
      );
    }

    const conditions = [
      gte(timeEntry.date, from),
      lte(timeEntry.date, to),
      isNull(timeEntry.deletedAt),
    ];

    if (projectId) {
      const allowed =
        actor.role === "admin" || (await canManageProject(actor, projectId));

      // Without project management rights the report narrows to own hours,
      // matching what the assistant already warned about in the card.
      if (!allowed && scope !== "me") {
        conditions.push(eq(timeEntry.userId, actor.userId));
      }

      conditions.push(eq(timeEntry.projectId, projectId));
    }

    if (scope === "me") {
      conditions.push(eq(timeEntry.userId, actor.userId));
    } else if (scope === "team") {
      if (actor.role === "member") {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const scopedIds = await resolveScopedUserIds(actor);
      if (scopedIds !== null) {
        if (scopedIds.length === 0) {
          return Response.json({
            entries: [],
            summary: [],
            totalMinutes: 0,
            billableMinutes: 0,
          });
        }
        conditions.push(inArray(timeEntry.userId, scopedIds));
      }
    } else if (scope === "project" && !projectId) {
      return Response.json(
        { error: "Informe o projeto para um relatório de projeto." },
        { status: 400 },
      );
    }

    const rows = await db.query.timeEntry.findMany({
      where: and(...conditions),
      columns: {
        date: true,
        description: true,
        duration: true,
        billable: true,
        azureWorkItemId: true,
        azureWorkItemTitle: true,
      },
      with: {
        project: { columns: { name: true } },
        user: { columns: { name: true } },
        timesheet: { columns: { status: true } },
      },
      orderBy: [asc(timeEntry.date)],
      limit: MAX_ROWS,
    });

    const entries = rows.map((row) => ({
      date: row.date,
      project: row.project?.name ?? "Projeto removido",
      description: row.description,
      duration: row.duration,
      billable: row.billable,
      status: row.timesheet?.status ?? "draft",
      azureWorkItemId: row.azureWorkItemId,
      azureWorkItemTitle: row.azureWorkItemTitle,
      userName: row.user?.name ?? null,
    }));

    const byProject = new Map<
      string,
      { totalMinutes: number; billableMinutes: number; entryCount: number }
    >();

    for (const entry of entries) {
      const current = byProject.get(entry.project) ?? {
        totalMinutes: 0,
        billableMinutes: 0,
        entryCount: 0,
      };

      byProject.set(entry.project, {
        totalMinutes: current.totalMinutes + entry.duration,
        billableMinutes:
          current.billableMinutes + (entry.billable ? entry.duration : 0),
        entryCount: current.entryCount + 1,
      });
    }

    const summary = [...byProject.entries()]
      .map(([projectName, totals]) => ({ projectName, ...totals }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    return Response.json({
      entries,
      summary,
      totalMinutes: entries.reduce((sum, entry) => sum + entry.duration, 0),
      billableMinutes: entries.reduce(
        (sum, entry) => sum + (entry.billable ? entry.duration : 0),
        0,
      ),
      truncated: rows.length === MAX_ROWS,
    });
  } catch (error) {
    console.error("[POST /api/operator/report]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
