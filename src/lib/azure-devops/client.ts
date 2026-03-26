import type {
  AzureDevOpsCommit,
  AzureDevOpsRepository,
  AzureDevOpsWorkItem,
  WorkItemSearchResult,
  WorkItemState,
  WorkItemType,
} from "@/types/azure-devops";
import { resolveSchedulingHours } from "./scheduling";

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

function parseWorkItemIdsFromText(text: string) {
  const matches = text.match(/(?:AB#|#)(\d{1,9})/gi) ?? [];
  const ids = new Set<number>();

  for (const match of matches) {
    const numeric = Number.parseInt(match.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(numeric)) {
      ids.add(numeric);
    }
  }

  return [...ids];
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
  ): Promise<boolean> {
    try {
      const current = await fetchApi<{
        fields: Record<string, unknown>;
      }>(
        `${orgUrl}/_apis/wit/workitems/${workItemId}?fields=Microsoft.VSTS.Scheduling.CompletedWork,Microsoft.VSTS.Scheduling.RemainingWork,Microsoft.VSTS.Scheduling.OriginalEstimate&api-version=7.1`,
      );
      const updatedFields = resolveSchedulingHours({
        completedWork:
          current.fields["Microsoft.VSTS.Scheduling.CompletedWork"],
        remainingWork:
          current.fields["Microsoft.VSTS.Scheduling.RemainingWork"],
        originalEstimate:
          current.fields["Microsoft.VSTS.Scheduling.OriginalEstimate"],
        nextCompletedWork: completedWorkHours,
      });
      const patches: Array<{ op: string; path: string; value: number }> = [
        {
          op: "add",
          path: "/fields/Microsoft.VSTS.Scheduling.CompletedWork",
          value: updatedFields.completedWork,
        },
        {
          op: "add",
          path: "/fields/Microsoft.VSTS.Scheduling.RemainingWork",
          value: updatedFields.remainingWork,
        },
      ];

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
        `[AzDO] Failed to update scheduling fields for WI#${workItemId}:`,
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

  async function listRepositories(
    projectName: string,
    top = 30,
  ): Promise<AzureDevOpsRepository[]> {
    const repositoriesResult = await fetchApi<{
      value: Array<{
        id: string;
        name: string;
        remoteUrl?: string;
      }>;
    }>(
      `${orgUrl}/${encodeURIComponent(projectName)}/_apis/git/repositories?api-version=7.1`,
    );

    return repositoriesResult.value.slice(0, top).map((repository) => ({
      id: repository.id,
      name: repository.name,
      remoteUrl: repository.remoteUrl,
    }));
  }

  async function getRecentCommits(
    projectRef: string,
    options: {
      author?: string;
      authorAliases?: string[];
      fromDate: string;
      toDate: string;
      top?: number;
      projectLabel?: string;
    },
  ): Promise<AzureDevOpsCommit[]> {
    const repositories = await listRepositories(projectRef, 10);
    const projectLabel = options.projectLabel ?? projectRef;
    const authorCandidates = Array.from(
      new Set(
        [options.author, ...(options.authorAliases ?? [])]
          .map((candidate) => candidate?.trim())
          .filter((candidate): candidate is string => Boolean(candidate)),
      ),
    );

    const perRepoTop = Math.max(
      5,
      Math.floor((options.top ?? 40) / Math.max(1, repositories.length)),
    );

    async function fetchRepoCommits(
      repository: AzureDevOpsRepository,
      authorCandidate?: string,
    ) {
      const params = new URLSearchParams({
        "searchCriteria.fromDate": options.fromDate,
        "searchCriteria.toDate": options.toDate,
        "searchCriteria.$top": String(perRepoTop),
        "api-version": "7.1",
      });

      if (authorCandidate) {
        params.set("searchCriteria.author", authorCandidate);
      }

      const result = await fetchApi<{
        value: Array<{
          commitId: string;
          comment?: string;
          author?: { date?: string; email?: string; name?: string };
          committer?: { date?: string };
          remoteUrl?: string;
        }>;
      }>(
        `${orgUrl}/${encodeURIComponent(projectRef)}/_apis/git/repositories/${encodeURIComponent(repository.id)}/commits?${params.toString()}`,
      );

      return result.value.map((commit) => {
        const text = commit.comment ?? "";
        const workItemIds = parseWorkItemIdsFromText(text);
        const branch =
          text.match(
            /(?:branch|refs\/heads\/|feature\/|bugfix\/|hotfix\/)([\w/-]+)/i,
          )?.[1] ?? null;

        return {
          id: `${repository.id}:${commit.commitId}`,
          commitId: commit.commitId,
          repositoryId: repository.id,
          repositoryName: repository.name,
          projectName: projectLabel,
          message: text.split("\n")[0] ?? "",
          comment: text,
          authorEmail: commit.author?.email ?? null,
          authorName: commit.author?.name ?? null,
          branch,
          timestamp:
            commit.author?.date ??
            commit.committer?.date ??
            new Date().toISOString(),
          workItemIds,
        } satisfies AzureDevOpsCommit;
      });
    }

    let commitBuckets: AzureDevOpsCommit[][] = [];

    for (const authorCandidate of authorCandidates) {
      const batch = await Promise.all(
        repositories.map((repository) =>
          fetchRepoCommits(repository, authorCandidate),
        ),
      );

      if (batch.some((commits) => commits.length > 0)) {
        commitBuckets = batch;
        break;
      }
    }

    if (commitBuckets.length === 0) {
      commitBuckets = await Promise.all(
        repositories.map((repository) => fetchRepoCommits(repository)),
      );
    }

    const deduped = new Map<string, AzureDevOpsCommit>();

    for (const commit of commitBuckets.flat()) {
      deduped.set(commit.id, commit);
    }

    return [...deduped.values()]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, options.top ?? 40);
  }

  return {
    searchWorkItems,
    getWorkItem,
    updateCompletedWork,
    getProjectWorkItems,
    listRepositories,
    getRecentCommits,
  };
}
