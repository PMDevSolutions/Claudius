import type { ChatMessage } from "../chat";

/** A value that may be returned synchronously or as a promise. */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Read-only context shared by every server plugin hook.
 *
 * This is the server-side counterpart to the widget's `PluginContext`. Because
 * the Worker handles the whole request, hooks operate on the message array and
 * the reply string rather than on individual widget messages.
 */
export interface ServerPluginContext {
  /** The conversation as received, oldest message first. Treat as immutable. */
  readonly messages: readonly ChatMessage[];
  /** Worker environment bindings (secrets, KV, D1, vars). */
  readonly env: Record<string, unknown>;
}

/**
 * Context for {@link ClaudiusServerPlugin.onBeforeSend}. Adds the ability to
 * answer without calling the model.
 */
export interface ServerBeforeSendContext extends ServerPluginContext {
  /**
   * Skip the model call and return this reply text to the client. Stops the
   * hook chain — later plugins' `onBeforeSend` hooks do not run.
   */
  respondWith(reply: string): void;
}

/**
 * A server-side middleware that runs around the chat request lifecycle. Register
 * a list of plugins with {@link chatPlugins} to wrap the `POST /api/chat` route.
 *
 * Hooks may be async and may modify, replace, or short-circuit the request. A
 * hook that throws is caught and logged so a misbehaving plugin will not crash
 * the Worker.
 */
export interface ClaudiusServerPlugin {
  /** Stable identifier, used in log messages. */
  name: string;
  /**
   * Runs before the request reaches the model. Return a new messages array to
   * replace the conversation, return nothing to leave it unchanged, or call
   * {@link ServerBeforeSendContext.respondWith} to answer without the model.
   */
  onBeforeSend?(
    messages: ChatMessage[],
    ctx: ServerBeforeSendContext,
  ): MaybePromise<ChatMessage[] | void>;
  /**
   * Runs after the model replies, before the response is returned. Return a new
   * string to replace the reply, or nothing to leave it unchanged.
   */
  onAfterReceive?(
    reply: string,
    ctx: ServerPluginContext,
  ): MaybePromise<string | void>;
  /** Runs when handling the request throws. Observe and log the error. */
  onError?(error: Error, ctx: ServerPluginContext): MaybePromise<void>;
}
