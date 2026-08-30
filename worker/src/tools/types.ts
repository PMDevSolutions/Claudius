/**
 * Context passed to every tool handler invocation.
 */
export interface ToolContext {
  /**
   * The Worker environment (bindings, vars, secrets). Typed loosely so the
   * tools module doesn't depend on the route layer; handlers narrow it to
   * what they need.
   */
  env?: Record<string, unknown>;
  /** Conversation id from the chat request, when the widget sent one. */
  conversationId?: string;
}

/**
 * JSON Schema for a tool's input. Anthropic requires the top level to be an
 * object schema.
 */
export interface ToolInputSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * A declarative tool the model may call during a chat turn.
 *
 * Register tools in `worker/src/tools/index.ts`; the Worker advertises them
 * to the Anthropic API and runs `handler` for each `tool_use` block, feeding
 * the result back to the model transparently (the widget only sees the final
 * reply plus a summary of which tools ran).
 */
export interface ClaudiusTool<TInput = Record<string, unknown>> {
  /** Unique tool name (letters, digits, `_`/`-`; max 64 chars). */
  name: string;
  /**
   * What the tool does and when to use it. The model relies on this to
   * decide when to call the tool — be specific.
   */
  description: string;
  /** JSON Schema for the tool's input (sent as Anthropic `input_schema`). */
  inputSchema: ToolInputSchema;
  /**
   * Executes the tool. The return value is serialized as the tool result:
   * strings pass through, anything else is JSON-stringified. A thrown error
   * becomes an `is_error` tool result (its message is shown to the model, so
   * throw messages you'd be comfortable surfacing).
   */
  handler: (input: TInput, ctx: ToolContext) => Promise<unknown> | unknown;
}

/**
 * Summary of one executed tool call, returned to the widget alongside the
 * reply so it can render a "used tool" affordance. Everything here is
 * user-visible; don't put secrets in tool results.
 */
export interface ToolUseSummary {
  /** Tool name. */
  name: string;
  /** Input the model supplied. */
  input?: Record<string, unknown>;
  /** Serialized tool result (capped), as the model saw it. */
  result?: string;
  /** Present when the tool failed and the model saw an error result. */
  isError?: boolean;
}
