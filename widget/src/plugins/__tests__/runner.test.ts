import { describe, it, expect, vi } from "vitest";
import { runBeforeSend, runAfterReceive, runError } from "../runner";
import type { ClaudiusPlugin, PluginContext } from "../types";
import type { ChatMessage } from "../../api/types";

const base: PluginContext = { messages: [], apiUrl: "https://api.test" };

const userMsg = (content = "hi"): ChatMessage => ({
  id: "u1",
  role: "user",
  content,
});
const assistantMsg = (content = "yo"): ChatMessage => ({
  id: "a1",
  role: "assistant",
  content,
});

describe("runBeforeSend", () => {
  it("returns the original message when no plugins transform it", async () => {
    const outcome = await runBeforeSend([], userMsg("hello"), base);
    expect(outcome).toEqual({ type: "send", message: userMsg("hello") });
  });

  it("threads a transformed message through the chain in order", async () => {
    const upper: ClaudiusPlugin = {
      name: "upper",
      onBeforeSend: (m) => ({ ...m, content: m.content.toUpperCase() }),
    };
    const bang: ClaudiusPlugin = {
      name: "bang",
      onBeforeSend: (m) => ({ ...m, content: `${m.content}!` }),
    };

    const outcome = await runBeforeSend([upper, bang], userMsg("hi"), base);
    expect(outcome).toMatchObject({
      type: "send",
      message: { content: "HI!" },
    });
  });

  it("awaits async hooks", async () => {
    const slow: ClaudiusPlugin = {
      name: "slow",
      onBeforeSend: async (m) => {
        await Promise.resolve();
        return { ...m, content: "async" };
      },
    };
    const outcome = await runBeforeSend([slow], userMsg(), base);
    expect(outcome).toMatchObject({
      type: "send",
      message: { content: "async" },
    });
  });

  it("short-circuits with respondWith, carrying the transformed user message", async () => {
    const transform: ClaudiusPlugin = {
      name: "transform",
      onBeforeSend: (m) => ({ ...m, content: "seen" }),
    };
    const canned: ClaudiusPlugin = {
      name: "canned",
      onBeforeSend: (_m, ctx) => ctx.respondWith("canned reply"),
    };
    const never = vi.fn();
    const after: ClaudiusPlugin = { name: "after", onBeforeSend: never };

    const outcome = await runBeforeSend(
      [transform, canned, after],
      userMsg(),
      base,
    );

    expect(outcome).toEqual({
      type: "respond",
      message: { id: "u1", role: "user", content: "seen" },
      reply: { content: "canned reply" },
    });
    expect(never).not.toHaveBeenCalled();
  });

  it("supports respondWith with a full PluginReply (sources)", async () => {
    const sources = [{ url: "https://x", title: "X", type: "page" as const }];
    const plugin: ClaudiusPlugin = {
      name: "p",
      onBeforeSend: (_m, ctx) => ctx.respondWith({ content: "r", sources }),
    };
    const outcome = await runBeforeSend([plugin], userMsg(), base);
    expect(outcome).toMatchObject({
      type: "respond",
      reply: { content: "r", sources },
    });
  });

  it("aborts and stops the chain", async () => {
    const never = vi.fn();
    const abort: ClaudiusPlugin = {
      name: "abort",
      onBeforeSend: (_m, ctx) => ctx.abort("nope"),
    };
    const after: ClaudiusPlugin = { name: "after", onBeforeSend: never };

    const outcome = await runBeforeSend([abort, after], userMsg(), base);
    expect(outcome).toEqual({ type: "abort", reason: "nope" });
    expect(never).not.toHaveBeenCalled();
  });

  it("isolates a throwing hook and continues the chain", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom: ClaudiusPlugin = {
      name: "boom",
      onBeforeSend: () => {
        throw new Error("kaboom");
      },
    };
    const ok: ClaudiusPlugin = {
      name: "ok",
      onBeforeSend: (m) => ({ ...m, content: "recovered" }),
    };

    const outcome = await runBeforeSend([boom, ok], userMsg(), base);
    expect(outcome).toMatchObject({
      type: "send",
      message: { content: "recovered" },
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('plugin "boom" failed in onBeforeSend'),
      expect.any(Error),
    );
    spy.mockRestore();
  });
});

describe("runAfterReceive", () => {
  it("threads transforms in order", async () => {
    const a: ClaudiusPlugin = {
      name: "a",
      onAfterReceive: (m) => ({ ...m, content: `${m.content}-a` }),
    };
    const b: ClaudiusPlugin = {
      name: "b",
      onAfterReceive: (m) => ({ ...m, content: `${m.content}-b` }),
    };
    const result = await runAfterReceive([a, b], assistantMsg("x"), base);
    expect(result.content).toBe("x-a-b");
  });

  it("leaves the message unchanged when a hook returns nothing", async () => {
    const noop: ClaudiusPlugin = {
      name: "noop",
      onAfterReceive: () => undefined,
    };
    const result = await runAfterReceive([noop], assistantMsg("keep"), base);
    expect(result.content).toBe("keep");
  });

  it("isolates a throwing hook", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom: ClaudiusPlugin = {
      name: "boom",
      onAfterReceive: () => {
        throw new Error("x");
      },
    };
    const result = await runAfterReceive([boom], assistantMsg("safe"), base);
    expect(result.content).toBe("safe");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("runError", () => {
  it("returns the first recovery reply", async () => {
    const observe: ClaudiusPlugin = { name: "observe", onError: vi.fn() };
    const recover: ClaudiusPlugin = {
      name: "recover",
      onError: (_e, ctx) => ctx.respondWith("fallback"),
    };
    const later = vi.fn();
    const after: ClaudiusPlugin = { name: "after", onError: later };

    const reply = await runError(
      [observe, recover, after],
      new Error("fail"),
      base,
    );
    expect(reply).toEqual({ content: "fallback" });
    expect(later).not.toHaveBeenCalled();
  });

  it("returns null when no plugin recovers", async () => {
    const observe: ClaudiusPlugin = { name: "observe", onError: vi.fn() };
    const reply = await runError([observe], new Error("fail"), base);
    expect(reply).toBeNull();
  });

  it("isolates a throwing onError hook", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom: ClaudiusPlugin = {
      name: "boom",
      onError: () => {
        throw new Error("x");
      },
    };
    const reply = await runError([boom], new Error("fail"), base);
    expect(reply).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
