import { eq, inArray } from "drizzle-orm";
import { getAccessibleProjectIds } from "@/lib/access-control";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
import {
  extensionJson,
  extensionOptions,
  resolveExtensionUser,
} from "@/lib/extension-auth";

export function OPTIONS() {
  return extensionOptions();
}

/**
 * GET /api/extension/projects
 * Returns the list of active projects inside the extension user scope.
 */
export async function GET(req: Request): Promise<Response> {
  const extUser = await resolveExtensionUser(req);
  if (!extUser) {
    return extensionJson({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessibleProjectIds = await getAccessibleProjectIds({
      role:
        extUser.role === "admin" || extUser.role === "manager"
          ? extUser.role
          : "member",
      userId: extUser.id,
    });

    if (accessibleProjectIds && accessibleProjectIds.length === 0) {
      return extensionJson({ projects: [] });
    }

    const projects = await db.query.project.findMany({
      where: accessibleProjectIds
        ? inArray(project.id, accessibleProjectIds)
        : eq(project.status, "active"),
      columns: { id: true, name: true, code: true, color: true, status: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    });

    return extensionJson({
      projects: projects
        .filter((item) => item.status === "active")
        .map(({ status: _status, ...projectSummary }) => projectSummary),
    });
  } catch (error) {
    console.error("[GET /api/extension/projects]:", error);
    return extensionJson({ error: "Internal Server Error" }, { status: 500 });
  }
}
