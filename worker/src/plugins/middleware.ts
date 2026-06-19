import type { MiddlewareHandler } from "hono";
import type { ChatRequest, ChatResponse } from "../chat";
import type { ClaudiusServerPlugin, ServerPluginContext } from "./types";
import {
  runServerBeforeSend,
  runServerAfterReceive,
  runServerError,
} from "./runner";

/** Context key under which the transformed request is stashed for the route. */
export const CHAT_REQUEST_KEY = "chatRequest";

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Hono middleware that runs a list of {@link ClaudiusServerPlugin}s around the
 * chat route — the server-side equivalent of the widget's `plugins` prop.
 *
 * It parses the JSON body, runs `onBeforeSend` (which may transform the
 * messages or short-circuit with `respondWith`), stashes the transformed
 * request under `c.get("chatRequest")` for the route handler, then runs
 * `onAfterReceive` over the reply in a successful JSON response.
 *
 * With an empty plugin list it is a transparent pass-through.
 *
 * @example
 * ```ts
 * app.use("/api/chat", chatPlugins([pluginRedactPII()]));
 * app.post("/api/chat", async (c) => {
 *   const body = c.get("chatRequest") ?? (await c.req.json<ChatRequest>());
 *   // ...
 * });
 * ```
 */
export function chatPlugins(
  plugins: ClaudiusServerPlugin[],
): MiddlewareHandler {
  return async (c, next) => {
    if (plugins.length === 0) return next();

    let body: ChatRequest;
    try {
      body = await c.req.json<ChatRequest>();
    } catch {
      // Not a JSON body we can introspect; let the route handle it as usual.
      return next();
    }

    const messages = body.messages ?? [];
    const ctx: ServerPluginContext = {
      messages,
      env: c.env as Record<string, unknown>,
    };

    let outcome;
    try {
      outcome = await runServerBeforeSend(plugins, messages, ctx);
    } catch (error) {
      await runServerError(plugins, asError(error), ctx);
      throw error;
    }

    if (outcome.type === "respond") {
      return c.json<ChatResponse>({ reply: outcome.reply });
    }

    // Hand the (possibly transformed) request to the route handler.
    c.set(CHAT_REQUEST_KEY, { ...body, messages: outcome.messages });

    await next();

    // Transform the reply on a successful JSON response. Any failure here
    // leaves the original response untouched.
    try {
      const res = c.res;
      const isJson = res.headers
        .get("content-type")
        ?.includes("application/json");
      if (!res.ok || !isJson) return;

      const data = (await res.clone().json()) as ChatResponse;
      if (typeof data?.reply !== "string") return;

      const newReply = await runServerAfterReceive(plugins, data.reply, ctx);
      if (newReply === data.reply) return;

      const headers = new Headers(res.headers);
      headers.delete("content-length");
      c.res = new Response(JSON.stringify({ ...data, reply: newReply }), {
        status: res.status,
        headers,
      });
    } catch {
      // Leave the original response in place.
    }
  };
}
