import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getManagedProjectIds,
  getScopedUserIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { allocation, project, timeEntry, user } from "@/lib/db/schema";
import { buildWeekWindow, classifyUtilization } from "@/lib/hq/workload";
import { todayInAppTimeZone } from "@/lib/timezone";
import { getWeekPeriod } from "@/lib/utils";
import { getWorkloadSchema } from "@/lib/validations/hq.schema";
import type {
  WorkloadCell,
  WorkloadMatrixResponse,
  WorkloadRow,
} from "@/types/hq";

/**
 * GET - Workload Matrix & FTE forecasting.
 *
 * Past weeks aggregate logged minutes; future weeks read planned allocations.
 * Managers see themselves plus their direct reports; admins see everyone.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = getWorkloadSchema.safeParse({
    past: searchParams.get("past") ?? undefined,
    future: searchParams.get("future") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Parâmetros inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { past, future } = parsed.data;
    const today = todayInAppTimeZone();
    const weeks = buildWeekWindow(today, past, future);
    const windowStart = weeks[0]?.start ?? today;
    const weekIds = weeks.map((week) => week.week);
    const futureWeekIds = new Set(
      weeks.filter((week) => week.isFuture).map((week) => week.week),
    );
    const currentWeekId = weeks.find((week) => week.isCurrent)?.week ?? null;

    // Managers plan for themselves too, so the scope always includes the actor.
    const scopedUserIds = await getScopedUserIds(actor);
    const userWhere =
      scopedUserIds === null
        ? eq(user.isActive, true)
        : and(
            inArray(user.id, [...new Set([...scopedUserIds, actor.userId])]),
            eq(user.isActive, true),
          );

    const people = await db.query.user.findMany({
      where: userWhere,
      columns: {
        id: true,
        name: true,
        image: true,
        role: true,
        weeklyCapacity: true,
      },
      orderBy: (fields, { asc }) => [asc(fields.name)],
    });

    if (people.length === 0) {
      const empty: WorkloadMatrixResponse = {
        generatedAt: new Date().toISOString(),
        weeks,
        rows: [],
        projects: [],
        totals: { people: 0, overloadedThisWeek: 0, idleThisWeek: 0 },
      };
      return Response.json(empty);
    }

    const userIds = people.map((person) => person.id);
    const managedProjectIds = await getManagedProjectIds(actor);

    const [dailyRows, allocationRows, plannerProjects] = await Promise.all([
      db
        .select({
          userId: timeEntry.userId,
          date: timeEntry.date,
          minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
        })
        .from(timeEntry)
        .where(
          and(
            inArray(timeEntry.userId, userIds),
            gte(timeEntry.date, windowStart),
            isNull(timeEntry.deletedAt),
          ),
        )
        .groupBy(timeEntry.userId, timeEntry.date),
      db
        .select({
          id: allocation.id,
          userId: allocation.userId,
          projectId: allocation.projectId,
          week: allocation.week,
          plannedMinutes: allocation.plannedMinutes,
          note: allocation.note,
          projectName: project.name,
          projectColor: project.color,
        })
        .from(allocation)
        .innerJoin(project, eq(allocation.projectId, project.id))
        .where(
          and(
            inArray(allocation.userId, userIds),
            inArray(allocation.week, weekIds),
          ),
        ),
      db.query.project.findMany({
        where:
          managedProjectIds === null
            ? inArray(project.status, ["open", "active"])
            : managedProjectIds.length > 0
              ? and(
                  inArray(project.id, managedProjectIds),
                  inArray(project.status, ["open", "active"]),
                )
              : eq(project.id, "__none__"),
        columns: { id: true, name: true, code: true, color: true },
        orderBy: (fields, { asc }) => [asc(fields.name)],
      }),
    ]);

    // (userId, week) → logged minutes
    const actualByUserWeek = new Map<string, number>();
    for (const row of dailyRows) {
      const key = `${row.userId}:${getWeekPeriod(row.date)}`;
      actualByUserWeek.set(
        key,
        (actualByUserWeek.get(key) ?? 0) + Number(row.minutes),
      );
    }

    // (userId, week) → allocation slices
    const allocationsByUserWeek = new Map<string, typeof allocationRows>();
    for (const row of allocationRows) {
      const key = `${row.userId}:${row.week}`;
      const bucket = allocationsByUserWeek.get(key) ?? [];
      bucket.push(row);
      allocationsByUserWeek.set(key, bucket);
    }

    let overloadedThisWeek = 0;
    let idleThisWeek = 0;

    const rows: WorkloadRow[] = people.map((person) => {
      const capacityMinutes = (person.weeklyCapacity ?? 40) * 60;
      let pastUtilizationSum = 0;
      let pastWeekCount = 0;

      const cells: WorkloadCell[] = weeks.map((week) => {
        const key = `${person.id}:${week.week}`;
        const isFuture = futureWeekIds.has(week.week);
        const actualMinutes = isFuture ? 0 : (actualByUserWeek.get(key) ?? 0);
        const slices = allocationsByUserWeek.get(key) ?? [];
        const plannedMinutes = slices.reduce(
          (sum, slice) => sum + slice.plannedMinutes,
          0,
        );

        const relevantMinutes = isFuture ? plannedMinutes : actualMinutes;
        const level = classifyUtilization(relevantMinutes, capacityMinutes);

        if (!isFuture && !week.isCurrent) {
          pastUtilizationSum +=
            capacityMinutes > 0 ? actualMinutes / capacityMinutes : 0;
          pastWeekCount += 1;
        }

        if (week.isCurrent && currentWeekId) {
          if (level === "over") overloadedThisWeek += 1;
          if (level === "low" || level === "empty") idleThisWeek += 1;
        }

        return {
          week: week.week,
          actualMinutes,
          plannedMinutes,
          level,
          allocations: slices.map((slice) => ({
            allocationId: slice.id,
            projectId: slice.projectId,
            projectName: slice.projectName,
            projectColor: slice.projectColor,
            plannedMinutes: slice.plannedMinutes,
            note: slice.note,
          })),
        };
      });

      return {
        userId: person.id,
        name: person.name,
        image: person.image,
        role: person.role,
        capacityMinutes,
        cells,
        avgUtilization:
          pastWeekCount > 0
            ? Math.round((pastUtilizationSum / pastWeekCount) * 100) / 100
            : 0,
      };
    });

    const payload: WorkloadMatrixResponse = {
      generatedAt: new Date().toISOString(),
      weeks,
      rows,
      projects: plannerProjects,
      totals: {
        people: rows.length,
        overloadedThisWeek,
        idleThisWeek,
      },
    };

    return Response.json(payload);
  } catch (error) {
    console.error("[GET /api/hq/workload]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
