import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { runAgent } from "@/lib/ai/agent";
import { normalizeTimeZone, resolveTodayInTimeZone } from "@/lib/ai/context";
import { toOperatorSettings } from "@/lib/ai/operator/policy";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import type { AgentEvent, AgentUserContext } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { chatRequestSchema } from "@/lib/validations/ai.schema";

/** Streaming keeps the request alive well past the default serverless budget. */
export const maxDuration = 60;

function encodeEvent(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * POST - Streams the TimeBot agent response as Server-Sent Events.
 * Each event is an `AgentEvent`: text deltas, tool activity, rich cards,
 * confirmable actions, follow-up suggestions and a terminating `done`.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(session.user.id);
  if (!limit.allowed) {
    return Response.json(
      {
        error: `Muitas mensagens em sequência. Aguarde ${limit.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  try {
    const body = await req.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Payload inválido", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { message, history, context } = parsed.data;
    const actor = getActorContext(session.user);

    const profile = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: {
        weeklyCapacity: true,
        name: true,
        email: true,
        operatorMode: true,
        operatorPolicies: true,
        operatorVoiceEnabled: true,
        operatorVoiceLocale: true,
        operatorSpeakReplies: true,
      },
    });

    const timeZone = normalizeTimeZone(
      context?.timeZone ?? req.headers.get("x-timezone"),
    );

    const operatorSettings = toOperatorSettings(profile ?? {});

    const agentUser: AgentUserContext = {
      userId: session.user.id,
      name: profile?.name || session.user.name || "Colaborador",
      email: profile?.email || session.user.email,
      role: actor.role,
      weeklyCapacityHours: profile?.weeklyCapacity ?? 40,
      timeZone,
      today: resolveTodayInTimeZone(timeZone),
      activePath: context?.activePath,
    };

    const encoder = new TextEncoder();
    const abortController = new AbortController();

    // Client disconnects (stop button, closed tab) must cancel provider calls.
    req.signal.addEventListener("abort", () => abortController.abort());

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of runAgent({
            message,
            history,
            user: agentUser,
            actor,
            settings: operatorSettings,
            signal: abortController.signal,
          })) {
            controller.enqueue(encoder.encode(encodeEvent(event)));
          }
        } catch (error: unknown) {
          console.error("[POST /api/ai/chat] stream:", error);
          controller.enqueue(
            encoder.encode(
              encodeEvent({
                type: "error",
                message: "Falha ao gerar a resposta do TimeBot.",
                retryable: true,
              }),
            ),
          );
          controller.enqueue(encoder.encode(encodeEvent({ type: "done" })));
        } finally {
          controller.close();
        }
      },
      cancel() {
        abortController.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[POST /api/ai/chat]:", error);
    return Response.json(
      { error: "Falha ao processar mensagem do TimeBot" },
      { status: 500 },
    );
  }
}
