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
      try {
        return new URL(match).hostname;
      } catch {
        return match;
      }
    });
}
