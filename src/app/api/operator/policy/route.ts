import { eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import {
  canEverAutoRun,
  isActionAllowedForRole,
  OPERATOR_ACTION_LIST,
  toOperatorSettings,
} from "@/lib/ai/operator/policy";
import type { OperatorPermission } from "@/lib/ai/operator/types";
import type { ConfirmableActionKind } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { updateOperatorPolicySchema } from "@/lib/validations/operator.schema";

const POLICY_COLUMNS = {
  operatorMode: true,
  operatorPolicies: true,
  operatorVoiceEnabled: true,
  operatorVoiceLocale: true,
  operatorSpeakReplies: true,
} as const;

/**
 * GET - Operator settings plus the catalogue of actions available to this role,
 * so the settings screen and the plan runner agree on what may auto-run.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = getActorContext(session.user);

    const row = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: POLICY_COLUMNS,
    });

    const settings = toOperatorSettings(row ?? {});

    const actions = OPERATOR_ACTION_LIST.filter((meta) =>
      isActionAllowedForRole(meta.kind, actor.role),
    ).map((meta) => ({
      kind: meta.kind,
      label: meta.label,
      description: meta.description,
      risk: meta.risk,
      reversible: meta.reversible,
      outward: meta.outward,
      /** False means the "executar direto" option is not offered at all. */
      canAutoRun: canEverAutoRun(meta.kind),
    }));

    return Response.json({ settings, actions, role: actor.role });
  } catch (error) {
    console.error("[GET /api/operator/policy]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PATCH - Updates the operator autonomy settings for the current user. */
export async function PATCH(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateOperatorPolicySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  try {
    const actor = getActorContext(session.user);
    const { mode, overrides, voiceEnabled, voiceLocale, speakReplies } =
      parsed.data;

    const updates: Partial<{
      operatorMode: string;
      operatorPolicies: string | null;
      operatorVoiceEnabled: boolean;
      operatorVoiceLocale: string;
      operatorSpeakReplies: boolean;
    }> = {};

    if (mode) updates.operatorMode = mode;
    if (typeof voiceEnabled === "boolean") {
      updates.operatorVoiceEnabled = voiceEnabled;
    }
    if (voiceLocale) updates.operatorVoiceLocale = voiceLocale;
    if (typeof speakReplies === "boolean") {
      updates.operatorSpeakReplies = speakReplies;
    }

    if (overrides) {
      const sanitized: Partial<
        Record<ConfirmableActionKind, OperatorPermission>
      > = {};

      for (const [rawKind, permission] of Object.entries(overrides)) {
        const kind = rawKind as ConfirmableActionKind;

        if (!isActionAllowedForRole(kind, actor.role)) continue;

        // "auto" on an action that can never auto-run would be a silent lie in
        // the UI, so it is stored as an explicit "ask".
        if (permission === "auto" && !canEverAutoRun(kind)) {
          sanitized[kind] = "ask";
          continue;
        }

        sanitized[kind] = permission;
      }

      updates.operatorPolicies =
        Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : null;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const [updated] = await db
      .update(user)
      .set(updates)
      .where(eq(user.id, session.user.id))
      .returning({
        operatorMode: user.operatorMode,
        operatorPolicies: user.operatorPolicies,
        operatorVoiceEnabled: user.operatorVoiceEnabled,
        operatorVoiceLocale: user.operatorVoiceLocale,
        operatorSpeakReplies: user.operatorSpeakReplies,
      });

    if (!updated) {
      return Response.json(
        { error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    return Response.json({ settings: toOperatorSettings(updated) });
  } catch (error) {
    console.error("[PATCH /api/operator/policy]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
