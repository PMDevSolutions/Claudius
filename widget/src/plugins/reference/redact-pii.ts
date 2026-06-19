import type { ChatMessage } from "../../api/types";
import type { ClaudiusPlugin } from "../types";

/**
 * Default PII patterns: email addresses, North-American-style phone numbers,
 * US Social Security numbers, and 13–16 digit card-like sequences. These are
 * intentionally conservative starting points — tune {@link RedactPiiOptions.patterns}
 * for your data.
 */
export const DEFAULT_PII_PATTERNS: readonly RegExp[] = [
  // Email
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // US SSN (before the looser card pattern so it wins on 9-digit groups)
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Card-like: 13–16 digits, optionally separated by spaces or hyphens
  /\b(?:\d[ -]?){13,16}\b/g,
  // Phone: optional +1, area code, 7 digits with common separators
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
];

/** Options for {@link pluginRedactPII}. */
export interface RedactPiiOptions {
  /**
   * Patterns to redact. Each must carry the global (`g`) flag.
   * @defaultValue {@link DEFAULT_PII_PATTERNS}
   */
  patterns?: readonly RegExp[];
  /**
   * Text substituted for each match.
   * @defaultValue `"[redacted]"`
   */
  replacement?: string;
  /**
   * Also redact the assistant's replies, not just outgoing user messages.
   * @defaultValue `false`
   */
  redactReplies?: boolean;
}

/** Replace every match of every pattern in `text` with `replacement`. */
export function redactText(
  text: string,
  patterns: readonly RegExp[],
  replacement: string,
): string {
  return patterns.reduce(
    // Reset lastIndex defensively: a shared global regex is stateful.
    (acc, pattern) => {
      pattern.lastIndex = 0;
      return acc.replace(pattern, replacement);
    },
    text,
  );
}

/**
 * Reference plugin that strips PII from the user's message before it leaves the
 * browser. The redacted text is what gets displayed and sent, so the user sees
 * that redaction happened. Optionally redacts assistant replies too.
 *
 * @example
 * ```ts
 * <ChatWidget apiUrl={url} plugins={[pluginRedactPII()]} />
 * ```
 */
export function pluginRedactPII(
  options: RedactPiiOptions = {},
): ClaudiusPlugin {
  const {
    patterns = DEFAULT_PII_PATTERNS,
    replacement = "[redacted]",
    redactReplies = false,
  } = options;

  const redact = (message: ChatMessage): ChatMessage | void => {
    const content = redactText(message.content, patterns, replacement);
    if (content === message.content) return;
    return { ...message, content };
  };

  return {
    name: "redact-pii",
    onBeforeSend: redact,
    onAfterReceive: redactReplies ? redact : undefined,
  };
}
