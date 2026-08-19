import type { AppRole } from "@/lib/access-control";
import type { OperatorActionKind, ToolSpec } from "@/lib/ai/types";
import { OPERATOR_TOOLS } from "./operator-tools";
import { READ_TOOLS } from "./read-tools";
import { type AnyAgentTool, toToolSpec } from "./types";
import { WRITE_TOOLS } from "./write-tools";

const ALL_TOOLS: AnyAgentTool[] = [
  ...READ_TOOLS,
  ...WRITE_TOOLS,
  ...OPERATOR_TOOLS,
];

export interface ToolFilter {
  /**
   * Action kinds the user switched off in the operator settings. Tools that
   * propose them are hidden from the model entirely, so it never offers what
   * the user forbade.
   */
  disabledKinds?: OperatorActionKind[];
}

function isAvailable(
  tool: AnyAgentTool,
  role: AppRole,
  filter?: ToolFilter,
): boolean {
  if (tool.roles && !tool.roles.includes(role)) return false;

  if (tool.actionKind && filter?.disabledKinds?.includes(tool.actionKind)) {
    return false;
  }

  return true;
}

/** Tools the given role is allowed to invoke. */
export function getToolsForRole(
  role: AppRole,
  filter?: ToolFilter,
): AnyAgentTool[] {
  return ALL_TOOLS.filter((tool) => isAvailable(tool, role, filter));
}

export function getToolSpecsForRole(
  role: AppRole,
  filter?: ToolFilter,
): ToolSpec[] {
  return getToolsForRole(role, filter).map(toToolSpec);
}

export function findTool(
  role: AppRole,
  name: string,
  filter?: ToolFilter,
): AnyAgentTool | undefined {
  return getToolsForRole(role, filter).find((tool) => tool.name === name);
}

export { ALL_TOOLS };
