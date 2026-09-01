import { describe, it, expect } from "vitest";
import {
  applyStoredAttachments,
  attachmentPreviewSrc,
  DEFAULT_ATTACHMENT_OPTIONS,
  detectMediaType,
  fileToAttachment,
  formatBytes,
  resolveAttachmentsConfig,
  stripAttachmentData,
  validateFiles,
} from "../attachments";
import type { ChatMessage } from "../../api/types";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function file(name: string, type: string, size = 8): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("resolveAttachmentsConfig", () => {
  it("returns null when disabled", () => {
    expect(resolveAttachmentsConfig(undefined)).toBeNull();
    expect(resolveAttachmentsConfig(false)).toBeNull();
    expect(resolveAttachmentsConfig(null)).toBeNull();
  });

  it("returns the defaults for `true`", () => {
    expect(resolveAttachmentsConfig(true)).toEqual(DEFAULT_ATTACHMENT_OPTIONS);
  });

  it("fills in missing fields and normalizes types", () => {
    expect(
      resolveAttachmentsConfig({ maxCount: 2, allowedTypes: [" Image/PNG "] }),
    ).toEqual({
      maxSizeBytes: DEFAULT_ATTACHMENT_OPTIONS.maxSizeBytes,
      maxCount: 2,
      allowedTypes: ["image/png"],
    });
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(-1)).toBe("0 B");
  });
});

describe("detectMediaType", () => {
  it("prefers the browser-reported type and falls back to the extension", () => {
    expect(detectMediaType(file("a.png", "image/png"))).toBe("image/png");
    expect(detectMediaType(file("photo.JPG", ""))).toBe("image/jpeg");
    expect(detectMediaType(file("doc.pdf", ""))).toBe("application/pdf");
    expect(detectMediaType(file("mystery", ""))).toBe("");
  });
});

describe("validateFiles", () => {
  const config = {
    ...DEFAULT_ATTACHMENT_OPTIONS,
    maxSizeBytes: 100,
    maxCount: 2,
  };

  it("accepts allowed files within limits", () => {
    const png = file("a.png", "image/png");
    const pdf = file("b.pdf", "application/pdf");
    expect(validateFiles([png, pdf], 0, config)).toEqual({
      accepted: [png, pdf],
      rejected: [],
    });
  });

  it("rejects by type, size, and count with the first failing reason", () => {
    const txt = file("notes.txt", "text/plain");
    const big = file("big.png", "image/png", 101);
    const empty = file("empty.png", "image/png", 0);
    const ok1 = file("1.png", "image/png");
    const ok2 = file("2.png", "image/png");
    const result = validateFiles([txt, big, empty, ok1, ok2], 1, config);
    expect(result.accepted).toEqual([ok1]);
    expect(result.rejected).toEqual([
      { file: txt, reason: "type" },
      { file: big, reason: "size" },
      { file: empty, reason: "size" },
      { file: ok2, reason: "count" },
    ]);
  });
});

describe("fileToAttachment", () => {
  it("reads the file into a base64 attachment with a unique id", async () => {
    const f = new File([PNG_BYTES], "shot.png", { type: "image/png" });
    const a = await fileToAttachment(f);
    const b = await fileToAttachment(f);
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe("shot.png");
    expect(a.mediaType).toBe("image/png");
    expect(a.size).toBe(PNG_BYTES.byteLength);
    expect(a.data).toBe(btoa(String.fromCharCode(...PNG_BYTES)));
  });
});

describe("attachmentPreviewSrc", () => {
  const base = { id: "a", name: "x.png", mediaType: "image/png", size: 1 };

  it("uses a safe signed URL first, then inline data, else nothing", () => {
    expect(
      attachmentPreviewSrc({ ...base, url: "https://w/x", data: "AA==" }),
    ).toBe("https://w/x");
    expect(
      attachmentPreviewSrc({
        ...base,
        url: "javascript:alert(1)",
        data: "AA==",
      }),
    ).toBe("data:image/png;base64,AA==");
    expect(attachmentPreviewSrc({ ...base, data: "AA==" })).toBe(
      "data:image/png;base64,AA==",
    );
    expect(attachmentPreviewSrc(base)).toBeUndefined();
  });

  it("returns nothing for non-images", () => {
    expect(
      attachmentPreviewSrc({
        ...base,
        mediaType: "application/pdf",
        data: "AA==",
      }),
    ).toBeUndefined();
  });
});

describe("stripAttachmentData / applyStoredAttachments", () => {
  const messages: ChatMessage[] = [
    {
      id: "m1",
      role: "user",
      content: "look",
      attachments: [
        {
          id: "a1",
          name: "x.png",
          mediaType: "image/png",
          size: 1,
          data: "AA==",
        },
        {
          id: "a2",
          name: "y.pdf",
          mediaType: "application/pdf",
          size: 1,
          key: "att/t/k",
        },
      ],
    },
    { id: "m2", role: "assistant", content: "ok" },
  ];

  it("strips inline bytes but keeps everything else", () => {
    const stripped = stripAttachmentData(messages);
    expect(stripped[0].attachments).toEqual([
      { id: "a1", name: "x.png", mediaType: "image/png", size: 1 },
      {
        id: "a2",
        name: "y.pdf",
        mediaType: "application/pdf",
        size: 1,
        key: "att/t/k",
      },
    ]);
    expect(stripped[1]).toBe(messages[1]);
    // The input is not mutated.
    expect(messages[0].attachments![0].data).toBe("AA==");
  });

  it("records storage metadata and drops the bytes for matched ids only", () => {
    const applied = applyStoredAttachments(messages, [
      {
        id: "a1",
        key: "att/t/new",
        url: "https://w/att/t/new?sig=1",
        expiresAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    expect(applied[0].attachments![0]).toEqual({
      id: "a1",
      name: "x.png",
      mediaType: "image/png",
      size: 1,
      key: "att/t/new",
      url: "https://w/att/t/new?sig=1",
      expiresAt: "2026-01-02T00:00:00.000Z",
    });
    expect(applied[0].attachments![1]).toBe(messages[0].attachments![1]);
    expect(applyStoredAttachments(messages, undefined)).toBe(messages);
    expect(applyStoredAttachments(messages, [])).toBe(messages);
  });
});
