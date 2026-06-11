import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleChat, ChatRequest, ChatTelemetry } from "./chat";
import { checkRateLimit } from "./rate-limit";
import { recordEvent } from "./analytics";

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
}

export interface ErrorResponse {
  error: string;
  code?: string;
  limitType?: "minute" | "hour";
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      // Comma-separated list, e.g. "https://pmds.info,https://docs.example"
      const allowed = (c.env.ALLOWED_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((o) => o.trim())
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

    body = await c.req.json<ChatRequest>();

    const chatConfig = {
      model: c.env.CLAUDE_MODEL,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : undefined,
    };

    const result = await handleChat(body, c.env.ANTHROPIC_API_KEY, chatConfig);
    telemetry = result.telemetry;
    return c.json(result.response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

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

    // API key issues
    if (message.includes("authentication") || message.includes("api_key")) {
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

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
