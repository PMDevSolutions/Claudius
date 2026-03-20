# Claudius Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add rate limiting, conversation persistence, and theming to the Claudius chat widget.

**Architecture:** Rate limiting uses Cloudflare KV counters per IP with TTL expiry (worker-side). Conversation persistence uses localStorage in the useChat hook (widget-side). Theming adds dark mode via a data attribute and Tailwind dark classes, plus an accentColor runtime override (widget-side).

**Tech Stack:** Cloudflare KV, Hono middleware, React useState/useEffect, localStorage, Tailwind CSS dark mode, CSS custom properties

---

## Feature 1: Rate Limiting

### Task 1: Add KV namespace binding

**Files:**
- Modify: `worker/wrangler.toml`

**Step 1: Add KV namespace to wrangler.toml**

```toml
name = "chat-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGIN = "http://localhost:5173"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "placeholder"
preview_id = "placeholder"
```

Note: The actual KV namespace IDs will be set after creating the namespace via `npx wrangler kv namespace create RATE_LIMIT`. For local dev, wrangler auto-creates a local KV store.

**Step 2: Update the Env interface in worker/src/index.ts**

Add `RATE_LIMIT: KVNamespace` to the Env interface.

**Step 3: Commit**

```bash
git add worker/wrangler.toml worker/src/index.ts
git commit -m "chore: add KV namespace binding for rate limiting"
```

---

### Task 2: Implement rate limit middleware

**Files:**
- Create: `worker/src/rate-limit.ts`
- Create: `worker/src/__tests__/rate-limit.test.ts`
- Modify: `worker/src/index.ts`

**Step 1: Write the failing tests**

```ts
// worker/src/__tests__/rate-limit.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit } from "../rate-limit";

function createMockKV() {
  const store = new Map<string, { value: string; expiration?: number }>();
  return {
    get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
    put: vi.fn(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      store.set(key, { value, expiration: opts?.expirationTtl });
    }),
    _store: store,
  };
}

describe("checkRateLimit", () => {
  let kv: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    kv = createMockKV();
  });

  it("allows first request from an IP", async () => {
    const result = await checkRateLimit(kv as unknown as KVNamespace, "1.2.3.4");
    expect(result.allowed).toBe(true);
  });

  it("blocks after 10 requests in a minute", async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(kv as unknown as KVNamespace, "1.2.3.4");
    }
    const result = await checkRateLimit(kv as unknown as KVNamespace, "1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
  });

  it("blocks after 50 requests in an hour", async () => {
    // Set hour counter to 50
    kv._store.set("rate:hr:1.2.3.4", { value: "50" });
    const result = await checkRateLimit(kv as unknown as KVNamespace, "1.2.3.4");
    expect(result.allowed).toBe(false);
  });

  it("allows different IPs independently", async () => {
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(kv as unknown as KVNamespace, "1.2.3.4");
    }
    const result = await checkRateLimit(kv as unknown as KVNamespace, "5.6.7.8");
    expect(result.allowed).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd worker && pnpm test`
Expected: FAIL - `checkRateLimit` not found

**Step 3: Implement rate-limit.ts**

```ts
// worker/src/rate-limit.ts
const MINUTE_LIMIT = 10;
const HOUR_LIMIT = 50;
const MINUTE_TTL = 60;
const HOUR_TTL = 3600;

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<RateLimitResult> {
  const minuteKey = `rate:min:${ip}`;
  const hourKey = `rate:hr:${ip}`;

  const [minuteCount, hourCount] = await Promise.all([
    kv.get(minuteKey).then((v) => parseInt(v || "0", 10)),
    kv.get(hourKey).then((v) => parseInt(v || "0", 10)),
  ]);

  if (minuteCount >= MINUTE_LIMIT) {
    return { allowed: false, retryAfter: MINUTE_TTL };
  }

  if (hourCount >= HOUR_LIMIT) {
    return { allowed: false, retryAfter: HOUR_TTL };
  }

  await Promise.all([
    kv.put(minuteKey, String(minuteCount + 1), { expirationTtl: MINUTE_TTL }),
    kv.put(hourKey, String(hourCount + 1), { expirationTtl: HOUR_TTL }),
  ]);

  return { allowed: true };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd worker && pnpm test`
