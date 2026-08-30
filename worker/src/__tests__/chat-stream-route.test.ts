import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK. Each test configures `createSpy` to return an async
// iterable of raw streaming events (what `messages.create({stream: true})`
// yields).
const createSpy = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createSpy };
  },
}));

import app from "../index";

interface StreamRouteEnv {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT: KVNamespace;
  RATE_LIMIT_MINUTE?: string;
}

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

function createEnv(overrides: Partial<StreamRouteEnv> = {}): StreamRouteEnv {
  return {
    ANTHROPIC_API_KEY: "test-key",
    ALLOWED_ORIGIN: "http://localhost:5173",
    RATE_LIMIT: createMockKV(),
    ...overrides,
  };
}

function streamRequest(body?: unknown): Request {
  return new Request("http://localhost/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      body ?? { messages: [{ role: "user", content: "hi" }] }
    ),
  });
}

async function* wellFormedStream() {
  yield { type: "message_start", message: { usage: { input_tokens: 3 } } };
  yield {
    type: "content_block_delta",
    delta: { type: "text_delta", text: "Hel" },
  };
  yield {
    type: "content_block_delta",
    delta: { type: "text_delta", text: "lo!" },
  };
  yield { type: "message_delta", usage: { output_tokens: 4 } };
  yield { type: "message_stop" };
}

describe("POST /api/chat/stream", () => {
  beforeEach(() => {
    createSpy.mockReset();
    createSpy.mockImplementation(() => wellFormedStream());
  });

  it("emits chunk events per text delta and a final done event", async () => {
    const res = await app.fetch(streamRequest(), createEnv(), createMockCtx());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain('event: chunk\ndata: {"text":"Hel"}');
    expect(text).toContain('event: chunk\ndata: {"text":"lo!"}');
    expect(text).toContain('event: done\ndata: {"reply":"Hello!"}');
    // done comes after all chunks
    expect(text.indexOf("event: done")).toBeGreaterThan(
      text.lastIndexOf("event: chunk")
    );
  });

  it("passes stream: true to the Anthropic API", async () => {
    await app.fetch(streamRequest(), createEnv(), createMockCtx());
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true })
    );
  });

  it("returns 400 JSON (not a stream) for validation errors", async () => {
    const res = await app.fetch(
      streamRequest({ messages: [] }),
      createEnv(),
      createMockCtx()
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 500 JSON when the upstream connection fails before streaming", async () => {
    createSpy.mockImplementation(() => {
      throw new Error("authentication failed");
    });

    const res = await app.fetch(streamRequest(), createEnv(), createMockCtx());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "CONFIG_ERROR" });
  });

  it("emits an in-band error event when the stream breaks mid-way", async () => {
    createSpy.mockImplementation(async function* () {
      yield { type: "message_start", message: { usage: { input_tokens: 3 } } };
      yield {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "partial" },
      };
      throw new Error("overloaded");
    });

    const res = await app.fetch(streamRequest(), createEnv(), createMockCtx());

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: chunk\ndata: {"text":"partial"}');
    expect(text).toContain("event: error");
    expect(text).toContain('"code":"STREAM_ERROR"');
    expect(text).not.toContain("event: done");
  });

  it("is rate limited like the non-streaming endpoint, one slot per request", async () => {
    const env = createEnv({ RATE_LIMIT_MINUTE: "1" });

    const first = await app.fetch(streamRequest(), env, createMockCtx());
    expect(first.status).toBe(200);
    await first.text(); // drain

    const second = await app.fetch(streamRequest(), env, createMockCtx());
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBe("60");
    expect(await second.json()).toMatchObject({
      code: "RATE_LIMITED",
      limitType: "minute",
    });
  });

  it("emits a tool event when the model calls a registered tool", async () => {
    // Round 1: the model calls get_current_time (in the default registry).
    createSpy.mockImplementationOnce(async function* () {
      yield { type: "message_start", message: { usage: { input_tokens: 3 } } };
      yield {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "tu_1",
          name: "get_current_time",
        },
      };
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "{}" },
      };
      yield { type: "content_block_stop", index: 0 };
      yield {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 2 },
      };
      yield { type: "message_stop" };
    });
    // Round 2: the model answers with text.
    createSpy.mockImplementationOnce(() => wellFormedStream());

    const res = await app.fetch(streamRequest(), createEnv(), createMockCtx());

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("event: tool");
    expect(text).toContain('"name":"get_current_time"');
    expect(text).toContain('event: done');
    expect(text).toContain('"toolUses":[{"name":"get_current_time"');
    // Tool event precedes the second round's chunks.
    expect(text.indexOf("event: tool")).toBeLessThan(
      text.indexOf("event: chunk")
    );
  });

  it("shares the rate-limit budget with /api/chat", async () => {
    const env = createEnv({ RATE_LIMIT_MINUTE: "1" });

    const streamRes = await app.fetch(streamRequest(), env, createMockCtx());
    expect(streamRes.status).toBe(200);
    await streamRes.text();

    const chatRes = await app.fetch(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      }),
      env,
      createMockCtx()
    );
    expect(chatRes.status).toBe(429);
  });
});
