import type { ClaudiusPlugin, PluginReply } from "../types";

/** A single intent-matching rule for {@link pluginCannedResponses}. */
export interface CannedRule {
  /**
   * How to match the user's message:
   * - `string` — case-insensitive substring match (see
   *   {@link CannedResponsesOptions.caseSensitive}).
   * - `RegExp` — tested against the message content.
   * - function — receives the content and returns whether it matches.
   */
  match: string | RegExp | ((content: string) => boolean);
  /** The reply rendered when the rule matches. */
  reply: string | PluginReply;
}

/** Options for {@link pluginCannedResponses}. */
export interface CannedResponsesOptions {
  /** Rules evaluated in order; the first match wins. */
  rules: CannedRule[];
  /**
   * Make `string` matchers case-sensitive.
   * @defaultValue `false`
   */
  caseSensitive?: boolean;
}

function ruleMatches(
  match: CannedRule["match"],
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
 * Reference plugin that answers matching messages locally, without calling the
 * API. The first rule whose matcher fires short-circuits the send via
 * `ctx.respondWith`, so the network is never hit for that turn.
 *
 * @example
 * ```ts
 * <ChatWidget
 *   apiUrl={url}
 *   plugins={[pluginCannedResponses({
 *     rules: [
 *       { match: "hours", reply: "We're open 9-5, Mon-Fri." },
 *       { match: /pricing|cost/i, reply: "See https://example.com/pricing." },
 *     ],
 *   })]}
 * />
 * ```
 */
export function pluginCannedResponses(
  options: CannedResponsesOptions,
): ClaudiusPlugin {
  const { rules, caseSensitive = false } = options;

  return {
    name: "canned-responses",
    onBeforeSend(message, ctx) {
      for (const rule of rules) {
        if (ruleMatches(rule.match, message.content, caseSensitive)) {
          ctx.respondWith(rule.reply);
          return;
        }
      }
    },
  };
}
