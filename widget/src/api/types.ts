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
