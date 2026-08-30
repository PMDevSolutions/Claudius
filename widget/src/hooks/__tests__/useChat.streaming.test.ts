import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "../useChat";

const API_URL = "https://test.workers.dev";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const encoder = new TextEncoder();

/** A hand-driven SSE response: tests emit events and close when they choose. */
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

function jsonResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
  };
}

describe("useChat streaming", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
  });

  it("renders tokens progressively and finalizes on done", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch.mock.calls[0][0]).toBe(`${API_URL}/api/chat/stream`);

    act(() => stream.emit("chunk", { text: "Hel" }));
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].content).toBe("Hel");
    });
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.streamingMessageId).toBe(
      result.current.messages[1].id,
    );

    act(() => stream.emit("chunk", { text: "lo!" }));
    await waitFor(() =>
      expect(result.current.messages[1].content).toBe("Hello!"),
    );

    act(() => {
      stream.emit("done", { reply: "Hello!" });
      stream.close();
    });
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingMessageId).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hello!",
    });

    // The finished conversation is persisted.
    const stored = JSON.parse(
      sessionStorage.getItem("claudius:messages:test.workers.dev") ?? "[]",
    );
    expect(stored).toHaveLength(2);
    expect(stored[1].content).toBe("Hello!");
  });

  it("stop() cancels mid-stream and keeps the partial reply", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi");
    });
    act(() => stream.emit("chunk", { text: "Partial answer" }));
    await waitFor(() =>
      expect(result.current.messages[1]?.content).toBe("Partial answer"),
    );

    act(() => result.current.stop());
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.messages[1].content).toBe("Partial answer");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it("stop() before the first token drops the reply silently", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    act(() => result.current.stop());
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps the partial reply and shows an error when the stream fails mid-way", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);

    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi");
    });
    act(() => stream.emit("chunk", { text: "Partial" }));
    await waitFor(() =>
      expect(result.current.messages[1]?.content).toBe("Partial"),
    );

    act(() => {
      stream.emit("error", {
        error: "AI service temporarily unavailable. Please try again.",
        code: "STREAM_ERROR",
      });
      stream.close();
    });
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.messages[1].content).toBe("Partial");
    expect(result.current.error).not.toBeNull();
    // Retrying would duplicate the partial reply; the retry button is hidden.
    expect(result.current.canRetry).toBe(false);
    expect(result.current.isStreaming).toBe(false);
  });

  it("falls back to the non-streaming endpoint when the Worker has no stream route", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(200, { reply: "Fallback reply" }));

    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API_URL}/api/chat/stream`);
    expect(mockFetch.mock.calls[1][0]).toBe(`${API_URL}/api/chat`);
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Fallback reply",
    });
    expect(result.current.error).toBeNull();
  });

  it("streaming: false uses the blocking endpoint directly", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { reply: "Plain" }));

    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, streaming: false }),
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(`${API_URL}/api/chat`);
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Plain",
    });
  });
});
