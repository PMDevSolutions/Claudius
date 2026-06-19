import { describe, it, expect, vi } from "vitest";
import {
  runServerBeforeSend,
  runServerAfterReceive,
  runServerError,
} from "../plugins/runner";
import {
  pluginAnalytics,
  pluginRedactPII,
  pluginCannedResponses,
  redactServerText,
  type ServerAnalyticsEvent,
} from "../plugins/reference";
import type { ClaudiusServerPlugin, ServerPluginContext } from "../plugins/types";
import type { ChatMessage } from "../chat";

const base: ServerPluginContext = { messages: [], env: {} };
const msgs = (...contents: string[]): ChatMessage[] =>
  contents.map((content) => ({ role: "user", content }));

describe("runServerBeforeSend", () => {
  it("threads transformed messages through the chain", async () => {
    const tag: ClaudiusServerPlugin = {
      name: "tag",
      onBeforeSend: (m) => m.map((x) => ({ ...x, content: `[${x.content}]` })),
    };
    const outcome = await runServerBeforeSend([tag], msgs("hi"), base);
    expect(outcome).toEqual({ type: "send", messages: [{ role: "user", content: "[hi]" }] });
  });

  it("short-circuits on respondWith and stops the chain", async () => {
    const canned: ClaudiusServerPlugin = {
      name: "canned",
      onBeforeSend: (_m, ctx) => ctx.respondWith("answered"),
    };
    const never = vi.fn();
    const after: ClaudiusServerPlugin = { name: "after", onBeforeSend: never };

    const outcome = await runServerBeforeSend([canned, after], msgs("q"), base);
    expect(outcome).toEqual({ type: "respond", reply: "answered" });
    expect(never).not.toHaveBeenCalled();
  });

  it("isolates a throwing hook", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom: ClaudiusServerPlugin = {
      name: "boom",
      onBeforeSend: () => {
        throw new Error("x");
      },
    };
    const outcome = await runServerBeforeSend([boom], msgs("hi"), base);
    expect(outcome).toEqual({ type: "send", messages: [{ role: "user", content: "hi" }] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("runServerAfterReceive", () => {
  it("threads reply transforms in order, allowing empty results", async () => {
    const a: ClaudiusServerPlugin = { name: "a", onAfterReceive: (r) => `${r}-a` };
    const result = await runServerAfterReceive([a], "x", base);
    expect(result).toBe("x-a");

    const blank: ClaudiusServerPlugin = { name: "blank", onAfterReceive: () => "" };
    expect(await runServerAfterReceive([blank], "x", base)).toBe("");
  });

  it("leaves the reply unchanged when a hook returns void", async () => {
    const noop: ClaudiusServerPlugin = { name: "noop", onAfterReceive: () => undefined };
    expect(await runServerAfterReceive([noop], "keep", base)).toBe("keep");
  });
});

describe("runServerError", () => {
  it("invokes every onError and isolates throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    const observe: ClaudiusServerPlugin = {
      name: "observe",
      onError: (e) => void seen.push(e.message),
    };
    const boom: ClaudiusServerPlugin = {
      name: "boom",
      onError: () => {
        throw new Error("y");
      },
    };
    await runServerError([observe, boom], new Error("fail"), base);
    expect(seen).toEqual(["fail"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("reference plugins", () => {
  it("pluginAnalytics emits request/response/error events", async () => {
    const events: ServerAnalyticsEvent[] = [];
    const plugin = pluginAnalytics({ onEvent: (e) => events.push(e) });

    await runServerBeforeSend(
      [plugin],
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "..." },
        { role: "user", content: "second" },
      ],
      base,
    );
    await runServerAfterReceive([plugin], "a reply", base);
    await runServerError([plugin], new Error("oops"), base);

    expect(events).toEqual([
      { type: "request", messageCount: 3, lastUserChars: 6 },
      { type: "response", chars: 7 },
      { type: "error", message: "oops" },
    ]);
  });

  it("pluginRedactPII redacts every message and (optionally) the reply", async () => {
    const outcome = await runServerBeforeSend(
      [pluginRedactPII()],
      [{ role: "user", content: "call 555-123-4567 or a@b.com" }],
      base,
    );
    if (outcome.type !== "send") throw new Error("expected send");
    expect(outcome.messages[0].content).toBe("call [redacted] or [redacted]");

    expect(redactServerText("a@b.com", [/\w+@\w+\.\w+/g], "X")).toBe("X");

    const reply = await runServerAfterReceive(
      [pluginRedactPII({ redactReplies: true })],
      "reach a@b.com",
      base,
    );
    expect(reply).toBe("reach [redacted]");
  });

  it("pluginCannedResponses matches the last user message", async () => {
    const plugin = pluginCannedResponses({
      rules: [{ match: /refund/i, reply: "See our refund policy." }],
    });
    const outcome = await runServerBeforeSend(
      [plugin],
      [
        { role: "user", content: "earlier" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "How do I get a REFUND?" },
      ],
      base,
    );
    expect(outcome).toEqual({ type: "respond", reply: "See our refund policy." });
  });

  it("pluginCannedResponses passes through when nothing matches", async () => {
    const plugin = pluginCannedResponses({ rules: [{ match: "refund", reply: "x" }] });
    const outcome = await runServerBeforeSend([plugin], msgs("hello"), base);
    expect(outcome.type).toBe("send");
  });
});
