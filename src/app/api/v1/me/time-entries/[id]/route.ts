import { requireAgentScope } from "@/lib/mcp/auth";
import { parseDurationMinutes, resolveEntryDate } from "@/lib/mcp/format";
import { agentOptions, readJsonBody, withAgentAuth } from "@/lib/mcp/http";
import { deleteTimeEntry, updateTimeEntry } from "@/lib/mcp/service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 *   PATCH  /api/v1/me/time-entries/:id  → partial update
 *   DELETE /api/v1/me/time-entries/:id  → soft delete
 *
 * Both refuse entries inside a submitted or approved week.
 */
export const OPTIONS = agentOptions;

export const PATCH = withAgentAuth<RouteContext>(
  "PATCH /api/v1/me/time-entries/:id",
  async (principal, req, context) => {
    requireAgentScope(principal, "time:write");

    const { id } = await context.params;
    const body = await readJsonBody(req);

    const entry = await updateTimeEntry(principal, {
      entryId: id,
      project:
        typeof body.projectId === "string"
          ? body.projectId
          : typeof body.project === "string"
            ? body.project
            : null,
      durationMinutes:
        body.durationMinutes != null || body.duration != null
          ? parseDurationMinutes(body.durationMinutes ?? body.duration)
          : null,
      description:
        typeof body.description === "string" ? body.description : null,
      date: body.date ? resolveEntryDate(body.date) : null,
      billable: typeof body.billable === "boolean" ? body.billable : null,
      azureWorkItemId:
        "azureWorkItemId" in body
          ? typeof body.azureWorkItemId === "number"
            ? body.azureWorkItemId
            : null
          : undefined,
    });

    return { entry };
  },
);

export const DELETE = withAgentAuth<RouteContext>(
  "DELETE /api/v1/me/time-entries/:id",
  async (principal, _req, context) => {
    requireAgentScope(principal, "time:write");

    const { id } = await context.params;
    return deleteTimeEntry(principal, id);
  },
);
