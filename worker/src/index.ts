import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { handleChat, streamChat, ChatRequest, ChatTelemetry } from "./chat";
import { chatTools } from "./tools";
import { createRagFromEnv } from "./rag";
import type { VectorizeIndexLike, WorkersAiLike } from "./rag";
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
  type AttachmentErrorCode,
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
  SYSTEM_PROMPT?: string;
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
  // RAG (optional): both bindings present activates retrieval. See
  // wrangler.toml and the RAG docs page.
  VECTORIZE_INDEX?: VectorizeIndexLike;
  AI?: WorkersAiLike;
  RAG_TOP_K?: string;
  RAG_SCORE_THRESHOLD?: string;
  RAG_CONTEXT_TEMPLATE?: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  limitType?: "minute" | "hour";
}

type AppEnv = { Bindings: Env; Variables: { chatRequest?: ChatRequest } };
type AppContext = Context<AppEnv>;

const app = new Hono<AppEnv>();

// Server-side plugins run around POST /api/chat as Hono middleware — the
// equivalent of the widget's `plugins` prop. Empty by default (behavior
// unchanged); add plugins here to enable PII redaction, canned responses,
// analytics, model routing, etc. See docs: /plugins.
const serverPlugins: ClaudiusServerPlugin[] = [];

interface ClassifiedChatError {
  status: 400 | 413 | 500 | 503;
  code:
    | "VALIDATION_ERROR"
    | "CONFIG_ERROR"
    | "SERVICE_ERROR"
    | "UNKNOWN_ERROR"
    | AttachmentErrorCode;
  error: string;
  /** Seconds until the client may retry, when the failure is time-bound. */
  retryAfter?: number;
}

/** Anthropic rejects malformed media with a 400; duck-type so SDK mocks work. */
function isUpstreamBadRequest(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === 400
  );
}

/**
 * Maps a thrown chat error to an HTTP status, machine code, and safe message.
 * `hadAttachments` lets an upstream 400 be reported as a media problem rather
 * than a generic failure.
 */
function classifyChatError(
  error: unknown,
  hadAttachments = false
): ClassifiedChatError {
  // Attachment problems the client can fix (type, size, count, quota)
  if (error instanceof AttachmentError) {
    return {
      status: error.status,
      code: error.code,
      error: error.message,
      ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
    };
  }

  const message = error instanceof Error ? error.message : "";

  // Client errors (bad input)
  if (
    message.includes("required") ||
    message.includes("Too many") ||
    message.includes("Invalid message role")
  ) {
    return { status: 400, code: "VALIDATION_ERROR", error: message };
  }

  // Storage misconfiguration or API key issues
  if (
    error instanceof AttachmentStorageConfigError ||
    message.includes("authentication") ||
    message.includes("api_key")
  ) {
    return {
      status: 500,
      code: "CONFIG_ERROR",
      error: "Service configuration error. Please try again later.",
    };
  }

  // Claude rejected the media itself (corrupt file, unsupported PDF, ...)
  if (hadAttachments && isUpstreamBadRequest(error)) {
    return {
      status: 400,
      code: "ATTACHMENT_INVALID",
      error: "An attachment could not be processed. Please try another file.",
    };
  }

  // Model/API errors
  if (message.includes("model") || message.includes("overloaded")) {
    return {
      status: 503,
      code: "SERVICE_ERROR",
      error: "AI service temporarily unavailable. Please try again.",
    };
  }

  return {
    status: 500,
    code: "UNKNOWN_ERROR",
    error: "Something went wrong. Please try again.",
  };
}

function errorResponse(c: AppContext, classified: ClassifiedChatError) {
  return c.json<ErrorResponse>(
    { error: classified.error, code: classified.code },
    {
      status: classified.status,
      ...(classified.retryAfter !== undefined
        ? { headers: { "Retry-After": String(classified.retryAfter) } }
        : {}),
    }
  );
}

function getRateLimitConfig(env: Env) {
  return {
    minuteLimit: env.RATE_LIMIT_MINUTE
      ? parseInt(env.RATE_LIMIT_MINUTE, 10)
      : undefined,
    hourLimit: env.RATE_LIMIT_HOUR
      ? parseInt(env.RATE_LIMIT_HOUR, 10)
      : undefined,
  };
}

function getChatConfig(env: Env, body?: ChatRequest) {
  return {
    model: env.CLAUDE_MODEL,
    maxTokens: env.MAX_TOKENS ? parseInt(env.MAX_TOKENS, 10) : undefined,
    systemPrompt: env.SYSTEM_PROMPT,
    // Tools registered at startup (worker/src/tools/index.ts); the chat
    // layer runs the tool_use / tool_result round trip transparently.
    tools: chatTools,
    toolContext: {
      env: env as unknown as Record<string, unknown>,
      conversationId: body?.conversationId,
    },
    // Retrieval config, active only when the Vectorize + AI bindings exist.
    rag: createRagFromEnv(env),
  };
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

/**
 * Validate, quota-check, store/hydrate, and budget the attachments on a
 * request, mutating the message refs in place. Returns storage metadata for
 * uploads persisted this turn (R2 mode). Throws {@link AttachmentError} or
 * {@link AttachmentStorageConfigError}; a no-op for requests without files.
 */
async function prepareAttachments(
  c: AppContext,
  body: ChatRequest,
  clientIp: string
): Promise<StoredAttachment[]> {
  if (!Array.isArray(body?.messages) || !hasAttachments(body.messages)) {
    return [];
  }

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
      throw new AttachmentError(
        "Daily upload limit reached. Please try again later.",
        "ATTACHMENT_QUOTA_EXCEEDED",
        413,
        quota.retryAfter ?? 3600
      );
    }
  }

  const storage = storageFromEnv(c.env, new URL(c.req.url).origin);
  const stored = storage
    ? await resolveAttachments(body.messages, storage, tenant)
    : [];
  enforceRequestBudget(body.messages, attachmentConfig.maxRequestBytes);
  return stored;
}

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

