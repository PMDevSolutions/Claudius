/**
 * Attachment storage backends.
 *
 * - **passthrough** (default): bytes are forwarded to Anthropic and dropped.
 *   Nothing is written anywhere; the widget re-sends history each turn.
 * - **r2**: new uploads are written to an R2 bucket under a tenant-scoped,
 *   unguessable key, forwarded to Anthropic, and referenced by key on later
 *   turns. Each stored object gets an HMAC-signed download URL that expires
 *   with the retention window so the widget can render previews.
 */
import {
  bytesToBase64,
  type AttachmentRef,
  AttachmentError,
} from "./attachments";

/** Metadata returned to the client for each newly stored attachment. */
export interface StoredAttachment {
  id: string;
  key: string;
  url?: string;
  expiresAt: string;
}

export interface LoadedAttachment {
  bytes: Uint8Array;
  mediaType: string;
  name: string;
  expiresAt: string;
}

export interface AttachmentStorage {
  /** Persist an inline upload and return its key/URL metadata. */
  store(att: AttachmentRef, tenant: string): Promise<StoredAttachment>;
  /** Fetch a stored attachment, or null when missing or expired. */
  load(key: string): Promise<LoadedAttachment | null>;
}

export interface R2StorageOptions {
  retentionHours: number;
  signingSecret: string;
  /** Origin of this worker, used to build signed download URLs. */
  baseUrl: string;
  /** Deletes expired objects lazily on read; injectable for tests. */
  now?: () => number;
}

export const DEFAULT_RETENTION_HOURS = 24;

/** Thrown when the storage backend is misconfigured (maps to 500 CONFIG_ERROR). */
export class AttachmentStorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentStorageConfigError";
  }
}

// ---------------------------------------------------------------------------
// Signed URLs (HMAC-SHA256 over "<key>:<exp>")
// ---------------------------------------------------------------------------

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signAttachmentUrl(
  baseUrl: string,
  key: string,
  expiresAtSeconds: number,
  secret: string
): Promise<string> {
  const sig = await hmacHex(secret, `${key}:${expiresAtSeconds}`);
  return `${baseUrl}/api/attachments/${key}?exp=${expiresAtSeconds}&sig=${sig}`;
}

export async function verifyAttachmentSignature(
  key: string,
  exp: string | undefined,
  sig: string | undefined,
  secret: string,
  now: number = Date.now()
): Promise<boolean> {
  if (!exp || !sig) return false;
  const expiresAt = parseInt(exp, 10);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < now) return false;
  const expected = await hmacHex(secret, `${key}:${expiresAt}`);
  return constantTimeEqual(expected, sig);
}

// ---------------------------------------------------------------------------
// R2 backend
// ---------------------------------------------------------------------------

function safeTenant(tenant: string): string {
  const cleaned = tenant.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return (cleaned || "default").slice(0, 64);
}

export function createR2Storage(
  bucket: R2Bucket,
  options: R2StorageOptions
): AttachmentStorage {
  const now = options.now ?? (() => Date.now());
  const retentionMs = options.retentionHours * 60 * 60 * 1000;

  return {
    async store(att, tenant) {
      if (!att.data) {
        throw new AttachmentError(
          "Cannot store an attachment without data",
          "ATTACHMENT_INVALID",
          400
        );
      }
      const key = `att/${safeTenant(tenant)}/${crypto.randomUUID()}`;
      const expiresAtMs = now() + retentionMs;
      const expiresAt = new Date(expiresAtMs).toISOString();

      // Decode via atob to avoid pulling Buffer into the Workers bundle.
      const binary = atob(att.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      await bucket.put(key, bytes, {
        httpMetadata: { contentType: att.mediaType },
        customMetadata: { name: att.name, expiresAt, tenant },
      });

      const url = await signAttachmentUrl(
        options.baseUrl,
        key,
        Math.floor(expiresAtMs / 1000),
        options.signingSecret
      );
      return { id: att.id, key, url, expiresAt };
    },

    async load(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      const expiresAt = object.customMetadata?.expiresAt ?? "";
      const expiresAtMs = Date.parse(expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs < now()) {
        // Retention elapsed: purge lazily and behave as if it were gone.
        await bucket.delete(key);
        return null;
      }
      return {
        bytes: new Uint8Array(await object.arrayBuffer()),
        mediaType:
          object.httpMetadata?.contentType ?? "application/octet-stream",
        name: object.customMetadata?.name ?? key.split("/").pop() ?? key,
        expiresAt,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Env wiring
// ---------------------------------------------------------------------------

export interface StorageEnv {
  ATTACHMENT_STORAGE?: string;
  ATTACHMENTS?: R2Bucket;
  ATTACHMENT_RETENTION_HOURS?: string;
  ATTACHMENT_SIGNING_SECRET?: string;
}

/**
 * Build the configured storage backend, or null for passthrough. Throws
 * {@link AttachmentStorageConfigError} when `ATTACHMENT_STORAGE=r2` is set
 * without the bucket binding or signing secret.
 */
export function storageFromEnv(
  env: StorageEnv,
  baseUrl: string
): AttachmentStorage | null {
  const mode = (env.ATTACHMENT_STORAGE ?? "passthrough").toLowerCase();
  if (mode === "passthrough") return null;
  if (mode !== "r2") {
    throw new AttachmentStorageConfigError(
      `Unknown ATTACHMENT_STORAGE "${env.ATTACHMENT_STORAGE}"`
    );
  }
  if (!env.ATTACHMENTS) {
    throw new AttachmentStorageConfigError(
      "ATTACHMENT_STORAGE=r2 requires an ATTACHMENTS R2 bucket binding"
    );
  }
  if (!env.ATTACHMENT_SIGNING_SECRET) {
    throw new AttachmentStorageConfigError(
      "ATTACHMENT_STORAGE=r2 requires the ATTACHMENT_SIGNING_SECRET secret"
    );
  }
  const hours = parseInt(env.ATTACHMENT_RETENTION_HOURS ?? "", 10);
  return createR2Storage(env.ATTACHMENTS, {
    retentionHours:
      Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_RETENTION_HOURS,
    signingSecret: env.ATTACHMENT_SIGNING_SECRET,
    baseUrl,
  });
}

/**
 * Persist new inline uploads and hydrate key-only references from storage.
 * Mutates the attachment refs in place (adds `key` to new uploads, fills
 * `data` for loaded ones) and returns metadata for everything stored.
 */
export async function resolveAttachments(
  messages: Array<{ role: string; attachments?: AttachmentRef[] }>,
  storage: AttachmentStorage,
  tenant: string
): Promise<StoredAttachment[]> {
  const stored: StoredAttachment[] = [];
  for (const message of messages) {
    if (message.role !== "user" || !message.attachments) continue;
    for (const att of message.attachments) {
      if (att.data && !att.key) {
        const meta = await storage.store(att, tenant);
        att.key = meta.key;
        stored.push(meta);
      } else if (att.key && !att.data) {
        const loaded = await storage.load(att.key);
        if (loaded) {
          att.data = bytesToBase64(loaded.bytes);
          att.size = loaded.bytes.byteLength;
          att.mediaType = loaded.mediaType;
        }
      }
    }
  }
  return stored;
}
