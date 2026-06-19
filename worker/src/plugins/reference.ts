import type { ChatMessage } from "../chat";
import type { ClaudiusServerPlugin } from "./types";

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/** An analytics event emitted by the server {@link pluginAnalytics}. */
export type ServerAnalyticsEvent =
  | { type: "request"; messageCount: number; lastUserChars: number }
  | { type: "response"; chars: number }
  | { type: "error"; message: string };

/** Options for the server {@link pluginAnalytics}. */
export interface ServerAnalyticsOptions {
  /** Sink called once per lifecycle event (log, push to D1, forward, ...). */
  onEvent: (event: ServerAnalyticsEvent) => void;
}

function lastUserMessage(messages: readonly ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  return undefined;
}

/**
 * Reference plugin that emits a structured event for each request, reply, and
 * error. It never modifies the request.
 */
export function pluginAnalytics(
  options: ServerAnalyticsOptions,
): ClaudiusServerPlugin {
  const { onEvent } = options;
  return {
    name: "analytics",
    onBeforeSend(messages) {
      onEvent({
        type: "request",
        messageCount: messages.length,
        lastUserChars: lastUserMessage(messages)?.content.length ?? 0,
      });
    },
    onAfterReceive(reply) {
      onEvent({ type: "response", chars: reply.length });
    },
    onError(error) {
      onEvent({ type: "error", message: error.message });
    },
  };
}

// ---------------------------------------------------------------------------
// Redact PII
// ---------------------------------------------------------------------------

/** Default PII patterns. See the widget's `DEFAULT_PII_PATTERNS` for notes. */
export const DEFAULT_PII_PATTERNS: readonly RegExp[] = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:\d[ -]?){13,16}\b/g,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
];

/** Replace every match of every pattern in `text` with `replacement`. */
export function redactServerText(
  text: string,
  patterns: readonly RegExp[],
  replacement: string,
): string {
  return patterns.reduce((acc, pattern) => {
    pattern.lastIndex = 0;
    return acc.replace(pattern, replacement);
  }, text);
}

/** Options for the server {@link pluginRedactPII}. */
export interface ServerRedactPiiOptions {
  /** Patterns to redact; each must carry the global (`g`) flag. */
  patterns?: readonly RegExp[];
  /** Text substituted for each match. @defaultValue `"[redacted]"` */
  replacement?: string;
  /** Also redact the model's reply. @defaultValue `false` */
  redactReplies?: boolean;
}

/**
 * Reference plugin that strips PII from every message before it reaches the
 * model — defense in depth alongside the widget-side redactor. Optionally
 * redacts the reply too.
 */
export function pluginRedactPII(
  options: ServerRedactPiiOptions = {},
): ClaudiusServerPlugin {
  const {
    patterns = DEFAULT_PII_PATTERNS,
    replacement = "[redacted]",
    redactReplies = false,
  } = options;

  return {
    name: "redact-pii",
    onBeforeSend(messages) {
      return messages.map((m) => ({
        ...m,
        content: redactServerText(m.content, patterns, replacement),
      }));
    },
    onAfterReceive: redactReplies
      ? (reply) => redactServerText(reply, patterns, replacement)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

/** A single intent-matching rule for the server {@link pluginCannedResponses}. */
export interface ServerCannedRule {
  /** Substring (string), pattern (RegExp), or predicate matched against the last user message. */
  match: string | RegExp | ((content: string) => boolean);
  /** The reply text returned when the rule matches. */
  reply: string;
}

/** Options for the server {@link pluginCannedResponses}. */
export interface ServerCannedResponsesOptions {
  /** Rules evaluated in order against the last user message; first match wins. */
  rules: ServerCannedRule[];
  /** Make `string` matchers case-sensitive. @defaultValue `false` */
  caseSensitive?: boolean;
}

function ruleMatches(
  match: ServerCannedRule["match"],
  content: string,
  caseSensitive: boolean,
): boolean {
  if (typeof match === "function") return match(content);
  if (match instanceof RegExp) return match.test(content);
  return caseSensitive
    ? content.includes(match)
    : content.toLowerCase().includes(match.toLowerCase());
}

/**
 * Reference plugin that answers matching requests at the edge without calling
 * the model, via `ctx.respondWith`.
 */
export function pluginCannedResponses(
  options: ServerCannedResponsesOptions,
): ClaudiusServerPlugin {
  const { rules, caseSensitive = false } = options;

  return {
    name: "canned-responses",
    onBeforeSend(messages, ctx) {
      const lastUser = lastUserMessage(messages);
      if (!lastUser) return;
      for (const rule of rules) {
        if (ruleMatches(rule.match, lastUser.content, caseSensitive)) {
          ctx.respondWith(rule.reply);
          return;
        }
      }
    },
  };
}