Expected: All pass

**Step 5: Wire into index.ts**

Add rate limiting middleware before the `/api/chat` route in `worker/src/index.ts`:

```ts
import { checkRateLimit } from "./rate-limit";

// Add to Env interface:
// RATE_LIMIT: KVNamespace;

app.post("/api/chat", async (c) => {
  // Rate limiting
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
  const rateLimit = await checkRateLimit(c.env.RATE_LIMIT, ip);
  if (!rateLimit.allowed) {
    c.header("Retry-After", String(rateLimit.retryAfter || 60));
    return c.json({ error: "Too many requests. Please try again in a moment." }, 429);
  }

  // Existing chat handling...
  try {
    const body = await c.req.json<ChatRequest>();
    const result = await handleChat(body, c.env.ANTHROPIC_API_KEY);
    return c.json(result);
  } catch (error) {
    // ... existing error handling
  }
});
```

**Step 6: Run all tests**

Run: `cd worker && pnpm test`
Expected: All pass (existing + new)

**Step 7: Commit**

```bash
git add worker/src/rate-limit.ts worker/src/__tests__/rate-limit.test.ts worker/src/index.ts
git commit -m "feat: add KV-based rate limiting (10/min, 50/hr per IP)"
```

---

## Feature 2: Conversation Persistence

### Task 3: Add localStorage persistence to useChat

**Files:**
- Modify: `widget/src/hooks/useChat.ts`
- Modify: `widget/src/hooks/__tests__/useChat.test.ts`

**Step 1: Write the failing tests**

Add to `widget/src/hooks/__tests__/useChat.test.ts`:

```ts
describe("conversation persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves messages to localStorage after receiving a reply", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    const stored = localStorage.getItem("claudius:messages:test.workers.dev");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveLength(2);
  });

  it("restores messages from localStorage on mount", async () => {
    const saved = [
      { id: "msg-1", role: "user", content: "Hi" },
      { id: "msg-2", role: "assistant", content: "Hello!" },
    ];
    localStorage.setItem(
      "claudius:messages:test.workers.dev",
      JSON.stringify(saved)
    );

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe("Hi");
  });

  it("clears localStorage when clearMessages is called", async () => {
    localStorage.setItem(
      "claudius:messages:test.workers.dev",
      JSON.stringify([{ id: "msg-1", role: "user", content: "Hi" }])
    );

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    act(() => {
      result.current.clearMessages();
    });

    expect(localStorage.getItem("claudius:messages:test.workers.dev")).toBeNull();
  });

  it("does not persist when persistMessages is false", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev", persistMessages: false })
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(localStorage.getItem("claudius:messages:test.workers.dev")).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd widget && pnpm test`
Expected: FAIL - persistMessages not in options, no localStorage logic

**Step 3: Implement persistence in useChat**

Update `widget/src/hooks/useChat.ts`:

- Add `persistMessages?: boolean` to `UseChatOptions` (default `true`)
- Create storage key from apiUrl: `claudius:messages:${new URL(apiUrl).host}`
- On mount: read from localStorage, parse, set as initial messages
- After each setMessages call: write to localStorage
- In clearMessages: also clear localStorage
- Cap stored messages at 200

**Step 4: Run tests to verify they pass**

Run: `cd widget && pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add widget/src/hooks/useChat.ts widget/src/hooks/__tests__/useChat.test.ts
git commit -m "feat: add localStorage conversation persistence"
```

---

### Task 4: Pass persistMessages config through widget

**Files:**
- Modify: `widget/src/components/ChatWidget.tsx`
- Modify: `widget/src/embed.tsx`

