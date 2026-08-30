import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { handleChat, streamChat, ChatRequest, ChatTelemetry } from "./chat";
import { chatTools } from "./tools";
import { checkRateLimit } from "./rate-limit";
import { recordEvent } from "./analytics";
import { chatPlugins } from "./plugins";
import type { ClaudiusServerPlugin } from "./plugins";

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

interface ClassifiedChatError {
  status: 400 | 500 | 503;
  code: "VALIDATION_ERROR" | "CONFIG_ERROR" | "SERVICE_ERROR" | "UNKNOWN_ERROR";
  error: string;
}

/** Maps a thrown chat error to an HTTP status, machine code, and safe message. */
function classifyChatError(error: unknown): ClassifiedChatError {
  const message = error instanceof Error ? error.message : "";

  // Client errors (bad input)
  if (
    message.includes("required") ||
    message.includes("Too many") ||
    message.includes("Invalid message role")
  ) {
    return { status: 400, code: "VALIDATION_ERROR", error: message };
  }

  // API key issues
  if (message.includes("authentication") || message.includes("api_key")) {
    return {
      status: 500,
      code: "CONFIG_ERROR",
      error: "Service configuration error. Please try again later.",
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
  };
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
    allowMethods: ["POST", "OPTIONS"],
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
    // fall back to parsing the body when no plugins are configured.
    body = c.get("chatRequest") ?? (await c.req.json<ChatRequest>());

    const result = await handleChat(
      body,
      c.env.ANTHROPIC_API_KEY,
      getChatConfig(c.env, body)
    );
    telemetry = result.telemetry;
    return c.json(result.response);
  } catch (error) {
    const classified = classifyChatError(error);
    statusCode = classified.status;
    errorCode = classified.code;
    return c.json<ErrorResponse>(
      { error: classified.error, code: classified.code },
      classified.status
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
        lastUserMsgLength: lastUserMsg?.content.length ?? 0,
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
//   event: done   data: {"reply": "..."}       full assembled reply, stream end
//   event: error  data: {"error": ..., "code"} failure after streaming began
// Failures before the first byte (rate limit, validation, bad API key, model
// errors) return plain JSON with the same status codes and shapes as
// /api/chat, so clients can share error handling and fall back cleanly.
app.post("/api/chat/stream", async (c) => {
  const startedAt = Date.now();
  let body: ChatRequest | undefined;
  let telemetry: ChatTelemetry | undefined;
  let statusCode = 200;
  let errorCode: string | undefined;

  const recordAnalytics = () => {
    const lastUserMsg = body?.messages
      ?.slice()
      .reverse()
      .find((m) => m.role === "user");
    c.executionCtx.waitUntil(
      recordEvent(c.env.ANALYTICS_DB, {
        conversationId: body?.conversationId,
        messageCount: body?.messages?.length ?? 0,
        lastUserMsgLength: lastUserMsg?.content.length ?? 0,
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

    body = await c.req.json<ChatRequest>();

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
              }),
            });
          }
          result = await stream.next();
        }
      } catch (error) {
        // The stream broke after bytes were sent; the HTTP status is already
        // 200, so signal the failure in-band.
        errorCode = "STREAM_ERROR";
        const classified = classifyChatError(error);
        await sse.writeSSE({
          event: "error",
          data: JSON.stringify({ error: classified.error, code: errorCode }),
        });
      } finally {
        recordAnalytics();
      }
    });
  } catch (error) {
    const classified = classifyChatError(error);
    statusCode = classified.status;
    errorCode = classified.code;
    recordAnalytics();
    return c.json<ErrorResponse>(
      { error: classified.error, code: classified.code },
      classified.status
    );
  }
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
