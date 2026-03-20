# PMDS Chat Widget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-powered chat widget for pmds.info that answers visitor questions using a Claude API backend on Cloudflare Workers, styled to match the PMDS brand.

**Architecture:** Two packages — a React component (`widget/`) embedded in the existing SPA, and a Cloudflare Worker (`worker/`) that proxies chat messages to the Claude API with a baked-in knowledge base system prompt. The widget sends the full conversation history with each request (stateless backend). The widget component stays mounted across SPA route changes, preserving chat state in React state.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS (widget), Cloudflare Workers + Hono + Claude API (worker), Vitest (tests)

---

## Task 1: Scaffold the Worker Package

**Files:**
- Create: `worker/package.json`
- Create: `worker/wrangler.jsonc`
- Create: `worker/tsconfig.json`
- Create: `worker/src/index.ts` (empty export for now)

**Step 1: Create `worker/package.json`**

```json
{
  "name": "pmds-chat-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.52.0",
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250313.0",
    "typescript": "^5.8.0",
    "vitest": "^4.1.0",
    "wrangler": "^4.6.0"
  }
}
```

**Step 2: Create `worker/wrangler.jsonc`**

```jsonc
{
  "name": "pmds-chat-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-14",
  "compatibility_flags": ["nodejs_compat"],
  // Set ANTHROPIC_API_KEY as a secret: npx wrangler secret put ANTHROPIC_API_KEY
  // Set ALLOWED_ORIGIN: npx wrangler secret put ALLOWED_ORIGIN
}
```

**Step 3: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 4: Create `worker/src/index.ts`** (placeholder)

```ts
export default {
  async fetch(): Promise<Response> {
    return new Response("ok");
  },
};
```

**Step 5: Install dependencies**

Run: `cd worker && pnpm install`

**Step 6: Verify worker starts**

Run: `cd worker && npx wrangler dev --local` (Ctrl+C after confirming it starts)

**Step 7: Commit**

```bash
git add worker/
git commit -m "feat: scaffold Cloudflare Worker package for chat backend"
```

---

## Task 2: Build the Knowledge Base System Prompt

**Files:**
- Create: `worker/src/system-prompt.ts`

**Step 1: Write the failing test**

Create `worker/src/__tests__/system-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "../system-prompt";

describe("system prompt", () => {
  it("contains business contact info", () => {
    expect(SYSTEM_PROMPT).toContain("paul@pmds.info");
    expect(SYSTEM_PROMPT).toContain("(443) 866-7356");
  });

  it("contains pricing tiers", () => {
    expect(SYSTEM_PROMPT).toContain("$1,000");
    expect(SYSTEM_PROMPT).toContain("$3,750");
    expect(SYSTEM_PROMPT).toContain("$7,500");
    expect(SYSTEM_PROMPT).toContain("$15,000");
  });

  it("contains contact form URL", () => {
    expect(SYSTEM_PROMPT).toContain("https://pmds.info/contact");
  });

  it("instructs the bot to recommend the contact form", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("contact");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("recommend");
  });

  it("contains FAQ content", () => {
    expect(SYSTEM_PROMPT).toContain("How much does a custom website cost");
    expect(SYSTEM_PROMPT).toContain("How long does it take");
  });

  it("contains blog post summaries", () => {
    expect(SYSTEM_PROMPT).toContain("blog");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd worker && npx vitest run src/__tests__/system-prompt.test.ts`
Expected: FAIL — module not found

**Step 3: Write the system prompt**

Create `worker/src/system-prompt.ts` with the full knowledge base. This is a large file containing all FAQ answers, pricing details, service descriptions, blog post summaries, and behavioral instructions. Key sections:

