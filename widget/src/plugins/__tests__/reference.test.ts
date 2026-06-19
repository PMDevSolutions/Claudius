import { describe, it, expect } from "vitest";
import { runBeforeSend, runAfterReceive } from "../runner";
import {
  pluginAnalytics,
  type ClaudiusAnalyticsEvent,
} from "../reference/analytics";
import { pluginRedactPII, redactText } from "../reference/redact-pii";
import { pluginCannedResponses } from "../reference/canned-responses";
import type { ClaudiusPlugin, PluginContext } from "../types";
import type { ChatMessage } from "../../api/types";

const base: PluginContext = { messages: [], apiUrl: "https://api.test" };
const userMsg = (content: string): ChatMessage => ({
  id: "u1",
  role: "user",
  content,
});
const assistantMsg = (content: string): ChatMessage => ({
  id: "a1",
  role: "assistant",
  content,
});

describe("pluginAnalytics", () => {
  it("emits sent, received, and error events", async () => {
    const events: ClaudiusAnalyticsEvent[] = [];
    const plugin = pluginAnalytics({ onEvent: (e) => events.push(e) });

    await runBeforeSend([plugin], userMsg("hello"), base);
    await runAfterReceive([plugin], assistantMsg("hi there"), base);
    await plugin.onError?.(
      Object.assign(new Error("boom"), { code: "TIMEOUT" }),
      { ...base, respondWith: () => {} },
    );

    expect(events).toEqual([
      { type: "message_sent", role: "user", content: "hello", chars: 5 },
      {
        type: "message_received",
        role: "assistant",
        content: "hi there",
        chars: 8,
      },
      { type: "chat_error", message: "boom", code: "TIMEOUT" },
    ]);
  });

  it("omits content but keeps chars when includeContent is false", async () => {
    const events: ClaudiusAnalyticsEvent[] = [];
    const plugin = pluginAnalytics({
      onEvent: (e) => events.push(e),
      includeContent: false,
    });

    await runBeforeSend([plugin], userMsg("secret"), base);
    expect(events[0]).toEqual({
      type: "message_sent",
      role: "user",
      content: "",
      chars: 6,
    });
  });

  it("never modifies the message", async () => {
    const plugin = pluginAnalytics({ onEvent: () => {} });
    const outcome = await runBeforeSend([plugin], userMsg("untouched"), base);
    expect(outcome).toMatchObject({
      type: "send",
      message: { content: "untouched" },
    });
  });
});

describe("pluginRedactPII", () => {
  it("redacts emails, phones, SSNs, and card numbers from outgoing messages", async () => {
    const plugin = pluginRedactPII();
    const outcome = await runBeforeSend(
      [plugin],
      userMsg("mail me at a@b.com or call 555-123-4567"),
      base,
    );
    expect(outcome).toMatchObject({ type: "send" });
    if (outcome.type !== "send") throw new Error("expected send");
    expect(outcome.message.content).toBe(
      "mail me at [redacted] or call [redacted]",
    );
  });

  it("redactText handles SSN and card-like sequences", () => {
    expect(redactText("ssn 123-45-6789", [/\b\d{3}-\d{2}-\d{4}\b/g], "X")).toBe(
      "ssn X",
    );
  });

  it("returns nothing when there is no PII (message unchanged)", async () => {
    const plugin = pluginRedactPII();
    const outcome = await runBeforeSend([plugin], userMsg("just hello"), base);
    expect(outcome).toMatchObject({
      type: "send",
      message: { content: "just hello" },
    });
  });

  it("supports a custom replacement string", async () => {
    const plugin = pluginRedactPII({ replacement: "***" });
    const outcome = await runBeforeSend([plugin], userMsg("a@b.com"), base);
    if (outcome.type !== "send") throw new Error("expected send");
    expect(outcome.message.content).toBe("***");
  });

  it("does not touch replies unless redactReplies is set", async () => {
    const off = pluginRedactPII();
    expect(off.onAfterReceive).toBeUndefined();

    const on = pluginRedactPII({ redactReplies: true });
    const result = await runAfterReceive(
      [on],
      assistantMsg("reach a@b.com"),
      base,
    );
    expect(result.content).toBe("reach [redacted]");
  });
});

describe("pluginCannedResponses", () => {
  const run = (plugin: ClaudiusPlugin, content: string) =>
    runBeforeSend([plugin], userMsg(content), base);

  it("answers a case-insensitive substring match without hitting the network", async () => {
    const plugin = pluginCannedResponses({
      rules: [{ match: "hours", reply: "9 to 5" }],
    });
    const outcome = await run(plugin, "What are your HOURS?");
    expect(outcome).toMatchObject({
      type: "respond",
      reply: { content: "9 to 5" },
    });
  });

  it("supports RegExp and predicate matchers, first match wins", async () => {
    const plugin = pluginCannedResponses({
      rules: [
        { match: /pricing|cost/i, reply: "See /pricing" },
        { match: (c) => c.length > 100, reply: "too long" },
      ],
    });
    expect(await run(plugin, "what is the cost")).toMatchObject({
      type: "respond",
      reply: { content: "See /pricing" },
    });
    expect(await run(plugin, "x".repeat(101))).toMatchObject({
      type: "respond",
      reply: { content: "too long" },
    });
  });

  it("passes through (sends) when no rule matches", async () => {
    const plugin = pluginCannedResponses({
      rules: [{ match: "hours", reply: "x" }],
    });
    const outcome = await run(plugin, "unrelated question");
    expect(outcome.type).toBe("send");
  });

  it("honors caseSensitive for string matchers", async () => {
    const plugin = pluginCannedResponses({
      rules: [{ match: "Help", reply: "hi" }],
      caseSensitive: true,
    });
    expect((await run(plugin, "help me")).type).toBe("send");
    expect((await run(plugin, "Help me")).type).toBe("respond");
  });
});
