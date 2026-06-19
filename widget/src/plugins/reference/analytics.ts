import type { ClaudiusPlugin } from "../types";

/** An analytics event emitted by {@link pluginAnalytics}. */
export type ClaudiusAnalyticsEvent =
  | {
      /** Event discriminant. */
      type: "message_sent";
      /** Always `"user"`. */
      role: "user";
      /** Message text, or `""` when `includeContent` is `false`. */
      content: string;
      /** Length of the message in characters. */
      chars: number;
    }
  | {
      /** Event discriminant. */
      type: "message_received";
      /** Always `"assistant"`. */
      role: "assistant";
      /** Reply text, or `""` when `includeContent` is `false`. */
      content: string;
      /** Length of the reply in characters. */
      chars: number;
    }
  | {
      /** Event discriminant. */
      type: "chat_error";
      /** The error message. */
      message: string;
      /** Machine-readable error code, when available (e.g. `"TIMEOUT"`). */
      code?: string;
    };

/** Options for {@link pluginAnalytics}. */
export interface AnalyticsPluginOptions {
  /**
   * Sink called once per chat lifecycle event. Wire it to your analytics
   * provider (Google Analytics, PostHog, Segment, a custom endpoint, ...).
   */
  onEvent: (event: ClaudiusAnalyticsEvent) => void;
  /**
   * Include message text in `message_sent` / `message_received` events. Set to
   * `false` to record only the character count and avoid logging user content.
   * @defaultValue `true`
   */
  includeContent?: boolean;
}

/**
 * Reference plugin that emits a structured analytics event for every message
 * sent, every reply received, and every error. It never modifies messages.
 *
 * @example
 * ```ts
 * <ChatWidget
 *   apiUrl={url}
 *   plugins={[pluginAnalytics({ onEvent: (e) => gtag("event", e.type, e) })]}
 * />
 * ```
 */
export function pluginAnalytics(
  options: AnalyticsPluginOptions,
): ClaudiusPlugin {
  const { onEvent, includeContent = true } = options;
  const textOf = (content: string) => (includeContent ? content : "");

  return {
    name: "analytics",
    onBeforeSend(message) {
      onEvent({
        type: "message_sent",
        role: "user",
        content: textOf(message.content),
        chars: message.content.length,
      });
    },
    onAfterReceive(message) {
      onEvent({
        type: "message_received",
        role: "assistant",
        content: textOf(message.content),
        chars: message.content.length,
      });
    },
    onError(error) {
      onEvent({
        type: "chat_error",
        message: error.message,
        code: (error as { code?: string }).code,
      });
    },
  };
}
