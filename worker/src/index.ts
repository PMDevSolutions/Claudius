import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleChat, ChatRequest } from "./chat";
import { checkRateLimit } from "./rate-limit";

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT: KVNamespace;
  // Optional configuration
  CLAUDE_MODEL?: string;
  MAX_TOKENS?: string;
  RATE_LIMIT_MINUTE?: string;
  RATE_LIMIT_HOUR?: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGIN || "http://localhost:5173";
      if (origin?.startsWith("http://localhost:")) {
        return origin;
      }
      return origin === allowed ? origin : allowed;
    },
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  })
);

app.post("/api/chat", async (c) => {
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

      return c.json<ErrorResponse>(
        { error: errorMessage, code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    const body = await c.req.json<ChatRequest>();

    const chatConfig = {
      model: c.env.CLAUDE_MODEL,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : undefined,
    };

    const result = await handleChat(body, c.env.ANTHROPIC_API_KEY, chatConfig);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    // Client errors (bad input)
    if (
      message.includes("required") ||
      message.includes("Too many") ||
      message.includes("Invalid message role")
    ) {
      return c.json<ErrorResponse>(
        { error: message, code: "VALIDATION_ERROR" },
        400
      );
    }

    // API key issues
    if (message.includes("authentication") || message.includes("api_key")) {
      return c.json<ErrorResponse>(
        { error: "Service configuration error. Please try again later.", code: "CONFIG_ERROR" },
        500
      );
    }

    // Model/API errors
    if (message.includes("model") || message.includes("overloaded")) {
      return c.json<ErrorResponse>(
        { error: "AI service temporarily unavailable. Please try again.", code: "SERVICE_ERROR" },
        503
      );
    }

    // Generic fallback
    return c.json<ErrorResponse>(
      { error: "Something went wrong. Please try again.", code: "UNKNOWN_ERROR" },
      500
    );
  }
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
