import { describe, it, expect, vi } from "vitest";

// Mock the Anthropic SDK so the success path returns a deterministic reply.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Hi from model" }],
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
    };
  },
}));

import app from "../index";

interface ChatRouteEnv {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT: KVNamespace;
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

describe("POST /api/chat success path", () => {
  it("returns the model reply (covers the stashed-request fallback read)", async () => {
    const env: ChatRouteEnv = {
      ANTHROPIC_API_KEY: "test-key",
      ALLOWED_ORIGIN: "http://localhost:5173",
      RATE_LIMIT: createMockKV(),
    };

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });

    const res = await app.fetch(request, env, createMockCtx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "Hi from model" });
  });
});
