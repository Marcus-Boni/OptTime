import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  canAccessProject,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { project, timeEntry } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import {
  getCachedSuggestions,
  setCachedSuggestions,
} from "@/lib/time-assistant/cache";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import { scopeCreepQuerySchema } from "@/lib/validations/hq.schema";
import type { ScopeCreepItem, ScopeCreepResponse } from "@/types/hq";

/** Azure fan-out is slow; a short cache keeps the radar snappy. */
const CACHE_TTL_MS = 10 * 60_000;
/** Work items inspected per project, ranked by logged minutes. */
const MAX_WORK_ITEMS = 20;
const AZURE_CONCURRENCY = 4;
/** logged/estimate above this ratio is flagged as scope creep. */
const FLAG_RATIO = 1.2;

function unavailable(projectId: string, reason: string): ScopeCreepResponse {
  return { available: false, reason, projectId, items: [], flaggedCount: 0 };
}

/**
 * GET - Scope-creep detector for one project.
 *
 * Compares minutes logged per Azure DevOps work item against the original
 * estimate on the work item itself. Uses the viewer's own PAT — the analysis
 * is only offered when their integration is configured.
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
  const parsed = scopeCreepQuerySchema.safeParse({
    projectId: searchParams.get("projectId") ?? "",
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Parâmetros inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { projectId } = parsed.data;

  try {
    if (!(await canAccessProject(actor, projectId))) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    const cacheKey = `scope-creep:${session.user.id}:${projectId}`;
    const cached = getCachedSuggestions<ScopeCreepResponse>(cacheKey);
    if (cached) {
      return Response.json(cached);
    }

    const projectRow = await db.query.project.findFirst({
      where: eq(project.id, projectId),
      columns: { id: true, azureProjectId: true, name: true },
    });

    if (!projectRow) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    if (!projectRow.azureProjectId) {
      return Response.json(
        unavailable(projectId, "Projeto sem vínculo com o Azure DevOps."),
      );
    }

    const config = await findAzureDevopsConfigByUserId(session.user.id);
    if (!config) {
      return Response.json(
        unavailable(
          projectId,
          "Configure sua integração Azure DevOps para habilitar a análise de desvios.",
        ),
      );
    }

    const pat = decrypt(config.pat);
    if (!pat) {
      return Response.json(
        unavailable(
          projectId,
          "Não foi possível ler o token do Azure DevOps. Reconfigure a integração.",
        ),
      );
    }

    // Minutes logged per work item across the whole team.
    const loggedRows = await db
      .select({
        workItemId: timeEntry.azureWorkItemId,
        minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.projectId, projectId),
          isNotNull(timeEntry.azureWorkItemId),
          isNull(timeEntry.deletedAt),
        ),
      )
      .groupBy(timeEntry.azureWorkItemId);

    const ranked = loggedRows
      .filter(
        (row): row is { workItemId: number; minutes: number } =>
          row.workItemId !== null,
      )
      .sort((a, b) => Number(b.minutes) - Number(a.minutes))
      .slice(0, MAX_WORK_ITEMS);

    if (ranked.length === 0) {
      const payload: ScopeCreepResponse = {
        available: true,
        reason: null,
        projectId,
        items: [],
        flaggedCount: 0,
      };
      setCachedSuggestions(cacheKey, payload, CACHE_TTL_MS);
      return Response.json(payload);
    }

    const client = createAzureDevOpsClient(config.organizationUrl, pat);

    const items = await mapWithConcurrencyLimit(
      ranked,
      AZURE_CONCURRENCY,
      async (row): Promise<ScopeCreepItem | null> => {
        try {
          const workItem = await client.getWorkItem(row.workItemId);
          const estimateMinutes =
            typeof workItem.originalEstimate === "number" &&
            workItem.originalEstimate > 0
              ? Math.round(workItem.originalEstimate * 60)
              : null;

          return {
            workItemId: row.workItemId,
            title: workItem.title,
            type: workItem.type,
            state: workItem.state,
            url: workItem.url ?? null,
            estimateMinutes,
            loggedMinutes: Number(row.minutes),
            ratio:
              estimateMinutes !== null
                ? Math.round((Number(row.minutes) / estimateMinutes) * 100) /
                  100
                : null,
          };
        } catch {
          // A deleted/inaccessible work item should not sink the analysis.
          return null;
        }
      },
    );

    const resolved = items.filter(
      (item): item is ScopeCreepItem => item !== null,
    );

    // Worst offenders first; items without estimate sink to the bottom.
    resolved.sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));

    const payload: ScopeCreepResponse = {
      available: true,
      reason: null,
      projectId,
      items: resolved,
      flaggedCount: resolved.filter(
        (item) => item.ratio !== null && item.ratio >= FLAG_RATIO,
      ).length,
    };

    setCachedSuggestions(cacheKey, payload, CACHE_TTL_MS);

    return Response.json(payload);
  } catch (error) {
    console.error("[GET /api/hq/scope-creep]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
