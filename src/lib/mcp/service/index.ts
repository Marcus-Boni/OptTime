/**
 * Service layer shared by the agent REST API (`/api/v1/me/*`) and the hosted
 * MCP endpoint (`/api/mcp`). Everything here is transport-agnostic: it takes an
 * authenticated principal plus plain input, and throws `AgentError` on failure.
 */

export * from "./entries";
export * from "./projects";
export * from "./suggestions";
export * from "./timer";
export * from "./timesheets";
