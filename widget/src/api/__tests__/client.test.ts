import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatApiClient } from "../client";
import { ChatApiError, DebounceError } from "../errors";
import type { ChatMessage } from "../types";

const BASE_URL = "https://test.workers.dev";

const mockMessages: ChatMessage[] = [
  { id: "1", role: "user", content: "Hello" },
];

function createMockResponse(overrides: {
  ok: boolean;
  status: number;
  headers?: Headers;
  body: Record<string, unknown>;
}) {
  return {
    ok: overrides.ok,
    status: overrides.status,
    headers: overrides.headers ?? new Headers(),
    json: () => Promise.resolve(overrides.body),
  };
}

describe("ChatApiClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("sendMessage", () => {
    it("sends POST to /api/chat with messages", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          status: 200,
          body: { reply: "Hi there!" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
      await client.sendMessage(mockMessages);

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/chat`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: mockMessages }),
        }),
      );
    });

    it("returns typed ChatResponse on success", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          status: 200,
          body: { reply: "Hi there!" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
      const result = await client.sendMessage(mockMessages);

      expect(result).toEqual({ reply: "Hi there!" });
    });

    it("throws ChatApiError on 400 response", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          body: { error: "Bad request", code: "INVALID_INPUT" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

      const error = await client
        .sendMessage(mockMessages)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ChatApiError);
      expect(error).toMatchObject({
        status: 400,
        code: "INVALID_INPUT",
      });
    });

    it("throws ChatApiError on 500 response", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 500,
          body: { error: "Internal server error" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

      const error = await client
        .sendMessage(mockMessages)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ChatApiError);
      expect(error).toMatchObject({ status: 500 });
    });
  });

  describe("retry logic", () => {
    it("retries on 429 respecting Retry-After header", async () => {
      vi.useFakeTimers();

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 429,
            headers: new Headers({ "Retry-After": "2" }),
            body: { error: "Rate limited" },
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            status: 200,
            body: { reply: "OK" },
          }),
        );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
      const promise = client.sendMessage(mockMessages);

      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result).toEqual({ reply: "OK" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries on 503 with exponential backoff", async () => {
      vi.useFakeTimers();

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 503,
            body: { error: "Service unavailable" },
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 503,
            body: { error: "Service unavailable" },
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            status: 200,
            body: { reply: "OK" },
          }),
        );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
      const promise = client.sendMessage(mockMessages);

      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry: 3000ms
      await vi.advanceTimersByTimeAsync(3000);

      const result = await promise;
      expect(result).toEqual({ reply: "OK" });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("retries on network error with exponential backoff", async () => {
      vi.useFakeTimers();

      mockFetch
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            status: 200,
            body: { reply: "OK" },
          }),
        );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
      const promise = client.sendMessage(mockMessages);

      // First retry backoff: 1000ms
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual({ reply: "OK" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not retry on 400", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          body: { error: "Bad request" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

      await expect(client.sendMessage(mockMessages)).rejects.toThrow(
        ChatApiError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws after max retries exhausted", async () => {
      vi.useFakeTimers();

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 503,
            body: { error: "Service unavailable" },
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 503,
            body: { error: "Service unavailable" },
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 503,
            body: { error: "Service unavailable" },
          }),
        );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
      const promise = client.sendMessage(mockMessages).catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(3000);

      const error = await promise;
      expect(error).toBeInstanceOf(ChatApiError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("caps Retry-After at 60 seconds", async () => {
      vi.useFakeTimers();

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            ok: false,
            status: 429,
            headers: new Headers({ "Retry-After": "120" }),
            body: { error: "Rate limited" },
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            status: 200,
            body: { reply: "OK" },
          }),
        );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
      const promise = client.sendMessage(mockMessages);

      // Should be capped at 60s, not 120s
      await vi.advanceTimersByTimeAsync(60_000);

      const result = await promise;
      expect(result).toEqual({ reply: "OK" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("timeout", () => {
    it("aborts and throws ChatApiError(code=TIMEOUT) when the request exceeds timeoutMs", async () => {
      vi.useFakeTimers();

      // Fetch never resolves on its own; the client aborts via AbortSignal.
      mockFetch.mockImplementation(
        (_input: RequestInfo, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );

      const client = new ChatApiClient(BASE_URL, {
        debounceMs: 0,
        maxRetries: 0,
        timeoutMs: 5_000,
      });

      const promise = client.sendMessage(mockMessages).catch((e: unknown) => e);

      // Trigger the timeout AbortController.
      await vi.advanceTimersByTimeAsync(5_000);

      const error = await promise;
      expect(error).toBeInstanceOf(ChatApiError);
      expect(error).toMatchObject({ status: 0, code: "TIMEOUT" });
    });

    it("treats TIMEOUT as retryable and recovers on the next attempt", async () => {
      vi.useFakeTimers();

      let callCount = 0;
      mockFetch.mockImplementation(
        (_input: RequestInfo, init?: RequestInit) => {
          callCount += 1;
          if (callCount === 1) {
            // First call: hang until aborted by the client's timeout.
            return new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              });
            });
          }
          // Second call: succeed.
          return Promise.resolve(
            createMockResponse({
              ok: true,
              status: 200,
              body: { reply: "OK" },
            }),
          );
        },
      );

      const client = new ChatApiClient(BASE_URL, {
        debounceMs: 0,
        maxRetries: 1,
        timeoutMs: 1_000,
      });

      const promise = client.sendMessage(mockMessages);

      // Advance past the timeout to abort attempt 1.
      await vi.advanceTimersByTimeAsync(1_000);
      // Advance past the network-error backoff (1s for first retry).
      await vi.advanceTimersByTimeAsync(1_000);

      const result = await promise;
      expect(result).toEqual({ reply: "OK" });
      expect(callCount).toBe(2);
    });

    it("does not abort when timeoutMs is 0", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          status: 200,
          body: { reply: "OK" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, {
        debounceMs: 0,
        timeoutMs: 0,
      });

      const result = await client.sendMessage(mockMessages);
      expect(result).toEqual({ reply: "OK" });
      // When timeoutMs is 0, fetch is called without a signal.
      const call = mockFetch.mock.calls[0];
      expect(call[1].signal).toBeUndefined();
    });
  });

  describe("debounce", () => {
    it("rejects rapid calls within debounce window with DebounceError", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          body: { reply: "OK" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 300 });

      // First call succeeds
      await client.sendMessage(mockMessages);

      // Second call within debounce window should throw
      await expect(client.sendMessage(mockMessages)).rejects.toThrow(
        DebounceError,
      );
    });

    it("allows calls after debounce window passes", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          body: { reply: "OK" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 300 });

      await client.sendMessage(mockMessages);

      // Advance past debounce window
      await vi.advanceTimersByTimeAsync(300);

      const result = await client.sendMessage(mockMessages);
      expect(result).toEqual({ reply: "OK" });
    });

    it("can disable debounce with debounceMs: 0", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          body: { reply: "OK" },
        }),
      );

      const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

      await client.sendMessage(mockMessages);
      const result = await client.sendMessage(mockMessages);
      expect(result).toEqual({ reply: "OK" });
    });
  });
});
