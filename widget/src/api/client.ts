import type {
  ChatMessage,
  ChatResponse,
  ChatErrorResponse,
  ChatStreamOptions,
  ChatStreamResult,
  ToolUse,
} from "./types";
import { ChatApiError, DebounceError } from "./errors";

/**
 * Options for {@link ChatApiClient}.
 */
export interface ChatApiClientOptions {
  /**
   * Maximum retries after the first attempt, for retryable failures (HTTP
   * 429/503, network errors, timeouts).
   * @defaultValue `2`
   */
  maxRetries?: number;
  /**
   * Minimum gap between sends, in milliseconds. A send inside this window
   * rejects with {@link DebounceError}. Set to 0 to disable.
   * @defaultValue `300`
   */
  debounceMs?: number;
  /**
   * Per-attempt request timeout in milliseconds. Aborts the in-flight fetch
   * via `AbortController` and surfaces a retryable {@link ChatApiError} with
   * code `"TIMEOUT"`. Set to 0 to disable.
   * @defaultValue `30000`
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Typed client for the Claudius Worker chat API. Handles debouncing,
 * per-attempt timeouts, and automatic retries with backoff for transient
 * failures (HTTP 429/503, network errors, timeouts).
 *
 * @example
 * ```ts
 * const client = new ChatApiClient("https://api.example.com");
 * const { reply } = await client.sendMessage([
 *   { id: "1", role: "user", content: "Hello" },
 * ]);
 * ```
 */
export class ChatApiClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly debounceMs: number;
  private readonly timeoutMs: number;
  private lastSendTime = 0;

  /**
   * Create a chat client for the given Worker base URL.
   *
   * @param baseUrl - Base URL of the Worker. Requests post to `${baseUrl}/api/chat`.
   * @param options - Optional retry, debounce, and timeout settings.
   */
  constructor(baseUrl: string, options?: ChatApiClientOptions) {
    this.baseUrl = baseUrl;
    this.maxRetries = options?.maxRetries ?? 2;
    this.debounceMs = options?.debounceMs ?? 300;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Send the conversation to the chat endpoint and return the assistant's
   * reply, retrying transient failures with backoff up to
   * {@link ChatApiClientOptions.maxRetries} times.
   *
   * @param messages - The full conversation so far, oldest message first.
   * @returns The assistant's reply and any cited sources.
   * @throws {@link DebounceError} when called within the debounce window.
   * @throws {@link ChatApiError} when the request fails after all retries.
   */
  async sendMessage(messages: ChatMessage[]): Promise<ChatResponse> {
    if (
      this.debounceMs > 0 &&
      Date.now() - this.lastSendTime < this.debounceMs
    ) {
      throw new DebounceError();
    }

    this.lastSendTime = Date.now();

    let lastError: ChatApiError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(messages);

        if (response.ok) {
          return (await response.json()) as ChatResponse;
        }

        const body = (await response.json().catch(() => ({}))) as
          | ChatErrorResponse
          | Record<string, never>;
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfter = retryAfterHeader
          ? Number(retryAfterHeader)
          : undefined;

        lastError = new ChatApiError(
          body.error ?? `Request failed with status ${response.status}`,
          response.status,
          body.code,
          retryAfter,
        );

        if (!this.isRetryable(response.status)) {
          throw lastError;
        }

        if (attempt < this.maxRetries) {
          const delayMs = this.getRetryDelay(response, attempt);
          await this.delay(delayMs);
        }
      } catch (error) {
        if (error instanceof ChatApiError) {
          if (!this.isRetryable(error.status, error.code)) {
            throw error;
          }
          lastError = error;
          if (attempt < this.maxRetries) {
            const delayMs = this.getRetryDelay(null, attempt);
            await this.delay(delayMs);
          }
        } else {
          // Network error (fetch threw, e.g. DNS / offline / CORS).
          lastError = new ChatApiError(
            "Failed to connect. Please try again.",
            0,
            "NETWORK_ERROR",
          );
          if (attempt < this.maxRetries) {
            const delayMs = this.getRetryDelay(null, attempt);
            await this.delay(delayMs);
          }
        }
      }
    }

