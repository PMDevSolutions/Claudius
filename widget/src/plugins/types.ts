import type { ChatMessage, Source } from "../api/types";

/** A value that may be returned synchronously or as a promise. */
export type MaybePromise<T> = T | Promise<T>;

/**
 * A synthesized assistant reply, produced by a plugin instead of (or in
 * recovery from) a network round-trip. Passed to
 * {@link BeforeSendContext.respondWith} and {@link ErrorContext.respondWith}.
 */
export interface PluginReply {
  /** The assistant reply text to render. */
  content: string;
  /** Optional sources to attach to the synthesized reply. */
  sources?: Source[];
}

/**
 * Read-only context shared by every plugin hook.
 *
 * `messages` is a snapshot of the conversation at the moment the hook runs:
 * in {@link ClaudiusPlugin.onBeforeSend} it excludes the in-flight user
 * message; in {@link ClaudiusPlugin.onAfterReceive} and
 * {@link ClaudiusPlugin.onError} it includes it.
 */
export interface PluginContext {
  /** Conversation snapshot, oldest message first. Treat as immutable. */
  readonly messages: readonly ChatMessage[];
  /** The Worker chat endpoint URL the widget posts to. */
  readonly apiUrl: string;
}

/**
 * Context for {@link ClaudiusPlugin.onBeforeSend}. Adds the ability to
 * short-circuit the request before it reaches the network.
 */
export interface BeforeSendContext extends PluginContext {
  /**
   * Skip the network request and render this assistant reply instead. The
   * (possibly modified) user message is still shown. Stops the hook chain —
   * later plugins' `onBeforeSend` hooks do not run.
   */
  respondWith(reply: string | PluginReply): void;
  /**
   * Cancel the send entirely: no request is made and nothing is rendered (the
   * user message is dropped). Stops the hook chain. Use for client-only
   * commands the chat should swallow.
   */
  abort(reason?: string): void;
}

/**
 * Context for {@link ClaudiusPlugin.onError}. Adds the ability to recover from
 * a failed send by rendering a reply in place of the error UI.
 */
export interface ErrorContext extends PluginContext {
  /**
   * Recover from the failure by rendering this assistant reply instead of the
   * error state. Stops the hook chain — later plugins' `onError` hooks do not
   * run.
   */
  respondWith(reply: string | PluginReply): void;
}

/**
 * A client-side middleware that runs around the chat message lifecycle. Pass
 * an array of plugins to {@link ChatWidget} via the `plugins` prop; hooks run
 * in array order.
 *
 * Hooks may be async, and may modify, replace, or short-circuit messages. A
 * hook that throws is caught and logged — a misbehaving plugin will not break
 * the chat — so security-sensitive transforms (e.g. PII redaction) should be
 * written defensively.
 *
 * @example
 * ```ts
 * const logger: ClaudiusPlugin = {
 *   name: "logger",
 *   onBeforeSend: (message) => { console.log("sending", message.content); },
 *   onAfterReceive: (message) => { console.log("received", message.content); },
 * };
 * ```
 */
export interface ClaudiusPlugin {
  /** Stable identifier, used in log messages. */
  name: string;
  /**
   * Runs before the user message is sent. Return a {@link ChatMessage} to
   * replace it (the returned message is both displayed and sent), return
   * nothing to leave it unchanged, or call {@link BeforeSendContext.respondWith}
   * / {@link BeforeSendContext.abort} to short-circuit.
   */
  onBeforeSend?(
    message: ChatMessage,
    ctx: BeforeSendContext,
  ): MaybePromise<ChatMessage | void>;
  /**
   * Runs after the assistant reply is received, before it is rendered. Return
   * a {@link ChatMessage} to replace it, or nothing to leave it unchanged.
   */
  onAfterReceive?(
    message: ChatMessage,
    ctx: PluginContext,
  ): MaybePromise<ChatMessage | void>;
  /**
   * Runs when a send fails. Observe the error, or call
   * {@link ErrorContext.respondWith} to render a fallback reply instead of the
   * error UI.
   */
  onError?(error: Error, ctx: ErrorContext): MaybePromise<void>;
}
