import type { ChatMessage, ChatResponse, ChatErrorResponse } from "./types";
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
