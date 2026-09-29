import { describe, it, expect, vi, beforeEach } from "vitest";

const createSpy = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createSpy };
  },
}));

import app from "../index";

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
  } as unknown as KVNamespace;
}

function createMockCtx(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

/** Env with the RAG bindings, so retrieval runs and yields one source. */
function ragEnv() {
  return {
    ANTHROPIC_API_KEY: "test-key",
    ALLOWED_ORIGIN: "http://localhost:5173",
    RATE_LIMIT: createMockKV(),
    AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
    VECTORIZE_INDEX: {
      query: vi.fn().mockResolvedValue({
        matches: [
          {
            id: "pricing.md#0",
            score: 0.9,
            metadata: {
              content: "Plans start at $10.",
              url: "https://example.com/pricing",
              title: "Pricing",
            },
          },
        ],
      }),
    },
  };
}

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const messages = [{ role: "user", content: "What are your prices?" }];

async function* textStream() {
  yield { type: "message_start", message: { usage: { input_tokens: 3 } } };
  yield {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Plans start at $10 [1]." },
  };
  yield {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 4 },
  };
  yield { type: "message_stop" };
}

describe("citations on the chat routes", () => {
  beforeEach(() => {
    createSpy.mockReset();
  });

  it("numbers the prompt when the body carries citations: true", async () => {
    createSpy.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Plans start at $10 [1]." }],
      usage: { input_tokens: 3, output_tokens: 4 },
    });

    const res = await app.fetch(
      request("/api/chat", { messages, citations: true }),
      ragEnv(),
      createMockCtx()
    );

    expect(res.status).toBe(200);
    const system = createSpy.mock.calls[0][0].system as string;
    expect(system).toContain("### [1] [Pricing](https://example.com/pricing)");
    expect(await res.json()).toMatchObject({
      sources: [
        { url: "https://example.com/pricing", snippet: "Plans start at $10." },
      ],
    });
  });

  it.each([[undefined], ["true"], [1]])(
    "leaves the prompt unnumbered for citations = %j",
    async (citations) => {
      createSpy.mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Plans start at $10." }],
        usage: { input_tokens: 3, output_tokens: 4 },
      });

      const res = await app.fetch(
        request("/api/chat", { messages, citations }),
        ragEnv(),
        createMockCtx()
      );

      expect(res.status).toBe(200);
      const system = createSpy.mock.calls[0][0].system as string;
      expect(system).toContain("### [Pricing](https://example.com/pricing)");
      expect(system).not.toContain("[1]");
    }
  );

  it("streams a sources event before the first chunk", async () => {
    createSpy.mockImplementation(() => textStream());

    const res = await app.fetch(
      request("/api/chat/stream", { messages, citations: true }),
      ragEnv(),
      createMockCtx()
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    const sourcesAt = text.indexOf("event: sources");
    const chunkAt = text.indexOf("event: chunk");
    expect(sourcesAt).toBeGreaterThanOrEqual(0);
    expect(chunkAt).toBeGreaterThanOrEqual(0);
    expect(sourcesAt).toBeLessThan(chunkAt);
    expect(text).toContain(
      'event: sources\ndata: {"sources":[{"url":"https://example.com/pricing","title":"Pricing","type":"page","snippet":"Plans start at $10."}]}'
    );
    expect(text).toContain('"reply":"Plans start at $10 [1]."');
  });

  it("still returns JSON 503 when the model stream fails on its first event with RAG on", async () => {
    // Anthropic can deliver an overload as the first stream event. The route
    // must still see that before any sources announcement opens the SSE.
    createSpy.mockImplementation(() =>
      (async function* () {
        await Promise.resolve();
        throw new Error("overloaded_error");
      })()
    );

    const res = await app.fetch(
      request("/api/chat/stream", { messages, citations: true }),
      ragEnv(),
      createMockCtx()
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ code: "SERVICE_ERROR" });
  });

  it("still returns JSON 500 when the model connection fails with RAG on", async () => {
    createSpy.mockImplementation(() => {
      throw new Error("authentication failed");
    });

    const res = await app.fetch(
      request("/api/chat/stream", { messages, citations: true }),
      ragEnv(),
      createMockCtx()
    );

    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ code: "CONFIG_ERROR" });
  });
});