- **Identity & personality:** "You are Paul's AI assistant on pmds.info. You're friendly, helpful, and knowledgeable about PMDS's web development services."
- **Behavioral rules:**
  - Always recommend the contact form (https://pmds.info/contact) when the visitor seems interested
  - Offer Paul's email (paul@pmds.info) as a human handoff option
  - After hours note: "Paul is available Mon-Sat 9am-8pm EST. If you reach out outside those hours, he'll get back to you as soon as he can."
  - Keep responses concise (2-4 sentences typical, longer for detailed questions)
  - Don't make up services or pricing not listed in the knowledge base
  - If unsure, suggest contacting Paul directly
- **Business info:** Name, phone, email, address, hours, experience stats
- **Pricing:** All three tiers with details, hourly rate, hosting, nonprofit discount, payment plans
- **Services:** Website dev, SEO, hosting, mentorship — key details from each page
- **FAQ:** All 18 questions and answers
- **Blog summaries:** Title, date, category, and one-line description for each of the 20 posts
- **Portfolio:** Project names, categories, years
- **Process:** The 3-step "How It Works" flow

**Step 4: Run test to verify it passes**

Run: `cd worker && npx vitest run src/__tests__/system-prompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add worker/src/system-prompt.ts worker/src/__tests__/system-prompt.test.ts
git commit -m "feat: add knowledge base system prompt with full PMDS content"
```

---

## Task 3: Build the Chat API Endpoint

**Files:**
- Create: `worker/src/chat.ts`
- Modify: `worker/src/index.ts`

**Step 1: Write the failing test**

Create `worker/src/__tests__/chat.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Hello! How can I help?" }],
      }),
    },
  })),
}));

import { handleChat, ChatRequest } from "../chat";

describe("handleChat", () => {
  it("returns assistant response for valid request", async () => {
    const request: ChatRequest = {
      messages: [{ role: "user", content: "What are your prices?" }],
    };

    const result = await handleChat(request, "test-api-key");

    expect(result.reply).toBe("Hello! How can I help?");
  });

  it("rejects empty messages array", async () => {
    const request: ChatRequest = { messages: [] };

    await expect(handleChat(request, "test-api-key")).rejects.toThrow(
      "Messages array is required"
    );
  });

  it("rejects messages that are too long", async () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      role: "user" as const,
      content: `message ${i}`,
    }));
    const request: ChatRequest = { messages };

    await expect(handleChat(request, "test-api-key")).rejects.toThrow(
      "Too many messages"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd worker && npx vitest run src/__tests__/chat.test.ts`
Expected: FAIL

**Step 3: Implement `worker/src/chat.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
}

const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 2000;

export async function handleChat(
  request: ChatRequest,
  apiKey: string
): Promise<ChatResponse> {
  if (!request.messages || request.messages.length === 0) {
    throw new Error("Messages array is required");
  }

  if (request.messages.length > MAX_MESSAGES) {
    throw new Error("Too many messages");
  }

  // Sanitize: trim and cap individual message length
  const sanitizedMessages = request.messages.map((msg) => ({
    role: msg.role,
    content: msg.content.slice(0, MAX_MESSAGE_LENGTH).trim(),
  }));

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: sanitizedMessages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }

  return { reply: textBlock.text };
}
```

**Step 4: Wire up the Hono router in `worker/src/index.ts`**

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleChat, ChatRequest } from "./chat";

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGIN || "https://pmds.info";
      return origin === allowed ? origin : "";
    },
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  })
);

