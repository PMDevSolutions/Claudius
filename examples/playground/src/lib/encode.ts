/**
 * Base64url encoding of UTF-8 JSON, used to pass the widget config to the
 * preview iframe via the URL hash and to make playground state shareable.
 * public/preview.html contains the mirror-image decoder; keep them in sync.
 */

export function encodeConfig(value: unknown): string {
  const json = JSON.stringify(value);
  const utf8 = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of utf8) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig<T>(encoded: string): T | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
