import type { Project } from "./types";

function normalizeProjectToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function buildProjectTokens(project: Project): string[] {
  return [project.name, project.code]
    .filter(Boolean)
    .map(normalizeProjectToken)
    .filter(Boolean);
}

export interface ProjectMatchResult {
  /** The matched project ID, or empty string when no projects are available. */
  projectId: string;
  /**
   * True only when an actual name/code match was found between the DevOps
   * project name and an OptSolv project.
   * False when the result is a generic first-project fallback.
   */
  isMatched: boolean;
}

/**
 * Tries to find an OptSolv project that corresponds to the current Azure
 * DevOps project name.
 *
 * Returns `isMatched = false` when:
 *  - The project list is empty
 *  - No DevOps project name was provided
 *  - No exact or partial name/code match was found (falls back to first project)
 */
export function matchProjectFromDevOpsContext(
  projects: Project[],
  devOpsProjectName: string,
): ProjectMatchResult {
  if (projects.length === 0) return { projectId: "", isMatched: false };
  if (!devOpsProjectName)
    return { projectId: projects[0]?.id ?? "", isMatched: false };

  const normalizedDevOpsProject = normalizeProjectToken(devOpsProjectName);
  if (!normalizedDevOpsProject)
    return { projectId: projects[0]?.id ?? "", isMatched: false };

  const exact = projects.find((project) =>
    buildProjectTokens(project).some(
      (token) => token === normalizedDevOpsProject,
    ),
  );
  if (exact) return { projectId: exact.id, isMatched: true };

  const partial = projects.find((project) =>
    buildProjectTokens(project).some(
      (token) =>
        token.includes(normalizedDevOpsProject) ||
        normalizedDevOpsProject.includes(token),
    ),
  );
  if (partial) return { projectId: partial.id, isMatched: true };

  // No match found — return first project as a neutral fallback but signal
  // that the user should still manually pick the correct project.
  return { projectId: projects[0]?.id ?? "", isMatched: false };
}

/**
 * @deprecated Use `matchProjectFromDevOpsContext` instead, which also exposes
 * whether the result is a genuine match or a generic fallback.
 */
export function resolveProjectIdFromDevOpsContext(
  projects: Project[],
  devOpsProjectName: string,
): string {
  return matchProjectFromDevOpsContext(projects, devOpsProjectName).projectId;
}
