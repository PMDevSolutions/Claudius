import type { ChatMessage } from "../chat";
import type {
  ClaudiusServerPlugin,
  ServerBeforeSendContext,
  ServerPluginContext,
} from "./types";

/**
 * The outcome of running the server `onBeforeSend` chain:
 * - `send` — call the model with `messages` (possibly transformed).
 * - `respond` — skip the model; return `reply` to the client.
 */
export type ServerBeforeOutcome =
  | { type: "send"; messages: ChatMessage[] }
  | { type: "respond"; reply: string };

function warn(
  plugin: ClaudiusServerPlugin,
  hook: string,
  error: unknown,
): void {
  // A misbehaving plugin must not crash the Worker: log and carry on.
  console.error(`[claudius] plugin "${plugin.name}" failed in ${hook}:`, error);
}

/**
 * Run every plugin's `onBeforeSend` hook in order, threading the (possibly
 * transformed) messages through the chain. The first hook to call `respondWith`
 * stops the chain and short-circuits the model call.
 */
export async function runServerBeforeSend(
  plugins: readonly ClaudiusServerPlugin[],
  messages: ChatMessage[],
  base: ServerPluginContext,
): Promise<ServerBeforeOutcome> {
  let current = messages;

  for (const plugin of plugins) {
    if (!plugin.onBeforeSend) continue;

    let responded: string | null = null;
    const ctx: ServerBeforeSendContext = {
      ...base,
      respondWith(reply) {
        responded = reply;
      },
    };

    try {
      const result = await plugin.onBeforeSend(current, ctx);
      if (responded !== null) return { type: "respond", reply: responded };
      if (result) current = result;
    } catch (error) {
      warn(plugin, "onBeforeSend", error);
    }
  }

  return { type: "send", messages: current };
}

/**
 * Run every plugin's `onAfterReceive` hook in order, threading the (possibly
 * transformed) reply through the chain. Returns the final reply text.
 */
export async function runServerAfterReceive(
  plugins: readonly ClaudiusServerPlugin[],
  reply: string,
  base: ServerPluginContext,
): Promise<string> {
  let current = reply;

  for (const plugin of plugins) {
    if (!plugin.onAfterReceive) continue;
    try {
      const result = await plugin.onAfterReceive(current, base);
      // Allow an empty string ("") to replace the reply; only `undefined`/void
      // means "no change".
      if (typeof result === "string") current = result;
    } catch (error) {
      warn(plugin, "onAfterReceive", error);
    }
  }

  return current;
}

/** Run every plugin's `onError` hook in order, isolating failures. */
export async function runServerError(
  plugins: readonly ClaudiusServerPlugin[],
  error: Error,
  base: ServerPluginContext,
): Promise<void> {
  for (const plugin of plugins) {
    if (!plugin.onError) continue;
    try {
      await plugin.onError(error, base);
    } catch (hookError) {
      warn(plugin, "onError", hookError);
    }
  }
}
