import { describe, it, expect } from "vitest";
import {
  AttachmentError,
  attachmentConfigFromEnv,
  attachmentToBlock,
  base64DecodedLength,
  base64ToBytes,
  bytesToBase64,
  DEFAULT_ATTACHMENT_TYPES,
  DEFAULT_MAX_ATTACHMENT_BYTES,
  enforceRequestBudget,
  hasAttachments,
  newUploadBytes,
  parseChatRequest,
  sniffMediaType,
  validateAttachments,
  type AttachmentRef,
} from "../attachments";

// --- Fixtures -------------------------------------------------------------

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_HEADER = Array.from(new TextEncoder().encode("%PDF-1.4\n"));

function bytes(header: number[], length = 64): Uint8Array {
  const out = new Uint8Array(length);
  out.set(header);
  for (let i = header.length; i < length; i++) out[i] = i & 0xff;
  return out;
}

const PNG_BYTES = bytes(PNG_HEADER);
const PDF_BYTES = bytes(PDF_HEADER);
const PNG_B64 = bytesToBase64(PNG_BYTES);
const PDF_B64 = bytesToBase64(PDF_BYTES);

function png(overrides: Partial<AttachmentRef> = {}): AttachmentRef {
  return {
    id: "a1",
    name: "shot.png",
    mediaType: "image/png",
    size: 0,
    data: PNG_B64,
    ...overrides,
  };
}

const config = attachmentConfigFromEnv({});

// --- base64 helpers -------------------------------------------------------

describe("base64 helpers", () => {
  it("round-trips bytes", () => {
    expect(base64ToBytes(bytesToBase64(PNG_BYTES))).toEqual(PNG_BYTES);
  });

  it("computes decoded length without decoding", () => {
    for (const len of [1, 2, 3, 4, 63, 64, 65]) {
      const b64 = bytesToBase64(bytes([], len));
      expect(base64DecodedLength(b64)).toBe(len);
    }
    expect(base64DecodedLength("")).toBe(0);
  });

  it("encodes buffers larger than one chunk", () => {
    const big = bytes([], 0x8000 * 2 + 17);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
  });
});

// --- sniffMediaType -------------------------------------------------------

