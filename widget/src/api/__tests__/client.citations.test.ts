import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatApiClient } from "../client";
import type { ChatMessage, Source } from "../types";

const BASE_URL = "https://test.workers.dev";
const messages: ChatMessage[] = [{ id: "1", role: "user", content: "Prices?" }];
const pricing: Source = {
  url: "https://example.com/pricing",
  title: "Pricing",
  type: "page",
  snippet: "Plans start at $10.",
};
const faq: Source = {
  url: "https://example.com/faq",
  title: "FAQ",
  type: "page",
};

const encoder = new TextEncoder();

function sseResponse(chunks: string[]) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "text/event-stream" }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  };
}

function jsonResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
  };
}

const sourcesFrame = `event: sources\ndata: ${JSON.stringify({ sources: [pricing] })}\n\n`;

describe("ChatApiClient citations", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function sentBody(call = 0): Record<string, unknown> {
    const init = mockFetch.mock.calls[call][1] as RequestInit;
    return JSON.parse(init.body as string);
  }

  it("sends citations: true in the JSON body of both endpoints when the option is on", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ reply: "Hi" }));
    const client = new ChatApiClient(BASE_URL, {
      debounceMs: 0,
      citations: true,
    });

    await client.sendMessage(messages);
    expect(sentBody(0)).toEqual({ messages, citations: true });

    await client.streamMessage(messages);
    expect(sentBody(1)).toEqual({ messages, citations: true });
  });

  it("omits the citations key entirely when the option is off", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ reply: "Hi" }));
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    await client.sendMessage(messages);
    expect(sentBody(0)).toEqual({ messages });
    expect(sentBody(0)).not.toHaveProperty("citations");
  });

  it("carries citations: true inside the multipart payload", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ reply: "Hi" }));
    const client = new ChatApiClient(BASE_URL, {
      debounceMs: 0,
      citations: true,
    });
    const withFile: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "What is this?",
        attachments: [
          {
            id: "f1",
            name: "a.png",
            mediaType: "image/png",
            size: 1,
            data: "iVBORw0=",
          },
        ],
      },
    ];

    await client.sendMessage(withFile);

    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    const payload = JSON.parse(
      (init.body as FormData).get("payload") as string,
    );
    expect(payload.citations).toBe(true);
    expect(payload.messages[0].attachments[0]).not.toHaveProperty("data");
  });

  it("reports a sources event through onSources and uses it when done has none", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        sourcesFrame,
        'event: chunk\ndata: {"text":"Plans start at $10 [1]."}\n\n',
        'event: done\ndata: {"reply":"Plans start at $10 [1]."}\n\n',
      ]),
    );
    const onSources = vi.fn();
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    const result = await client.streamMessage(messages, { onSources });

    expect(onSources).toHaveBeenCalledExactlyOnceWith([pricing]);
    expect(result.sources).toEqual([pricing]);
  });

  it("prefers the sources on the done event over the early announcement", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        sourcesFrame,
        'event: chunk\ndata: {"text":"Hi"}\n\n',
        `event: done\ndata: ${JSON.stringify({ reply: "Hi", sources: [pricing, faq] })}\n\n`,
      ]),
    );
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    const result = await client.streamMessage(messages);

    expect(result.sources).toEqual([pricing, faq]);
  });

  it("keeps the announced sources on a reply the caller aborted", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(
          encoder.encode(
            sourcesFrame + 'event: chunk\ndata: {"text":"Partial"}\n\n',
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
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    const result = await client.streamMessage(messages, {
      signal: abort.signal,
      onChunk: () => abort.abort(),
    });

    expect(result).toEqual({
      reply: "Partial",
      aborted: true,
      sources: [pricing],
    });
    expect(controller).toBeDefined();
  });

  it("ignores a sources event whose data is not an array", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        'event: sources\ndata: {"sources":"nope"}\n\n',
        'event: done\ndata: {"reply":"Hi"}\n\n',
      ]),
    );
    const onSources = vi.fn();
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    const result = await client.streamMessage(messages, { onSources });

    expect(onSources).not.toHaveBeenCalled();
    expect(result.sources).toBeUndefined();
  });
});
