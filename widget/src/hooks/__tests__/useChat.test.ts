import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "../useChat";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("useChat", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
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
      status: 200,
      headers: new Headers(),
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

  it("includes sources from API response in assistant message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          reply: "Here are resources.",
          sources: [
            { url: "https://pmds.info/blog/test", title: "Test", type: "blog" },
          ],
        }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    await act(async () => {
      await result.current.sendMessage("Help me");
    });

    const assistantMsg = result.current.messages.find(
      (m) => m.role === "assistant"
    );
    expect(assistantMsg?.sources).toEqual([
      { url: "https://pmds.info/blog/test", title: "Test", type: "blog" },
    ]);
  });

  it("sets error on failed fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.resolve({ error: "Server error", code: "UNKNOWN_ERROR" }),
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
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ reply: "Hello!" }),
      });
      await sendPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("conversation persistence", () => {
  const STORAGE_KEY = "claudius:messages:test.workers.dev";

  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("saves messages to sessionStorage after receiving a reply", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Hello! How can I help?" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    await act(async () => {
      await result.current.sendMessage("Hi there");
    });

    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ role: "user", content: "Hi there" });
    expect(stored[1]).toMatchObject({
      role: "assistant",
      content: "Hello! How can I help?",
    });
  });

  it("does not write to localStorage", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("restores messages from sessionStorage on mount", () => {
    const savedMessages = [
      { id: "msg-1", role: "user", content: "Hello" },
      { id: "msg-2", role: "assistant", content: "Hi there!" },
    ];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(savedMessages));

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hi there!",
    });
  });

  it("clears sessionStorage when clearMessages is called", () => {
    const savedMessages = [
      { id: "msg-1", role: "user", content: "Hello" },
      { id: "msg-2", role: "assistant", content: "Hi there!" },
    ];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(savedMessages));

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    act(() => {
      result.current.clearMessages();
    });

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.messages).toEqual([]);
  });

  it("does not persist when persistMessages is false", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev", persistMessages: false })
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.messages).toHaveLength(2);
  });
});

describe("storage key prefix", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
  });

  it("uses a custom prefix when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Hi!" }),
    });

    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        storageKeyPrefix: "myapp:widget-a",
      })
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(
      sessionStorage.getItem("myapp:widget-a:test.workers.dev")
    ).not.toBeNull();
    expect(
      sessionStorage.getItem("claudius:messages:test.workers.dev")
    ).toBeNull();
  });

  it("isolates history between widgets with different prefixes on the same apiUrl", () => {
    sessionStorage.setItem(
      "myapp:widget-a:test.workers.dev",
      JSON.stringify([{ id: "a-1", role: "user", content: "from A" }])
    );
    sessionStorage.setItem(
      "myapp:widget-b:test.workers.dev",
      JSON.stringify([{ id: "b-1", role: "user", content: "from B" }])
    );

    const a = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        storageKeyPrefix: "myapp:widget-a",
      })
    );
    const b = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        storageKeyPrefix: "myapp:widget-b",
      })
    );

    expect(a.result.current.messages).toEqual([
      { id: "a-1", role: "user", content: "from A" },
    ]);
    expect(b.result.current.messages).toEqual([
      { id: "b-1", role: "user", content: "from B" },
    ]);
  });
});
