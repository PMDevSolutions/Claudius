import { describe, it, expect } from "vitest";
import {
  AttachmentStorageConfigError,
  createR2Storage,
  resolveAttachments,
  signAttachmentUrl,
  storageFromEnv,
  verifyAttachmentSignature,
} from "../attachment-storage";
import { bytesToBase64, type AttachmentRef } from "../attachments";

// --- Mock R2 ---------------------------------------------------------------

interface StoredObject {
  bytes: Uint8Array;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

function createMockBucket() {
  const objects = new Map<string, StoredObject>();
  const bucket = {
    objects,
    put: async (
      key: string,
      value: Uint8Array,
      opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
    ) => {
      objects.set(key, {
        bytes: new Uint8Array(value),
        httpMetadata: opts?.httpMetadata,
        customMetadata: opts?.customMetadata,
      });
    },
    get: async (key: string) => {
      const obj = objects.get(key);
      if (!obj) return null;
      return {
        httpMetadata: obj.httpMetadata,
        customMetadata: obj.customMetadata,
        arrayBuffer: async () => obj.bytes.buffer.slice(0),
      };
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
  };
  return bucket as unknown as R2Bucket & { objects: Map<string, StoredObject> };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PNG_B64 = bytesToBase64(PNG);
const SECRET = "test-secret";
const BASE = "https://worker.example";

function ref(overrides: Partial<AttachmentRef> = {}): AttachmentRef {
  return {
    id: "a1",
    name: "shot.png",
    mediaType: "image/png",
    size: PNG.byteLength,
    data: PNG_B64,
    ...overrides,
  };
}

// --- Signed URLs -----------------------------------------------------------

describe("signed attachment URLs", () => {
  const key = "att/example.com/123e4567-e89b-12d3-a456-426614174000";

  it("round-trips a valid signature", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const url = await signAttachmentUrl(BASE, key, exp, SECRET);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(`/api/attachments/${key}`);
    const ok = await verifyAttachmentSignature(
      key,
      parsed.searchParams.get("exp")!,
      parsed.searchParams.get("sig")!,
      SECRET
    );
    expect(ok).toBe(true);
  });

  it("rejects tampered keys, wrong secrets, and expired links", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = new URL(await signAttachmentUrl(BASE, key, exp, SECRET)).searchParams.get("sig")!;

    expect(await verifyAttachmentSignature("att/other/123e4567-e89b-12d3-a456-426614174000", String(exp), sig, SECRET)).toBe(false);
    expect(await verifyAttachmentSignature(key, String(exp), sig, "other")).toBe(false);
    expect(await verifyAttachmentSignature(key, String(exp + 1), sig, SECRET)).toBe(false);
    expect(await verifyAttachmentSignature(key, String(exp), sig, SECRET, (exp + 10) * 1000)).toBe(false);
    expect(await verifyAttachmentSignature(key, undefined, sig, SECRET)).toBe(false);
    expect(await verifyAttachmentSignature(key, String(exp), undefined, SECRET)).toBe(false);
  });
});

// --- R2 backend --------------------------------------------------------------

describe("createR2Storage", () => {
  it("stores bytes with metadata and returns a signed URL", async () => {
    const bucket = createMockBucket();
    const now = Date.UTC(2026, 0, 1);
    const storage = createR2Storage(bucket, {
      retentionHours: 2,
      signingSecret: SECRET,
      baseUrl: BASE,
      now: () => now,
    });

    const stored = await storage.store(ref(), "Example.COM");
    expect(stored.id).toBe("a1");
    expect(stored.key).toMatch(/^att\/example\.com\/[0-9a-f-]{36}$/);
    expect(stored.expiresAt).toBe(new Date(now + 2 * 3600 * 1000).toISOString());
    expect(stored.url).toContain(`${BASE}/api/attachments/${stored.key}?exp=`);

    const obj = bucket.objects.get(stored.key)!;
    expect(obj.bytes).toEqual(PNG);
    expect(obj.httpMetadata?.contentType).toBe("image/png");
    expect(obj.customMetadata?.name).toBe("shot.png");
    expect(obj.customMetadata?.expiresAt).toBe(stored.expiresAt);
  });

  it("loads a stored object and purges it once expired", async () => {
    const bucket = createMockBucket();
    let now = Date.UTC(2026, 0, 1);
    const storage = createR2Storage(bucket, {
      retentionHours: 1,
      signingSecret: SECRET,
      baseUrl: BASE,
      now: () => now,
    });
    const { key } = await storage.store(ref(), "t");

    const loaded = await storage.load(key);
    expect(loaded?.bytes).toEqual(PNG);
    expect(loaded?.mediaType).toBe("image/png");
    expect(loaded?.name).toBe("shot.png");

    now += 2 * 3600 * 1000;
    expect(await storage.load(key)).toBeNull();
    expect(bucket.objects.has(key)).toBe(false);
    expect(await storage.load("att/t/missing")).toBeNull();
  });

  it("refuses to store a ref without data", async () => {
    const storage = createR2Storage(createMockBucket(), {
      retentionHours: 1,
      signingSecret: SECRET,
      baseUrl: BASE,
    });
    await expect(storage.store(ref({ data: undefined }), "t")).rejects.toThrow(/without data/);
  });
});

// --- storageFromEnv ------------------------------------------------------

describe("storageFromEnv", () => {
  it("returns null for passthrough (default)", () => {
    expect(storageFromEnv({}, BASE)).toBeNull();
    expect(storageFromEnv({ ATTACHMENT_STORAGE: "passthrough" }, BASE)).toBeNull();
  });

  it("requires the bucket binding and signing secret in r2 mode", () => {
    expect(() => storageFromEnv({ ATTACHMENT_STORAGE: "r2" }, BASE)).toThrow(AttachmentStorageConfigError);
    expect(() =>
      storageFromEnv({ ATTACHMENT_STORAGE: "r2", ATTACHMENTS: createMockBucket() }, BASE)
    ).toThrow(/SIGNING_SECRET/);
    expect(() => storageFromEnv({ ATTACHMENT_STORAGE: "s3" }, BASE)).toThrow(/Unknown/);
  });

  it("builds an R2 backend when fully configured", () => {
    const storage = storageFromEnv(
      {
        ATTACHMENT_STORAGE: "r2",
        ATTACHMENTS: createMockBucket(),
        ATTACHMENT_SIGNING_SECRET: SECRET,
        ATTACHMENT_RETENTION_HOURS: "48",
      },
      BASE
    );
    expect(storage).not.toBeNull();
  });
});

// --- resolveAttachments ---------------------------------------------------

describe("resolveAttachments", () => {
  it("stores new uploads and hydrates key references", async () => {
    const bucket = createMockBucket();
    const storage = createR2Storage(bucket, {
      retentionHours: 1,
      signingSecret: SECRET,
      baseUrl: BASE,
    });

    // First turn: a new upload.
    const first = ref();
    const stored = await resolveAttachments(
      [{ role: "user", attachments: [first] }],
      storage,
      "tenant"
    );
    expect(stored).toHaveLength(1);
    expect(first.key).toBe(stored[0].key);
    expect(first.data).toBe(PNG_B64); // still forwarded this turn

    // Second turn: the widget references it by key only.
    const byKey = ref({ data: undefined, size: 0, key: stored[0].key });
    const again = await resolveAttachments(
      [
        { role: "user", attachments: [byKey] },
        { role: "assistant" },
      ],
      storage,
      "tenant"
    );
    expect(again).toEqual([]);
    expect(byKey.data).toBe(PNG_B64);
    expect(byKey.size).toBe(PNG.byteLength);

    // A stale key stays unavailable rather than failing the request.
    const stale = ref({ data: undefined, key: "att/tenant/00000000-0000-0000-0000-000000000000" });
    await resolveAttachments([{ role: "user", attachments: [stale] }], storage, "tenant");
    expect(stale.data).toBeUndefined();
  });
});
