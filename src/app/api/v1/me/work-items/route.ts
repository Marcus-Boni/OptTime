import { requireAgentScope } from "@/lib/mcp/auth";
import { AgentError } from "@/lib/mcp/errors";
import { agentOptions, searchParamsOf, withAgentAuth } from "@/lib/mcp/http";
import { searchWorkItems } from "@/lib/mcp/service";

/**
 * GET /api/v1/me/work-items?q=&projectId=&limit=
 * Azure DevOps work-item search scoped to the user's projects.
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/work-items",
  async (principal, req) => {
    requireAgentScope(principal, "time:read");

    const params = searchParamsOf(req);
    const query = params.get("q") ?? params.get("query");

    if (!query?.trim()) {
      throw new AgentError(
        "VALIDATION_ERROR",
        "Informe o parâmetro 'q' com o ID (#123) ou parte do título.",
      );
    }

    const limit = Number.parseInt(params.get("limit") ?? "", 10);

    return searchWorkItems(principal, {
      query,
      projectRef: params.get("projectId"),
      limit: Number.isFinite(limit) ? limit : null,
    });
  },
);