app.post("/api/chat", async (c) => {
  const startedAt = Date.now();
  let body: ChatRequest | undefined;
  let telemetry: ChatTelemetry | undefined;
  let statusCode = 200;
  let errorCode: string | undefined;
  let hadAttachments = false;

  try {
    const clientIp =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for") ||
      "unknown";

    const rateLimit = await checkRateLimit(
      c.env.RATE_LIMIT,
      clientIp,
      getRateLimitConfig(c.env)
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

    hadAttachments =
      Array.isArray(body?.messages) && hasAttachments(body.messages);
    const storedAttachments = await prepareAttachments(c, body, clientIp);

    const result = await handleChat(
      body,
      c.env.ANTHROPIC_API_KEY,
      getChatConfig(c.env, body)
    );
    telemetry = result.telemetry;
    return c.json(
      storedAttachments.length > 0
        ? { ...result.response, attachments: storedAttachments }
        : result.response
    );
  } catch (error) {
    const classified = classifyChatError(error, hadAttachments);
    statusCode = classified.status;
    errorCode = classified.code;
    return errorResponse(c, classified);
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

// Streaming variant of /api/chat. Emits SSE events:
//   event: chunk  data: {"text": "..."}        one per model text delta
//   event: tool   data: {...ToolUseSummary}    one per executed tool call
//   event: done   data: {"reply": "..."}       full assembled reply, stream end
//   event: error  data: {"error": ..., "code"} failure after streaming began
// Failures before the first byte (rate limit, validation, attachments, bad
// API key, model errors) return plain JSON with the same status codes and
// shapes as /api/chat, so clients can share error handling and fall back
// cleanly. Accepts the same JSON or multipart bodies as /api/chat.
app.post("/api/chat/stream", async (c) => {
  const startedAt = Date.now();
  let body: ChatRequest | undefined;
  let telemetry: ChatTelemetry | undefined;
  let statusCode = 200;
  let errorCode: string | undefined;
  let hadAttachments = false;

  const recordAnalytics = () => {
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
  };

  try {
    const clientIp =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for") ||
      "unknown";

    // One streaming request consumes one rate-limit slot, exactly like a
    // non-streaming request: the check runs before the stream opens, and the
    // connection's lifetime doesn't count extra.
    const rateLimit = await checkRateLimit(
      c.env.RATE_LIMIT,
      clientIp,
      getRateLimitConfig(c.env)
    );

    if (!rateLimit.allowed) {
      const errorMessage =
        rateLimit.limitType === "minute"
          ? "Too many requests. Please wait a minute before trying again."
          : "Hourly limit reached. Please try again later.";

      statusCode = 429;
      errorCode = "RATE_LIMITED";
      recordAnalytics();
      return c.json<ErrorResponse>(
        { error: errorMessage, code: errorCode, limitType: rateLimit.limitType },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    body = (await parseChatRequest(c.req.raw)) as ChatRequest;

    hadAttachments =
      Array.isArray(body?.messages) && hasAttachments(body.messages);
    const storedAttachments = await prepareAttachments(c, body, clientIp);

    const stream = streamChat(
      body,
      c.env.ANTHROPIC_API_KEY,
      getChatConfig(c.env, body)
    );

    // Pull the first event before opening the SSE response: validation and
    // upstream connection errors surface here as regular JSON error responses
    // instead of a 200 stream that dies immediately.
    const first = await stream.next();

    return streamSSE(c, async (sse) => {
      try {
        let result = first;
        while (!result.done) {
          const event = result.value;
          if (event.type === "text") {
            await sse.writeSSE({
              event: "chunk",
              data: JSON.stringify({ text: event.text }),
            });
          } else if (event.type === "tool") {
            await sse.writeSSE({
              event: "tool",
              data: JSON.stringify(event.toolUse),
            });
          } else {
            telemetry = event.telemetry;
            await sse.writeSSE({
              event: "done",
              data: JSON.stringify({
                reply: event.reply,
                ...(event.toolUses ? { toolUses: event.toolUses } : {}),
                ...(event.sources ? { sources: event.sources } : {}),
                ...(storedAttachments.length > 0
                  ? { attachments: storedAttachments }
                  : {}),
              }),
            });
          }
          result = await stream.next();
        }
      } catch (error) {
        // The stream broke after bytes were sent; the HTTP status is already
        // 200, so signal the failure in-band.
        errorCode = "STREAM_ERROR";
        const classified = classifyChatError(error, hadAttachments);
        await sse.writeSSE({
          event: "error",
          data: JSON.stringify({ error: classified.error, code: errorCode }),
        });
      } finally {
        recordAnalytics();
      }
    });
  } catch (error) {
    const classified = classifyChatError(error, hadAttachments);
    statusCode = classified.status;
    errorCode = classified.code;
    recordAnalytics();
    return errorResponse(c, classified);
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
