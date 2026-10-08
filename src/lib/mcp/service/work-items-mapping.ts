import type { AzureDevOpsMyWorkItem } from "@/lib/azure-devops/client";
import {
  type AutofillProject,
  matchProjectForAzureProject,
} from "@/lib/time-assistant/autofill";
import { formatInstantWithOffset } from "@/lib/timezone";

/**
 * Pure mapping of Azure DevOps work items assigned to the user into the agent
 * contract. Separated from the service so it can be verified offline.
 */

export interface MyWorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  teamProject: string;
  areaPath: string | null;
  iterationPath: string | null;
  priority: number | null;
  originalEstimateHours: number | null;
  remainingWorkHours: number | null;
  completedWorkHours: number | null;
  /** ISO 8601 with the app timezone offset. */
  changedAt: string;
  url: string;
  parentId: number | null;
  /** The OptTime project linked to the item's team project, when there is one. */
  optTimeProject: { id: string; name: string } | null;
  /** Minutes already logged against this work item in OptTime. */
  loggedMinutesInOptTime: number;
  /** When the most recent of those entries was created. */
  lastLoggedAt: string | null;
}

export interface LoggedAgainstWorkItem {
  minutes: number;
  /** Creation instant of the most recent entry. */
  lastLoggedAt: Date | null;
}

export interface MapMyWorkItemsInput {
  items: AzureDevOpsMyWorkItem[];
  projects: AutofillProject[];
  logged: Map<number, LoggedAgainstWorkItem>;
  timeZone: string;
}

/** Epoch used when Azure omits `ChangedDate`, so ordering stays total. */
const UNKNOWN_CHANGE = new Date(0);

/** Maps, links to OptTime projects and orders by last change, newest first. */
export function mapMyWorkItems(input: MapMyWorkItemsInput): MyWorkItem[] {
  const { timeZone } = input;
  const seen = new Set<number>();

  return input.items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item) => ({
      item,
      changed: item.changedDate ? new Date(item.changedDate) : UNKNOWN_CHANGE,
    }))
    .sort(
      (a, b) =>
        b.changed.getTime() - a.changed.getTime() || b.item.id - a.item.id,
    )
    .map(({ item, changed }): MyWorkItem => {
      const linked = item.teamProject
        ? matchProjectForAzureProject(input.projects, item.teamProject)
        : null;
      const logged = input.logged.get(item.id);

      return {
        id: item.id,
        title: item.title,
        type: item.type,
        state: item.state,
        teamProject: item.teamProject,
        areaPath: item.areaPath,
        iterationPath: item.iterationPath,
        priority: item.priority,
        originalEstimateHours: item.originalEstimateHours,
        remainingWorkHours: item.remainingWorkHours,
        completedWorkHours: item.completedWorkHours,
        changedAt: formatInstantWithOffset(changed, timeZone),
        url: item.url,
        parentId: item.parentId,
        optTimeProject: linked ? { id: linked.id, name: linked.name } : null,
        loggedMinutesInOptTime: logged?.minutes ?? 0,
        lastLoggedAt: logged?.lastLoggedAt
          ? formatInstantWithOffset(logged.lastLoggedAt, timeZone)
          : null,
      };
    });
}

/** One line per item, written to be quoted to the user. */
export function formatMyWorkItemLine(item: MyWorkItem): string {
  const project = item.optTimeProject?.name ?? item.teamProject;
  const logged =
    item.loggedMinutesInOptTime > 0
      ? ` · ${Math.round(item.loggedMinutesInOptTime / 6) / 10}h lançadas`
      : "";

  return `• #${item.id} [${item.type} · ${item.state}] ${item.title} — ${project}${logged}`;
}
