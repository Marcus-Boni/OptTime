import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import {
  AzureDevOpsError,
  type AzureDevOpsMyWorkItem,
  createAzureDevOpsClient,
} from "@/lib/azure-devops/client";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { timeEntry } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import type { AutofillProject } from "@/lib/time-assistant/autofill";
import { getAppTimeZone } from "@/lib/timezone";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";
import { getVisibleProjects } from "./projects";
import {
  type LoggedAgainstWorkItem,
  type MyWorkItem,
  mapMyWorkItems,
} from "./work-items-mapping";

/**
 * The work items assigned to the user in Azure DevOps — the list an assistant
 * needs to answer "what should I be working on?" without searching blind.
 */

const AZURE_SETTINGS_HINT =
  "Configure em Configurações → Integrações → Azure DevOps e tente de novo.";

export interface ListMyWorkItemsInput {
  /** Also return items closed or completed in the last 14 days. */
  includeClosed: boolean;
  /** Maximum items, 1–100. */
  top: number;
}

export interface ListMyWorkItemsResult {
  sources: { azureDevOps: boolean };
  warnings: string[];
  items: MyWorkItem[];
}

/** Collaborators the listing needs, injectable so the logic runs offline. */
export interface WorkItemsDeps {
  /** The user's Azure DevOps connection, or null when none is configured. */
  loadConnection: (
    userId: string,
  ) => Promise<{ organizationUrl: string; pat: string | null } | null>;
  fetchAssigned: (
    connection: { organizationUrl: string; pat: string },
    options: { top: number; includeClosed: boolean },
  ) => Promise<AzureDevOpsMyWorkItem[]>;
  loadProjects: (principal: AgentPrincipal) => Promise<AutofillProject[]>;
  loadLogged: (
    userId: string,
    workItemIds: number[],
  ) => Promise<Map<number, LoggedAgainstWorkItem>>;
}

const defaultDeps: WorkItemsDeps = {
  loadConnection: async (userId) => {
    const config = await findAzureDevopsConfigByUserId(userId);
    if (!config) return null;
    return {
      organizationUrl: config.organizationUrl,
      pat: decrypt(config.pat),
    };
  },
  fetchAssigned: (connection, options) =>
    createAzureDevOpsClient(
      connection.organizationUrl,
      connection.pat,
    ).getMyWorkItems(options),
  loadProjects: (principal) => getVisibleProjects(principal),
  loadLogged: async (userId, workItemIds) => {
    const logged = new Map<number, LoggedAgainstWorkItem>();
    if (workItemIds.length === 0) return logged;

    const rows = await db
      .select({
        workItemId: timeEntry.azureWorkItemId,
        minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
        lastLoggedAt: max(timeEntry.createdAt),
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, userId),
          isNull(timeEntry.deletedAt),
          inArray(timeEntry.azureWorkItemId, workItemIds),
        ),
      )
      .groupBy(timeEntry.azureWorkItemId);

    for (const row of rows) {
      if (row.workItemId === null) continue;
      logged.set(row.workItemId, {
        minutes: Number(row.minutes),
        lastLoggedAt: row.lastLoggedAt,
      });
    }

    return logged;
  },
};

/**
 * Lists the work items assigned to the user, newest change first.
 *
 * @throws {AgentError} `AZURE_DEVOPS_NOT_CONFIGURED` without a usable PAT,
 * `UPSTREAM_ERROR` when Azure DevOps rejects or does not answer the query.
 */
export async function listMyWorkItems(
  principal: AgentPrincipal,
  input: ListMyWorkItemsInput,
  deps: WorkItemsDeps = defaultDeps,
): Promise<ListMyWorkItemsResult> {
  const connection = await deps.loadConnection(principal.userId);

  if (!connection) {
    throw new AgentError(
      "AZURE_DEVOPS_NOT_CONFIGURED",
      "Integração com Azure DevOps não configurada para a sua conta.",
      { hint: AZURE_SETTINGS_HINT },
    );
  }

  if (!connection.pat) {
    throw new AgentError(
      "AZURE_DEVOPS_NOT_CONFIGURED",
      "O token do Azure DevOps está inválido. Atualize a integração.",
      { hint: AZURE_SETTINGS_HINT },
    );
  }

  let assigned: AzureDevOpsMyWorkItem[];
  try {
    assigned = await deps.fetchAssigned(
      { organizationUrl: connection.organizationUrl, pat: connection.pat },
      { top: input.top, includeClosed: input.includeClosed },
    );
  } catch (error: unknown) {
    const rejected =
      error instanceof AzureDevOpsError &&
      (error.statusCode === 401 || error.statusCode === 403);

    console.error("[mcp][work_items] assigned query failed", {
      userId: principal.userId,
      status: error instanceof AzureDevOpsError ? error.statusCode : null,
    });

    throw new AgentError(
      "UPSTREAM_ERROR",
      rejected
        ? "O Azure DevOps recusou o token da integração. Atualize o PAT."
        : "Não foi possível consultar o Azure DevOps agora. Tente de novo em instantes.",
      rejected ? { hint: AZURE_SETTINGS_HINT } : undefined,
    );
  }

  const [projects, logged] = await Promise.all([
    deps.loadProjects(principal),
    deps.loadLogged(
      principal.userId,
      assigned.map((item) => item.id),
    ),
  ]);

  const items = mapMyWorkItems({
    items: assigned,
    projects,
    logged,
    timeZone: getAppTimeZone(),
  }).slice(0, input.top);

  console.info("[mcp][work_items]", {
    userId: principal.userId,
    includeClosed: input.includeClosed,
    returned: items.length,
  });

  return { sources: { azureDevOps: true }, warnings: [], items };
}
