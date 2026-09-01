/**
 * File and image attachments: request parsing (JSON + multipart), validation
 * (type allowlist, size, count, magic bytes), and Anthropic content-block
 * construction.
 *
 * Attachments ride on user messages as `attachments: AttachmentRef[]`. Each
 * ref carries either inline base64 `data` (a new upload, or the widget
 * re-sending history in passthrough mode) or a storage `key` (R2 backend) that
 * the worker resolves before calling Claude. A ref with neither is rendered to
 * the model as a short "no longer available" note so follow-up questions still
 * make sense.
 */

/** Media types forwarded to Claude when no `ATTACHMENT_TYPES` override is set. */
export const DEFAULT_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
];

/** Media types the Anthropic API accepts as `image` blocks. */
export const IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Media types the Anthropic API accepts as `document` blocks. */
export const DOCUMENT_MEDIA_TYPES = new Set(["application/pdf"]);

export const DEFAULT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MAX_ATTACHMENTS_PER_MESSAGE = 5;
/** Raw (decoded) bytes forwarded to Claude per request; base64 adds ~33%. */
export const DEFAULT_MAX_REQUEST_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type AttachmentErrorCode =
  | "ATTACHMENTS_DISABLED"
  | "ATTACHMENT_INVALID"
  | "ATTACHMENT_TOO_LARGE"
  | "ATTACHMENT_QUOTA_EXCEEDED";

/** Thrown for any attachment problem the client caused; maps to a 4xx. */
export class AttachmentError extends Error {
  readonly code: AttachmentErrorCode;
  readonly status: 400 | 413;

  constructor(message: string, code: AttachmentErrorCode, status: 400 | 413) {
    super(message);
    this.name = "AttachmentError";
    this.code = code;
    this.status = status;
  }
}

/** An attachment as it appears on a request message. */
export interface AttachmentRef {
  /** Client-generated id; multipart file parts are named after it. */
  id: string;
  /** Original filename, shown to the model as the document title. */
  name: string;
  /** MIME type, e.g. `image/png` or `application/pdf`. */
  mediaType: string;
  /** Decoded size in bytes. Recomputed server-side whenever bytes are present. */
  size: number;
  /** Inline base64 payload (no `data:` prefix). */
  data?: string;
  /** Storage key returned by a previous request when the R2 backend is on. */
  key?: string;
}

export interface AttachmentConfig {
  enabled: boolean;
  allowedTypes: string[];
  maxBytes: number;
  maxPerMessage: number;
  maxRequestBytes: number;
}

interface AttachmentEnv {
  ATTACHMENTS_ENABLED?: string;
  ATTACHMENT_TYPES?: string;
  ATTACHMENT_MAX_BYTES?: string;
  ATTACHMENT_MAX_COUNT?: string;
  ATTACHMENT_MAX_REQUEST_BYTES?: string;
}

function intFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function attachmentConfigFromEnv(env: AttachmentEnv): AttachmentConfig {
  const types = env.ATTACHMENT_TYPES
    ? env.ATTACHMENT_TYPES.split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_ATTACHMENT_TYPES;
  return {
    enabled: env.ATTACHMENTS_ENABLED !== "false",
    allowedTypes: types,
    maxBytes: intFromEnv(env.ATTACHMENT_MAX_BYTES, DEFAULT_MAX_ATTACHMENT_BYTES),
    maxPerMessage: intFromEnv(
      env.ATTACHMENT_MAX_COUNT,
      DEFAULT_MAX_ATTACHMENTS_PER_MESSAGE
    ),
    maxRequestBytes: intFromEnv(
      env.ATTACHMENT_MAX_REQUEST_BYTES,
      DEFAULT_MAX_REQUEST_ATTACHMENT_BYTES
    ),
  };
}

