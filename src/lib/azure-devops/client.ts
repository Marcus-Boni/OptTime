import type {
  AzureDevOpsWorkItem,
  WorkItemSearchResult,
  WorkItemState,
  WorkItemType,
} from "@/types/azure-devops";

export class AzureDevOpsError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "AzureDevOpsError";
  }
}

function buildAuthHeader(pat: string): string {
  return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
}

export function createAzureDevOpsClient(organizationUrl: string, pat: string) {
  const orgUrl = organizationUrl.replace(/\/$/, "");
  const authHeader = buildAuthHeader(pat);

  async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new AzureDevOpsError(
        `Azure DevOps API error (${res.status}): ${text}`,
        res.status,
      );
    }

    return res.json() as Promise<T>;
  }

  async function searchWorkItems(
    projectName: string,
    query: string,
    top = 20,
  ): Promise<WorkItemSearchResult[]> {
    const isIdSearch = /^#?\d+$/.test(query.trim());
    const sanitizedQuery = query.replace(/'/g, "''");

    let wiql: string;
    if (isIdSearch) {
      const id = query.replace("#", "").trim();
      wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectName}' AND [System.Id] = ${id}`;
    } else {
      wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectName}' AND [System.Title] CONTAINS '${sanitizedQuery}' AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC`;
    }

    const wiqlResult = await fetchApi<{
      workItems: Array<{ id: number; url: string }>;
    }>(
      `${orgUrl}/${encodeURIComponent(projectName)}/_apis/wit/wiql?api-version=7.1`,
      {
        method: "POST",
        body: JSON.stringify({ query: wiql }),
      },
    );

    const ids = wiqlResult.workItems.slice(0, top).map((wi) => wi.id);
    if (ids.length === 0) return [];

    const batchResult = await fetchApi<{
      value: Array<{
        id: number;
        fields: Record<string, unknown>;
      }>;
    }>(
      `${orgUrl}/_apis/wit/workitems?ids=${ids.join(",")}&fields=System.Id,System.Title,System.WorkItemType,System.State,System.TeamProject&api-version=7.1`,
    );

    return batchResult.value.map((wi) => ({
      id: wi.id,
      title: (wi.fields["System.Title"] as string) ?? "",
      type: (wi.fields["System.WorkItemType"] as WorkItemType) ?? "Task",
      state: (wi.fields["System.State"] as WorkItemState) ?? "New",
      projectName: (wi.fields["System.TeamProject"] as string) ?? projectName,
    }));
  }

  async function getWorkItem(id: number): Promise<AzureDevOpsWorkItem> {
    const result = await fetchApi<{
      id: number;
      fields: Record<string, unknown>;
      _links: { html: { href: string } };
    }>(`${orgUrl}/_apis/wit/workitems/${id}?$expand=all&api-version=7.1`);

    return {
      id: result.id,
      title: (result.fields["System.Title"] as string) ?? "",
      type: (result.fields["System.WorkItemType"] as WorkItemType) ?? "Task",
      state: (result.fields["System.State"] as WorkItemState) ?? "New",
      assignedTo: (
        result.fields["System.AssignedTo"] as { displayName?: string }
      )?.displayName,
      projectName: (result.fields["System.TeamProject"] as string) ?? "",
      areaPath: (result.fields["System.AreaPath"] as string) ?? "",
      iterationPath: (result.fields["System.IterationPath"] as string) ?? "",
      remainingWork: result.fields["Microsoft.VSTS.Scheduling.RemainingWork"] as
        | number
        | undefined,
      completedWork: result.fields["Microsoft.VSTS.Scheduling.CompletedWork"] as
        | number
        | undefined,
      originalEstimate: result.fields[
        "Microsoft.VSTS.Scheduling.OriginalEstimate"
      ] as number | undefined,
      url:
        result._links?.html?.href ?? `${orgUrl}/_workitems/edit/${result.id}`,
    };
  }

  async function updateCompletedWork(
    workItemId: number,
    completedWorkHours: number,
    deltaHours?: number,
  ): Promise<boolean> {
    try {
      const patches: Array<{ op: string; path: string; value: number }> = [
        {
          op: "add",
          path: "/fields/Microsoft.VSTS.Scheduling.CompletedWork",
          value: completedWorkHours,
        },
      ];

      // Optionally subtract the delta from RemainingWork
      if (deltaHours !== undefined && deltaHours > 0) {
        // Read current RemainingWork first
        const current = await fetchApi<{
          fields: Record<string, unknown>;
        }>(
          `${orgUrl}/_apis/wit/workitems/${workItemId}?fields=Microsoft.VSTS.Scheduling.RemainingWork&api-version=7.1`,
        );
        const currentRemaining =
          typeof current.fields["Microsoft.VSTS.Scheduling.RemainingWork"] ===
          "number"
            ? (current.fields[
                "Microsoft.VSTS.Scheduling.RemainingWork"
              ] as number)
            : 0;
        const newRemaining = Math.max(
          0,
          Math.round((currentRemaining - deltaHours) * 100) / 100,
        );
        patches.push({
          op: "add",
          path: "/fields/Microsoft.VSTS.Scheduling.RemainingWork",
          value: newRemaining,
        });
      }

      await fetchApi(
        `${orgUrl}/_apis/wit/workitems/${workItemId}?api-version=7.1`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json-patch+json",
          },
          body: JSON.stringify(patches),
        },
      );
      return true;
    } catch (error) {
      console.error(
        `[AzDO] Failed to update CompletedWork for WI#${workItemId}:`,
        error,
      );
      return false;
    }
  }


  async function getProjectWorkItems(
    projectName: string,
    top = 50,
  ): Promise<WorkItemSearchResult[]> {
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectName}' AND [System.State] <> 'Removed' AND [System.State] <> 'Closed' ORDER BY [System.ChangedDate] DESC`;

    const wiqlResult = await fetchApi<{
      workItems: Array<{ id: number }>;
    }>(
      `${orgUrl}/${encodeURIComponent(projectName)}/_apis/wit/wiql?api-version=7.1`,
      {
        method: "POST",
        body: JSON.stringify({ query: wiql }),
      },
    );

    const ids = wiqlResult.workItems.slice(0, top).map((wi) => wi.id);
    if (ids.length === 0) return [];

    const batchResult = await fetchApi<{
      value: Array<{
        id: number;
        fields: Record<string, unknown>;
      }>;
    }>(
      `${orgUrl}/_apis/wit/workitems?ids=${ids.join(",")}&fields=System.Id,System.Title,System.WorkItemType,System.State,System.TeamProject&api-version=7.1`,
    );

    return batchResult.value.map((wi) => ({
      id: wi.id,
      title: (wi.fields["System.Title"] as string) ?? "",
      type: (wi.fields["System.WorkItemType"] as WorkItemType) ?? "Task",
      state: (wi.fields["System.State"] as WorkItemState) ?? "New",
      projectName: (wi.fields["System.TeamProject"] as string) ?? projectName,
    }));
  }

  return {
    searchWorkItems,
    getWorkItem,
    updateCompletedWork,
    getProjectWorkItems,
  };
}
