import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleChat, ChatRequest, ChatTelemetry } from "./chat";
import { checkRateLimit } from "./rate-limit";
import { recordEvent } from "./analytics";
import { chatPlugins } from "./plugins";
import type { ClaudiusServerPlugin } from "./plugins";
import {
  ATTACHMENT_KEY_RE,
  AttachmentError,
  attachmentConfigFromEnv,
  enforceRequestBudget,
  hasAttachments,
  newUploadBytes,
  parseChatRequest,
  validateAttachments,
} from "./attachments";
import {
  AttachmentStorageConfigError,
  resolveAttachments,
  storageFromEnv,
  verifyAttachmentSignature,
  type StoredAttachment,
} from "./attachment-storage";
import { checkAttachmentQuota, quotaConfigFromEnv } from "./attachment-quota";

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT: KVNamespace;
  ANALYTICS_DB?: D1Database;
  // Optional configuration
  CLAUDE_MODEL?: string;
  MAX_TOKENS?: string;
  RATE_LIMIT_MINUTE?: string;
  RATE_LIMIT_HOUR?: string;
  // Attachments (see attachments.ts / attachment-storage.ts / attachment-quota.ts)
  ATTACHMENTS_ENABLED?: string;
  ATTACHMENT_TYPES?: string;
  ATTACHMENT_MAX_BYTES?: string;
  ATTACHMENT_MAX_COUNT?: string;
  ATTACHMENT_MAX_REQUEST_BYTES?: string;
  ATTACHMENT_QUOTA_IP_BYTES?: string;
  ATTACHMENT_QUOTA_TENANT_BYTES?: string;
  ATTACHMENT_STORAGE?: string;
  ATTACHMENT_RETENTION_HOURS?: string;
  ATTACHMENT_SIGNING_SECRET?: string;
  ATTACHMENTS?: R2Bucket;
  TENANT_ID?: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  limitType?: "minute" | "hour";
}

const app = new Hono<{
  Bindings: Env;
  Variables: { chatRequest?: ChatRequest };
}>();

// Server-side plugins run around POST /api/chat as Hono middleware — the
// equivalent of the widget's `plugins` prop. Empty by default (behavior
// unchanged); add plugins here to enable PII redaction, canned responses,
// analytics, model routing, etc. See docs: /plugins.
const serverPlugins: ClaudiusServerPlugin[] = [];

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      // Comma-separated list, e.g. "https://pmds.info,https://docs.example"
      const allowed = (c.env.ALLOWED_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((o: string) => o.trim())
        .filter(Boolean);
      if (origin?.startsWith("http://localhost:")) {
        return origin;
      }
      return origin && allowed.includes(origin) ? origin : allowed[0];
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  })
);

if (serverPlugins.length > 0) {
  app.use("/api/chat", chatPlugins(serverPlugins));
}

/** Quota tenant: explicit TENANT_ID, else the embedding site's host. */
function resolveTenant(env: Env, origin: string | undefined): string {
  if (env.TENANT_ID) return env.TENANT_ID;
  if (origin) {
    try {
      return new URL(origin).host;
    } catch {
      // fall through
    }
  }
  return "default";
}

/** Anthropic rejects malformed media with a 400; duck-type so SDK mocks work. */
function isUpstreamBadRequest(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === 400
  );
}

