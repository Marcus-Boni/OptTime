import { and, eq, inArray } from "drizzle-orm";
import { getAccessibleProjectIds } from "@/lib/access-control";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";

/**
 * Project lookup and Azure DevOps work-item search for agents.
 *
 * The defining constraint here is that models speak in names, not UUIDs: a user
 * says "registre no Harvest" and the agent forwards "Harvest". Every entry
 * point therefore resolves a free-form reference, and when it cannot, it fails
 * with the candidate list attached so the agent can disambiguate in one turn
 * instead of guessing.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  color: string;
  status: string;
  billable: boolean;
  clientName: string | null;
  azureProjectId: string | null;
  azureProjectName: string | null;
}

const PROJECT_COLUMNS = {
  id: true,
  name: true,
  code: true,
  color: true,
  status: true,
  billable: true,
  clientName: true,
  azureProjectId: true,
} as const;

type ProjectRow = {
  id: string;
  name: string;
  code: string;
  color: string;
  status: string;
  billable: boolean;
  clientName: string | null;
  azureProjectId: string | null;
};

function toSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    color: row.color,
    status: row.status,
    billable: row.billable,
    clientName: row.clientName,
    azureProjectId: row.azureProjectId,
    // The Azure project is addressed by name in the REST API; the internal
    // project name is the fallback used across the app for that mapping.
    azureProjectName: row.azureProjectId ? row.name : null,
  };
}

/** Every project the principal may log time against. */
export async function getVisibleProjects(
  principal: AgentPrincipal,
  options?: { includeInactive?: boolean },
): Promise<ProjectSummary[]> {
  const accessibleIds = await getAccessibleProjectIds({
    role: principal.role,
    userId: principal.userId,
  });

  if (accessibleIds && accessibleIds.length === 0) return [];

  const rows = await db.query.project.findMany({
    where: accessibleIds ? inArray(project.id, accessibleIds) : undefined,
    columns: PROJECT_COLUMNS,
    orderBy: (table, { asc }) => [asc(table.name)],
  });

  const summaries = rows.map(toSummary);

  return options?.includeInactive
    ? summaries
    : summaries.filter((item) => item.status === "active");
}

export interface ListProjectsInput {
  search?: string | null;
  status?: "active" | "open" | "all" | null;
  limit?: number | null;
}

export interface ListProjectsResult {
  projects: ProjectSummary[];
  /** How many matched the filters, before the limit was applied. */
  total: number;
  /** How many are in `projects`. */
  returned: number;
  /** True when `total > returned` — the caller is seeing a partial list. */
  truncated: boolean;
}

/**
 * Lists projects, reporting the pre-limit total.
 *
 * Truncation has to be explicit. An admin here can see over a hundred projects,
 * and an agent handed a silently-clipped list will state confidently that a
 * project does not exist. `truncated` is what lets it say "showing 50 of 136"
 * or narrow the search instead of guessing.
 */
export async function listProjects(
  principal: AgentPrincipal,
  input: ListProjectsInput = {},
): Promise<ListProjectsResult> {
  const all = await getVisibleProjects(principal, { includeInactive: true });

  const status = input.status ?? "active";
  const byStatus =
    status === "all" ? all : all.filter((item) => item.status === status);

  const search = input.search?.trim().toLowerCase();
  const filtered = search
    ? byStatus.filter(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          item.code.toLowerCase().includes(search) ||
          (item.clientName?.toLowerCase().includes(search) ?? false),
      )
    : byStatus;

  const limit =
    input.limit && input.limit > 0 ? Math.min(input.limit, 200) : 50;
  const projects = filtered.slice(0, limit);

  return {
    projects,
    total: filtered.length,
    returned: projects.length,
    truncated: filtered.length > projects.length,
  };
}

function scoreMatch(candidate: ProjectSummary, needle: string): number {
  const name = candidate.name.toLowerCase();
  const code = candidate.code.toLowerCase();

  if (candidate.id === needle) return 100;
  if (code === needle) return 90;
  if (name === needle) return 80;
  if (code.startsWith(needle) || name.startsWith(needle)) return 60;
  if (name.includes(needle) || code.includes(needle)) return 40;
  if (candidate.clientName?.toLowerCase().includes(needle)) return 20;
  return 0;
}

/**
 * Turns a free-form project reference into a concrete project.
 *
 * @throws {AgentError} `NOT_FOUND` with the available projects attached, or
 * `AMBIGUOUS_PROJECT` when several candidates tie on the best score.
 */
export async function resolveProject(
  principal: AgentPrincipal,
  reference: string,
): Promise<ProjectSummary> {
  const needle = reference?.trim().toLowerCase();
  if (!needle) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Informe o projeto (id, código ou nome).",
    );
  }

  const candidates = await getVisibleProjects(principal, {
    includeInactive: true,
  });

  if (candidates.length === 0) {
    throw new AgentError(
      "NOT_FOUND",
      "Você não está associado a nenhum projeto. Peça a um gestor para incluir você em um projeto.",
    );
  }

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreMatch(candidate, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    throw new AgentError(
      "NOT_FOUND",
      `Nenhum projeto encontrado para "${reference}".`,
      {
        details: {
          availableProjects: candidates
            .filter((item) => item.status === "active")
            .slice(0, 20)
            .map((item) => ({ id: item.id, name: item.name, code: item.code })),
        },
        hint: "Chame opt_time_list_projects para ver os projetos disponíveis e use o código exato.",
      },
    );
  }

  const best = scored[0];
  const tied = scored.filter((item) => item.score === best.score);

  if (tied.length > 1) {
    throw new AgentError(
      "AMBIGUOUS_PROJECT",
      `"${reference}" corresponde a ${tied.length} projetos. Especifique o código.`,
      {
        details: {
          candidates: tied.map((item) => ({
            id: item.candidate.id,
            name: item.candidate.name,
            code: item.candidate.code,
          })),
        },
        hint: "Peça ao usuário para escolher, ou repita a chamada usando o código do projeto.",
      },
    );
  }

  if (best.candidate.status !== "active") {
    throw new AgentError(
      "CONFLICT",
      `O projeto "${best.candidate.name}" está com status "${best.candidate.status}" e não aceita novos lançamentos.`,
      { details: { projectId: best.candidate.id } },
    );
  }

  return best.candidate;
}

