import { and, desc, inArray } from "drizzle-orm";
import {
  canManageProject,
  getActiveSession,
  getActorContext,
  getManagedProjectIds,
} from "@/lib/access-control";
import { getServerAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { portalLink, project } from "@/lib/db/schema";
import { generatePortalToken, hashPortalPassword } from "@/lib/portal/tokens";
import { createPortalLinkSchema } from "@/lib/validations/hq.schema";
import type { PortalLinkSummary } from "@/types/hq";

type PortalLinkWithRelations = typeof portalLink.$inferSelect & {
  project: {
    id: string;
    name: string;
    code: string;
    color: string;
  } | null;
  createdBy: { name: string } | null;
};

function toSummary(row: PortalLinkWithRelations): PortalLinkSummary {
  const now = Date.now();
  const status = row.revokedAt
    ? "revoked"
    : row.expiresAt && row.expiresAt.getTime() < now
      ? "expired"
      : "active";

  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project?.name ?? "Projeto",
    projectCode: row.project?.code ?? "",
    projectColor: row.project?.color ?? "#6366f1",
    label: row.label,
    url: `${getServerAppUrl()}/portal/${row.token}`,
    hasPassword: Boolean(row.passwordHash),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    showBudget: row.showBudget,
    showTeam: row.showTeam,
    showDescriptions: row.showDescriptions,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy?.name ?? "—",
    status,
  };
}

/** GET - Portal links the actor can manage (admin: all). */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const managedProjectIds = await getManagedProjectIds(actor);

    if (managedProjectIds !== null && managedProjectIds.length === 0) {
      return Response.json({ links: [], manageableProjects: [] });
    }

    const [rows, manageableProjects] = await Promise.all([
      db.query.portalLink.findMany({
        where:
          managedProjectIds === null
            ? undefined
            : inArray(portalLink.projectId, managedProjectIds),
        with: {
          project: {
            columns: { id: true, name: true, code: true, color: true },
          },
          createdBy: { columns: { name: true } },
        },
        orderBy: [desc(portalLink.createdAt)],
      }) as Promise<PortalLinkWithRelations[]>,
      db.query.project.findMany({
        where:
          managedProjectIds === null
            ? inArray(project.status, ["open", "active"])
            : and(
                inArray(project.id, managedProjectIds),
                inArray(project.status, ["open", "active"]),
              ),
        columns: { id: true, name: true, code: true, color: true },
        orderBy: (fields, { asc }) => [asc(fields.name)],
      }),
    ]);

    return Response.json({ links: rows.map(toSummary), manageableProjects });
  } catch (error) {
    console.error("[GET /api/hq/portal-links]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST - Create a shareable portal link.
 *
 * The plaintext password is hashed immediately and never persisted; the full
 * URL is returned once so the manager can copy it alongside the password.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = createPortalLinkSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { projectId, label, password, expiresInDays, ...visibility } =
      parsed.data;

    if (!(await canManageProject(actor, projectId))) {
      return Response.json(
        { error: "Você só pode criar portais de projetos que gerencia." },
        { status: 403 },
      );
    }

    const expiresAt =
      expiresInDays != null
        ? new Date(Date.now() + expiresInDays * 86_400_000)
        : null;

    const [created] = await db
      .insert(portalLink)
      .values({
        id: crypto.randomUUID(),
        projectId,
        token: generatePortalToken(),
        label,
        passwordHash: password ? hashPortalPassword(password) : null,
        expiresAt,
        showBudget: visibility.showBudget,
        showTeam: visibility.showTeam,
        showDescriptions: visibility.showDescriptions,
        createdById: session.user.id,
      })
      .returning();

    if (!created) {
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }

    console.info("[portal_link_created]", {
      userId: session.user.id,
      projectId,
      hasPassword: Boolean(password),
      expiresAt: expiresAt?.toISOString() ?? null,
    });

    return Response.json(
      {
        link: {
          id: created.id,
          url: `${getServerAppUrl()}/portal/${created.token}`,
          hasPassword: Boolean(created.passwordHash),
          expiresAt: created.expiresAt?.toISOString() ?? null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/hq/portal-links]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