    throw lastError!;
  }

  /**
   * Send the conversation to the streaming chat endpoint and resolve with the
   * assistant's full reply once the stream completes. Text deltas are
   * delivered through {@link ChatStreamOptions.onChunk} as they arrive.
   *
   * Falls back to {@link sendMessage} (non-streaming) when the browser can't
   * read response streams or the Worker doesn't expose `/api/chat/stream`
   * (HTTP 404/405), so callers never need their own feature detection.
   *
   * Failures before the first byte follow the same retry policy as
   * {@link sendMessage}; once streaming has begun there are no automatic
   * retries. Aborting via {@link ChatStreamOptions.signal} is not an error:
   * the promise resolves with the partial reply and `aborted: true`.
   *
   * @param messages - The full conversation so far, oldest message first.
   * @param options - Chunk callback and cancellation signal.
   * @throws {@link DebounceError} when called within the debounce window.
   * @throws {@link ChatApiError} when the request fails after all retries, or
   *   the stream errors or is interrupted mid-reply (code `"STREAM_ERROR"`).
   */
  async streamMessage(
    messages: ChatMessage[],
    options: ChatStreamOptions = {},
  ): Promise<ChatStreamResult> {
    if (typeof ReadableStream === "undefined") {
      return this.sendMessage(messages);
    }

    if (
      this.debounceMs > 0 &&
      Date.now() - this.lastSendTime < this.debounceMs
    ) {
      throw new DebounceError();
    }

    this.lastSendTime = Date.now();

    let lastError: ChatApiError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let response: Response;
      try {
        response = await this.fetchStream(messages, options.signal);
      } catch (err) {
        if (options.signal?.aborted) {
          return { reply: "", aborted: true };
        }
        lastError =
          err instanceof ChatApiError
            ? err
            : new ChatApiError(
                "Failed to connect. Please try again.",
                0,
                "NETWORK_ERROR",
              );
        if (!this.isRetryable(lastError.status, lastError.code)) {
          throw lastError;
        }
        if (attempt < this.maxRetries) {
          await this.delay(this.getRetryDelay(null, attempt));
        }
        continue;
      }

      // Older Worker deployments without the stream endpoint: fall back to
      // the non-streaming API. Debounce was already paid, so bypass it.
      if (response.status === 404 || response.status === 405) {
        this.lastSendTime = 0;
        return this.sendMessage(messages);
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as
          | ChatErrorResponse
          | Record<string, never>;
        const retryAfterHeader = response.headers.get("Retry-After");
        lastError = new ChatApiError(
          body.error ?? `Request failed with status ${response.status}`,
          response.status,
          body.code,
          retryAfterHeader ? Number(retryAfterHeader) : undefined,
        );
        if (!this.isRetryable(response.status)) {
          throw lastError;
        }
        if (attempt < this.maxRetries) {
          await this.delay(this.getRetryDelay(response, attempt));
        }
        continue;
      }

      // An OK response that isn't SSE (e.g. a proxy rewrote the route to the
      // JSON endpoint): treat it as a non-streaming reply if it parses.
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        try {
          return (await response.json()) as ChatResponse;
        } catch {
          this.lastSendTime = 0;
          return this.sendMessage(messages);
        }
      }

      if (!response.body) {
        this.lastSendTime = 0;
        return this.sendMessage(messages);
      }

      return this.readSseStream(response.body, options);
    }

    throw lastError!;
  }

  /**
   * Consumes an SSE body, invoking `onChunk` per `chunk` event, resolving on
   * `done`, throwing on `error` events or an interrupted connection, and
   * resolving with the partial text when the caller aborts.
   */
  private async readSseStream(
    body: ReadableStream<Uint8Array>,
    options: ChatStreamOptions,
  ): Promise<ChatStreamResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    const toolUses: ToolUse[] = [];
    let done: ChatStreamResult | undefined;

    const abort = () => {
      void reader.cancel().catch(() => {});
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (options.signal?.aborted) break;
          throw err;
        }
        if (options.signal?.aborted) break;
        if (chunk.done) break;

        buffer += decoder.decode(chunk.value, { stream: true });

        // SSE events are separated by a blank line.
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          const parsed = parseSseEvent(rawEvent);
          if (!parsed) continue;

          if (parsed.event === "chunk") {
            const text =
              typeof parsed.data.text === "string" ? parsed.data.text : "";
            if (text) {
              fullText += text;
              options.onChunk?.(text, fullText);
            }
          } else if (parsed.event === "tool") {
            if (typeof parsed.data.name === "string") {
              const toolUse = parsed.data as unknown as ToolUse;
              toolUses.push(toolUse);
              options.onToolUse?.(toolUse, toolUses);
            }
          } else if (parsed.event === "done") {
            const doneToolUses = Array.isArray(parsed.data.toolUses)
              ? (parsed.data.toolUses as ToolUse[])
              : toolUses;
            done = {
              reply:
                typeof parsed.data.reply === "string"
                  ? parsed.data.reply
                  : fullText,
              sources: parsed.data.sources as ChatStreamResult["sources"],
              ...(doneToolUses.length > 0 ? { toolUses: doneToolUses } : {}),
            };
          } else if (parsed.event === "error") {
            throw new ChatApiError(
              typeof parsed.data.error === "string"
                ? parsed.data.error
                : "Something went wrong. Please try again.",
              0,
              "STREAM_ERROR",
            );
          }
        }
      }
    } finally {
      options.signal?.removeEventListener("abort", abort);
      reader.releaseLock();
    }

    if (options.signal?.aborted) {
      return {
        reply: fullText,
        aborted: true,
        ...(toolUses.length > 0 ? { toolUses } : {}),
      };
    }

    if (done) return done;

    // The connection closed without a done event: the reply is incomplete.
    throw new ChatApiError(
      "Connection interrupted. Please try again.",
      0,
      "STREAM_ERROR",
    );
  }

  private async fetchStream(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<Response> {
    // The per-attempt timeout guards time-to-first-byte only: a healthy
    // stream may legitimately take longer than timeoutMs to finish, so the
    // timer is cleared as soon as response headers arrive.
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    signal?.addEventListener("abort", onCallerAbort, { once: true });

    let timedOut = false;
    const timeoutId =
      this.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, this.timeoutMs)
        : undefined;

    try {
      return await fetch(`${this.baseUrl}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) {
        throw new ChatApiError(
          "Request timed out. Please try again.",
          0,
          "TIMEOUT",
        );
      }
      throw err;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  private async fetchWithTimeout(messages: ChatMessage[]): Promise<Response> {
    if (this.timeoutMs <= 0) {
      return fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new ChatApiError(
          "Request timed out. Please try again.",
          0,
          "TIMEOUT",
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isRetryable(status: number, code?: string): boolean {
    if (code === "TIMEOUT" || code === "NETWORK_ERROR") return true;
    return status === 429 || status === 503;
  }

  private getRetryDelay(response: Response | null, attempt: number): number {
    if (response && response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const seconds = Number(retryAfter);
        return Math.min(seconds * 1000, 60_000);
      }
    }
    return attempt === 0 ? 1000 : 3000;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Parses one raw SSE event block (the text between blank-line separators)
 * into its event name and JSON-decoded data. Returns null for events with
 * no parsable data (comments, keep-alives).
 */
function parseSseEvent(
  raw: string,
): { event: string; data: Record<string, unknown> } | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  try {
    const data = JSON.parse(dataLines.join("\n"));
    if (typeof data !== "object" || data === null) return null;
    return { event, data: data as Record<string, unknown> };
  } catch {
    return null;
  }
}
