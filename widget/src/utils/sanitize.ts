/**
 * Sanitization utilities for XSS prevention.
 *
 * The widget uses React element rendering (not innerHTML) which is inherently
 * safe for text content. These utilities handle edge cases like URL schemes.
 */

/** Allowed URL schemes for links */
const ALLOWED_URL_SCHEMES = ["http:", "https:"];

/** Maximum allowed message length */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Validates and sanitizes a URL to prevent javascript:, data:, vbscript: attacks.
 *
 * @param url - The URL to sanitize
 * @returns The original URL if safe, or null if potentially malicious
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }

  // Trim whitespace and normalize
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    // Only allow http and https schemes
    if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
      return null;
    }

    return trimmed;
  } catch {
    // If URL parsing fails, check if it looks like a relative URL
    // For this widget, we only want absolute http/https URLs
    return null;
  }
}

/**
 * Checks if a URL is safe to use as an href.
 *
 * @param url - The URL to check
 * @returns true if the URL is safe, false otherwise
 */
export function isUrlSafe(url: string): boolean {
  return sanitizeUrl(url) !== null;
}

/**
 * Validates message content length.
 *
 * @param content - The message content to validate
 * @returns true if the content is within the allowed length
 */
export function isValidMessageLength(content: string): boolean {
  return typeof content === "string" && content.length <= MAX_MESSAGE_LENGTH;
}

/**
 * Sanitizes message content by trimming and enforcing length limits.
 *
 * @param content - The message content to sanitize
 * @returns Sanitized content, or empty string if invalid
 */
export function sanitizeMessageContent(content: string): string {
  if (!content || typeof content !== "string") {
    return "";
  }

  const trimmed = content.trim();

  // Enforce max length
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return trimmed.slice(0, MAX_MESSAGE_LENGTH);
  }

  return trimmed;
}
