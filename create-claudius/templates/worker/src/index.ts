import { Hono } from "hono";
import { cors } from "hono/cors";
import Anthropic from "@anthropic-ai/sdk";

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT: KVNamespace;
  CLAUDE_MODEL?: string;
  MAX_TOKENS?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_PER_MINUTE = 20;

// Customize your assistant's personality and knowledge here.
const SYSTEM_PROMPT =
  "You are a helpful, concise assistant embedded on a website. " +
  "Answer clearly and politely. If you don't know something, say so.";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = (c.env.ALLOWED_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((o: string) => o.trim())
        .filter(Boolean);
      if (origin?.startsWith("http://localhost:")) return origin;
      return origin && allowed.includes(origin) ? origin : allowed[0];
    },
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  }),
);

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/chat", async (c) => {
  let body: { messages?: ChatMessage[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: "A non-empty messages array is required." }, 400);
  }

  // Minimal per-IP, per-minute rate limit backed by the RATE_LIMIT KV namespace.
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const bucket = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
  const count = parseInt((await c.env.RATE_LIMIT.get(bucket)) ?? "0", 10);
  if (count >= RATE_LIMIT_PER_MINUTE) {
    return c.json({ error: "Too many requests. Please wait a minute." }, 429, {
      "Retry-After": "60",
    });
  }
  await c.env.RATE_LIMIT.put(bucket, String(count + 1), { expirationTtl: 120 });

  const sanitized = messages.map((m) => ({
    role: m.role,
    content: String(m.content ?? "").slice(0, MAX_MESSAGE_LENGTH),
  }));

  try {
    const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: c.env.CLAUDE_MODEL ?? DEFAULT_MODEL,
      max_tokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : 1024,
      system: SYSTEM_PROMPT,
      messages: sanitized,
    });
    const textBlock = response.content.find((block) => block.type === "text");
    return c.json({ reply: textBlock && textBlock.type === "text" ? textBlock.text : "" });
  } catch {
    return c.json({ error: "AI service temporarily unavailable. Please try again." }, 502);
  }
});

export default app;
