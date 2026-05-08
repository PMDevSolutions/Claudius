import { vi } from "vitest";
import type { ChatMessage, ChatResponse } from "../api/types";
import { ChatApiError, DebounceError } from "../api/errors";

/**
 * Programmable test double for `ChatApiClient`. Tests queue responses with
 * `mockReply` / `mockError` / `mockTimeout`; calls to `sendMessage` consume
 * one queued response per call (FIFO). When the queue is empty the client
 * blocks on a `pending` promise so tests can drive loading-state assertions
 * before resolving.
 *
 * Usage:
 *   const mock = new MockChatApiClient();
 *   installChatApiClientMock(mock); // before render / hook init
 *   mock.mockReply({ reply: "Hi!" });
 *   ...
 */
export type QueuedResponse =
  | { kind: "reply"; response: ChatResponse }
  | { kind: "error"; error: ChatApiError | DebounceError | Error }
  | { kind: "timeout" }
  | { kind: "pending"; promise: Promise<ChatResponse> };

export class MockChatApiClient {
  public readonly calls: ChatMessage[][] = [];
  public sendMessage = vi.fn(this.handleSend.bind(this));
  private queue: QueuedResponse[] = [];

  /** Queue a successful reply for the next sendMessage call. */
  mockReply(response: ChatResponse): this {
    this.queue.push({ kind: "reply", response });
    return this;
  }

  /** Queue a ChatApiError (or arbitrary Error) for the next call. */
  mockError(error: ChatApiError | DebounceError | Error): this {
    this.queue.push({ kind: "error", error });
    return this;
  }

  /** Queue a timeout-style failure (status 0, code "TIMEOUT"). */
  mockTimeout(message = "Request timed out. Please try again."): this {
    this.queue.push({
      kind: "error",
      error: new ChatApiError(message, 0, "TIMEOUT"),
    });
    return this;
  }

  /** Queue a network failure (status 0, code "NETWORK_ERROR"). */
  mockNetworkError(message = "Failed to connect. Please try again."): this {
    this.queue.push({
      kind: "error",
      error: new ChatApiError(message, 0, "NETWORK_ERROR"),
    });
    return this;
  }

  /**
   * Queue a deferred reply. Returns a `resolve` function the test can call
   * later to settle the in-flight request — useful for asserting the
   * loading state mid-flight.
   */
  mockPending(): { resolve: (response: ChatResponse) => void; reject: (err: unknown) => void } {
    let resolve!: (response: ChatResponse) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<ChatResponse>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.queue.push({ kind: "pending", promise });
    return { resolve, reject };
  }

  /** Total messages received across all sendMessage calls (last call). */
  get lastCall(): ChatMessage[] | undefined {
    return this.calls[this.calls.length - 1];
  }

  /** Clear queued responses and call history. */
  reset(): void {
    this.queue = [];
    this.calls.length = 0;
    this.sendMessage.mockClear();
  }

  private async handleSend(messages: ChatMessage[]): Promise<ChatResponse> {
    this.calls.push(messages.map((m) => ({ ...m })));

    const next = this.queue.shift();
    if (!next) {
      throw new Error(
        "MockChatApiClient: sendMessage called but no response was queued. " +
          "Call mockReply()/mockError()/mockPending() before triggering the request.",
      );
    }

    switch (next.kind) {
      case "reply":
        return next.response;
      case "error":
        throw next.error;
      case "timeout":
        throw new ChatApiError("Request timed out. Please try again.", 0, "TIMEOUT");
      case "pending":
        return next.promise;
    }
  }
}

/**
 * Install the mock as the implementation of `ChatApiClient` for the current
 * test. Must be paired with `vi.mock("../api/client", ...)` at module
 * top-level, since vi.mock is hoisted; this helper just wires the
 * already-mocked constructor to return our instance.
 *
 * Most tests should call `useMockChatApiClient()` instead — it bundles the
 * vi.mock setup with creation.
 */
export async function installChatApiClientMock(
  mock: MockChatApiClient,
): Promise<void> {
  const { ChatApiClient } = (await import("../api/client")) as {
    ChatApiClient: ReturnType<typeof vi.fn>;
  };
  if (typeof ChatApiClient !== "function" || !("mockImplementation" in ChatApiClient)) {
    throw new Error(
      "installChatApiClientMock: ChatApiClient is not a vi.fn(). " +
        "Add `vi.mock(\"../api/client\")` at the top of the test file.",
    );
  }
  (ChatApiClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    function MockChatApiClientCtor() {
      return mock;
    },
  );
}
