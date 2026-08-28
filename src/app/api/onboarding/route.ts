import { getActiveSession, getActorContext } from "@/lib/access-control";
import {
  applyOnboardingAction,
  getOnboardingOverview,
} from "@/lib/onboarding/state";
import type { OnboardingAction } from "@/lib/onboarding/types";
import { onboardingActionSchema } from "@/lib/validations/onboarding.schema";

/** GET - the full onboarding picture for the signed-in user. */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

  try {
    const overview = await getOnboardingOverview(actor.userId, actor.role);
    return Response.json(overview);
  } catch (error: unknown) {
    console.error("[GET /api/onboarding]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PATCH - applies one onboarding action and returns the refreshed overview. */
export async function PATCH(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  const body = await req.json().catch(() => null);
  const parsed = onboardingActionSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Ação inválida.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await applyOnboardingAction(
      actor.userId,
      actor.role,
      parsed.data as OnboardingAction,
    );

    const overview = await getOnboardingOverview(actor.userId, actor.role);
    return Response.json(overview);
  } catch (error: unknown) {
    console.error("[PATCH /api/onboarding]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
