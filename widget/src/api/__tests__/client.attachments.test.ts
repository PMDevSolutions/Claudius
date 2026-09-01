import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatApiClient } from "../client";
import type { ChatMessage } from "../types";

const BASE_URL = "https://test.workers.dev";
const PNG_B64 = btoa(
  String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
);

function okResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  };
}

describe("ChatApiClient with attachments", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts multipart/form-data when a message carries inline bytes", async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ reply: "A receipt." }));
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "What is this?",
        attachments: [
          {
            id: "att-1",
            name: "shot.png",
            mediaType: "image/png",
            size: 8,
            data: PNG_B64,
          },
          {
            id: "att-2",
            name: "old.pdf",
            mediaType: "application/pdf",
            size: 5,
            key: "att/t/k",
          },
        ],
      },
    ];

    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
    await client.sendMessage(messages);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/chat`);
    expect(init.method).toBe("POST");
    // fetch sets the multipart boundary; no explicit Content-Type.
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    const payload = JSON.parse(form.get("payload") as string);
    expect(payload.messages[0].attachments).toEqual([
      { id: "att-1", name: "shot.png", mediaType: "image/png", size: 8 },
      {
        id: "att-2",
        name: "old.pdf",
        mediaType: "application/pdf",
        size: 5,
        key: "att/t/k",
      },
    ]);

    const part = form.get("att-1") as File;
    expect(part).toBeInstanceOf(Blob);
    expect(part.name).toBe("shot.png");
    expect(part.type).toBe("image/png");
    expect(part.size).toBe(8);
    expect(form.get("att-2")).toBeNull();

    // The caller's messages are not mutated.
    expect(messages[0].attachments![0].data).toBe(PNG_B64);
  });

  it("keeps posting JSON when attachments have no inline bytes", async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ reply: "ok" }));
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "again?",
        attachments: [
          {
            id: "a",
            name: "x.png",
            mediaType: "image/png",
            size: 1,
            key: "att/t/k",
          },
        ],
      },
    ];
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
    await client.sendMessage(messages);

    const init = mockFetch.mock.calls[0][1];
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ messages }));
  });

  it("returns the worker's stored-attachment metadata", async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        reply: "Stored.",
        attachments: [
          {
            id: "att-1",
            key: "att/t/u",
            url: "https://w/a",
            expiresAt: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });
    const result = await client.sendMessage([
      {
        id: "1",
        role: "user",
        content: "",
        attachments: [
          {
            id: "att-1",
            name: "s.png",
            mediaType: "image/png",
            size: 8,
            data: PNG_B64,
          },
        ],
      },
    ]);
    expect(result.attachments?.[0].key).toBe("att/t/u");
  });
});
