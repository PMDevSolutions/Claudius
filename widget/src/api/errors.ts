/**
 * Error thrown by {@link ChatApiClient} when a chat request ultimately fails:
 * either after exhausting retries, or immediately for a non-retryable status.
 */
export class ChatApiError extends Error {
  /**
   * Create a {@link ChatApiError}.
   *
   * @param message - Human-readable error message.
   * @param status - HTTP status code, or `0` for network and timeout failures.
   * @param code - Optional machine-readable error code (e.g. `"TIMEOUT"`, `"NETWORK_ERROR"`).
   * @param retryAfter - Seconds to wait before retrying, from the `Retry-After` header.
   */
  constructor(
    message: string,
    /** HTTP status code, or `0` for network and timeout failures. */
    public readonly status: number,
    /** Machine-readable error code, when available (e.g. `"TIMEOUT"`). */
    public readonly code?: string,
    /** Seconds to wait before retrying, parsed from the `Retry-After` header. */
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

/**
 * Error thrown by {@link ChatApiClient.sendMessage} when a send is rejected
 * for arriving within the configured debounce window.
 */
export class DebounceError extends Error {
  /** Creates a `DebounceError` with a fixed message. */
  constructor() {
    super("Request debounced");
    this.name = "DebounceError";
  }
}
