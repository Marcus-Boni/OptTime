import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeEntry, timesheet, user } from "@/lib/db/schema";
import {
  getBaseWeekPeriod,
  getTimesheetPeriodForDate,
  isCanonicalTimesheetPeriod,
} from "@/lib/timesheet-periods";
import { todayInAppTimeZone } from "@/lib/timezone";
import { getPeriodRange, getWeekPeriod } from "@/lib/utils";

const createTimesheetSchema = z.object({
  period: z.string().trim().min(1).max(32),
  periodType: z.enum(["weekly", "monthly"]).default("weekly"),
});

/**
 * GET - List timesheets for the current user.
 * Query params: status (open|submitted|approved|rejected)
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Buscar capacidade semanal do usuário
  const userRecord = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { weeklyCapacity: true, createdAt: true },
  });
  const weeklyCapacity = userRecord?.weeklyCapacity ?? 40;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  try {
    // Ensure the timesheet that owns today exists (a week, or its month
    // segment when the week crosses a month boundary).
    const currentPeriod = getTimesheetPeriodForDate(todayInAppTimeZone());

    const currentTimesheet = await db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.userId, session.user.id),
        eq(timesheet.period, currentPeriod),
      ),
    });

    if (!currentTimesheet) {
      await db.insert(timesheet).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        period: currentPeriod,
        periodType: "weekly",
      });
    }

    const conditions = [eq(timesheet.userId, session.user.id)];
    if (status) conditions.push(eq(timesheet.status, status));

    const timesheets = await db.query.timesheet.findMany({
      where: and(...conditions),
      with: {
        approver: { columns: { id: true, name: true } },
      },
      orderBy: [desc(timesheet.period)],
    });

    // Enriquecer timesheets abertos/rejeitados com os totais atuais baseados nas entradas
    const enrichedTimesheets = await Promise.all(
      timesheets.map(async (ts) => {
        const { start, end } = getPeriodRange(ts.period, ts.periodType);

        if (ts.status === "open" || ts.status === "rejected") {
          const result = await db
            .select({
              totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
              billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)`,
            })
            .from(timeEntry)
            .where(
              and(
                eq(timeEntry.userId, session.user.id),
                gte(timeEntry.date, start),
                lte(timeEntry.date, end),
                isNull(timeEntry.deletedAt),
                or(
                  isNull(timeEntry.timesheetId),
                  eq(timeEntry.timesheetId, ts.id),
                ),
              ),
            );

          return {
            ...ts,
            totalMinutes: Number(result[0]?.totalMinutes || 0),
            billableMinutes: Number(result[0]?.billableMinutes || 0),
            weeklyCapacity,
            periodStart: start,
            periodEnd: end,
          };
        }

        return {
          ...ts,
          weeklyCapacity,
          periodStart: start,
          periodEnd: end,
        };
      }),
    );

    return Response.json({ timesheets: enrichedTimesheets });
  } catch (error) {
    console.error("[GET /api/timesheets]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST - Create or get a timesheet for the given period.
 * Body: { period: "2026-W10", periodType: "weekly" | "monthly" }
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = createTimesheetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: "Período é obrigatório.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { period, periodType } = parsed.data;

    // A week that crosses a month boundary only exists as its two month
    // segments; a bare week key would span two competences again.
    if (!isCanonicalTimesheetPeriod(period, periodType)) {
      return Response.json(
        {
          error:
            "Período inválido. Semanas que cruzam a virada do mês são registradas por mês.",
        },
        { status: 400 },
      );
    }

    // Validar que o período solicitado não é anterior ao ingresso do usuário
    const userForValidation = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: { createdAt: true },
    });

    if (userForValidation && periodType === "weekly") {
      const joinWeek = getWeekPeriod(new Date(userForValidation.createdAt));

      // Comparação lexicográfica funciona para formato "YYYY-WNN"
      // NOTA: o zero à esquerda é essencial — sem ele "2026-W9" > "2026-W10" na comparação de string
      if (getBaseWeekPeriod(period) < joinWeek) {
        return Response.json(
          { error: "Período anterior ao ingresso no sistema" },
          { status: 403 },
        );
      }
    }

    // Check if already exists
    const existing = await db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.userId, session.user.id),
        eq(timesheet.period, period),
      ),
    });

    if (existing) {
      return Response.json({ timesheet: existing });
    }

    const id = crypto.randomUUID();
    const [ts] = await db
      .insert(timesheet)
      .values({
        id,
        userId: session.user.id,
        period,
        periodType,
      })
      .returning();

    return Response.json({ timesheet: ts }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/timesheets]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
