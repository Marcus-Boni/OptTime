import { and, eq, isNull } from "drizzle-orm";
import {
  extensionJson,
  extensionOptions,
  resolveExtensionUser,
} from "@/lib/extension-auth";
export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { timeEntry } from "@/lib/db/schema";

export function OPTIONS() {
  return extensionOptions();
}

/**
 * GET /api/extension/work-items/[id]/time-entries
 * Returns all time entries linked to the given Azure DevOps work item.
 * Includes both the user's own entries and the team totals.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const extUser = await resolveExtensionUser(req);
  if (!extUser) {
    return extensionJson({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const workItemId = Number(id);
  if (!Number.isFinite(workItemId) || workItemId <= 0) {
    return extensionJson({ error: "Invalid work item ID" }, { status: 400 });
  }

  try {
    // All non-deleted entries for this work item (all users)
    const entries = await db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.azureWorkItemId, workItemId),
        isNull(timeEntry.deletedAt),
      ),
      with: {
        user: { columns: { id: true, name: true, image: true } },
        project: { columns: { id: true, name: true, code: true, color: true } },
      },
      orderBy: (e, { desc }) => [desc(e.date), desc(e.createdAt)],
    });

    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
    const myMinutes = entries
      .filter((e) => e.user.id === extUser.id)
      .reduce((sum, e) => sum + e.duration, 0);

    return extensionJson({
      workItemId,
      totalMinutes,
      myMinutes,
      entries: entries.map((e) => ({
        id: e.id,
        date: e.date,
        duration: e.duration,
        description: e.description,
        billable: e.billable,
        project: e.project,
        user: e.user,
        isOwn: e.user.id === extUser.id,
      })),
    });
  } catch (error) {
    console.error("[GET /api/extension/work-items/[id]/time-entries]:", error);
    return extensionJson({ error: "Internal Server Error" }, { status: 500 });
  }
}
