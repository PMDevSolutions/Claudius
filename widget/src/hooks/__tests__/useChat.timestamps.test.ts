import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChat } from "../useChat";
import type { ClaudiusPlugin } from "../../plugins/types";

const API_URL = "https://test.workers.dev";
const STORAGE_KEY = "claudius:messages:test.workers.dev";
const T1 = "2026-09-19T14:03:00.000Z";
const T2 = "2026-09-19T14:03:05.000Z";
const T3 = "2026-09-19T14:03:09.000Z";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const encoder = new TextEncoder();

function sseStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body,
    },
    emit(event: string, data: unknown) {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    },
    close() {
      controller.close();
    },
  };
}

/** Resolve a blocking reply, moving the clock to `at` as it arrives. */
function mockReplyAt(reply: string, at: string) {
  mockFetch.mockImplementationOnce(async () => {
    vi.setSystemTime(new Date(at));
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply }),
    };
  });
}

describe("useChat timestamps", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T1));
  });
  afterEach(() => vi.useRealTimers());

  it("stamps the visitor message on send and the reply on arrival", async () => {
    mockReplyAt("Hello!", T2);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.messages[0].createdAt).toBe(T1);
    expect(result.current.messages[1].createdAt).toBe(T2);
  });

  it("keeps a streamed reply's time from its first token", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date(T2));
    act(() => stream.emit("chunk", { text: "Hel" }));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1].createdAt).toBe(T2);

    vi.setSystemTime(new Date(T3));
    act(() => {
      stream.emit("done", { reply: "Hello!" });
      stream.close();
    });
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.messages[1].content).toBe("Hello!");
    expect(result.current.messages[1].createdAt).toBe(T2);
  });

  it("persists the timestamps with the history", async () => {
    mockReplyAt("Hello!", T2);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored.map((m: { createdAt?: string }) => m.createdAt)).toEqual([
      T1,
      T2,
    ]);
  });

  it("leaves messages restored from an older version without a time", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "msg-1", role: "user", content: "old" }]),
    );
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    expect(result.current.messages[0].createdAt).toBeUndefined();
  });

  it("restores the time when a plugin returns a fresh message object", async () => {
    mockReplyAt("hello", T2);
    const rebuild: ClaudiusPlugin = {
      name: "rebuild",
      onBeforeSend: (m) => ({ id: m.id, role: m.role, content: m.content }),
      onAfterReceive: (m) => ({
        id: m.id,
        role: m.role,
        content: m.content.toUpperCase(),
      }),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, plugins: [rebuild] }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.messages[0].createdAt).toBe(T1);
    expect(result.current.messages[1]).toMatchObject({
      content: "HELLO",
      createdAt: T2,
    });
  });

  it("stamps both sides of a reply a plugin answered locally", async () => {
    const canned: ClaudiusPlugin = {
      name: "canned",
      onBeforeSend: (_m, ctx) => ctx.respondWith("We open at 9."),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, plugins: [canned] }),
    );

    await act(async () => {
      await result.current.sendMessage("hours?");
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.messages.map((m) => m.createdAt)).toEqual([T1, T1]);
  });

  it("stamps a fallback reply a plugin supplied after an error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.resolve({ error: "boom", code: "UNKNOWN_ERROR" }),
    });
    const recover: ClaudiusPlugin = {
      name: "recover",
      onError: (_e, ctx) => ctx.respondWith("We're offline."),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, plugins: [recover] }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      createdAt: T1,
    });
  });
});
