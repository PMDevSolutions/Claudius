import { describe, it, expect, vi } from "vitest";

const createMock = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: "Looks like a receipt for $42." }],
  usage: { input_tokens: 50, output_tokens: 8 },
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createMock };
  },
}));

import app from "../index";
import { bytesToBase64 } from "../attachments";

/**
 * Route-level coverage for attachments on POST /api/chat and the signed
 * download route, driving the Hono app through `app.fetch` with mocked KV,
 * R2, and Anthropic.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PNG_B64 = bytesToBase64(PNG);

function createMockKV() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
  } as unknown as KVNamespace & { store: Map<string, string> };
}

function createMockBucket() {
  const objects = new Map<
    string,
    { bytes: Uint8Array; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
  >();
  return {
    objects,
    put: async (key: string, value: Uint8Array, opts?: Record<string, never>) => {
      objects.set(key, { bytes: new Uint8Array(value), ...(opts ?? {}) });
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
    delete: async (key: string) => void objects.delete(key),
  } as unknown as R2Bucket & { objects: Map<string, unknown> };
}

function createMockCtx(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

function baseEnv(extra: Record<string, unknown> = {}) {
  return {
    ANTHROPIC_API_KEY: "test-key",
    ALLOWED_ORIGIN: "https://site.example",
    RATE_LIMIT: createMockKV(),
    ...extra,
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "1.2.3.4",
      Origin: "https://site.example",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function multipartRequest(payload: unknown, files: Array<[string, Uint8Array, string]>) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  for (const [id, bytes, name] of files) {
    form.append(id, new Blob([bytes], { type: "image/png" }), name);
  }
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "cf-connecting-ip": "1.2.3.4", Origin: "https://site.example" },
    body: form,
  });
}

const attachedMessage = (data?: string) => ({
  messages: [
    {
      role: "user",
      content: "How much was this?",
      attachments: [
        { id: "f1", name: "receipt.png", mediaType: "image/png", size: PNG.byteLength, ...(data ? { data } : {}) },
      ],
    },
  ],
});

describe("POST /api/chat with attachments", () => {
  it("accepts a multipart upload and forwards it to the model", async () => {
    createMock.mockClear();
    const res = await app.fetch(
      multipartRequest(attachedMessage(), [["f1", PNG, "receipt.png"]]),
      baseEnv(),
      createMockCtx()
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "Looks like a receipt for $42." });

    const content = createMock.mock.calls[0][0].messages[0].content;
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: PNG_B64 },
    });
  });

  it("accepts inline base64 in a JSON body", async () => {
    const res = await app.fetch(jsonRequest(attachedMessage(PNG_B64)), baseEnv(), createMockCtx());
    expect(res.status).toBe(200);
  });

  it("returns 400 ATTACHMENTS_DISABLED when switched off", async () => {
    const res = await app.fetch(
      jsonRequest(attachedMessage(PNG_B64)),
      baseEnv({ ATTACHMENTS_ENABLED: "false" }),
      createMockCtx()
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("ATTACHMENTS_DISABLED");
  });

  it("returns 400 ATTACHMENT_INVALID for a disallowed type", async () => {
    const body = attachedMessage(PNG_B64);
    body.messages[0].attachments[0].mediaType = "text/plain";
    const res = await app.fetch(jsonRequest(body), baseEnv(), createMockCtx());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("ATTACHMENT_INVALID");
  });

  it("returns 413 ATTACHMENT_TOO_LARGE when a file exceeds the cap", async () => {
    const res = await app.fetch(
      jsonRequest(attachedMessage(PNG_B64)),
      baseEnv({ ATTACHMENT_MAX_BYTES: "4" }),
      createMockCtx()
    );
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("ATTACHMENT_TOO_LARGE");
  });

  it("returns 413 ATTACHMENT_QUOTA_EXCEEDED with Retry-After once the daily quota is spent", async () => {
    const env = baseEnv({ ATTACHMENT_QUOTA_IP_BYTES: String(PNG.byteLength + 1) });
    const first = await app.fetch(jsonRequest(attachedMessage(PNG_B64)), env, createMockCtx());
    expect(first.status).toBe(200);

    const second = await app.fetch(jsonRequest(attachedMessage(PNG_B64)), env, createMockCtx());
    expect(second.status).toBe(413);
    expect((await second.json()).code).toBe("ATTACHMENT_QUOTA_EXCEEDED");
    expect(Number(second.headers.get("Retry-After"))).toBeGreaterThan(0);

    const tenantKeys = [...env.RATE_LIMIT.store.keys()].filter((k) => k.startsWith("attq:tenant:site.example:"));
    expect(tenantKeys).toHaveLength(1);
  });

  it("maps an upstream 400 to ATTACHMENT_INVALID", async () => {
    createMock.mockRejectedValueOnce(Object.assign(new Error("Could not process image"), { status: 400 }));
    const res = await app.fetch(jsonRequest(attachedMessage(PNG_B64)), baseEnv(), createMockCtx());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("ATTACHMENT_INVALID");
  });

  it("returns 500 CONFIG_ERROR when r2 mode is missing its bucket", async () => {
    const res = await app.fetch(
      jsonRequest(attachedMessage(PNG_B64)),
      baseEnv({ ATTACHMENT_STORAGE: "r2" }),
      createMockCtx()
    );
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("CONFIG_ERROR");
  });
});

describe("R2 storage mode", () => {
  function r2Env() {
    return baseEnv({
      ATTACHMENT_STORAGE: "r2",
      ATTACHMENTS: createMockBucket(),
      ATTACHMENT_SIGNING_SECRET: "s3cret",
      ATTACHMENT_RETENTION_HOURS: "1",
    });
  }

  it("stores new uploads, returns their keys/URLs, and serves them via the signed route", async () => {
    const env = r2Env();
    const res = await app.fetch(
      multipartRequest(attachedMessage(), [["f1", PNG, "receipt.png"]]),
      env,
      createMockCtx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBeDefined();
    expect(body.attachments).toHaveLength(1);
    const stored = body.attachments[0];
    expect(stored.id).toBe("f1");
    expect(stored.key).toMatch(/^att\/site\.example\/[0-9a-f-]{36}$/);
    expect(stored.url).toContain("http://localhost/api/attachments/");
    expect(env.ATTACHMENTS.objects.has(stored.key)).toBe(true);

    // The signed URL serves the bytes back.
    const download = await app.fetch(new Request(stored.url), env, createMockCtx());
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Type")).toBe("image/png");
    expect(download.headers.get("Content-Disposition")).toContain('filename="receipt.png"');
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(PNG);

    // Tampering with the signature is rejected; a bad key 404s. Flip the
    // first hex digit so the result always differs from the real signature.
    const tampered = stored.url.replace(/sig=(\w)/, (_m: string, ch: string) =>
      `sig=${ch === "0" ? "1" : "0"}`
    );
    const denied = await app.fetch(new Request(tampered), env, createMockCtx());
    expect(denied.status).toBe(403);
    const missing = await app.fetch(new Request("http://localhost/api/attachments/not-a-key"), env, createMockCtx());
    expect(missing.status).toBe(404);

    // A later turn referencing the key only is hydrated from R2.
    createMock.mockClear();
    const followUp = await app.fetch(
      jsonRequest({
        messages: [
          {
            role: "user",
            content: "How much?",
            attachments: [{ id: "f1", name: "receipt.png", mediaType: "image/png", size: 0, key: stored.key }],
          },
          { role: "assistant", content: "A receipt." },
          { role: "user", content: "Total?" },
        ],
      }),
      env,
      createMockCtx()
    );
    expect(followUp.status).toBe(200);
    expect((await followUp.json()).attachments).toBeUndefined();
    const content = createMock.mock.calls[0][0].messages[0].content;
    expect(content[0].source.data).toBe(PNG_B64);
  });

  it("404s the download route when storage is passthrough", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/attachments/att/t/123e4567-e89b-12d3-a456-426614174000?exp=1&sig=a"),
      baseEnv(),
      createMockCtx()
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/chat/stream with attachments", () => {
  // Minimal Anthropic streaming shape: one text block then end_turn.
  async function* fakeStream() {
    yield { type: "message_start", message: { usage: { input_tokens: 9 } } };
    yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
    yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "A receipt." } };
    yield { type: "content_block_stop", index: 0 };
    yield { type: "message_delta", usage: { output_tokens: 3 }, delta: { stop_reason: "end_turn" } };
  }

  function streamRequest(payload: unknown, files: Array<[string, Uint8Array, string]>) {
    const form = new FormData();
    form.append("payload", JSON.stringify(payload));
    for (const [id, bytes, name] of files) {
      form.append(id, new Blob([bytes], { type: "image/png" }), name);
    }
    return new Request("http://localhost/api/chat/stream", {
      method: "POST",
      headers: { "cf-connecting-ip": "1.2.3.4", Origin: "https://site.example" },
      body: form,
    });
  }

  it("accepts multipart uploads and reports stored attachments on the done event", async () => {
    createMock.mockImplementationOnce(async (params: { stream?: boolean }) =>
      params.stream ? fakeStream() : { content: [], usage: {} }
    );
    const env = baseEnv({
      ATTACHMENT_STORAGE: "r2",
      ATTACHMENTS: createMockBucket(),
      ATTACHMENT_SIGNING_SECRET: "s3cret",
    });

    const res = await app.fetch(
      streamRequest(attachedMessage(), [["f1", PNG, "receipt.png"]]),
      env,
      createMockCtx()
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain("event: chunk");
    const doneLine = text
      .split("\n")
      .find((line, i, lines) => lines[i - 1]?.trim() === "event: done" && line.startsWith("data:"));
    const done = JSON.parse(doneLine!.replace(/^data:\s*/, ""));
    expect(done.reply).toBe("A receipt.");
    expect(done.attachments).toHaveLength(1);
    expect(done.attachments[0].key).toMatch(/^att\/site\.example\//);

    // The model saw the image block, not just text.
    const content = createMock.mock.calls.at(-1)![0].messages[0].content;
    expect(content[0].type).toBe("image");
  });

  it("rejects attachment problems as plain JSON before the stream opens", async () => {
    const res = await app.fetch(
      streamRequest(attachedMessage(), [["f1", PNG, "receipt.png"]]),
      baseEnv({ ATTACHMENT_MAX_BYTES: "4" }),
      createMockCtx()
    );
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("ATTACHMENT_TOO_LARGE");
  });
});
