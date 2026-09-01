import { describe, it, expect } from "vitest";
import {
  checkAttachmentQuota,
  DEFAULT_IP_BYTES_PER_DAY,
  DEFAULT_TENANT_BYTES_PER_DAY,
  quotaConfigFromEnv,
} from "../attachment-quota";

function createMockKV() {
  const store = new Map<string, string>();
  const kv = {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
  return kv as unknown as KVNamespace & { store: Map<string, string> };
}

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // noon UTC

describe("quotaConfigFromEnv", () => {
  it("uses defaults and accepts overrides (0 disables)", () => {
    expect(quotaConfigFromEnv({})).toEqual({
      ipBytesPerDay: DEFAULT_IP_BYTES_PER_DAY,
      tenantBytesPerDay: DEFAULT_TENANT_BYTES_PER_DAY,
    });
    expect(
      quotaConfigFromEnv({
        ATTACHMENT_QUOTA_IP_BYTES: "0",
        ATTACHMENT_QUOTA_TENANT_BYTES: "1234",
      })
    ).toEqual({ ipBytesPerDay: 0, tenantBytesPerDay: 1234 });
  });
});

describe("checkAttachmentQuota", () => {
  const config = { ipBytesPerDay: 100, tenantBytesPerDay: 150 };

  it("is a no-op for zero bytes", async () => {
    const kv = createMockKV();
    const result = await checkAttachmentQuota(kv, { ip: "1.1.1.1", tenant: "t", bytes: 0 }, config, NOW);
    expect(result).toEqual({ allowed: true });
    expect(kv.store.size).toBe(0);
  });

  it("accumulates usage per IP and per tenant under date-scoped keys", async () => {
    const kv = createMockKV();
    await checkAttachmentQuota(kv, { ip: "1.1.1.1", tenant: "t", bytes: 40 }, config, NOW);
    await checkAttachmentQuota(kv, { ip: "1.1.1.1", tenant: "t", bytes: 30 }, config, NOW);
    expect(kv.store.get("attq:ip:1.1.1.1:2026-06-15")).toBe("70");
    expect(kv.store.get("attq:tenant:t:2026-06-15")).toBe("70");
  });

  it("rejects when the per-IP cap would be exceeded", async () => {
    const kv = createMockKV();
    await checkAttachmentQuota(kv, { ip: "1.1.1.1", tenant: "t", bytes: 90 }, config, NOW);
    const result = await checkAttachmentQuota(kv, { ip: "1.1.1.1", tenant: "t", bytes: 20 }, config, NOW);
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("ip");
    expect(result.retryAfter).toBe(12 * 3600);
    // Rejected uploads are not counted.
    expect(kv.store.get("attq:ip:1.1.1.1:2026-06-15")).toBe("90");
  });

  it("rejects when the tenant cap would be exceeded across IPs", async () => {
    const kv = createMockKV();
    await checkAttachmentQuota(kv, { ip: "1.1.1.1", tenant: "t", bytes: 80 }, config, NOW);
    await checkAttachmentQuota(kv, { ip: "2.2.2.2", tenant: "t", bytes: 60 }, config, NOW);
    const result = await checkAttachmentQuota(kv, { ip: "3.3.3.3", tenant: "t", bytes: 20 }, config, NOW);
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("tenant");
  });

  it("skips a check whose cap is 0", async () => {
    const kv = createMockKV();
    const result = await checkAttachmentQuota(
      kv,
      { ip: "1.1.1.1", tenant: "t", bytes: 10_000 },
      { ipBytesPerDay: 0, tenantBytesPerDay: 0 },
      NOW
    );
    expect(result.allowed).toBe(true);
    expect(kv.store.size).toBe(0);
  });
});