**Step 1: Add persistMessages to ChatWidgetProps**

```ts
export interface ChatWidgetProps {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  persistMessages?: boolean;
}
```

Pass it to `useChat({ apiUrl, persistMessages })`.

**Step 2: Add to ClaudiusConfig in embed.tsx**

```ts
interface ClaudiusConfig {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  persistMessages?: boolean;
}
```

Pass `config.persistMessages` to ChatWidget.

**Step 3: Run all tests**

Run: `cd widget && pnpm test`
Expected: All pass

**Step 4: Commit**

```bash
git add widget/src/components/ChatWidget.tsx widget/src/embed.tsx
git commit -m "feat: expose persistMessages config option"
```

---

## Feature 3: Theming

### Task 5: Add dark mode support

**Files:**
- Modify: `widget/src/components/ChatWidget.tsx`
- Modify: `widget/src/components/ChatWindow.tsx`
- Modify: `widget/src/components/ChatInput.tsx`
- Modify: `widget/src/components/MessageBubble.tsx`
- Modify: `widget/src/components/ChatToggleButton.tsx`
- Modify: `widget/src/embed.tsx`
- Modify: `widget/tailwind.config.ts`

**Step 1: Enable Tailwind dark mode with selector strategy**

In `widget/tailwind.config.ts`, add:

```ts
export default {
  darkMode: ["selector", '[data-claudius-dark="true"]'],
  content: ["./src/**/*.{ts,tsx}"],
  // ... rest of config
```

This makes dark mode activate when `data-claudius-dark="true"` is on an ancestor element.

**Step 2: Add theme prop to ChatWidget and embed**

Add to ChatWidgetProps:
```ts
theme?: "light" | "dark" | "auto";
accentColor?: string;
```

In ChatWidget, wrap the JSX in a container div that:
- Sets `data-claudius-dark="true"` when theme is "dark"
- Listens to `prefers-color-scheme` when theme is "auto"
- Sets `--claudius-primary` CSS variable when accentColor is provided

**Step 3: Add dark classes to all components**

For each component, add Tailwind dark variant classes:

ChatWindow:
- Outer container: add `dark:bg-gray-900 dark:shadow-gray-950/50`
- Header: keep as-is (accent color already works)
- Messages area: add `dark:bg-gray-900`
- Welcome message bubble: add `dark:bg-gray-800 dark:text-gray-200`
- Error message: add `dark:bg-red-900/30 dark:text-red-400`

ChatInput:
- Form border: add `dark:border-gray-700`
- Input: add `dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500`

MessageBubble:
- User bubble: keep accent color (already uses pmds-blue)
- Assistant bubble: add `dark:bg-gray-800 dark:text-gray-200`

ChatToggleButton:
- No changes needed (uses accent color)

**Step 4: Add to embed.tsx ClaudiusConfig**

```ts
interface ClaudiusConfig {
  // ... existing
  theme?: "light" | "dark" | "auto";
  accentColor?: string;
}
```

**Step 5: Run all tests**

Run: `cd widget && pnpm test`
Expected: All pass

**Step 6: Build and verify**

Run: `cd widget && pnpm build:embed`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add widget/
git commit -m "feat: add dark mode theming and accentColor override"
```

---

### Task 6: Update README and push

**Files:**
- Modify: `README.md`

**Step 1: Update README configuration table**

Add new config options to the table:

| Option | Default | Description |
|--------|---------|-------------|
| `persistMessages` | `true` | Save chat history to localStorage |
| `theme` | `"light"` | Color scheme: "light", "dark", or "auto" |
| `accentColor` | `"#2563eb"` | Primary brand color override |

Add a "Rate Limiting" section explaining the KV-based rate limiting and how to create the KV namespace.

**Step 2: Run all tests one final time**

Run: `cd widget && pnpm test && cd ../worker && pnpm test`
Expected: All pass

**Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: update README with persistence, theming, and rate limiting"
git push origin main
```
