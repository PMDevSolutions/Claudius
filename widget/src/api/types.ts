/**
 * A cited source the assistant referenced when answering. Rendered as a link
 * in the chat and grouped in the sources sidebar.
 */
export interface Source {
  /** Absolute URL of the source. */
  url: string;
  /** Human-readable link title shown to the user. */
  title: string;
  /** Origin category, used to group and label the source. */
  type: "blog" | "page" | "external";
}

/**
 * One tool call the assistant made while producing a reply. Rendered as a
 * compact "used tool" affordance with an optional details disclosure.
 */
export interface ToolUse {
  /** Tool name (e.g. `"get_current_time"`). */
  name: string;
  /** Input the model supplied to the tool. */
  input?: Record<string, unknown>;
  /** Serialized tool result, as the model saw it. */
  result?: string;
  /** Present when the tool call failed. */
  isError?: boolean;
}

/**
 * A single chat message exchanged between the user and the assistant.
 */
export interface ChatMessage {
  /** Stable unique identifier, used as the React list key. */
  id: string;
  /** Who authored the message. */
  role: "user" | "assistant";
  /** Plain-text message body. */
  content: string;
  /** Sources cited by the assistant for this message, when any. */
  sources?: Source[];
  /** Tools the assistant called while producing this message, when any. */
  toolUses?: ToolUse[];
}

/**
 * Request payload sent to the Worker `POST /api/chat` endpoint.
 */
export interface ChatRequest {
  /** The full conversation so far, oldest message first. */
  messages: ChatMessage[];
}

/**
 * Successful response body from `POST /api/chat`.
 */
export interface ChatResponse {
  /** The assistant's reply text. */
  reply: string;
  /** Sources the assistant cited, when any. */
  sources?: Source[];
  /** Tools the assistant called while producing the reply, when any. */
  toolUses?: ToolUse[];
}

/**
 * Options for {@link ChatApiClient.streamMessage}.
 */
export interface ChatStreamOptions {
  /**
   * Called once per streamed text delta, as tokens arrive.
   *
   * @param text - The incremental text of this chunk.
   * @param fullText - The full reply accumulated so far, including this chunk.
   */
  onChunk?: (text: string, fullText: string) => void;
  /**
   * Called when the assistant finishes a tool call mid-stream, so the UI can
   * show a "used tool" affordance before the reply completes.
   */
  onToolUse?: (toolUse: ToolUse, allToolUses: ToolUse[]) => void;
  /**
   * Cancels the stream when aborted. Cancellation is not an error: the
   * promise resolves with the partial reply and `aborted: true`.
   */
  signal?: AbortSignal;
}

/**
 * Result of a completed or cancelled streaming chat request.
 */
export interface ChatStreamResult extends ChatResponse {
  /** `true` when the caller cancelled the stream before it finished. */
  aborted?: boolean;
}

/**
 * Error response body returned by the Worker when a chat request fails.
 */
export interface ChatErrorResponse {
  /** Human-readable error message. */
  error: string;
  /** Optional machine-readable error code (e.g. `"RATE_LIMITED"`). */
  code?: string;
}
