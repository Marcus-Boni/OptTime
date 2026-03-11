import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { azureDevopsConfig, timeEntry } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { createAzureDevOpsClient } from "./client";

/**
 * Trigger asynchronous Completed Work sync for one or more Azure DevOps work items.
 * @param deltaMinutes - minutes of the new entry being added (used to subtract from RemainingWork)
 */
export function triggerCompletedWorkSync(
  userId: string,
  workItemIds: Array<number | null | undefined>,
  deltaMinutes?: number,
): void {
  const uniqueWorkItemIds = [
    ...new Set(
      workItemIds.filter(
        (workItemId): workItemId is number => typeof workItemId === "number",
      ),
    ),
  ];

  for (const workItemId of uniqueWorkItemIds) {
    void syncCompletedWorkToAzDO(userId, workItemId, deltaMinutes);
  }
}

/**
 * Sync Completed Work hours to Azure DevOps for a given Work Item.
 *
 * Sums all non-deleted time entries for that work item across all users
 * and updates the CompletedWork field in AzDO.
 * Optionally subtracts deltaHours from RemainingWork.
 *
 * Fire-and-forget — logs errors but never throws.
 */
export async function syncCompletedWorkToAzDO(
  userId: string,
  workItemId: number,
  deltaMinutes?: number,
): Promise<void> {
  try {
    const config = await db.query.azureDevopsConfig.findFirst({
      where: eq(azureDevopsConfig.userId, userId),
    });

    if (!config) return;

    const pat = decrypt(config.pat);
    if (!pat) return;

    // Sum all non-deleted entries for this work item (in minutes)
    const [result] = await db
      .select({
        totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.azureWorkItemId, workItemId),
          sql`${timeEntry.deletedAt} IS NULL`,
        ),
      );

    const rawTotalHours = (result?.totalMinutes ?? 0) / 60;
    const totalHours = Math.round(rawTotalHours * 100) / 100;
    const deltaHours =
      deltaMinutes !== undefined ? deltaMinutes / 60 : undefined;

    const client = createAzureDevOpsClient(config.organizationUrl, pat);
    const success = await client.updateCompletedWork(
      workItemId,
      totalHours,
      deltaHours,
    );

    if (success) {
      // Mark all linked entries for this WI as synced.
      await db
        .update(timeEntry)
        .set({ azdoSyncStatus: "synced" })
        .where(
          and(
            eq(timeEntry.azureWorkItemId, workItemId),
            sql`${timeEntry.deletedAt} IS NULL`,
          ),
        );
    } else {
      // Mark all linked entries as failed so the UI can surface the retry state.
      await db
        .update(timeEntry)
        .set({ azdoSyncStatus: "failed" })
        .where(
          and(
            eq(timeEntry.azureWorkItemId, workItemId),
            sql`${timeEntry.deletedAt} IS NULL`,
          ),
        );
    }
  } catch (error) {
    console.error(`[syncCompletedWork] Failed for WI#${workItemId}:`, error);
  }
}

