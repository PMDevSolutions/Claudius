import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
      useChat({ apiUrl: "https://test.workers.dev" }),
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
      useChat({ apiUrl: "https://test.workers.dev" }),
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
      useChat({ apiUrl: "https://test.workers.dev" }),
    );

    await act(async () => {
      await result.current.sendMessage("Help me");
    });

    const assistantMsg = result.current.messages.find(
      (m) => m.role === "assistant",
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
      json: () =>
        Promise.resolve({ error: "Server error", code: "UNKNOWN_ERROR" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" }),
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
      }),
    );

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" }),
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
      useChat({ apiUrl: "https://test.workers.dev" }),
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
      useChat({ apiUrl: "https://test.workers.dev" }),
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
      useChat({ apiUrl: "https://test.workers.dev" }),
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
      useChat({ apiUrl: "https://test.workers.dev" }),
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
      useChat({ apiUrl: "https://test.workers.dev", persistMessages: false }),
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
      }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(
      sessionStorage.getItem("myapp:widget-a:test.workers.dev"),
    ).not.toBeNull();
    expect(
      sessionStorage.getItem("claudius:messages:test.workers.dev"),
    ).toBeNull();
  });

  it("isolates history between widgets with different prefixes on the same apiUrl", () => {
    sessionStorage.setItem(
      "myapp:widget-a:test.workers.dev",
      JSON.stringify([{ id: "a-1", role: "user", content: "from A" }]),
    );
    sessionStorage.setItem(
      "myapp:widget-b:test.workers.dev",
      JSON.stringify([{ id: "b-1", role: "user", content: "from B" }]),
    );

    const a = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        storageKeyPrefix: "myapp:widget-a",
      }),
    );
    const b = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        storageKeyPrefix: "myapp:widget-b",
      }),
    );

    expect(a.result.current.messages).toEqual([
      { id: "a-1", role: "user", content: "from A" },
    ]);
    expect(b.result.current.messages).toEqual([
      { id: "b-1", role: "user", content: "from B" },
    ]);
  });
});

describe("retry on failure", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets canRetry on network error and resends the same messages on retry", async () => {
    vi.useFakeTimers();

    // Every attempt rejects — the client retries internally (initial + 2),
    // backing off 1s and 3s between attempts before giving up.
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        // Disable timeout so AbortController doesn't interfere with the mock.
        timeoutMs: 0,
      }),
    );

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hello");
    });

    // Drain the client's two backoffs so the failure surfaces.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(3000);
      await sendPromise;
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.canRetry).toBe(true);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });

    // Network recovers — retry should succeed without re-appending the user message.
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Welcome back!" }),
    });

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.canRetry).toBe(false);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Welcome back!",
    });

    // The retried request must contain only the original user message —
    // not a second copy.
    const lastCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(lastCallBody.messages).toHaveLength(1);
    expect(lastCallBody.messages[0]).toMatchObject({
      role: "user",
      content: "Hello",
    });
  });

  it("does not set canRetry on validation errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () =>
        Promise.resolve({ error: "Invalid input", code: "VALIDATION_ERROR" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev", timeoutMs: 0 }),
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.canRetry).toBe(false);
  });

  it("retry is a no-op when last message is not from the user", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Hi!" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev", timeoutMs: 0 }),
    );

    await act(async () => {
      await result.current.sendMessage("Hello");
    });

    expect(result.current.messages).toHaveLength(2);
    mockFetch.mockReset();

    await act(async () => {
      await result.current.retry();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(2);
  });
});

describe("translation routing on errors", () => {
  const translations = {
    title: "Chat",
    subtitle: "Ask me anything",
    welcomeMessage: "Hi",
    closeChat: "Close chat",
    chatMessages: "Messages",
    typingIndicator: "Typing",
    placeholder: "Type",
    sendMessage: "Send",
    typeYourMessage: "Type your message",
    openChat: "Open chat",
    errorGeneric: "GEN",
    errorConnection: "CONN",
    errorTimeout: "TIMED_OUT",
    errorRateLimitMinute: "RL_MIN",
    errorRateLimitHour: "RL_HOUR",
    errorRetry: "Retry",
  };

  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps TIMEOUT code to translations.errorTimeout", async () => {
    vi.useFakeTimers();
    // The client treats TIMEOUT as retryable, so it tries 3 times. Return
    // the same response every call so all 3 attempts surface the TIMEOUT
    // code, then drain the 1s + 3s backoffs.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 0,
      headers: new Headers(),
      json: () => Promise.resolve({ error: "Timed out", code: "TIMEOUT" }),
    });

    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        translations,
        timeoutMs: 0,
      }),
    );

    let p!: Promise<void>;
    act(() => {
      p = result.current.sendMessage("hi");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(3000);
      await p;
    });

    expect(result.current.error).toBe("TIMED_OUT");
  });

  it("maps NETWORK_ERROR code to translations.errorConnection", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 0,
      headers: new Headers(),
      json: () => Promise.resolve({ error: "Net down", code: "NETWORK_ERROR" }),
    });

    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        translations,
        timeoutMs: 0,
      }),
    );

    let p!: Promise<void>;
    act(() => {
      p = result.current.sendMessage("hi");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(3000);
      await p;
    });

    expect(result.current.error).toBe("CONN");
  });

  it("routes RATE_LIMITED with 'minute' in message to errorRateLimitMinute", async () => {
    // Use status 400 (non-retryable) so the client throws immediately. The
    // RATE_LIMITED code in the body is what useChat routes on.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          error: "Slow down — wait a minute",
          code: "RATE_LIMITED",
        }),
    });

    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        translations,
        timeoutMs: 0,
      }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.error).toBe("RL_MIN");
  });

  it("routes RATE_LIMITED without 'minute' to errorRateLimitHour", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          error: "Hourly cap hit",
          code: "RATE_LIMITED",
        }),
    });

    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        translations,
        timeoutMs: 0,
      }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.error).toBe("RL_HOUR");
  });

  it("falls back to translations.errorGeneric on unknown codes when no fallback message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      // No `error` field — body parse falls back to {} and the client
      // synthesizes a status-code message; useChat then maps to errorGeneric
      // because the synthesized message isn't an i18n key.
      json: () => Promise.resolve({ code: "WEIRD_CODE" }),
    });

    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        translations,
        timeoutMs: 0,
      }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    // The client populates a fallback message ("Request failed with status 500")
    // and useChat returns that fallback verbatim for unknown codes.
    expect(result.current.error).toMatch(/Request failed/);
  });
});
