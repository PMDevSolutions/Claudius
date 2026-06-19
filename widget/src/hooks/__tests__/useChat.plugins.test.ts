import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "../useChat";
import type { ClaudiusPlugin } from "../../plugins/types";
import { pluginRedactPII } from "../../plugins/reference/redact-pii";
import { pluginCannedResponses } from "../../plugins/reference/canned-responses";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function mockReplyOnce(reply: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({ reply }),
  });
}

function lastFetchBody(): { messages: { role: string; content: string }[] } {
  const init = mockFetch.mock.calls.at(-1)?.[1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe("useChat plugins", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
  });

  it("onBeforeSend transforms both the displayed and the sent message", async () => {
    mockReplyOnce("ok");
    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        plugins: [pluginRedactPII()],
      }),
    );

    await act(async () => {
      await result.current.sendMessage("email me at a@b.com");
    });

    // Displayed user message is redacted...
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "email me at [redacted]",
    });
    // ...and so is what went over the wire.
    expect(lastFetchBody().messages.at(-1)?.content).toBe(
      "email me at [redacted]",
    );
  });

  it("onAfterReceive transforms the assistant reply before render", async () => {
    mockReplyOnce("hello");
    const shout: ClaudiusPlugin = {
      name: "shout",
      onAfterReceive: (m) => ({ ...m, content: m.content.toUpperCase() }),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev", plugins: [shout] }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "HELLO",
    });
  });

  it("a canned response short-circuits the network entirely", async () => {
    const { result } = renderHook(() =>
      useChat({
        apiUrl: "https://test.workers.dev",
        plugins: [
          pluginCannedResponses({
            rules: [{ match: "hours", reply: "9 to 5" }],
          }),
        ],
      }),
    );

    await act(async () => {
      await result.current.sendMessage("what are your hours?");
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "9 to 5",
    });
    expect(result.current.error).toBeNull();
  });

  it("abort drops the message and renders nothing", async () => {
    const swallow: ClaudiusPlugin = {
      name: "swallow",
      onBeforeSend: (_m, ctx) => ctx.abort(),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev", plugins: [swallow] }),
    );

    await act(async () => {
      await result.current.sendMessage("/secret-command");
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });

  it("onError recovers with a fallback reply instead of the error UI", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.resolve({ error: "boom", code: "UNKNOWN_ERROR" }),
    });
    const recover: ClaudiusPlugin = {
      name: "recover",
      onError: (_e, ctx) => ctx.respondWith("We're offline — email help@x.com"),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev", plugins: [recover] }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "We're offline — email help@x.com",
    });
  });
});