/** Asserts the principal may log time against an already-known project id. */
export async function assertProjectAccess(
  principal: AgentPrincipal,
  projectId: string,
): Promise<ProjectSummary> {
  const row = await db.query.project.findFirst({
    where: eq(project.id, projectId),
    columns: PROJECT_COLUMNS,
  });

  if (!row) {
    throw new AgentError("NOT_FOUND", "Projeto não encontrado.");
  }

  const accessibleIds = await getAccessibleProjectIds({
    role: principal.role,
    userId: principal.userId,
  });

  if (accessibleIds && !accessibleIds.includes(projectId)) {
    throw new AgentError(
      "FORBIDDEN",
      `Você não tem acesso ao projeto "${row.name}".`,
    );
  }

  if (row.status !== "active") {
    throw new AgentError(
      "CONFLICT",
      `O projeto "${row.name}" está com status "${row.status}" e não aceita novos lançamentos.`,
    );
  }

  return toSummary(row);
}

export interface WorkItemResult {
  id: number;
  title: string;
  type: string;
  state: string;
  projectName: string;
  url: string | null;
}

/**
 * Azure DevOps' WIQL search does not return the browser URL, so it is composed
 * here from the organisation URL — agents quote it back to the user as a link.
 */
function buildWorkItemUrl(
  organizationUrl: string,
  projectName: string,
  workItemId: number,
): string {
  const base = organizationUrl.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(projectName)}/_workitems/edit/${workItemId}`;
}

export interface SearchWorkItemsInput {
  query: string;
  /** Optional project reference to narrow the Azure DevOps project searched. */
  projectRef?: string | null;
  limit?: number | null;
}

/**
 * Searches Azure DevOps work items across the projects the user can see.
 *
 * A numeric query (`#123` or `123`) is treated as an id lookup; anything else
 * is a title search. Failures against individual Azure projects are swallowed —
 * a single misconfigured project must not blank out the whole result set.
 */
export async function searchWorkItems(
  principal: AgentPrincipal,
  input: SearchWorkItemsInput,
): Promise<{ workItems: WorkItemResult[]; searchedProjects: string[] }> {
  const query = input.query?.trim();
  if (!query || query.length < 1) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Informe um termo de busca (ID numérico ou parte do título).",
    );
  }

  const config = await findAzureDevopsConfigByUserId(principal.userId);
  if (!config) {
    throw new AgentError(
      "INTEGRATION_NOT_CONFIGURED",
      "Integração com Azure DevOps não configurada para a sua conta.",
      {
        hint: "Configure em Configurações → Integrações → Azure DevOps antes de buscar work items.",
      },
    );
  }

  const pat = decrypt(config.pat);
  if (!pat) {
    throw new AgentError(
      "INTEGRATION_NOT_CONFIGURED",
      "O token do Azure DevOps está inválido. Atualize a integração.",
    );
  }

  const projects = input.projectRef
    ? [await resolveProject(principal, input.projectRef)]
    : await getVisibleProjects(principal);

  const azureProjects = projects.filter((item) => item.azureProjectId);
  const targets = (azureProjects.length > 0 ? azureProjects : projects).slice(
    0,
    6,
  );

  if (targets.length === 0) {
    throw new AgentError(
      "NOT_FOUND",
      "Nenhum projeto vinculado ao Azure DevOps foi encontrado no seu escopo.",
    );
  }

  const client = createAzureDevOpsClient(config.organizationUrl, pat);
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 50) : 15;
  const numericId = query.match(/^#?(\d+)$/);

  const buckets = await Promise.all(
    targets.map(async (target) => {
      const projectRef = target.azureProjectId ?? target.name;
      try {
        const results = await client.searchWorkItems(
          projectRef,
          numericId ? numericId[1] : query,
          limit,
        );
        return results.map(
          (item): WorkItemResult => ({
            id: item.id,
            title: item.title,
            type: item.type,
            state: item.state,
            projectName: item.projectName || target.name,
            url: buildWorkItemUrl(
              config.organizationUrl,
              item.projectName || target.name,
              item.id,
            ),
          }),
        );
      } catch (error: unknown) {
        console.warn("[mcp][work_items] project search failed", {
          project: target.name,
          error: error instanceof Error ? error.message : "unknown",
        });
        return [];
      }
    }),
  );

  const seen = new Set<number>();
  const workItems = buckets
    .flat()
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);

  return {
    workItems,
    searchedProjects: targets.map((item) => item.name),
  };
}

/** Convenience used by the projects listing when scoping to a status filter. */
export async function countActiveProjects(
  principal: AgentPrincipal,
): Promise<number> {
  const accessibleIds = await getAccessibleProjectIds({
    role: principal.role,
    userId: principal.userId,
  });

  if (accessibleIds && accessibleIds.length === 0) return 0;

  const rows = await db.query.project.findMany({
    where: accessibleIds
      ? and(inArray(project.id, accessibleIds), eq(project.status, "active"))
      : eq(project.status, "active"),
    columns: { id: true },
  });

  return rows.length;
}
