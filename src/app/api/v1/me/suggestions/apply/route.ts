import { requireAgentScope } from "@/lib/mcp/auth";
import { resolveEntryDate } from "@/lib/mcp/format";
import { agentOptions, readJsonBody, withAgentAuth } from "@/lib/mcp/http";
import { parseIdempotencyKey } from "@/lib/mcp/idempotency";
import { applySuggestions } from "@/lib/mcp/service";

/**
 * POST /api/v1/me/suggestions/apply
 * Creates the reviewed suggestions as time entries in one transaction. Repeating
 * a call with the same `idempotencyKey` returns the first result and writes
 * nothing. Mirror of the `opt_time_apply_suggestions` MCP tool.
 *
 * Body: { date, idempotencyKey, items: [{ suggestionId, projectId?,
 * durationMinutes?, description?, billable? }], rejectedSuggestionIds?: [] }
 */
export const OPTIONS = agentOptions;

export const POST = withAgentAuth(
  "POST /api/v1/me/suggestions/apply",
  async (principal, req) => {
    requireAgentScope(principal, "time:write");

    const body = await readJsonBody(req);

    return applySuggestions(principal, {
      date: resolveEntryDate(body.date),
      idempotencyKey: parseIdempotencyKey(body.idempotencyKey),
      items: Array.isArray(body.items) ? body.items : [],
      rejectedSuggestionIds: Array.isArray(body.rejectedSuggestionIds)
        ? body.rejectedSuggestionIds
        : [],
    });
  },
  { status: 201 },
);
