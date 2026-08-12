import type { AppRole } from "@/lib/access-control";
import type { ToolSpec } from "@/lib/ai/types";
import { READ_TOOLS } from "./read-tools";
import { type AnyAgentTool, toToolSpec } from "./types";
import { WRITE_TOOLS } from "./write-tools";

const ALL_TOOLS: AnyAgentTool[] = [...READ_TOOLS, ...WRITE_TOOLS];

/** Tools the given role is allowed to invoke. */
export function getToolsForRole(role: AppRole): AnyAgentTool[] {
  return ALL_TOOLS.filter((tool) => !tool.roles || tool.roles.includes(role));
}

export function getToolSpecsForRole(role: AppRole): ToolSpec[] {
  return getToolsForRole(role).map(toToolSpec);
}

export function findTool(
  role: AppRole,
  name: string,
): AnyAgentTool | undefined {
  return getToolsForRole(role).find((tool) => tool.name === name);
}

export { ALL_TOOLS };
