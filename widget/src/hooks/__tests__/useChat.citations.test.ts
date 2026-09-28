import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "../useChat";
import type { Source } from "../../api/types";

const API_URL = "https://test.workers.dev";
const pricing: Source = {
  url: "https://example.com/pricing",
  title: "Pricing",
  type: "page",
  snippet: "Plans start at $10.",
};
const faq: Source = {
  url: "https://example.com/faq",
  title: "FAQ",
  type: "page",
};

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

/** Let the reader loop consume what was enqueued. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe("useChat citations", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
  });

  it("asks the worker for citations only when the option is on", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: () => Promise.resolve({ reply: "Hi" }),
    });

    const on = renderHook(() => useChat({ apiUrl: API_URL, citations: true }));
    await act(async () => {
      await on.result.current.sendMessage("Prices?");
    });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).citations).toBe(true);

    const off = renderHook(() => useChat({ apiUrl: API_URL }));
    await act(async () => {
      await off.result.current.sendMessage("Prices?");
    });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).not.toHaveProperty(
      "citations",
    );
  });

  it("holds early sources until the first token, then attaches them", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, citations: true }),
    );

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("Prices?");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    stream.emit("sources", { sources: [pricing] });
    await settle();
    // Only the visitor's message: an announcement alone creates no bubble.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("user");

    stream.emit("chunk", { text: "Plans start at $10 [1]." });
    await settle();
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Plans start at $10 [1].",
      sources: [pricing],
    });

    stream.emit("done", { reply: "Plans start at $10 [1]." });
    stream.close();
    await act(async () => {
      await sending;
    });
    expect(result.current.messages[1].sources).toEqual([pricing]);
  });

  it("lets the done event's sources replace the early ones", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, citations: true }),
    );

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("Prices?");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    stream.emit("chunk", { text: "Hi" });
    stream.emit("sources", { sources: [pricing] });
    await settle();
    expect(result.current.messages[1].sources).toEqual([pricing]);

    stream.emit("done", { reply: "Hi", sources: [pricing, faq] });
    stream.close();
    await act(async () => {
      await sending;
    });
    expect(result.current.messages[1].sources).toEqual([pricing, faq]);
  });

  it("creates no message when the stream fails after the announcement", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, citations: true }),
    );

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("Prices?");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    stream.emit("sources", { sources: [pricing] });
    stream.emit("error", {
      error: "AI service temporarily unavailable.",
      code: "STREAM_ERROR",
    });
    stream.close();
    await act(async () => {
      await sending;
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.error).toBe("AI service temporarily unavailable.");
    expect(result.current.canRetry).toBe(true);
  });
});