app.post("/api/chat", async (c) => {
  try {
    const body = await c.req.json<ChatRequest>();
    const result = await handleChat(body, c.env.ANTHROPIC_API_KEY);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    const status = message.includes("required") || message.includes("Too many") ? 400 : 500;
    return c.json({ error: message }, status);
  }
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
```

**Step 5: Run tests to verify they pass**

Run: `cd worker && npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add worker/src/
git commit -m "feat: add chat API endpoint with Claude integration and CORS"
```

---

## Task 4: Scaffold the Widget Package

**Files:**
- Create: `widget/package.json`
- Create: `widget/tsconfig.json`
- Create: `widget/tailwind.config.ts`
- Create: `widget/vite.config.ts`
- Create: `widget/src/index.ts` (barrel export)

**Step 1: Create `widget/package.json`**

```json
{
  "name": "pmds-chat-widget",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/user-event": "^14.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^26.0.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.8.0",
    "vite": "^6.2.0",
    "@vitejs/plugin-react": "^4.4.0",
    "vitest": "^4.1.0"
  }
}
```

**Step 2: Create `widget/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create `widget/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pmds: {
          blue: "hsl(207, 100%, 32%)",
          dark: "hsl(140, 67%, 2%)",
          "light-blue": "hsl(206, 68%, 85%)",
          "light-green": "hsl(122, 64%, 95%)",
          gray: "hsl(135, 5%, 30%)",
          peach: "hsl(27, 100%, 91%)",
        },
      },
      fontFamily: {
        heading: ["Comfortaa", "sans-serif"],
        body: ["Assistant", "sans-serif"],
      },
      borderRadius: {
        card: "40px",
        button: "32px",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

**Step 4: Create `widget/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Step 5: Create `widget/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
```

**Step 6: Create `widget/src/test-setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

**Step 7: Create `widget/src/index.ts`**

```ts
export { ChatWidget } from "./components/ChatWidget";
export type { ChatWidgetProps } from "./components/ChatWidget";
```

**Step 8: Create `widget/src/styles.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 9: Install dependencies**

Run: `cd widget && pnpm install`

**Step 10: Commit**

```bash
git add widget/
git commit -m "feat: scaffold widget package with React, Tailwind, and Vitest"
```

---

## Task 5: Build the Chat API Hook

**Files:**
- Create: `widget/src/hooks/useChat.ts`

**Step 1: Write the failing test**

Create `widget/src/hooks/__tests__/useChat.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "../useChat";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("useChat", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("starts with empty messages and not loading", () => {
    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sends message and receives reply", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ reply: "Hello! How can I help?" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    await act(async () => {
      await result.current.sendMessage("Hi there");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual({
      role: "user",
      content: "Hi there",
    });
    expect(result.current.messages[1]).toEqual({
      role: "assistant",
      content: "Hello! How can I help?",
    });
  });

  it("sets error on failed fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.error).toBe("Server error");
    // User message stays, no assistant reply added
    expect(result.current.messages).toHaveLength(1);
  });

  it("sets isLoading during request", async () => {
    let resolvePromise: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    const { result } = renderHook(() =>
      useChat({ apiUrl: "https://test.workers.dev" })
    );

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ reply: "Hello!" }),
      });
      await sendPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && npx vitest run src/hooks/__tests__/useChat.test.ts`
Expected: FAIL

**Step 3: Implement `widget/src/hooks/useChat.ts`**

```ts
import { useState, useCallback } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseChatOptions {
  apiUrl: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChat({ apiUrl }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = { role: "user", content: trimmed };
      const updatedMessages = [...messages, userMessage];

      setMessages(updatedMessages);
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Something went wrong");
          return;
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.reply,
        };
        setMessages([...updatedMessages, assistantMessage]);
      } catch {
        setError("Failed to connect. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, apiUrl]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, clearMessages };
}
```

**Step 4: Run test to verify it passes**

Run: `cd widget && npx vitest run src/hooks/__tests__/useChat.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/hooks/
git commit -m "feat: add useChat hook with message state and API integration"
```

---

## Task 6: Build the Chat Toggle Button

**Files:**
- Create: `widget/src/components/ChatToggleButton.tsx`

**Step 1: Write the failing test**

Create `widget/src/components/__tests__/ChatToggleButton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatToggleButton } from "../ChatToggleButton";

describe("ChatToggleButton", () => {
  it("renders with chat icon when closed", () => {
    render(<ChatToggleButton isOpen={false} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: /open chat/i });
    expect(button).toBeInTheDocument();
  });

  it("renders with close icon when open", () => {
    render(<ChatToggleButton isOpen={true} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: /close chat/i });
    expect(button).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ChatToggleButton isOpen={false} onClick={onClick} />);

    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && npx vitest run src/components/__tests__/ChatToggleButton.test.tsx`
Expected: FAIL

**Step 3: Implement `widget/src/components/ChatToggleButton.tsx`**

```tsx
interface ChatToggleButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export function ChatToggleButton({ isOpen, onClick }: ChatToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? "Close chat" : "Open chat"}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-pmds-blue text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-pmds-blue focus:ring-offset-2"
    >
      {isOpen ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
    </button>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd widget && npx vitest run src/components/__tests__/ChatToggleButton.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/components/ChatToggleButton.tsx widget/src/components/__tests__/ChatToggleButton.test.tsx
git commit -m "feat: add ChatToggleButton with open/close states"
```

---

## Task 7: Build the Message Bubble Component

**Files:**
- Create: `widget/src/components/MessageBubble.tsx`

**Step 1: Write the failing test**

Create `widget/src/components/__tests__/MessageBubble.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MessageBubble } from "../MessageBubble";

describe("MessageBubble", () => {
  it("renders user message with correct styling", () => {
    render(<MessageBubble role="user" content="Hello!" />);
    const bubble = screen.getByText("Hello!");
    expect(bubble).toBeInTheDocument();
    // User messages should be on the right (has ml-auto or similar)
    expect(bubble.closest("div")).toHaveClass("ml-auto");
  });

  it("renders assistant message with correct styling", () => {
    render(<MessageBubble role="assistant" content="How can I help?" />);
    const bubble = screen.getByText("How can I help?");
    expect(bubble).toBeInTheDocument();
    expect(bubble.closest("div")).toHaveClass("mr-auto");
  });

  it("renders links as clickable anchors", () => {
    render(
      <MessageBubble
        role="assistant"
        content="Visit https://pmds.info/contact to get started!"
      />
    );
    const link = screen.getByRole("link", { name: /pmds\.info\/contact/i });
    expect(link).toHaveAttribute("href", "https://pmds.info/contact");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && npx vitest run src/components/__tests__/MessageBubble.test.tsx`
Expected: FAIL

**Step 3: Implement `widget/src/components/MessageBubble.tsx`**

```tsx
interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

const URL_REGEX = /(https?:\/\/[^\s)]+)/g;

function renderContentWithLinks(content: string) {
  const parts = content.split(URL_REGEX);
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      // Reset regex lastIndex since it's global
      URL_REGEX.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium hover:opacity-80"
        >
          {part.replace(/^https?:\/\//, "")}
        </a>
      );
    }
    return part;
  });
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "ml-auto" : "mr-auto"} max-w-[85%]`}>
      <div
        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed font-body ${
          isUser
            ? "bg-pmds-blue text-white rounded-br-sm"
            : "bg-pmds-light-green text-pmds-dark rounded-bl-sm"
        }`}
      >
        {renderContentWithLinks(content)}
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd widget && npx vitest run src/components/__tests__/MessageBubble.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/components/MessageBubble.tsx widget/src/components/__tests__/MessageBubble.test.tsx
git commit -m "feat: add MessageBubble with user/assistant styling and link detection"
```

