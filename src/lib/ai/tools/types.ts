import type { z } from "zod";
import type { ActorContext, AppRole } from "@/lib/access-control";
import type {
  AgentUserContext,
  AssistantCard,
  JsonSchemaObject,
  OperatorActionKind,
  OperatorStepAction,
  ToolSpec,
} from "@/lib/ai/types";

/** Runtime services handed to a tool during execution. */
export interface ToolContext {
  user: AgentUserContext;
  actor: ActorContext;
  /** Streams a rich UI card to the client alongside the model text. */
  emitCard: (card: AssistantCard) => void;
  /**
   * Proposes an action (write confirmation or navigation). A tool always
   * proposes a single action — the agent groups them into a plan when a turn
   * produces more than one.
   */
  emitAction: (action: OperatorStepAction) => void;
}

export interface ToolExecutionResult {
  /** Compact JSON fed back into the model. Keep it small and factual. */
  data: unknown;
  /** Overrides the transcript label once the tool has finished. */
  label?: string;
}

export interface AgentTool<TArgs> {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
  schema: z.ZodType<TArgs>;
  /** Roles allowed to call the tool. Omit to allow every role. */
  roles?: AppRole[];
  /**
   * Action this tool proposes, when it proposes one. Lets the registry hide
   * tools whose action the user switched off in the operator settings.
   */
  actionKind?: OperatorActionKind;
  /** Label shown in the UI while the tool runs. */
  label: (args: TArgs) => string;
  execute: (args: TArgs, ctx: ToolContext) => Promise<ToolExecutionResult>;
}

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous tool args in a single registry
export type AnyAgentTool = AgentTool<any>;

export function toToolSpec(tool: AnyAgentTool): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}
