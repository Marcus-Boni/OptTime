import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { project, projectMember, user } from "@/lib/db/schema";

export type AppRole = "admin" | "manager" | "member";

export type ActorContext = {
  role: AppRole;
  userId: string;
};

type SessionUser = {
  id: string;
  role?: string;
  isActive?: boolean;
};

function normalizeRole(role: string | undefined): AppRole {
  if (role === "admin" || role === "manager" || role === "member") {
    return role;
  }
  return "member";
}

export async function getActiveSession(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const sessionUser = session.user as SessionUser;
  if (sessionUser.isActive === false) {
    return null;
  }

  return session;
}

export function getActorContext(user: SessionUser): ActorContext {
  return {
    role: normalizeRole(user.role),
    userId: user.id,
  };
}

export async function getDirectReportIds(managerId: string): Promise<string[]> {
  const reports = await db.query.user.findMany({
    where: eq(user.managerId, managerId),
    columns: { id: true },
  });

  return reports.map((report) => report.id);
}

export async function isDirectReport(
  managerId: string,
  targetUserId: string,
): Promise<boolean> {
  const targetUser = await db.query.user.findFirst({
    where: eq(user.id, targetUserId),
    columns: { managerId: true },
  });

  return targetUser?.managerId === managerId;
}

export async function getAccessibleProjectIds(
  actor: ActorContext,
): Promise<string[] | null> {
  if (actor.role === "admin") {
    return null;
  }

  const [memberships, managedProjects] = await Promise.all([
    db.query.projectMember.findMany({
      where: eq(projectMember.userId, actor.userId),
      columns: { projectId: true },
    }),
    actor.role === "manager"
      ? db.query.project.findMany({
          where: eq(project.managerId, actor.userId),
          columns: { id: true },
        })
      : Promise.resolve([]),
  ]);

  return [...new Set([...memberships.map((item) => item.projectId), ...managedProjects.map((item) => item.id)])];
}

export async function canAccessProject(
  actor: ActorContext,
  projectId: string,
): Promise<boolean> {
  if (actor.role === "admin") {
    return true;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(actor);
  return accessibleProjectIds?.includes(projectId) ?? false;
}

export async function canManageProject(
  actor: ActorContext,
  projectId: string,
): Promise<boolean> {
  if (actor.role === "admin") {
    return true;
  }

  if (actor.role !== "manager") {
    return false;
  }

  const managedProject = await db.query.project.findFirst({
    where: and(eq(project.id, projectId), eq(project.managerId, actor.userId)),
    columns: { id: true },
  });

  return !!managedProject;
}

export async function canManageUser(
  actor: ActorContext,
  targetUserId: string,
): Promise<boolean> {
  if (actor.role === "admin") {
    return true;
  }

  if (actor.role !== "manager") {
    return actor.userId === targetUserId;
  }

  return isDirectReport(actor.userId, targetUserId);
}

export async function ensureManagerAssignableUsers(
  actor: ActorContext,
  userIds: string[],
): Promise<boolean> {
  if (actor.role === "admin") {
    return true;
  }

  if (actor.role !== "manager") {
    return false;
  }

  const allowedIds = new Set([actor.userId, ...(await getDirectReportIds(actor.userId))]);
  return userIds.every((userId) => allowedIds.has(userId));
}

export async function getScopedUserIds(actor: ActorContext): Promise<string[] | null> {
  if (actor.role === "admin") {
    return null;
  }

  if (actor.role === "manager") {
    return getDirectReportIds(actor.userId);
  }

  return [actor.userId];
}

export async function buildScopedProjectWhere(actor: ActorContext) {
  const accessibleProjectIds = await getAccessibleProjectIds(actor);
  if (accessibleProjectIds === null) {
    return undefined;
  }

  if (accessibleProjectIds.length === 0) {
    return inArray(project.id, ["__no_project__"]);
  }

  return inArray(project.id, accessibleProjectIds);
}

export async function buildScopedUserWhere(actor: ActorContext) {
  if (actor.role === "admin") {
    return undefined;
  }

  if (actor.role === "manager") {
    return eq(user.managerId, actor.userId);
  }

  return eq(user.id, actor.userId);
}

export async function getScopedProjectIdsForUser(actor: ActorContext) {
  const ids = await getAccessibleProjectIds(actor);
  return ids ?? [];
}

export async function getManagedProjectIds(actor: ActorContext): Promise<string[] | null> {
  if (actor.role === "admin") {
    return null;
  }

  if (actor.role !== "manager") {
    return [];
  }

  const projects = await db.query.project.findMany({
    where: eq(project.managerId, actor.userId),
    columns: { id: true },
  });

  return projects.map((item) => item.id);
}