---

## Task 8: Build the Chat Input Component

**Files:**
- Create: `widget/src/components/ChatInput.tsx`

**Step 1: Write the failing test**

Create `widget/src/components/__tests__/ChatInput.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatInput } from "../ChatInput";

describe("ChatInput", () => {
  it("renders input and submit button", () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);
    expect(screen.getByPlaceholderText(/ask me anything/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("calls onSend with input value on submit", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    const input = screen.getByPlaceholderText(/ask me anything/i);
    await user.type(input, "What are your prices?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("What are your prices?");
  });

  it("clears input after sending", async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const input = screen.getByPlaceholderText(/ask me anything/i);
    await user.type(input, "Hello");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(input).toHaveValue("");
  });

  it("submits on Enter key", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    const input = screen.getByPlaceholderText(/ask me anything/i);
    await user.type(input, "Hello{enter}");

    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("disables input and button when loading", () => {
    render(<ChatInput onSend={vi.fn()} isLoading={true} />);
    expect(screen.getByPlaceholderText(/ask me anything/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("does not send empty messages", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(onSend).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && npx vitest run src/components/__tests__/ChatInput.test.tsx`
Expected: FAIL

**Step 3: Implement `widget/src/components/ChatInput.tsx`**

```tsx
import { useState, FormEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-gray-200 p-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask me anything about PMDS..."
        disabled={isLoading}
        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-body text-pmds-dark placeholder:text-pmds-gray focus:border-pmds-blue focus:outline-none focus:ring-1 focus:ring-pmds-blue disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isLoading}
        aria-label="Send message"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pmds-blue text-white transition-colors hover:bg-pmds-blue/90 disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </form>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd widget && npx vitest run src/components/__tests__/ChatInput.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/components/ChatInput.tsx widget/src/components/__tests__/ChatInput.test.tsx
git commit -m "feat: add ChatInput with form submission and loading state"
```

