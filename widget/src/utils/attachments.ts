import type { ChatAttachment, ChatMessage } from "../api/types";

/**
 * Client-side attachment limits. Pass to {@link ChatWidget} via the
 * `attachments` prop (or `true` for the defaults). The worker enforces its own
 * limits independently; keep the two in sync so uploads aren't rejected late.
 */
export interface AttachmentsOptions {
  /**
   * Largest file accepted, in bytes.
   * @defaultValue `5 * 1024 * 1024` (5 MB)
   */
  maxSizeBytes?: number;
  /**
   * Maximum number of files per message.
   * @defaultValue `5`
   */
  maxCount?: number;
  /**
   * Accepted MIME types.
   * @defaultValue `["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]`
   */
  allowedTypes?: string[];
}

/** {@link AttachmentsOptions} with every field filled in. */
export type ResolvedAttachmentsConfig = Required<AttachmentsOptions>;

/** Defaults applied when attachments are enabled with `true` or a partial config. */
export const DEFAULT_ATTACHMENT_OPTIONS: ResolvedAttachmentsConfig = {
  maxSizeBytes: 5 * 1024 * 1024,
  maxCount: 5,
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
  ],
};

/**
 * Turn the `attachments` prop into a full config, or `null` when attachments
 * are disabled (`false` / `undefined`).
 */
export function resolveAttachmentsConfig(
  input: boolean | AttachmentsOptions | undefined | null,
): ResolvedAttachmentsConfig | null {
  if (!input) return null;
  if (input === true) return DEFAULT_ATTACHMENT_OPTIONS;
  return {
    maxSizeBytes: input.maxSizeBytes ?? DEFAULT_ATTACHMENT_OPTIONS.maxSizeBytes,
    maxCount: input.maxCount ?? DEFAULT_ATTACHMENT_OPTIONS.maxCount,
    allowedTypes: (
      input.allowedTypes ?? DEFAULT_ATTACHMENT_OPTIONS.allowedTypes
    )
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  };
}

/** Human-readable size, e.g. `"512 KB"` or `"1.5 MB"`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

/**
 * Best-effort MIME type for a file: the browser-reported type, falling back to
 * the extension (some drag sources and clipboards omit `File.type`).
 */
export function detectMediaType(file: File): string {
  const reported = (file.type || "").trim().toLowerCase();
  if (reported) return reported;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? "";
}

/** Whether a MIME type is one of the image types the widget previews. */
export function isImageType(mediaType: string): boolean {
  return mediaType.startsWith("image/");
}

/**
 * Source usable in an `<img>` for an image attachment: its signed `url`
 * (http/https only) or an inline data URL. Undefined for non-images and for
 * attachments whose bytes are gone.
 */
export function attachmentPreviewSrc(att: ChatAttachment): string | undefined {
  if (!isImageType(att.mediaType)) return undefined;
  if (att.url) {
    try {
      const parsed = new URL(att.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return att.url;
      }
    } catch {
      // fall through to inline data
    }
  }
  if (att.data) return `data:${att.mediaType};base64,${att.data}`;
  return undefined;
}

/** Reason a file was refused by {@link validateFiles}. */
export type FileRejectionReason = "type" | "size" | "count";

/** Outcome of {@link validateFiles}. */
export interface FileValidationResult {
  /** Files that passed every check, in input order. */
  accepted: File[];
  /** Files that were refused, with the first failing check. */
  rejected: Array<{ file: File; reason: FileRejectionReason }>;
}

/**
 * Apply the type allowlist, size cap, and per-message count to a batch of
 * files. `existingCount` is the number of attachments already pending.
 */
export function validateFiles(
  files: readonly File[],
  existingCount: number,
  config: ResolvedAttachmentsConfig,
): FileValidationResult {
  const accepted: File[] = [];
  const rejected: FileValidationResult["rejected"] = [];
  let room = Math.max(0, config.maxCount - existingCount);

  for (const file of files) {
    const type = detectMediaType(file);
    if (!type || !config.allowedTypes.includes(type)) {
      rejected.push({ file, reason: "type" });
    } else if (file.size > config.maxSizeBytes || file.size === 0) {
      rejected.push({ file, reason: "size" });
    } else if (room <= 0) {
      rejected.push({ file, reason: "count" });
    } else {
      accepted.push(file);
      room -= 1;
    }
  }

  return { accepted, rejected };
}

/** Read a file's bytes as base64 (no `data:` prefix). */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

let attachmentCounter = 0;

/** Unique, URL-safe attachment id (also the multipart part name). */
export function createAttachmentId(): string {
  attachmentCounter += 1;
  return `att-${Date.now().toString(36)}-${attachmentCounter}`;
}

/** Convert a browser `File` into an inline {@link ChatAttachment}. */
export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const data = await readFileAsBase64(file);
  return {
    id: createAttachmentId(),
    name: file.name || "attachment",
    mediaType: detectMediaType(file),
    size: file.size,
    data,
  };
}

/**
 * Copy of `messages` with inline attachment bytes removed, for storage. Keeps
 * names, keys, and signed URLs so previews and follow-ups still work.
 */
export function stripAttachmentData(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (!m.attachments?.some((a) => a.data)) return m;
    return {
      ...m,
      attachments: m.attachments.map((a) => {
        if (!a.data) return a;
        const copy = { ...a };
        delete copy.data;
        return copy;
      }),
    };
  });
}

/**
 * Apply the worker's storage metadata to the matching user-message
 * attachments: record key/url/expiry and drop the inline bytes so the next
 * turn references the stored copy instead of re-uploading.
 */
export function applyStoredAttachments(
  messages: ChatMessage[],
  stored: readonly ChatAttachmentStorageInfo[] | undefined,
): ChatMessage[] {
  if (!stored || stored.length === 0) return messages;
  const byId = new Map(stored.map((s) => [s.id, s]));
  return messages.map((m) => {
    if (!m.attachments?.some((a) => byId.has(a.id))) return m;
    return {
      ...m,
      attachments: m.attachments.map((a) => {
        const info = byId.get(a.id);
        if (!info) return a;
        const next: ChatAttachment = {
          ...a,
          key: info.key,
          url: info.url,
          expiresAt: info.expiresAt,
        };
        delete next.data;
        return next;
      }),
    };
  });
}

/** Minimal shape of the worker's stored-attachment metadata. */
export interface ChatAttachmentStorageInfo {
  /** Attachment id the metadata belongs to. */
  id: string;
  /** Worker storage key. */
  key: string;
  /** Signed preview URL, when available. */
  url?: string;
  /** ISO 8601 expiry. */
  expiresAt: string;
}
