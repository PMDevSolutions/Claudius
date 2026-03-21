export class ChatApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export class DebounceError extends Error {
  constructor() {
    super("Request debounced");
    this.name = "DebounceError";
  }
}
