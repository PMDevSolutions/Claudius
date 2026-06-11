import { describe, it, expect } from "vitest";
import app from "../index";

/**
 * Route-level tests for the rate-limit (429) path of POST /api/chat.
 *
 * These exercise the Hono app end-to-end via `app.fetch` (including CORS and
 * the rate-limit gate) rather than the `checkRateLimit` helper in isolation,
 * proving the route itself returns a well-formed 429.
 */

interface ChatRouteEnv {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT: KVNamespace;
}

function createMockKV(seed: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(seed));

  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

function createMockCtx(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

function postChat(
  env: ChatRouteEnv,
  ip: string,
  origin?: string
): Promise<Response> {
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": ip,
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  return app.fetch(request, env, createMockCtx()) as Promise<Response>;
}

describe("POST /api/chat rate limiting", () => {
  it("returns 429 with Retry-After and limitType when the per-minute limit is exceeded", async () => {
    const env: ChatRouteEnv = {
      ANTHROPIC_API_KEY: "test-key",
      ALLOWED_ORIGIN: "http://localhost:5173",
      // Seed the minute counter at the default limit (10) so the next request
      // is rejected by the minute window before reaching the model.
      RATE_LIMIT: createMockKV({ "rate:min:1.2.3.4": "10" }),
    };

    const res = await postChat(env, "1.2.3.4");

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");

    const body = (await res.json()) as { code?: string; limitType?: string };
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.limitType).toBe("minute");
  });

  it("returns 429 with the hourly Retry-After and limitType when the per-hour limit is exceeded", async () => {
    const env: ChatRouteEnv = {
      ANTHROPIC_API_KEY: "test-key",
      ALLOWED_ORIGIN: "http://localhost:5173",
      // Minute window has room, but the hour counter is at the default limit (50).
      RATE_LIMIT: createMockKV({
        "rate:min:5.6.7.8": "0",
        "rate:hr:5.6.7.8": "50",
      }),
    };

    const res = await postChat(env, "5.6.7.8");

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");

    const body = (await res.json()) as { code?: string; limitType?: string };
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.limitType).toBe("hour");
  });
});

describe("CORS allowed origins", () => {
  // Drive the deterministic 429 path so no Anthropic call is made; CORS
  // headers are set by the middleware regardless of the response status.
  function rateLimitedEnv(allowedOrigin: string): ChatRouteEnv {
    return {
      ANTHROPIC_API_KEY: "test-key",
      ALLOWED_ORIGIN: allowedOrigin,
      RATE_LIMIT: createMockKV({ "rate:min:9.9.9.9": "10" }),
    };
  }

  it("allows a single configured origin (existing behavior)", async () => {
    const env = rateLimitedEnv("https://pmds.info");

    const res = await postChat(env, "9.9.9.9", "https://pmds.info");

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://pmds.info"
    );
  });

  it("allows any origin in a comma-separated ALLOWED_ORIGIN list", async () => {
    const env = rateLimitedEnv(
      "https://pmds.info, https://claudius-docs.pages.dev"
    );

    const res = await postChat(
      env,
      "9.9.9.9",
      "https://claudius-docs.pages.dev"
    );

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://claudius-docs.pages.dev"
    );
  });

  it("does not reflect an origin missing from the list", async () => {
    const env = rateLimitedEnv(
      "https://pmds.info,https://claudius-docs.pages.dev"
    );

    const res = await postChat(env, "9.9.9.9", "https://evil.example");

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://pmds.info"
    );
  });
});
