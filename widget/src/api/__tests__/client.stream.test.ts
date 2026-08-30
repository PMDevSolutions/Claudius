import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatApiClient } from "../client";
import { ChatApiError } from "../errors";
import type { ChatMessage } from "../types";

const BASE_URL = "https://test.workers.dev";

const mockMessages: ChatMessage[] = [
  { id: "1", role: "user", content: "Hello" },
];

const encoder = new TextEncoder();

/** SSE response whose body enqueues each string as its own network chunk. */
function sseResponse(chunks: string[]): {
  ok: boolean;
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
} {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "text/event-stream" }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  };
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
  };
}

function newClient() {
  return new ChatApiClient(BASE_URL, { debounceMs: 0 });
}

describe("ChatApiClient.streamMessage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("posts to /api/chat/stream and delivers chunks in order", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        'event: chunk\ndata: {"text":"Hel"}\n\n',
        'event: chunk\ndata: {"text":"lo!"}\n\n',
        'event: done\ndata: {"reply":"Hello!"}\n\n',
      ]),
    );

    const chunks: Array<[string, string]> = [];
    const result = await newClient().streamMessage(mockMessages, {
      onChunk: (text, fullText) => chunks.push([text, fullText]),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/chat/stream`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(chunks).toEqual([
      ["Hel", "Hel"],
      ["lo!", "Hello!"],
    ]);
    expect(result).toEqual({ reply: "Hello!", sources: undefined });
  });

  it("parses SSE events split across arbitrary network chunk boundaries", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        "event: chu",
        'nk\ndata: {"te',
        'xt":"Hel"}\n\nevent: chunk\ndata: {"text":"lo!"}\n\neve',
        'nt: done\ndata: {"reply":"Hello!"}\n\n',
      ]),
    );

    const chunks: string[] = [];
    const result = await newClient().streamMessage(mockMessages, {
      onChunk: (text) => chunks.push(text),
    });

    expect(chunks).toEqual(["Hel", "lo!"]);
    expect(result.reply).toBe("Hello!");
  });

  it("resolves with the partial reply and aborted: true when cancelled", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(
          encoder.encode('event: chunk\ndata: {"text":"Partial "}\n\n'),
        );
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body,
    });

    const abort = new AbortController();
    const promise = newClient().streamMessage(mockMessages, {
      signal: abort.signal,
      onChunk: (text) => {
        // Cancel as soon as the first chunk lands, mid-stream.
        expect(text).toBe("Partial ");
        abort.abort();
      },
    });

    const result = await promise;
    expect(result).toEqual({ reply: "Partial ", aborted: true });
    // Keep the controller referenced so the stream isn't GC-collected early.
    expect(controller).toBeDefined();
  });

  it("throws a STREAM_ERROR ChatApiError on an in-band error event", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        'event: chunk\ndata: {"text":"par"}\n\n',
        'event: error\ndata: {"error":"AI service temporarily unavailable. Please try again.","code":"STREAM_ERROR"}\n\n',
      ]),
    );

    const err = await newClient()
      .streamMessage(mockMessages)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ChatApiError);
    expect(err.code).toBe("STREAM_ERROR");
    expect(err.message).toContain("temporarily unavailable");
  });

  it("throws a STREAM_ERROR when the stream ends without a done event", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse(['event: chunk\ndata: {"text":"par"}\n\n']),
    );

    const err = await newClient()
      .streamMessage(mockMessages)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ChatApiError);
    expect(err.code).toBe("STREAM_ERROR");
  });

  it("falls back to the non-streaming endpoint on 404", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(404, { error: "not found" }))
      .mockResolvedValueOnce(jsonResponse(200, { reply: "Fallback reply" }));

    const result = await newClient().streamMessage(mockMessages);

    expect(result.reply).toBe("Fallback reply");
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/api/chat/stream`,
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/api/chat`,
      expect.anything(),
    );
  });

  it("returns a plain JSON reply when the endpoint answers without SSE", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { reply: "Plain" }));

    const result = await newClient().streamMessage(mockMessages);
    expect(result.reply).toBe("Plain");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries retryable pre-stream failures with backoff", async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(503, { error: "busy", code: "SERVICE_ERROR" }),
      )
      .mockResolvedValueOnce(
        sseResponse(['event: done\ndata: {"reply":"Recovered"}\n\n']),
      );

    const promise = newClient().streamMessage(mockMessages);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result.reply).toBe("Recovered");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable pre-stream failures", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(400, { error: "bad", code: "VALIDATION_ERROR" }),
    );

    const err = await newClient()
      .streamMessage(mockMessages)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ChatApiError);
    expect(err.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
