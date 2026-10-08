/**
 * Service layer shared by the agent REST API (`/api/v1/me/*`) and the hosted
 * MCP endpoint (`/api/mcp`). Everything here is transport-agnostic: it takes an
 * authenticated principal plus plain input, and throws `AgentError` on failure.
 */

export * from "./agenda";
export * from "./apply-suggestions";
export * from "./day-context";
export * from "./entries";
export * from "./identity";
export * from "./microsoft";
export * from "./projects";
export * from "./suggestions";
export * from "./timer";
export * from "./timesheets";
export * from "./work-items";
