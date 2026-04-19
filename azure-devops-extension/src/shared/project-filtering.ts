import type { Project } from "./types";

const STORAGE_KEY = "optsolv_hidden_project_ids";

/** Reads the set of hidden project IDs from localStorage. */
export function getHiddenProjectIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === "string"));
    }
  } catch {
    // localStorage parse error — start clean
  }
  return new Set();
}

/** Marks a project as hidden (will not appear in selects). */
export function hideProject(projectId: string): void {
  const ids = getHiddenProjectIds();
  ids.add(projectId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

/** Restores a previously hidden project (makes it visible again). */
export function showProject(projectId: string): void {
  const ids = getHiddenProjectIds();
  ids.delete(projectId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

/** Returns only the projects that are not hidden. */
export function getVisibleProjects(projects: Project[]): Project[] {
  const hidden = getHiddenProjectIds();
  return projects.filter((p) => !hidden.has(p.id));
}
