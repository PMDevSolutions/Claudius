import { vi } from "vitest";
import type {
  ChatMessage,
  ChatResponse,
  ChatStreamOptions,
  ChatStreamResult,
} from "../api/types";
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
  | { kind: "pending"; promise: Promise<ChatResponse> }
  | {
      kind: "stream";
      chunks: string[];
      sources?: ChatResponse["sources"];
      error?: Error;
    }
  | { kind: "stream-manual"; register: (impl: ManualStream) => void };

/**
 * Handle returned by {@link MockChatApiClient.mockStreamManual}: drives an
 * in-flight `streamMessage` call step by step from the test.
 */
export interface ManualStream {
  /** Deliver one streamed text chunk. */
  emit: (text: string) => void;
  /** Finish the stream successfully (defaults to the accumulated text). */
  complete: (reply?: string) => void;
  /** Fail the stream with the given error. */
  fail: (err: unknown) => void;
}

export class MockChatApiClient {
  public readonly calls: ChatMessage[][] = [];
  public sendMessage = vi.fn(this.handleSend.bind(this));
  public streamMessage = vi.fn(this.handleStream.bind(this));
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
  mockPending(): {
    resolve: (response: ChatResponse) => void;
    reject: (err: unknown) => void;
  } {
    let resolve!: (response: ChatResponse) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<ChatResponse>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.queue.push({ kind: "pending", promise });
    return { resolve, reject };
  }

  /**
   * Queue a streamed reply: each chunk is delivered through `onChunk` (with a
   * microtask between chunks), then the call resolves with the concatenated
   * text. Pass `error` to fail the stream after the chunks are delivered.
   */
  mockStreamReply(
    chunks: string[],
    opts: { sources?: ChatResponse["sources"]; error?: Error } = {},
  ): this {
    this.queue.push({ kind: "stream", chunks, ...opts });
    return this;
  }

  /**
   * Queue a manually driven stream. Returns a {@link ManualStream} handle the
   * test uses to emit chunks, complete, or fail the in-flight call — useful
   * for asserting mid-stream UI states and cancellation.
   */
  mockStreamManual(): ManualStream {
    let impl: ManualStream | null = null;
    const buffered: Array<(i: ManualStream) => void> = [];
    const call = (op: (i: ManualStream) => void) =>
      impl ? op(impl) : buffered.push(op);

    this.queue.push({
      kind: "stream-manual",
      register: (i) => {
        impl = i;
        buffered.forEach((op) => op(i));
        buffered.length = 0;
      },
    });

    return {
      emit: (text) => call((i) => i.emit(text)),
      complete: (reply) => call((i) => i.complete(reply)),
      fail: (err) => call((i) => i.fail(err)),
    };
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
    this.streamMessage.mockClear();
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
        throw new ChatApiError(
          "Request timed out. Please try again.",
          0,
          "TIMEOUT",
        );
      case "pending":
        return next.promise;
      default:
        throw new Error(
          `MockChatApiClient: a ${next.kind} response was queued but ` +
            "sendMessage was called; queue it for streamMessage instead.",
        );
    }
  }

  private async handleStream(
    messages: ChatMessage[],
    options: ChatStreamOptions = {},
  ): Promise<ChatStreamResult> {
    this.calls.push(messages.map((m) => ({ ...m })));

    const next = this.queue.shift();
    if (!next) {
      throw new Error(
        "MockChatApiClient: streamMessage called but no response was queued. " +
          "Call mockStreamReply()/mockStreamManual()/mockReply() first.",
      );
    }

    switch (next.kind) {
      // Non-stream queue kinds behave like the real client falling back to a
      // single-shot reply: no chunks, then the full response (or failure).
      case "reply":
        return next.response;
      case "error":
        throw next.error;
      case "timeout":
        throw new ChatApiError(
          "Request timed out. Please try again.",
          0,
          "TIMEOUT",
        );
      case "pending":
        return next.promise;

      case "stream": {
        let fullText = "";
        for (const text of next.chunks) {
          if (options.signal?.aborted) {
            return { reply: fullText, aborted: true };
          }
          fullText += text;
          options.onChunk?.(text, fullText);
          await Promise.resolve();
        }
        if (options.signal?.aborted) {
          return { reply: fullText, aborted: true };
        }
        if (next.error) throw next.error;
        return { reply: fullText, sources: next.sources };
      }

      case "stream-manual":
        return new Promise<ChatStreamResult>((resolve, reject) => {
          let fullText = "";
          options.signal?.addEventListener(
            "abort",
            () => resolve({ reply: fullText, aborted: true }),
            { once: true },
          );
          next.register({
            emit: (text) => {
              if (options.signal?.aborted) return;
              fullText += text;
              options.onChunk?.(text, fullText);
            },
            complete: (reply) => resolve({ reply: reply ?? fullText }),
            fail: (err) => reject(err),
          });
        });
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
  if (
    typeof ChatApiClient !== "function" ||
    !("mockImplementation" in ChatApiClient)
  ) {
    throw new Error(
      "installChatApiClientMock: ChatApiClient is not a vi.fn(). " +
        'Add `vi.mock("../api/client")` at the top of the test file.',
    );
  }
  (ChatApiClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    function MockChatApiClientCtor() {
      return mock;
    },
  );
}
