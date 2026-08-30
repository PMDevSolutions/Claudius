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

  it("delivers tool events via onToolUse and attaches toolUses to the result", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        'event: tool\ndata: {"name":"get_current_time","input":{},"result":"{\\"iso\\":\\"2026-01-01T00:00:00Z\\"}"}\n\n',
        'event: chunk\ndata: {"text":"It is midnight."}\n\n',
        'event: done\ndata: {"reply":"It is midnight.","toolUses":[{"name":"get_current_time","input":{},"result":"{\\"iso\\":\\"2026-01-01T00:00:00Z\\"}"}]}\n\n',
      ]),
    );

    const seen: string[] = [];
    const result = await newClient().streamMessage(mockMessages, {
      onToolUse: (toolUse, all) => {
        seen.push(toolUse.name);
        expect(all).toHaveLength(1);
      },
    });

    expect(seen).toEqual(["get_current_time"]);
    expect(result.reply).toBe("It is midnight.");
    expect(result.toolUses).toEqual([
      {
        name: "get_current_time",
        input: {},
        result: '{"iso":"2026-01-01T00:00:00Z"}',
      },
    ]);
  });

  it("keeps accumulated toolUses when the caller aborts mid-stream", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(
          encoder.encode(
            'event: tool\ndata: {"name":"get_time","input":{}}\n\n' +
              'event: chunk\ndata: {"text":"Partial"}\n\n',
          ),
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
    const result = await newClient().streamMessage(mockMessages, {
      signal: abort.signal,
      onChunk: () => abort.abort(),
    });

    expect(result).toEqual({
      reply: "Partial",
      aborted: true,
      toolUses: [{ name: "get_time", input: {} }],
    });
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
