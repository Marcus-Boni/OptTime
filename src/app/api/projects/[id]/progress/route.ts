import { eq } from "drizzle-orm";
import { canAccessProject, getActiveSession, getActorContext } from "@/lib/access-control";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { azureDevopsConfig, project } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import type { ProjectProgress } from "@/components/projects/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type AzureWorkItem = {
  id: number;
  fields: Record<string, unknown>;
};

type AzureWiqlResult = {
  workItems: Array<{ id: number }>;
};

type AzureBatchResult = {
  value: AzureWorkItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unconfiguredResponse(
  reason: ProjectProgress["unconfiguredReason"],
): ProjectProgress {
  return {
    unconfigured: true,
    unconfiguredReason: reason,
    estimated: 0,
    completed: 0,
    remaining: 0,
    progressPercent: 0,
    efficiency: 0,
  };
}

/**
 * Wrapper around fetch that:
 * 1. Adds Authorization + Content-Type headers
 * 2. Throws a descriptive error if response is not JSON (e.g. HTML error page)
 * 3. Throws if status is not ok
 */
async function fetchAzureApi<T>(
  url: string,
  authHeader: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const contentType = res.headers.get("content-type") ?? "";

  // Azure returns HTML on auth failures (including 203 redirect-to-login)
  if (!contentType.includes("application/json")) {
    const preview = await res.text().then((t) => t.slice(0, 200));
    throw new Error(
      `[Azure ${res.status}] Non-JSON response from ${url.split("?")[0]} — likely invalid PAT or organization URL. Preview: ${preview.replace(/\s+/g, " ").slice(0, 120)}`,
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `[Azure ${res.status}] ${JSON.stringify(body)}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Main data fetcher ────────────────────────────────────────────────────────

async function fetchProjectSchedulingData(
  organizationUrl: string,
  pat: string,
  azureProjectId: string,
): Promise<ProjectProgress> {
  const orgUrl = organizationUrl.replace(/\/$/, "");
  const authHeader = `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;

  // Step 1: Resolve the project NAME from the UUID.
  // Azure DevOps WIQL URL path context is unreliable with raw UUIDs for some orgs —
  // the safe and consistent approach is to get the project name first and use it everywhere.
  const projectInfo = await fetchAzureApi<{ id: string; name: string }>(
    `${orgUrl}/_apis/projects/${encodeURIComponent(azureProjectId)}?api-version=7.1`,
    authHeader,
  );

  const projectName = projectInfo.name;

  // Step 2: Query work items scoped to the project, using project name in both URL + WIQL filter.
  // [System.TeamProject] accepts the project NAME (not UUID), so this is the correct form.
  const sanitizedName = projectName.replace(/'/g, "''");
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${sanitizedName}' AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC`;

  const wiqlResult = await fetchAzureApi<AzureWiqlResult>(
    `${orgUrl}/${encodeURIComponent(projectName)}/_apis/wit/wiql?$top=200&api-version=7.1`,
    authHeader,
    { method: "POST", body: JSON.stringify({ query: wiql }) },
  );

  const ids = wiqlResult.workItems.slice(0, 200).map((wi) => wi.id);

  if (ids.length === 0) {
    return unconfiguredResponse("no_data");
  }

  // Step 3: Batch-fetch scheduling fields for all IDs
  const batchResult = await fetchAzureApi<AzureBatchResult>(
    `${orgUrl}/_apis/wit/workitems?ids=${ids.join(",")}&fields=System.Id,Microsoft.VSTS.Scheduling.OriginalEstimate,Microsoft.VSTS.Scheduling.CompletedWork,Microsoft.VSTS.Scheduling.RemainingWork&api-version=7.1`,
    authHeader,
  );

  let estimated = 0;
  let completed = 0;
  let remaining = 0;

  for (const wi of batchResult.value) {
    const origEst = wi.fields["Microsoft.VSTS.Scheduling.OriginalEstimate"];
    const compWork = wi.fields["Microsoft.VSTS.Scheduling.CompletedWork"];
    const remWork = wi.fields["Microsoft.VSTS.Scheduling.RemainingWork"];

    if (typeof origEst === "number") estimated += origEst;
    if (typeof compWork === "number") completed += compWork;
    if (typeof remWork === "number") remaining += remWork;
  }

  if (estimated === 0 && completed === 0 && remaining === 0) {
    return unconfiguredResponse("no_data");
  }

  const progressPercent =
    estimated > 0 ? Math.min(Math.round((completed / estimated) * 100), 100) : 0;
  const efficiency =
    estimated > 0 ? Math.round((completed / estimated) * 100) : 0;

  return {
    unconfigured: false,
    estimated: Math.round(estimated * 100) / 100,
    completed: Math.round(completed * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    progressPercent,
    efficiency,
  };
}


// ─── Route Handler ────────────────────────────────────────────────────────────

/**
 * GET /api/projects/[id]/progress
 *
 * Returns ProjectProgress JSON. Never returns 500 — errors are expressed
 * as `unconfigured: true` with a specific `unconfiguredReason` so the client
 * can show appropriate UI without crashing.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  const { id } = await params;

  if (!(await canAccessProject(actor, id))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const found = await db.query.project.findFirst({
      where: eq(project.id, id),
      columns: {
        id: true,
        azureProjectId: true,
        azureProjectUrl: true,
        managerId: true,
      },
    });

    if (!found) {
      return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
    }

    // No Azure link — tell client explicitly
    if (!found.azureProjectId) {
      return Response.json(unconfiguredResponse("no_azure_linked"));
    }

    // Resolve Azure credentials: project manager → current user → any admin
    // We prefer the manager's PAT because the manager is guaranteed to have access 
    // to the Azure project they imported. If an admin views it, their personal PAT 
    // might lack permissions on the Azure side, causing a 404.
    let azureConf = null;

    if (found.managerId) {
      azureConf = await findAzureDevopsConfigByUserId(found.managerId);
    }

    if (!azureConf) {
      azureConf = await findAzureDevopsConfigByUserId(actor.userId);
    }

    if (!azureConf) {
      const adminConfig = await db.query.azureDevopsConfig.findFirst();
      if (adminConfig) azureConf = adminConfig;
    }

    if (!azureConf) {
      return Response.json(unconfiguredResponse("no_azure_config"));
    }

    // Fetch from Azure DevOps — decrypt PAT first, then catch any Azure error gracefully
    try {
      const decryptedPat = decrypt(azureConf.pat);
      if (!decryptedPat) {
        console.error("[GET /api/projects/[id]/progress] Failed to decrypt PAT for config", azureConf.id);
        return Response.json(unconfiguredResponse("no_azure_config"));
      }

      const progress = await fetchProjectSchedulingData(
        azureConf.organizationUrl,
        decryptedPat,
        found.azureProjectId,
      );
      return Response.json(progress);
    } catch (azureErr) {
      // Log for debugging but don't crash — tell client "no data"
      console.error("[GET /api/projects/[id]/progress] Azure request failed:", azureErr);
      return Response.json(unconfiguredResponse("no_data"));
    }
  } catch (err) {
    console.error("[GET /api/projects/[id]/progress] Unexpected error:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