app.post("/api/chat", async (c) => {
  const startedAt = Date.now();
  let body: ChatRequest | undefined;
  let telemetry: ChatTelemetry | undefined;
  let statusCode = 200;
  let errorCode: string | undefined;
  let requestHadAttachments = false;

  try {
    const clientIp =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for") ||
      "unknown";

    const rateLimitConfig = {
      minuteLimit: c.env.RATE_LIMIT_MINUTE
        ? parseInt(c.env.RATE_LIMIT_MINUTE, 10)
        : undefined,
      hourLimit: c.env.RATE_LIMIT_HOUR
        ? parseInt(c.env.RATE_LIMIT_HOUR, 10)
        : undefined,
    };

    const rateLimit = await checkRateLimit(
      c.env.RATE_LIMIT,
      clientIp,
      rateLimitConfig
    );

    if (!rateLimit.allowed) {
      const errorMessage =
        rateLimit.limitType === "minute"
          ? "Too many requests. Please wait a minute before trying again."
          : "Hourly limit reached. Please try again later.";

      statusCode = 429;
      errorCode = "RATE_LIMITED";
      return c.json<ErrorResponse>(
        { error: errorMessage, code: errorCode, limitType: rateLimit.limitType },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    // When the plugin middleware ran, it stashed the transformed request here;
    // fall back to parsing the body (JSON or multipart) when no plugins are
    // configured.
    body =
      c.get("chatRequest") ??
      ((await parseChatRequest(c.req.raw)) as ChatRequest);

    let storedAttachments: StoredAttachment[] = [];
    if (Array.isArray(body?.messages) && hasAttachments(body.messages)) {
      requestHadAttachments = true;
      const attachmentConfig = attachmentConfigFromEnv(c.env);
      if (!attachmentConfig.enabled) {
        throw new AttachmentError(
          "Attachments are not enabled on this worker",
          "ATTACHMENTS_DISABLED",
          400
        );
      }
      validateAttachments(body.messages, attachmentConfig);

      const tenant = resolveTenant(c.env, c.req.header("origin"));
      const uploadBytes = newUploadBytes(body.messages);
      if (uploadBytes > attachmentConfig.maxRequestBytes) {
        throw new AttachmentError(
          "Attachments on this message exceed the per-request limit",
          "ATTACHMENT_TOO_LARGE",
          413
        );
      }
      if (uploadBytes > 0) {
        const quota = await checkAttachmentQuota(
          c.env.RATE_LIMIT,
          { ip: clientIp, tenant, bytes: uploadBytes },
          quotaConfigFromEnv(c.env)
        );
        if (!quota.allowed) {
          statusCode = 413;
          errorCode = "ATTACHMENT_QUOTA_EXCEEDED";
          return c.json<ErrorResponse>(
            {
              error: "Daily upload limit reached. Please try again later.",
              code: errorCode,
            },
            {
              status: 413,
              headers: { "Retry-After": String(quota.retryAfter ?? 3600) },
            }
          );
        }
      }

      const storage = storageFromEnv(c.env, new URL(c.req.url).origin);
      if (storage) {
        storedAttachments = await resolveAttachments(
          body.messages,
          storage,
          tenant
        );
      }
      enforceRequestBudget(body.messages, attachmentConfig.maxRequestBytes);
    }

    const chatConfig = {
      model: c.env.CLAUDE_MODEL,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : undefined,
    };

    const result = await handleChat(body, c.env.ANTHROPIC_API_KEY, chatConfig);
    telemetry = result.telemetry;
    return c.json(
      storedAttachments.length > 0
        ? { ...result.response, attachments: storedAttachments }
        : result.response
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    // Attachment problems the client can fix (type, size, count, quota)
    if (error instanceof AttachmentError) {
      statusCode = error.status;
      errorCode = error.code;
      return c.json<ErrorResponse>(
        { error: error.message, code: errorCode },
        error.status
      );
    }

    // Client errors (bad input)
    if (
      message.includes("required") ||
      message.includes("Too many") ||
      message.includes("Invalid message role")
    ) {
      statusCode = 400;
      errorCode = "VALIDATION_ERROR";
      return c.json<ErrorResponse>({ error: message, code: errorCode }, 400);
    }

    // Storage misconfiguration or API key issues
    if (
      error instanceof AttachmentStorageConfigError ||
      message.includes("authentication") ||
      message.includes("api_key")
    ) {
      statusCode = 500;
      errorCode = "CONFIG_ERROR";
      return c.json<ErrorResponse>(
        {
          error: "Service configuration error. Please try again later.",
          code: errorCode,
        },
        500
      );
    }

    // Claude rejected the media itself (corrupt file, unsupported PDF, ...)
    if (requestHadAttachments && isUpstreamBadRequest(error)) {
      statusCode = 400;
      errorCode = "ATTACHMENT_INVALID";
      return c.json<ErrorResponse>(
        {
          error: "An attachment could not be processed. Please try another file.",
          code: errorCode,
        },
        400
      );
    }

    // Model/API errors
    if (message.includes("model") || message.includes("overloaded")) {
      statusCode = 503;
      errorCode = "SERVICE_ERROR";
      return c.json<ErrorResponse>(
        {
          error: "AI service temporarily unavailable. Please try again.",
          code: errorCode,
        },
        503
      );
    }

    // Generic fallback
    statusCode = 500;
    errorCode = "UNKNOWN_ERROR";
    return c.json<ErrorResponse>(
      { error: "Something went wrong. Please try again.", code: errorCode },
      500
    );
  } finally {
    const lastUserMsg = body?.messages
      ?.slice()
      .reverse()
      .find((m) => m.role === "user");
    c.executionCtx.waitUntil(
      recordEvent(c.env.ANALYTICS_DB, {
        conversationId: body?.conversationId,
        messageCount: body?.messages?.length ?? 0,
        lastUserMsgLength: lastUserMsg?.content?.length ?? 0,
        model: telemetry?.model,
        inputTokens: telemetry?.inputTokens,
        outputTokens: telemetry?.outputTokens,
        latencyMs: Date.now() - startedAt,
        statusCode,
        errorCode,
      })
    );
  }
});

/**
 * Serve a stored attachment (R2 mode only). URLs are HMAC-signed by the chat
 * response and expire with the retention window, so anyone holding a link
 * can read the file until then — treat links like the conversation itself.
 */
app.get("/api/attachments/*", async (c) => {
  const key = decodeURIComponent(
    c.req.path.replace(/^\/api\/attachments\//, "")
  );
  if (!ATTACHMENT_KEY_RE.test(key)) {
    return c.json<ErrorResponse>({ error: "Not found" }, 404);
  }

  let storage;
  try {
    storage = storageFromEnv(c.env, new URL(c.req.url).origin);
  } catch {
    storage = null;
  }
  if (!storage || !c.env.ATTACHMENT_SIGNING_SECRET) {
    return c.json<ErrorResponse>({ error: "Not found" }, 404);
  }

  const valid = await verifyAttachmentSignature(
    key,
    c.req.query("exp"),
    c.req.query("sig"),
    c.env.ATTACHMENT_SIGNING_SECRET
  );
  if (!valid) {
    return c.json<ErrorResponse>({ error: "Link is invalid or expired" }, 403);
  }

  const loaded = await storage.load(key);
  if (!loaded) {
    return c.json<ErrorResponse>({ error: "Not found" }, 404);
  }

  const asciiName = loaded.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const expiresIn = Math.max(
    0,
    Math.floor((Date.parse(loaded.expiresAt) - Date.now()) / 1000)
  );
  // `.slice()` yields a Uint8Array backed by a plain ArrayBuffer, which is
  // what the Response body type expects.
  return new Response(loaded.bytes.slice(), {
    status: 200,
    headers: {
      "Content-Type": loaded.mediaType,
      "Content-Length": String(loaded.bytes.byteLength),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(loaded.name)}`,
      "Cache-Control": `private, max-age=${Math.min(expiresIn, 3600)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
