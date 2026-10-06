/**
 * Writes behind the card buttons: confirm a proposal and undo it.
 *
 * Both run through the MCP service layer, so a click in Teams obeys exactly
 * the same rules as the app — project access, locked weeks, Azure DevOps
 * sync. The `teams_bot_action` ledger makes "Registrar" idempotent: the
 * proposal id is claimed before the entry is written, so a double click or a
 * retried invoke resolves to the entry that already exists.
 */

import { and, eq } from "drizzle-orm";
import { parseDurationText } from "@/lib/ai/duration";
import { db } from "@/lib/db";
import { teamsBotAction } from "@/lib/db/schema";
import type { AgentPrincipal } from "@/lib/mcp/auth";
import { AgentError } from "@/lib/mcp/errors";
import { deleteTimeEntry, logTime } from "@/lib/mcp/service/entries";
import type { TimeDraft } from "@/lib/teams/bot/intent";
import { validateDraftDate } from "@/lib/teams/bot/intent";
import { formatDuration } from "@/lib/utils";

/** Card inputs as Teams posts them back — every value arrives as a string. */
export interface ProposalInputs {
  projectId?: unknown;
  duration?: unknown;
  date?: unknown;
  description?: unknown;
  billable?: unknown;
  workItemId?: unknown;
}

export interface LoggedEntry {
  entryId: string;
  projectLabel: string;
  date: string;
  durationMinutes: number;
  description: string;
  dayTotalLabel: string;
}

export type ConfirmResult =
  | { status: "logged"; entry: LoggedEntry }
  | { status: "duplicate" }
  | { status: "invalid"; error: string; draft: TimeDraft };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Reads the submitted card back into a draft, so errors re-render it. */
export function readInputs(inputs: ProposalInputs, today: string): TimeDraft {
  const workItem = Number(asString(inputs.workItemId) || Number.NaN);

  return {
    durationMinutes: parseDurationText(asString(inputs.duration)),
    date: asString(inputs.date) || today,
    description: asString(inputs.description).slice(0, 500),
    projectId: asString(inputs.projectId) || null,
    projectGuessed: false,
    azureWorkItemId:
      Number.isInteger(workItem) && workItem > 0 ? workItem : null,
    source: "rules",
  };
}

function validate(draft: TimeDraft, today: string): string | null {
  if (!draft.projectId) return "Escolha o projeto.";
  if (!draft.durationMinutes) {
    return "Não entendi a duração. Use algo como 1h, 1h30 ou 45min.";
  }
  if (!draft.description) return "A descrição é obrigatória.";
  return validateDraftDate(draft.date, today);
}

export async function confirmProposal(
  principal: AgentPrincipal,
  proposalId: string,
  inputs: ProposalInputs,
  today: string,
): Promise<ConfirmResult> {
  const draft = readInputs(inputs, today);
  const error = validate(draft, today);
  if (error) return { status: "invalid", error, draft };

  const [claimed] = await db
    .insert(teamsBotAction)
    .values({ id: proposalId, userId: principal.userId, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: teamsBotAction.id });

  if (!claimed) return { status: "duplicate" };

  try {
    const billable = asString(inputs.billable);
    const result = await logTime(principal, {
      project: draft.projectId ?? "",
      durationMinutes: draft.durationMinutes ?? 0,
      description: draft.description,
      date: draft.date,
      billable: billable ? billable === "true" : null,
      azureWorkItemId: draft.azureWorkItemId,
    });

    await db
      .update(teamsBotAction)
      .set({ status: "logged", entryId: result.entry.id })
      .where(eq(teamsBotAction.id, proposalId));

    return {
      status: "logged",
      entry: {
        entryId: result.entry.id,
        projectLabel: `${result.entry.project.code} · ${result.entry.project.name}`,
        date: result.entry.date,
        durationMinutes: result.entry.durationMinutes,
        description: result.entry.description,
        dayTotalLabel: result.dayTotalLabel,
      },
    };
  } catch (caught: unknown) {
    // Release the claim so the person can fix the card and try again.
    await db.delete(teamsBotAction).where(eq(teamsBotAction.id, proposalId));

    if (caught instanceof AgentError) {
      return { status: "invalid", error: caught.message, draft };
    }
    throw caught;
  }
}

export type UndoResult =
  | { status: "undone"; summary: string }
  | { status: "error"; message: string };

export async function undoProposal(
  principal: AgentPrincipal,
  proposalId: string,
): Promise<UndoResult> {
  const row = await db.query.teamsBotAction.findFirst({
    where: and(
      eq(teamsBotAction.id, proposalId),
      eq(teamsBotAction.userId, principal.userId),
    ),
  });

  if (!row?.entryId) {
    return { status: "error", message: "Lançamento não encontrado." };
  }
  if (row.status === "undone") {
    return {
      status: "undone",
      summary: "Este lançamento já tinha sido desfeito.",
    };
  }

  try {
    const removed = await deleteTimeEntry(principal, row.entryId);
    await db
      .update(teamsBotAction)
      .set({ status: "undone" })
      .where(eq(teamsBotAction.id, proposalId));

    return {
      status: "undone",
      summary: `${formatDuration(removed.durationMinutes)} removidas de ${removed.date.split("-").reverse().join("/")}.`,
    };
  } catch (caught: unknown) {
    if (caught instanceof AgentError) {
      return { status: "error", message: caught.message };
    }
    throw caught;
  }
}
