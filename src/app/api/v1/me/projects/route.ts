import { requireAgentScope } from "@/lib/mcp/auth";
import { agentOptions, searchParamsOf, withAgentAuth } from "@/lib/mcp/http";
import { listProjects } from "@/lib/mcp/service";

/**
 * GET /api/v1/me/projects?search=&status=&limit=
 * Projects the token holder may log time against.
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/projects",
  async (principal, req) => {
    requireAgentScope(principal, "time:read");

    const params = searchParamsOf(req);
    const status = params.get("status");
    const limit = Number.parseInt(params.get("limit") ?? "", 10);

    const result = await listProjects(principal, {
      search: params.get("search"),
      status:
        status === "active" || status === "open" || status === "all"
          ? status
          : null,
      limit: Number.isFinite(limit) ? limit : null,
    });

    return { ...result, count: result.returned };
  },
);
