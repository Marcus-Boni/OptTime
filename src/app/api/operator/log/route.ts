import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveSession } from "@/lib/access-control";
import { OPERATOR_ACTIONS } from "@/lib/ai/operator/policy";
import type { OperatorLogEntry } from "@/lib/ai/operator/types";
import type { OperatorActionKind } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { operatorActionLog } from "@/lib/db/schema";
import { createOperatorLogSchema } from "@/lib/validations/operator.schema";

const MAX_PAGE_SIZE = 50;

type LogRow = typeof operatorActionLog.$inferSelect;

function serialize(row: LogRow): OperatorLogEntry & { reversible: boolean } {
  const meta = OPERATOR_ACTIONS[row.kind as OperatorActionKind];

  return {
    id: row.id,
    planId: row.planId,
    stepIndex: row.stepIndex,
    kind: row.kind,
    summary: row.summary,
    status: row.status as OperatorLogEntry["status"],
    authorization: row.authorization as OperatorLogEntry["authorization"],
    inputMode: row.inputMode as OperatorLogEntry["inputMode"],
    resultId: row.resultId,
    errorMessage: row.errorMessage,
    undoneAt: row.undoneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    /** Undo only makes sense while we still hold the row it created. */
    reversible:
      Boolean(meta?.reversible) &&
      row.status === "executed" &&
      Boolean(row.resultId) &&
      !row.undoneAt,
  };
}

/** GET - The current user's own operator history, newest first. */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const requested = Number(searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGE_SIZE)
      : 20;

    const rows = await db.query.operatorActionLog.findMany({
      where: eq(operatorActionLog.userId, session.user.id),
      orderBy: [desc(operatorActionLog.createdAt)],
      limit,
    });

    return Response.json({ entries: rows.map(serialize) });
  } catch (error) {
    console.error("[GET /api/operator/log]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST - Records one settled action. Written by the client right after a step
 * finishes, so the history reflects what actually happened rather than what was
 * merely proposed.
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

  const parsed = createOperatorLogSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  try {
    const data = parsed.data;

    const [row] = await db
      .insert(operatorActionLog)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        planId: data.planId ?? null,
        stepIndex: data.stepIndex ?? 0,
        kind: data.kind,
        summary: data.summary,
        status: data.status,
        authorization: data.authorization,
        inputMode: data.inputMode ?? "text",
        params: data.params === undefined ? null : JSON.stringify(data.params),
        resultId: data.resultId ?? null,
        errorMessage: data.errorMessage ?? null,
      })
      .returning();

    if (!row) {
      return Response.json({ error: "Falha ao registrar" }, { status: 500 });
    }

    return Response.json({ entry: serialize(row) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/operator/log]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
