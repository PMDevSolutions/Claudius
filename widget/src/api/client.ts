import type {
  ChatMessage,
  ChatResponse,
  ChatErrorResponse,
} from "./types";
import { ChatApiError, DebounceError } from "./errors";

export interface ChatApiClientOptions {
  maxRetries?: number;
  debounceMs?: number;
}

export class ChatApiClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly debounceMs: number;
  private lastSendTime = 0;

  constructor(baseUrl: string, options?: ChatApiClientOptions) {
    this.baseUrl = baseUrl;
    this.maxRetries = options?.maxRetries ?? 2;
    this.debounceMs = options?.debounceMs ?? 300;
  }

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
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });

        if (response.ok) {
          return (await response.json()) as ChatResponse;
        }

        const body = (await response.json()) as ChatErrorResponse;
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfter = retryAfterHeader
          ? Number(retryAfterHeader)
          : undefined;

        lastError = new ChatApiError(
          body.error,
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
          if (!this.isRetryable(error.status)) {
            throw error;
          }
          lastError = error;
          if (attempt < this.maxRetries) {
            const delayMs = this.getRetryDelay(null, attempt);
            await this.delay(delayMs);
          }
        } else {
          // Network error
          lastError = new ChatApiError(
            "Failed to connect. Please try again.",
            0,
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

  private isRetryable(status: number): boolean {
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
