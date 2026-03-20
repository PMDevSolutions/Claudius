import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "../useChat";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("useChat", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("starts with empty messages and not loading", () => {
    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sends message and receives reply", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ reply: "Hello! How can I help?" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    await act(async () => {
      await result.current.sendMessage("Hi there");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "Hi there",
    });
    expect(result.current.messages[0].id).toBeDefined();
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hello! How can I help?",
    });
    expect(result.current.messages[1].id).toBeDefined();
  });

  it("sets error on failed fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.error).toBe("Server error");
    expect(result.current.messages).toHaveLength(1);
  });

  it("sets isLoading during request", async () => {
    let resolvePromise: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ reply: "Hello!" }),
      });
      await sendPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });
});