// ---------------------------------------------------------------------------
// base64 helpers (Workers has btoa/atob but no Buffer)
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decoded byte length of a base64 string without decoding it. */
export function base64DecodedLength(data: string): number {
  if (data.length === 0) return 0;
  let padding = 0;
  if (data.endsWith("==")) padding = 2;
  else if (data.endsWith("=")) padding = 1;
  return Math.floor((data.length * 3) / 4) - padding;
}

// ---------------------------------------------------------------------------
// Magic-byte sniffing: the declared media type must match the payload.
// ---------------------------------------------------------------------------

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** Returns the media type implied by the leading bytes, or null if unknown. */
export function sniffMediaType(head: Uint8Array): string | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(head, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(head, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif";
  }
  if (
    startsWith(head, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface MessageLike {
  role: string;
  content: unknown;
  attachments?: unknown;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Shape of an R2 storage key: `att/<tenant>/<uuid>`. */
export const ATTACHMENT_KEY_RE = /^att\/[a-z0-9._-]{1,64}\/[0-9a-f-]{36}$/;
const KEY_RE = ATTACHMENT_KEY_RE;
const MAX_NAME_LENGTH = 200;

export function hasAttachments(messages: readonly MessageLike[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.attachments) && m.attachments.length > 0
  );
}

function invalid(message: string): AttachmentError {
  return new AttachmentError(message, "ATTACHMENT_INVALID", 400);
}

/**
 * Validate every attachment on every message in place. Assistant messages may
 * not carry attachments. For inline payloads the decoded size is recomputed
 * and the leading bytes are checked against the declared media type.
 *
 * Throws {@link AttachmentError} on the first violation.
 */
export function validateAttachments(
  messages: MessageLike[],
  config: AttachmentConfig
): void {
  for (const message of messages) {
    if (message.attachments === undefined) continue;
    if (!Array.isArray(message.attachments)) {
      throw invalid("attachments must be an array");
    }
    if (message.attachments.length === 0) {
      delete message.attachments;
      continue;
    }
    if (message.role !== "user") {
      throw invalid("Only user messages may carry attachments");
    }
    if (message.attachments.length > config.maxPerMessage) {
      throw invalid(
        `Too many attachments: at most ${config.maxPerMessage} per message`
      );
    }

    const seen = new Set<string>();
    for (const raw of message.attachments as unknown[]) {
      const att = raw as Partial<AttachmentRef> | null;
      if (!att || typeof att !== "object") {
        throw invalid("Each attachment must be an object");
      }
      if (typeof att.id !== "string" || !ID_RE.test(att.id)) {
        throw invalid("Attachment id is missing or invalid");
      }
      if (seen.has(att.id)) throw invalid("Duplicate attachment id");
      seen.add(att.id);

      if (typeof att.name !== "string" || att.name.trim() === "") {
        throw invalid("Attachment name is required");
      }
      att.name = att.name.trim().slice(0, MAX_NAME_LENGTH);

      if (typeof att.mediaType !== "string") {
        throw invalid("Attachment mediaType is required");
      }
      att.mediaType = att.mediaType.trim().toLowerCase();
      if (!config.allowedTypes.includes(att.mediaType)) {
        throw invalid(`Attachment type "${att.mediaType}" is not allowed`);
      }

      if (att.key !== undefined) {
        if (typeof att.key !== "string" || !KEY_RE.test(att.key)) {
          throw invalid("Attachment key is invalid");
        }
      }

      if (att.data !== undefined) {
        if (typeof att.data !== "string" || !BASE64_RE.test(att.data)) {
          throw invalid("Attachment data must be base64");
        }
        const size = base64DecodedLength(att.data);
        if (size === 0) throw invalid("Attachment is empty");
        if (size > config.maxBytes) {
          throw new AttachmentError(
            `Attachment "${att.name}" exceeds the ${config.maxBytes} byte limit`,
            "ATTACHMENT_TOO_LARGE",
            413
          );
        }
        att.size = size;

        // 24 base64 chars decode to 18 bytes, enough for every signature.
        const sniffed = sniffMediaType(base64ToBytes(att.data.slice(0, 24)));
        if (sniffed !== att.mediaType) {
          throw invalid(
            `Attachment "${att.name}" does not look like ${att.mediaType}`
          );
        }
      } else if (typeof att.size !== "number" || !Number.isFinite(att.size)) {
        att.size = 0;
      }
    }
  }
}

/** Total decoded bytes of inline uploads on the newest user message. */
export function newUploadBytes(messages: readonly MessageLike[]): number {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last || !Array.isArray(last.attachments)) return 0;
  return (last.attachments as AttachmentRef[]).reduce(
    (sum, att) => sum + (att.data ? att.size : 0),
    0
  );
}

/**
 * Keep the total inline payload forwarded to Claude under `maxRequestBytes`
 * by dropping bytes from the oldest messages first. Dropped attachments keep
 * their metadata and are rendered as "no longer available".
 */
export function enforceRequestBudget(
  messages: MessageLike[],
  maxRequestBytes: number
): void {
  let remaining = maxRequestBytes;
  for (let i = messages.length - 1; i >= 0; i--) {
    const atts = messages[i].attachments;
    if (!Array.isArray(atts)) continue;
    for (const att of atts as AttachmentRef[]) {
      if (!att.data) continue;
      if (att.size <= remaining) {
        remaining -= att.size;
      } else {
        delete att.data;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Request parsing: JSON, or multipart/form-data with a `payload` JSON field
// plus one file part per attachment (part name = attachment id).
// ---------------------------------------------------------------------------

export interface ParsedChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    attachments?: AttachmentRef[];
  }>;
  conversationId?: string;
}

export async function parseChatRequest(
  request: Request
): Promise<ParsedChatRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return (await request.json()) as ParsedChatRequest;
  }

  const form = await request.formData();
  const payload = form.get("payload");
  if (typeof payload !== "string") {
    throw invalid("Multipart request is missing the payload field");
  }
  const body = JSON.parse(payload) as ParsedChatRequest;
  if (!Array.isArray(body.messages)) {
    throw new Error("Messages array is required");
  }

  const refsById = new Map<string, AttachmentRef>();
  for (const message of body.messages) {
    if (!Array.isArray(message?.attachments)) continue;
    for (const att of message.attachments) {
      if (att && typeof att.id === "string") refsById.set(att.id, att);
    }
  }

  for (const [field, value] of form.entries()) {
    if (field === "payload") continue;
    if (typeof value === "string") {
      throw invalid(`Unexpected form field "${field}"`);
    }
    const ref = refsById.get(field);
    if (!ref) {
      throw invalid(`File part "${field}" has no matching attachment`);
    }
    const bytes = new Uint8Array(await value.arrayBuffer());
    ref.data = bytesToBase64(bytes);
    ref.size = bytes.byteLength;
    if (!ref.mediaType && value.type) ref.mediaType = value.type;
  }

  return body;
}

// ---------------------------------------------------------------------------
// Anthropic content blocks
// ---------------------------------------------------------------------------

/** Minimal shapes of the SDK's content-block params we emit. */
export type AttachmentContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
    }
  | {
      type: "document";
      title: string;
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

export function attachmentToBlock(att: AttachmentRef): AttachmentContentBlock {
  if (!att.data) {
    return {
      type: "text",
      text: `[Attachment "${att.name}" (${att.mediaType}) is no longer available]`,
    };
  }
  if (IMAGE_MEDIA_TYPES.has(att.mediaType)) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: att.mediaType as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
        data: att.data,
      },
    };
  }
  if (DOCUMENT_MEDIA_TYPES.has(att.mediaType)) {
    return {
      type: "document",
      title: att.name,
      source: { type: "base64", media_type: "application/pdf", data: att.data },
    };
  }
  // Allowed by config but not a type Claude can ingest natively.
  return {
    type: "text",
    text: `[Attachment "${att.name}" (${att.mediaType}) could not be forwarded]`,
  };
}