---

## Task 9: Build the Chat Window Component

**Files:**
- Create: `widget/src/components/ChatWindow.tsx`

**Step 1: Write the failing test**

Create `widget/src/components/__tests__/ChatWindow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChatWindow } from "../ChatWindow";

describe("ChatWindow", () => {
  it("renders welcome message when no messages", () => {
    render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText(/Hi! I'm Paul's assistant/i)).toBeInTheDocument();
  });

  it("renders messages", () => {
    const messages = [
      { role: "user" as const, content: "What are your prices?" },
      { role: "assistant" as const, content: "Prices start at $1,000." },
    ];
    render(
      <ChatWindow
        messages={messages}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText("What are your prices?")).toBeInTheDocument();
    expect(screen.getByText(/Prices start at \$1,000/)).toBeInTheDocument();
  });

  it("shows typing indicator when loading", () => {
    render(
      <ChatWindow
        messages={[{ role: "user", content: "Hi" }]}
        isLoading={true}
        error={null}
        onSend={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/typing/i)).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error="Connection failed"
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
  });

  it("renders header with title", () => {
    render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText("PMDS Chat")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && npx vitest run src/components/__tests__/ChatWindow.test.tsx`
Expected: FAIL

**Step 3: Implement `widget/src/components/ChatWindow.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSend: (message: string) => void;
}

function TypingIndicator() {
  return (
    <div aria-label="Typing" className="mr-auto flex max-w-[85%]">
      <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-pmds-light-green px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-pmds-gray [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-pmds-gray [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-pmds-gray [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export function ChatWindow({ messages, isLoading, error, onSend }: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="fixed bottom-24 right-6 z-50 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-card bg-white shadow-2xl font-body">
      {/* Header */}
      <div className="flex items-center gap-3 bg-pmds-blue px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
          P
        </div>
        <div>
          <h2 className="text-sm font-heading font-semibold text-white">PMDS Chat</h2>
          <p className="text-xs text-white/70">Ask me anything about our services</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !error && (
          <div className="mr-auto flex max-w-[85%]">
            <div className="rounded-2xl rounded-bl-sm bg-pmds-light-green px-4 py-2.5 text-sm leading-relaxed text-pmds-dark">
              Hi! I'm Paul's assistant. Ask me about web development services,
              pricing, or anything else. How can I help?
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}

        {isLoading && <TypingIndicator />}

        {error && (
          <div className="mx-auto max-w-[90%] rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} isLoading={isLoading} />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd widget && npx vitest run src/components/__tests__/ChatWindow.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/components/ChatWindow.tsx widget/src/components/__tests__/ChatWindow.test.tsx
git commit -m "feat: add ChatWindow with message list, typing indicator, and welcome message"
```

---

## Task 10: Build the Root ChatWidget Component

**Files:**
- Create: `widget/src/components/ChatWidget.tsx`

**Step 1: Write the failing test**

