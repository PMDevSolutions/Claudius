import type { ClaudiusTool, ToolContext, ToolInputSchema } from "./types";

/** Anthropic tool definition shape (the `tools` request parameter). */
export interface AnthropicToolParam {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

/** Outcome of executing one tool call. */
export interface ToolExecution {
  /** Serialized result content fed back to the model as the tool_result. */
  content: string;
  /** True when the handler threw or the tool was unknown. */
  isError: boolean;
}

const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

// Cap what one tool call can feed back into the context window.
const MAX_RESULT_LENGTH = 8000;

/**
 * Validates a tool registry (unique, well-formed names) and converts it to
 * the Anthropic `tools` request parameter. Throws on registration mistakes —
 * call it at startup so a bad registry fails the deploy, not a chat.
 */
export function toAnthropicTools(
  tools: readonly ClaudiusTool[]
): AnthropicToolParam[] {
  const seen = new Set<string>();
  return tools.map((tool) => {
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      throw new Error(
        `Invalid tool name "${tool.name}": use letters, digits, _ or - (max 64 chars)`
      );
    }
    if (seen.has(tool.name)) {
      throw new Error(`Duplicate tool name "${tool.name}"`);
    }
    seen.add(tool.name);
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    };
  });
}

/**
 * Runs the named tool and serializes its outcome for a `tool_result` block.
 * Never throws: unknown tools and handler failures come back as `isError`
 * results so the model can recover (apologize, retry, ask the user).
 */
export async function executeTool(
  tools: readonly ClaudiusTool[],
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { content: `Unknown tool: ${name}`, isError: true };
  }

  try {
    const result = await tool.handler(input, ctx);
    return { content: serializeResult(result), isError: false };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tool execution failed";
    return { content: `Tool "${name}" failed: ${message}`, isError: true };
  }
}

function serializeResult(result: unknown): string {
  let content: string;
  if (typeof result === "string") {
    content = result;
  } else if (result === undefined || result === null) {
    content = "ok";
  } else {
    try {
      content = JSON.stringify(result);
    } catch {
      content = String(result);
    }
  }
  return content.length > MAX_RESULT_LENGTH
    ? `${content.slice(0, MAX_RESULT_LENGTH)}… [truncated]`
    : content;
}
