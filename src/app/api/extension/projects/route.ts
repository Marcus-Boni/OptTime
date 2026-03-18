import { and, eq, or } from "drizzle-orm";
import {
  extensionJson,
  extensionOptions,
  resolveExtensionUser,
} from "@/lib/extension-auth";
import { db } from "@/lib/db";
import { project, projectMember } from "@/lib/db/schema";

export function OPTIONS() {
  return extensionOptions();
}

/**
 * GET /api/extension/projects
 * Returns the list of active projects the authenticated user is a member of
 * (or all active projects for managers/admins).
 */
export async function GET(req: Request): Promise<Response> {
  const extUser = await resolveExtensionUser(req);
  if (!extUser) {
    return extensionJson({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let projects: { id: string; name: string; code: string; color: string }[];

    if (extUser.role === "member") {
      // Only projects the user is explicitly a member of
      const memberships = await db.query.projectMember.findMany({
        where: eq(projectMember.userId, extUser.id),
        with: {
          project: {
            columns: {
              id: true,
              name: true,
              code: true,
              color: true,
              status: true,
            },
          },
        },
      });
      projects = memberships
        .filter((m) => m.project.status === "active")
        .map((m) => ({
          id: m.project.id,
          name: m.project.name,
          code: m.project.code,
          color: m.project.color,
        }));
    } else {
      // Managers/admins see all active projects
      const all = await db.query.project.findMany({
        where: eq(project.status, "active"),
        columns: { id: true, name: true, code: true, color: true },
        orderBy: (p, { asc }) => [asc(p.name)],
      });
      projects = all;
    }

    return extensionJson({ projects });
  } catch (error) {
    console.error("[GET /api/extension/projects]:", error);
    return extensionJson({ error: "Internal Server Error" }, { status: 500 });
  }
}
