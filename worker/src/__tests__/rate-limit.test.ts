import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "../rate-limit";

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();

  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

describe("checkRateLimit", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createMockKV();
  });

  it("allows the first request from an IP", async () => {
    const result = await checkRateLimit(kv, "1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it("allows up to 10 requests per minute from the same IP", async () => {
    for (let i = 0; i < 10; i++) {
      const result = await checkRateLimit(kv, "1.2.3.4");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the 11th request in a minute", async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(kv, "1.2.3.4");
    }

    const result = await checkRateLimit(kv, "1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(60);
  });

  it("blocks after 50 requests in an hour", async () => {
    // Simulate 50 hourly requests by manipulating the KV store directly.
    // We set the minute counter low so the minute limit doesn't trigger,
    // but set the hour counter at the limit.
    await kv.put("rate:min:1.2.3.4", "0");
    await kv.put("rate:hr:1.2.3.4", "50");

    const result = await checkRateLimit(kv, "1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(3600);
  });

  it("allows different IPs independently", async () => {
    // Exhaust limits for IP A
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(kv, "10.0.0.1");
    }

    const blockedResult = await checkRateLimit(kv, "10.0.0.1");
    expect(blockedResult.allowed).toBe(false);

    // IP B should still be allowed
    const allowedResult = await checkRateLimit(kv, "10.0.0.2");
    expect(allowedResult.allowed).toBe(true);
  });
});