Create `widget/src/components/__tests__/ChatWidget.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWidget } from "../ChatWidget";

// Mock fetch for useChat
global.fetch = vi.fn();

describe("ChatWidget", () => {
  it("renders toggle button initially (chat closed)", () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" />);
    expect(screen.getByRole("button", { name: /open chat/i })).toBeInTheDocument();
    expect(screen.queryByText("PMDS Chat")).not.toBeInTheDocument();
  });

  it("opens chat window on button click", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(screen.getByText("PMDS Chat")).toBeInTheDocument();
  });

  it("closes chat window on second button click", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(screen.getByText("PMDS Chat")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close chat/i }));
    expect(screen.queryByText("PMDS Chat")).not.toBeInTheDocument();
  });

  it("preserves messages when toggling open/close", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    // Open and send a message
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    const input = screen.getByPlaceholderText(/ask me anything/i);
    await user.type(input, "Hi{enter}");

    // Wait for reply
    expect(await screen.findByText("Hello!")).toBeInTheDocument();

    // Close and reopen
    await user.click(screen.getByRole("button", { name: /close chat/i }));
    await user.click(screen.getByRole("button", { name: /open chat/i }));

    // Messages should still be there
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && npx vitest run src/components/__tests__/ChatWidget.test.tsx`
Expected: FAIL

**Step 3: Implement `widget/src/components/ChatWidget.tsx`**

```tsx
import { useState } from "react";
import { useChat } from "../hooks/useChat";
import { ChatToggleButton } from "./ChatToggleButton";
import { ChatWindow } from "./ChatWindow";

export interface ChatWidgetProps {
  apiUrl: string;
}

export function ChatWidget({ apiUrl }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isLoading, error, sendMessage } = useChat({ apiUrl });

  return (
    <>
      {isOpen && (
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          error={error}
          onSend={sendMessage}
        />
      )}
      <ChatToggleButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
    </>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd widget && npx vitest run src/components/__tests__/ChatWidget.test.tsx`
Expected: PASS

**Step 5: Update barrel export**

`widget/src/index.ts` already exports `ChatWidget` — verify it resolves correctly.

**Step 6: Commit**

```bash
git add widget/src/components/ChatWidget.tsx widget/src/components/__tests__/ChatWidget.test.tsx
git commit -m "feat: add ChatWidget root component with toggle and state persistence"
```

---

## Task 11: Run Full Test Suite and Fix Any Failures

**Step 1: Run all worker tests**

Run: `cd worker && npx vitest run`
Expected: ALL PASS

**Step 2: Run all widget tests**

Run: `cd widget && npx vitest run`
Expected: ALL PASS

**Step 3: Type-check both packages**

Run: `cd worker && npx tsc --noEmit && cd ../widget && npx tsc --noEmit`
Expected: No errors

**Step 4: Fix any failures** (if needed)

**Step 5: Commit** (if fixes were needed)

```bash
git commit -m "fix: resolve test and type errors across packages"
```

---

## Task 12: Deploy Worker and Wire Up Widget

**Step 1: Set worker secrets**

Run:
```bash
cd worker
npx wrangler secret put ANTHROPIC_API_KEY
# (paste API key when prompted)
npx wrangler secret put ALLOWED_ORIGIN
# (enter: https://pmds.info)
```

**Step 2: Deploy the worker**

Run: `cd worker && npx wrangler deploy`
Note the deployed URL (e.g., `https://pmds-chat-worker.<account>.workers.dev`)

**Step 3: Verify health endpoint**

Run: `curl https://pmds-chat-worker.<account>.workers.dev/api/health`
Expected: `{"ok":true}`

**Step 4: Update widget apiUrl in integration docs**

Document the worker URL for Paul to use when rendering `<ChatWidget apiUrl="..." />` in his main app.

**Step 5: Commit any final changes**

```bash
git add .
git commit -m "chore: finalize deployment config"
```

---

## Integration Instructions (for Paul's main PMDS app)

To embed the widget in the PMDS React SPA, add to the root layout:

```tsx
import { ChatWidget } from "../path-to-widget/src";

function App() {
  return (
    <>
      {/* ... existing app routes ... */}
      <ChatWidget apiUrl="https://pmds-chat-worker.<account>.workers.dev" />
    </>
  );
}
```

Since it's an SPA with Wouter routing, the `ChatWidget` component stays mounted across all route changes — no state loss.
