/**
 * Strips markdown-style formatting from message content so screen readers
 * don't announce literal asterisks or long URLs. Used only for live-region
 * announcements; visual rendering keeps the markers for formatting.
 */
const BOLD = /\*\*([^*]+)\*\*/g;
const ITALIC = /\*([^*]+)\*/g;
const URL_PATTERN = /https?:\/\/[^\s)]+/g;

export function stripAnnouncementFormatting(content: string): string {
  return content
    .replace(BOLD, "$1")
    .replace(ITALIC, "$1")
    .replace(URL_PATTERN, (match) => {
      // Punctuation that ends the sentence is not part of the link. Keep it,
      // or "see example.com/pricing. Then..." loses its sentence break.
      const trailing = match.match(/[.,;:!?'"]+$/)?.[0] ?? "";
      const url = trailing ? match.slice(0, -trailing.length) : match;
      try {
        return new URL(url).hostname + trailing;
      } catch {
        return match;
      }
    });
}
