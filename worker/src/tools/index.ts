import type { ClaudiusTool } from "./types";
import { getCurrentTime } from "./reference";

export type {
  ClaudiusTool,
  ToolContext,
  ToolInputSchema,
  ToolUseSummary,
} from "./types";
export {
  toAnthropicTools,
  executeTool,
  type AnthropicToolParam,
  type ToolExecution,
} from "./registry";
export { getCurrentTime, searchKnowledgeBase, submitLead } from "./reference";

/**
 * Tools registered at startup and advertised to the model on every chat
 * request — the tool-use equivalent of `serverPlugins`. The Worker runs the
 * tool_use / tool_result round trip transparently; the widget shows a
 * "used tool" affordance for each call.
 *
 * `getCurrentTime` ships enabled as a working example. Wire up the
 * `searchKnowledgeBase` / `submitLead` stubs (see worker/src/tools/reference.ts
 * and the "Tool use" docs page) before registering them:
 *
 *   import { searchKnowledgeBase, submitLead } from "./reference";
 *   export const chatTools: ClaudiusTool[] = [
 *     getCurrentTime,
 *     searchKnowledgeBase,
 *     submitLead,
 *   ];
 */
export const chatTools: ClaudiusTool[] = [getCurrentTime];
