import { requireAgentScope } from "@/lib/mcp/auth";
import { AgentError } from "@/lib/mcp/errors";
import {
  agentOptions,
  booleanParam,
  searchParamsOf,
  withAgentAuth,
} from "@/lib/mcp/http";
import { listMyWorkItems } from "@/lib/mcp/service";

/**
 * GET /api/v1/me/work-items/assigned?includeClosed=&top=
 * Azure DevOps work items assigned to the token owner. Mirror of the
 * `opt_time_list_my_work_items` MCP tool.
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/work-items/assigned",
  async (principal, req) => {
    requireAgentScope(principal, "time:read");

    const params = searchParamsOf(req);
    const rawTop = params.get("top");
    const top = rawTop === null || rawTop === "" ? 50 : Number(rawTop);

    if (!Number.isInteger(top) || top < 1 || top > 100) {
      throw new AgentError(
        "VALIDATION_ERROR",
        "'top' deve ser um inteiro entre 1 e 100.",
      );
    }

    return listMyWorkItems(principal, {
      includeClosed: booleanParam(params, "includeClosed"),
      top,
    });
  },
);