describe("sniffMediaType", () => {
  it("recognizes the supported signatures", () => {
    expect(sniffMediaType(PNG_BYTES)).toBe("image/png");
    expect(sniffMediaType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMediaType(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe(
      "image/gif"
    );
    const webp = bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffMediaType(webp)).toBe("image/webp");
    expect(sniffMediaType(PDF_BYTES)).toBe("application/pdf");
  });

  it("returns null for unknown bytes", () => {
    expect(sniffMediaType(bytes([0x00, 0x01, 0x02]))).toBeNull();
    expect(sniffMediaType(new Uint8Array(0))).toBeNull();
  });
});

// --- attachmentConfigFromEnv ---------------------------------------------

describe("attachmentConfigFromEnv", () => {
  it("uses documented defaults", () => {
    expect(config).toEqual({
      enabled: true,
      allowedTypes: DEFAULT_ATTACHMENT_TYPES,
      maxBytes: DEFAULT_MAX_ATTACHMENT_BYTES,
      maxPerMessage: 5,
      maxRequestBytes: 20 * 1024 * 1024,
    });
  });

  it("reads overrides and ignores garbage", () => {
    const c = attachmentConfigFromEnv({
      ATTACHMENTS_ENABLED: "false",
      ATTACHMENT_TYPES: " image/png , APPLICATION/PDF ",
      ATTACHMENT_MAX_BYTES: "1000",
      ATTACHMENT_MAX_COUNT: "not-a-number",
    });
    expect(c.enabled).toBe(false);
    expect(c.allowedTypes).toEqual(["image/png", "application/pdf"]);
    expect(c.maxBytes).toBe(1000);
    expect(c.maxPerMessage).toBe(5);
  });
});

// --- validateAttachments --------------------------------------------------

describe("validateAttachments", () => {
  it("accepts a valid inline PNG and recomputes its size", () => {
    const att = png({ size: 999 });
    const messages = [{ role: "user", content: "look", attachments: [att] }];
    validateAttachments(messages, config);
    expect(att.size).toBe(PNG_BYTES.byteLength);
  });

  it("accepts a valid PDF", () => {
    const att = png({ name: "doc.pdf", mediaType: "application/pdf", data: PDF_B64 });
    validateAttachments([{ role: "user", content: "", attachments: [att] }], config);
    expect(att.size).toBe(PDF_BYTES.byteLength);
  });

  it("drops empty attachment arrays", () => {
    const message = { role: "user", content: "hi", attachments: [] };
    validateAttachments([message], config);
    expect(message.attachments).toBeUndefined();
  });

  it("rejects attachments on assistant messages", () => {
    expect(() =>
      validateAttachments(
        [{ role: "assistant", content: "x", attachments: [png()] }],
        config
      )
    ).toThrow(/Only user messages/);
  });

  it("rejects disallowed media types", () => {
    const att = png({ mediaType: "image/svg+xml" });
    expect(() =>
      validateAttachments([{ role: "user", content: "", attachments: [att] }], config)
    ).toThrow(/not allowed/);
  });

  it("rejects a declared type that does not match the bytes", () => {
    const att = png({ mediaType: "image/jpeg" });
    expect(() =>
      validateAttachments([{ role: "user", content: "", attachments: [att] }], config)
    ).toThrow(/does not look like image\/jpeg/);
  });

  it("rejects oversized files with a 413 code", () => {
    const small = attachmentConfigFromEnv({ ATTACHMENT_MAX_BYTES: "16" });
    let caught: unknown;
    try {
      validateAttachments(
        [{ role: "user", content: "", attachments: [png()] }],
        small
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AttachmentError);
    expect((caught as AttachmentError).code).toBe("ATTACHMENT_TOO_LARGE");
    expect((caught as AttachmentError).status).toBe(413);
  });

  it("rejects more than maxPerMessage attachments", () => {
    const atts = Array.from({ length: 6 }, (_, i) => png({ id: `a${i}` }));
    expect(() =>
      validateAttachments([{ role: "user", content: "", attachments: atts }], config)
    ).toThrow(/Too many attachments/);
  });

  it("rejects bad ids, duplicate ids, empty names, and bad keys", () => {
    const run = (att: Partial<AttachmentRef>[]) =>
      validateAttachments(
        [{ role: "user", content: "", attachments: att }],
        config
      );
    expect(() => run([png({ id: "has space" })])).toThrow(/id/);
    expect(() => run([png(), png()])).toThrow(/Duplicate/);
    expect(() => run([png({ name: "  " })])).toThrow(/name/);
    expect(() =>
      run([{ id: "k1", name: "x.png", mediaType: "image/png", size: 1, key: "../etc" }])
    ).toThrow(/key/);
  });

  it("accepts a well-formed key reference without data", () => {
    const att: AttachmentRef = {
      id: "k1",
      name: "x.png",
      mediaType: "image/png",
      size: 12,
      key: "att/example.com/123e4567-e89b-12d3-a456-426614174000",
    };
    validateAttachments([{ role: "user", content: "", attachments: [att] }], config);
    expect(att.size).toBe(12);
  });

  it("rejects non-base64 data and empty payloads", () => {
    expect(() =>
      validateAttachments(
        [{ role: "user", content: "", attachments: [png({ data: "not base64!" })] }],
        config
      )
    ).toThrow(/base64/);
    expect(() =>
      validateAttachments(
        [{ role: "user", content: "", attachments: [png({ data: "" })] }],
        config
      )
    ).toThrow(/empty/);
  });
});

// --- newUploadBytes / enforceRequestBudget / hasAttachments -------------

describe("request-level helpers", () => {
  it("hasAttachments detects any non-empty list", () => {
    expect(hasAttachments([{ role: "user", content: "x" }])).toBe(false);
    expect(hasAttachments([{ role: "user", content: "x", attachments: [] }])).toBe(false);
    expect(hasAttachments([{ role: "user", content: "x", attachments: [png()] }])).toBe(true);
  });

  it("newUploadBytes counts inline data on the newest user message only", () => {
    const messages = [
      { role: "user", content: "a", attachments: [png({ size: 100 })] },
      { role: "assistant", content: "b" },
      {
        role: "user",
        content: "c",
        attachments: [png({ id: "x", size: 30 }), png({ id: "y", size: 20, data: undefined, key: "att/t/123e4567-e89b-12d3-a456-426614174000" })],
      },
    ];
    expect(newUploadBytes(messages)).toBe(30);
  });

  it("enforceRequestBudget drops bytes from the oldest messages first", () => {
    const old = png({ id: "old", size: 60 });
    const mid = png({ id: "mid", size: 30 });
    const latest = png({ id: "new", size: 30 });
    const messages = [
      { role: "user", content: "1", attachments: [old] },
      { role: "user", content: "2", attachments: [mid] },
      { role: "user", content: "3", attachments: [latest] },
    ];
    enforceRequestBudget(messages, 70);
    expect(latest.data).toBeDefined();
    expect(mid.data).toBeDefined();
    expect(old.data).toBeUndefined();
    expect(old.key).toBeUndefined();
    expect(old.name).toBe("shot.png");
  });
});

// --- parseChatRequest ----------------------------------------------------

describe("parseChatRequest", () => {
  it("parses a plain JSON body unchanged", async () => {
    const req = new Request("http://x/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    expect(await parseChatRequest(req)).toEqual({
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("merges multipart file parts into their attachment refs", async () => {
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        conversationId: "conv-1",
        messages: [
          {
            role: "user",
            content: "what is this?",
            attachments: [
              { id: "f1", name: "shot.png", mediaType: "image/png", size: 0 },
            ],
          },
        ],
      })
    );
    form.append("f1", new Blob([PNG_BYTES], { type: "image/png" }), "shot.png");
    const req = new Request("http://x/api/chat", { method: "POST", body: form });

    const parsed = await parseChatRequest(req);
    expect(parsed.conversationId).toBe("conv-1");
    const att = parsed.messages[0].attachments![0];
    expect(att.data).toBe(PNG_B64);
    expect(att.size).toBe(PNG_BYTES.byteLength);
  });

  it("rejects a multipart body without a payload field", async () => {
    const form = new FormData();
    form.append("f1", new Blob([PNG_BYTES]), "x.png");
    const req = new Request("http://x/api/chat", { method: "POST", body: form });
    await expect(parseChatRequest(req)).rejects.toThrow(/payload/);
  });

  it("rejects file parts that match no attachment", async () => {
    const form = new FormData();
    form.append("payload", JSON.stringify({ messages: [{ role: "user", content: "x" }] }));
    form.append("stray", new Blob([PNG_BYTES]), "x.png");
    const req = new Request("http://x/api/chat", { method: "POST", body: form });
    await expect(parseChatRequest(req)).rejects.toThrow(/no matching attachment/);
  });
});

// --- attachmentToBlock ---------------------------------------------------

describe("attachmentToBlock", () => {
  it("maps images to base64 image blocks", () => {
    expect(attachmentToBlock(png())).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: PNG_B64 },
    });
  });

  it("maps PDFs to document blocks with the filename as title", () => {
    expect(
      attachmentToBlock(png({ name: "invoice.pdf", mediaType: "application/pdf", data: PDF_B64 }))
    ).toEqual({
      type: "document",
      title: "invoice.pdf",
      source: { type: "base64", media_type: "application/pdf", data: PDF_B64 },
    });
  });

  it("renders a text note when bytes are unavailable", () => {
    expect(attachmentToBlock(png({ data: undefined }))).toEqual({
      type: "text",
      text: '[Attachment "shot.png" (image/png) is no longer available]',
    });
  });
});
