import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleChat, ChatRequest } from "./chat";
import { checkRateLimit } from "./rate-limit";

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT: KVNamespace;
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

    const rateLimit = await checkRateLimit(c.env.RATE_LIMIT, clientIp);

    if (!rateLimit.allowed) {
      return c.json(
        { error: "Too many requests. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
      );
    }

    const body = await c.req.json<ChatRequest>();
    const result = await handleChat(body, c.env.ANTHROPIC_API_KEY);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isClientError =
      message.includes("required") ||
      message.includes("Too many") ||
      message.includes("Invalid message role");
    if (isClientError) {
      return c.json({ error: message }, 400);
    }
    return c.json({ error: "Something went wrong. Please try again." }, 500);
  }
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
