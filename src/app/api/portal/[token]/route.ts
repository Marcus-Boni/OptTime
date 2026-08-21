import { cookies } from "next/headers";
import {
  buildPortalSnapshot,
  findPortalLinkByToken,
  registerPortalView,
  resolvePortalLinkState,
} from "@/lib/portal/data";
import {
  createPortalSessionJwt,
  PORTAL_SESSION_MAX_AGE_SECONDS,
  portalCookieName,
  verifyPortalPassword,
  verifyPortalSessionJwt,
} from "@/lib/portal/tokens";
import { portalPasswordSchema } from "@/lib/validations/hq.schema";

type RouteContext = { params: Promise<{ token: string }> };

/** Public endpoint — never cache, never index. */
export const dynamic = "force-dynamic";

// ─── Password attempt throttling (per link, in-process) ───────────────
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 10 * 60_000;
const attemptLog = new Map<string, number[]>();

function isThrottled(linkId: string): boolean {
  const now = Date.now();
  const attempts = (attemptLog.get(linkId) ?? []).filter(
    (timestamp) => now - timestamp < ATTEMPT_WINDOW_MS,
  );
  attemptLog.set(linkId, attempts);
  return attempts.length >= MAX_ATTEMPTS;
}

function registerAttempt(linkId: string): void {
  const attempts = attemptLog.get(linkId) ?? [];
  attempts.push(Date.now());
  attemptLog.set(linkId, attempts);
}

/**
 * GET - Sanitized project snapshot for the client portal.
 *
 * Password-protected links require the short-lived viewer cookie issued by
 * POST; everything else only needs the capability token in the URL.
 */
export async function GET(
  _req: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const { token } = await context.params;
    const link = await findPortalLinkByToken(token);
    const state = resolvePortalLinkState(link);

    if (state !== "ok" || !link) {
      return Response.json({ state }, { status: 404 });
    }

    if (link.passwordHash) {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(portalCookieName(link.id));
      const authorized = sessionCookie
        ? await verifyPortalSessionJwt(sessionCookie.value, link.id)
        : false;

      if (!authorized) {
        return Response.json({ state: "password_required" }, { status: 401 });
      }
    }

    const snapshot = await buildPortalSnapshot(link);
    if (!snapshot) {
      return Response.json({ state: "not_found" }, { status: 404 });
    }

    registerPortalView(link.id);

    return Response.json(
      { state: "ok", snapshot },
      { headers: { "X-Robots-Tag": "noindex, nofollow" } },
    );
  } catch (error) {
    console.error("[GET /api/portal/:token]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** POST - Exchange the link password for a 12h viewer session cookie. */
export async function POST(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const { token } = await context.params;
    const link = await findPortalLinkByToken(token);
    const state = resolvePortalLinkState(link);

    if (state !== "ok" || !link) {
      return Response.json({ state }, { status: 404 });
    }

    if (!link.passwordHash) {
      return Response.json({ state: "ok" });
    }

    if (isThrottled(link.id)) {
      return Response.json(
        {
          state: "invalid_password",
          error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const parsed = portalPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { state: "invalid_password", error: "Informe a senha de acesso." },
        { status: 400 },
      );
    }

    registerAttempt(link.id);

    if (!verifyPortalPassword(parsed.data.password, link.passwordHash)) {
      return Response.json(
        { state: "invalid_password", error: "Senha incorreta." },
        { status: 401 },
      );
    }

    const jwt = await createPortalSessionJwt(link.id);
    const cookieStore = await cookies();
    cookieStore.set(portalCookieName(link.id), jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: PORTAL_SESSION_MAX_AGE_SECONDS,
      path: "/",
    });

    return Response.json({ state: "ok" });
  } catch (error) {
    console.error("[POST /api/portal/:token]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
