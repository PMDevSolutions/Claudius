import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "../useChat";
import type { ChatAttachment } from "../../api/types";
import { defaultTranslations } from "../../i18n";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const API_URL = "https://test.workers.dev";
const STORAGE_KEY = "claudius:messages:test.workers.dev";
const PNG_B64 = btoa(
  String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
);

function attachment(): ChatAttachment {
  return {
    id: "att-1",
    name: "shot.png",
    mediaType: "image/png",
    size: 8,
    data: PNG_B64,
  };
}

function response(status: number, body: Record<string, unknown>) {
  return {
    ok: status < 400,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  };
}

describe("useChat attachments", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
  });

  it("sends an attachment-only message and keeps inline bytes in memory (passthrough)", async () => {
    mockFetch.mockResolvedValueOnce(response(200, { reply: "A receipt." }));
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    await act(async () => {
      await result.current.sendMessage("", [attachment()]);
    });

    expect(result.current.messages).toHaveLength(2);
    const user = result.current.messages[0];
    expect(user.content).toBe("");
    expect(user.attachments?.[0].data).toBe(PNG_B64);

    // Persisted history never contains the bytes.
    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(persisted[0].attachments[0]).toEqual({
      id: "att-1",
      name: "shot.png",
      mediaType: "image/png",
      size: 8,
    });
  });

  it("ignores an empty send with no attachments", async () => {
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));
    await act(async () => {
      await result.current.sendMessage("   ", []);
    });
    expect(result.current.messages).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("swaps inline bytes for storage metadata when the worker stored the upload", async () => {
    mockFetch.mockResolvedValueOnce(
      response(200, {
        reply: "Stored.",
        attachments: [
          {
            id: "att-1",
            key: "att/t/u",
            url: "https://w/api/attachments/att/t/u?exp=1&sig=2",
            expiresAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      }),
    );
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    await act(async () => {
      await result.current.sendMessage("keep this", [attachment()]);
    });

    const att = result.current.messages[0].attachments![0];
    expect(att.data).toBeUndefined();
    expect(att.key).toBe("att/t/u");
    expect(att.url).toBe("https://w/api/attachments/att/t/u?exp=1&sig=2");
    expect(att.expiresAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("rolls back the user message and shows a translated error when the worker rejects an attachment", async () => {
    mockFetch.mockResolvedValueOnce(
      response(413, { error: "too big", code: "ATTACHMENT_TOO_LARGE" }),
    );
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, translations: defaultTranslations }),
    );

    await act(async () => {
      await result.current.sendMessage("look", [attachment()]);
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBe(
      defaultTranslations.errorAttachmentRejected,
    );
    expect(result.current.canRetry).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("[]");
  });

  it("maps the quota error code to its translation", async () => {
    mockFetch.mockResolvedValueOnce(
      response(413, { error: "quota", code: "ATTACHMENT_QUOTA_EXCEEDED" }),
    );
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, translations: defaultTranslations }),
    );
    await act(async () => {
      await result.current.sendMessage("look", [attachment()]);
    });
    expect(result.current.error).toBe(defaultTranslations.errorAttachmentQuota);
  });
});
