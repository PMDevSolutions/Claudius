import type { ChatMessage } from "../api/types";
import type {
  BeforeSendContext,
  ClaudiusPlugin,
  ErrorContext,
  PluginContext,
  PluginReply,
} from "./types";

/**
 * The outcome of running the `onBeforeSend` chain:
 * - `send` — proceed to the network with `message` (possibly transformed).
 * - `respond` — skip the network; render `message` plus the synthesized `reply`.
 * - `abort` — drop the message; render nothing.
 */
export type BeforeSendOutcome =
  | { type: "send"; message: ChatMessage }
  | { type: "respond"; message: ChatMessage; reply: PluginReply }
  | { type: "abort"; reason?: string };

function normalizeReply(reply: string | PluginReply): PluginReply {
  return typeof reply === "string" ? { content: reply } : reply;
}

function warn(plugin: ClaudiusPlugin, hook: string, error: unknown): void {
  // A misbehaving plugin must not break the chat: log and carry on.
  console.error(`[claudius] plugin "${plugin.name}" failed in ${hook}:`, error);
}

/**
 * Run every plugin's `onBeforeSend` hook in order, threading the (possibly
 * transformed) message through the chain. The first hook to call
 * `respondWith` or `abort` stops the chain.
 */
export async function runBeforeSend(
  plugins: readonly ClaudiusPlugin[],
  message: ChatMessage,
  base: PluginContext,
): Promise<BeforeSendOutcome> {
  let current = message;

  for (const plugin of plugins) {
    if (!plugin.onBeforeSend) continue;

    let shortCircuit: BeforeSendOutcome | null = null;
    const ctx: BeforeSendContext = {
      ...base,
      respondWith(reply) {
        shortCircuit = {
          type: "respond",
          message: current,
          reply: normalizeReply(reply),
        };
      },
      abort(reason) {
        shortCircuit = { type: "abort", reason };
      },
    };

    try {
      const result = await plugin.onBeforeSend(current, ctx);
      if (shortCircuit) return shortCircuit;
      if (result) current = result;
    } catch (error) {
      warn(plugin, "onBeforeSend", error);
    }
  }

  return { type: "send", message: current };
}

/**
 * Run every plugin's `onAfterReceive` hook in order, threading the (possibly
 * transformed) assistant message through the chain. Returns the final message.
 */
export async function runAfterReceive(
  plugins: readonly ClaudiusPlugin[],
  message: ChatMessage,
  base: PluginContext,
): Promise<ChatMessage> {
  let current = message;

  for (const plugin of plugins) {
    if (!plugin.onAfterReceive) continue;
    try {
      const result = await plugin.onAfterReceive(current, base);
      if (result) current = result;
    } catch (error) {
      warn(plugin, "onAfterReceive", error);
    }
  }

  return current;
}

/**
 * Run every plugin's `onError` hook in order. Returns the first recovery reply
 * a hook supplies via `respondWith`, or `null` if none recover (the caller
 * then falls back to the normal error UI).
 */
export async function runError(
  plugins: readonly ClaudiusPlugin[],
  error: Error,
  base: PluginContext,
): Promise<PluginReply | null> {
  for (const plugin of plugins) {
    if (!plugin.onError) continue;

    let recovery: PluginReply | null = null;
    const ctx: ErrorContext = {
      ...base,
      respondWith(reply) {
        recovery = normalizeReply(reply);
      },
    };

    try {
      await plugin.onError(error, ctx);
      if (recovery) return recovery;
    } catch (hookError) {
      warn(plugin, "onError", hookError);
    }
  }

  return null;
}
