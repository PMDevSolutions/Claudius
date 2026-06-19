import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { chatPlugins } from "../plugins/middleware";
import {
  pluginRedactPII,
  pluginCannedResponses,
} from "../plugins/reference";
import type { ClaudiusServerPlugin } from "../plugins/types";
import type { ChatRequest } from "../chat";

/**
 * Exercise the `chatPlugins` Hono middleware against a stub route that echoes
 * the last message it receives. This isolates the middleware contract from the
 * Anthropic call: a canned short-circuit never reaches the handler, a
 * `onBeforeSend` transform changes what the handler sees, and an
 * `onAfterReceive` transform rewrites the handler's response.
 */
function buildApp(plugins: ClaudiusServerPlugin[]) {
  const app = new Hono<{ Variables: { chatRequest?: ChatRequest } }>();
  app.use("/chat", chatPlugins(plugins));
  app.post("/chat", async (c) => {
    const body = c.get("chatRequest") ?? (await c.req.json<ChatRequest>());
    const last = body.messages.at(-1);
    return c.json({ reply: `model:${last?.content}` });
  });
  return app;
}

function post(app: ReturnType<typeof buildApp>, ...contents: string[]) {
  return app.request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: contents.map((content) => ({ role: "user", content })),
    }),
  });
}

describe("chatPlugins middleware", () => {
  it("passes through transparently with no plugins", async () => {
    const res = await post(buildApp([]), "hello");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "model:hello" });
  });

  it("short-circuits a canned response without reaching the handler", async () => {
    const app = buildApp([
      pluginCannedResponses({ rules: [{ match: "hours", reply: "9 to 5" }] }),
    ]);
    const res = await post(app, "what are your hours?");
    expect(res.status).toBe(200);
    // "model:" prefix would be present only if the handler ran.
    expect(await res.json()).toEqual({ reply: "9 to 5" });
  });

  it("onBeforeSend transforms what the handler receives", async () => {
    const app = buildApp([pluginRedactPII()]);
    const res = await post(app, "ping a@b.com");
    expect(await res.json()).toEqual({ reply: "model:ping [redacted]" });
  });

  it("onAfterReceive rewrites the handler's reply, preserving status and JSON", async () => {
    const shout: ClaudiusServerPlugin = {
      name: "shout",
      onAfterReceive: (reply) => reply.toUpperCase(),
    };
    const res = await post(buildApp([shout]), "hi");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ reply: "MODEL:HI" });
  });

  it("leaves non-JSON / error responses untouched", async () => {
    const app = new Hono<{ Variables: { chatRequest?: ChatRequest } }>();
    const shout: ClaudiusServerPlugin = {
      name: "shout",
      onAfterReceive: (reply) => reply.toUpperCase(),
    };
    app.use("/chat", chatPlugins([shout]));
    app.post("/chat", (c) => c.text("plain", 500));

    const res = await post(app, "hi");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("plain");
  });
});
