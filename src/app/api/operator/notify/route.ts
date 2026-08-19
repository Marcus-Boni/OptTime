import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  getActiveSession,
  getActorContext,
  getDirectReportIds,
  getManagedProjectIds,
} from "@/lib/access-control";
import { getServerAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { projectMember, user } from "@/lib/db/schema";
import { sendOperatorNotificationBatch } from "@/lib/email";
import { operatorNotifySchema } from "@/lib/validations/operator.schema";

/**
 * Everyone the actor may legitimately e-mail: their direct reports plus the
 * members of the projects they manage. Admins may reach any active user.
 */
async function resolveAllowedRecipientIds(
  actor: ReturnType<typeof getActorContext>,
): Promise<string[] | null> {
  if (actor.role === "admin") return null;

  const [directReports, managedProjectIds] = await Promise.all([
    getDirectReportIds(actor.userId),
    getManagedProjectIds(actor),
  ]);

  const ids = new Set(directReports);

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
 * POST - Sends an operator-triggered notification.
 *
 * This is the only operator endpoint that reaches people outside the app, so it
 * is deliberately strict: manager/admin only, and every recipient is re-checked
 * against the actor's scope server-side rather than trusted from the payload.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = operatorNotifySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  try {
    const { subject, message, contextLines, recipientIds, projectId } =
      parsed.data;

    const allowedIds = await resolveAllowedRecipientIds(actor);
    const requested = [...new Set(recipientIds)];

    const permitted =
      allowedIds === null
        ? requested
        : requested.filter((id) => allowedIds.includes(id));

    if (permitted.length === 0) {
      return Response.json(
        { error: "Nenhum destinatário permitido no seu escopo." },
        { status: 403 },
      );
    }

    const recipients = await db.query.user.findMany({
      where: and(inArray(user.id, permitted), eq(user.isActive, true)),
      columns: { id: true, name: true, email: true },
    });

    if (recipients.length === 0) {
      return Response.json(
        { error: "Destinatários não encontrados ou inativos." },
        { status: 404 },
      );
    }

    let projectName: string | null = null;
    if (projectId) {
      const row = await db.query.project.findFirst({
        where: (table, { eq: eqOp }) => eqOp(table.id, projectId),
        columns: { name: true },
      });
      projectName = row?.name ?? null;
    }

    const { sent, failed } = await sendOperatorNotificationBatch(recipients, {
      subject,
      message,
      contextLines: contextLines ?? [],
      senderName: session.user.name,
      projectName,
      appUrl: `${getServerAppUrl()}/dashboard`,
    });

    if (sent === 0) {
      return Response.json(
        { error: "Falha ao enviar os e-mails." },
        { status: 502 },
      );
    }

    return Response.json({
      sent,
      failed,
      skipped: requested.length - permitted.length,
      recipients: recipients.map((item) => item.name),
    });
  } catch (error) {
    console.error("[POST /api/operator/notify]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
