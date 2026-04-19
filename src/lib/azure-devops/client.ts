import type {
  AzureDevOpsAssignedWorkItem,
  AzureDevOpsCommit,
  AzureDevOpsRepository,
  AzureDevOpsWorkItem,
  WorkItemSearchResult,
  WorkItemState,
  WorkItemType,
} from "@/types/azure-devops";
import { matchesCommitAuthor } from "./commit-author";
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

function isGuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function createAzureDevOpsClient(organizationUrl: string, pat: string) {
  const orgUrl = organizationUrl.replace(/\/$/, "");
  const authHeader = buildAuthHeader(pat);
  const projectContextCache = new Map<
    string,
    Promise<{ id?: string; name: string }>
  >();

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
    const projectContext = await resolveProjectContext(projectName);
    const sanitizedQuery = query.replace(/'/g, "''");

    let wiql: string;
    if (isIdSearch) {
      const id = query.replace("#", "").trim();
      wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectContext.name}' AND [System.Id] = ${id}`;
    } else {
      wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectContext.name}' AND [System.Title] CONTAINS '${sanitizedQuery}' AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC`;
    }

    const wiqlResult = await fetchApi<{
      workItems: Array<{ id: number; url: string }>;
    }>(
      `${orgUrl}/${encodeURIComponent(projectContext.name)}/_apis/wit/wiql?api-version=7.1`,
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
      projectName:
        (wi.fields["System.TeamProject"] as string) ?? projectContext.name,
    }));
  }

  async function resolveProjectContext(projectRef: string) {
    const normalizedRef = projectRef.trim();

    let cached = projectContextCache.get(normalizedRef);
    if (!cached) {
      cached = (async () => {
        if (!isGuidLike(normalizedRef)) {
          return { name: normalizedRef };
        }

        const projectResult = await fetchApi<{ id: string; name: string }>(
          `${orgUrl}/_apis/projects/${encodeURIComponent(normalizedRef)}?api-version=7.1`,
        );

        return {
          id: projectResult.id,
          name: projectResult.name,
        };
      })();

      projectContextCache.set(normalizedRef, cached);
    }

    return cached;
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
    const projectContext = await resolveProjectContext(projectName);
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectContext.name}' AND [System.State] <> 'Removed' AND [System.State] <> 'Closed' ORDER BY [System.ChangedDate] DESC`;

    const wiqlResult = await fetchApi<{
      workItems: Array<{ id: number }>;
    }>(
      `${orgUrl}/${encodeURIComponent(projectContext.name)}/_apis/wit/wiql?api-version=7.1`,
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
      projectName:
        (wi.fields["System.TeamProject"] as string) ?? projectContext.name,
    }));
  }

  async function getAssignedWorkItems(
    projectRef: string,
    top = 100,
  ): Promise<AzureDevOpsAssignedWorkItem[]> {
    const projectContext = await resolveProjectContext(projectRef);
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectContext.name}' AND [System.AssignedTo] = @Me AND [System.State] <> 'Removed' AND [System.State] <> 'Closed' AND [System.State] <> 'Done' AND [System.State] <> 'Completed' AND [System.State] <> 'Cancelad' ORDER BY [System.ChangedDate] DESC`;

    const wiqlResult = await fetchApi<{
      workItems: Array<{ id: number }>;
    }>(
      `${orgUrl}/${encodeURIComponent(projectContext.name)}/_apis/wit/wiql?$top=${top}&api-version=7.1`,
      {
        method: "POST",
        body: JSON.stringify({ query: wiql }),
      },
    );

    const ids = wiqlResult.workItems.slice(0, top).map((item) => item.id);
    if (ids.length === 0) {
      return [];
    }

    const batchResult = await fetchApi<{
      value: Array<{
        id: number;
        fields: Record<string, unknown>;
        _links?: { html?: { href?: string } };
      }>;
    }>(
      `${orgUrl}/_apis/wit/workitems?ids=${ids.join(",")}&fields=System.Id,System.Title,System.WorkItemType,System.State,System.TeamProject,System.AreaPath,System.IterationPath,System.CreatedDate,System.ChangedDate,Microsoft.VSTS.Scheduling.RemainingWork,Microsoft.VSTS.Scheduling.CompletedWork,Microsoft.VSTS.Scheduling.OriginalEstimate,Microsoft.VSTS.Common.Priority,System.Tags,Microsoft.VSTS.Scheduling.TargetDate&api-version=7.1`,
    );

    return batchResult.value.map((wi) => ({
      id: wi.id,
      title: (wi.fields["System.Title"] as string) ?? "",
      type: (wi.fields["System.WorkItemType"] as WorkItemType) ?? "Task",
      state: (wi.fields["System.State"] as WorkItemState) ?? "New",
      assignedTo: undefined,
      projectName:
        (wi.fields["System.TeamProject"] as string) ?? projectContext.name,
      areaPath: (wi.fields["System.AreaPath"] as string) ?? "",
      iterationPath: (wi.fields["System.IterationPath"] as string) ?? "",
      remainingWork: wi.fields["Microsoft.VSTS.Scheduling.RemainingWork"] as
        | number
        | undefined,
      completedWork: wi.fields["Microsoft.VSTS.Scheduling.CompletedWork"] as
        | number
        | undefined,
      originalEstimate: wi.fields[
        "Microsoft.VSTS.Scheduling.OriginalEstimate"
      ] as number | undefined,
      createdDate: wi.fields["System.CreatedDate"] as string | undefined,
      changedDate: wi.fields["System.ChangedDate"] as string | undefined,
      priority: wi.fields["Microsoft.VSTS.Common.Priority"] as
        | number
        | undefined,
      tags:
        typeof wi.fields["System.Tags"] === "string"
          ? (wi.fields["System.Tags"] as string)
              .split(";")
              .map((tag) => tag.trim())
              .filter(Boolean)
          : undefined,
      targetDate: wi.fields["Microsoft.VSTS.Scheduling.TargetDate"] as
        | string
        | undefined,
      url:
        wi._links?.html?.href ??
        `${orgUrl}/_workitems/edit/${encodeURIComponent(String(wi.id))}`,
    }));
  }

  async function listRepositories(
    projectName: string,
    top?: number,
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

    const repositories =
      typeof top === "number"
        ? repositoriesResult.value.slice(0, top)
        : repositoriesResult.value;

    return repositories.map((repository) => ({
      id: repository.id,
      name: repository.name,
      remoteUrl: repository.remoteUrl,
    }));
  }

  async function getRecentCommits(
    projectRef: string,
    options: {
      authorCandidates: string[];
      fromDate: string;
      toDate: string;
      top?: number;
      projectLabel?: string;
    },
  ): Promise<AzureDevOpsCommit[]> {
    const repositories = await listRepositories(projectRef);
    const projectLabel = options.projectLabel ?? projectRef;
    const authorCandidates = Array.from(
      new Set(
        options.authorCandidates
          .map((candidate) => candidate?.trim())
          .filter((candidate): candidate is string => Boolean(candidate)),
      ),
    );

    if (authorCandidates.length === 0) {
      return [];
    }

    const pageSize = Math.max(20, Math.min(options.top ?? 100, 200));

    async function fetchRepoCommits(
      repository: AzureDevOpsRepository,
      authorCandidate?: string,
    ) {
      const commits: AzureDevOpsCommit[] = [];
      let skip = 0;

      while (true) {
        const params = new URLSearchParams({
          "searchCriteria.fromDate": options.fromDate,
          "searchCriteria.toDate": options.toDate,
          "searchCriteria.$skip": String(skip),
          "searchCriteria.$top": String(pageSize),
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

        const normalizedCommits = result.value
          .map((commit) => {
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
          })
          .filter((commit) => matchesCommitAuthor(commit, authorCandidates));

        commits.push(...normalizedCommits);

        if (
          result.value.length < pageSize ||
          (typeof options.top === "number" && commits.length >= options.top)
        ) {
          break;
        }

        skip += result.value.length;
      }

      return typeof options.top === "number"
        ? commits.slice(0, options.top)
        : commits;
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
    getAssignedWorkItems,
    listRepositories,
    getRecentCommits,
  };
}
