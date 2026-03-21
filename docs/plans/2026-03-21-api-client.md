# Typed API Client Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the inline fetch from useChat into a typed API client with retry logic (429/503), exponential backoff, and debounced sends.

**Architecture:** A new `widget/src/api/` directory with `types.ts` (shared request/response types) and `client.ts` (ChatApiClient class). The useChat hook creates a client instance and delegates to it. The client is pure TypeScript with no React dependency.

**Tech Stack:** TypeScript, Vitest, jsdom (for fetch mocking)

---

### Task 1: API Types

**Files:**
- Create: `widget/src/api/types.ts`

**Step 1: Create the types file**

```typescript
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
}

export interface ChatErrorResponse {
  error: string;
  code?: string;
}
```

**Step 2: Commit**

```bash
git add widget/src/api/types.ts
git commit -m "feat: add shared API types for chat client"
```

---

### Task 2: ChatApiError and DebounceError

**Files:**
- Create: `widget/src/api/errors.ts`
- Create: `widget/src/api/__tests__/errors.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { ChatApiError, DebounceError } from "../errors";

describe("ChatApiError", () => {
  it("stores status, code, and retryAfter", () => {
    const err = new ChatApiError("Rate limited", 429, "RATE_LIMITED", 30);
    expect(err.message).toBe("Rate limited");
    expect(err.status).toBe(429);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryAfter).toBe(30);
    expect(err).toBeInstanceOf(Error);
  });

  it("works without optional fields", () => {
    const err = new ChatApiError("Server error", 500);
    expect(err.code).toBeUndefined();
    expect(err.retryAfter).toBeUndefined();
  });
});

describe("DebounceError", () => {
  it("is an instance of Error", () => {
    const err = new DebounceError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Request debounced");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd widget && pnpm test -- --run src/api/__tests__/errors.test.ts`
Expected: FAIL -- module not found

**Step 3: Write the implementation**

```typescript
export class ChatApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export class DebounceError extends Error {
  constructor() {
    super("Request debounced");
    this.name = "DebounceError";
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd widget && pnpm test -- --run src/api/__tests__/errors.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/api/errors.ts widget/src/api/__tests__/errors.test.ts
git commit -m "feat: add ChatApiError and DebounceError types"
```

---

### Task 3: ChatApiClient -- Core Send

**Files:**
- Create: `widget/src/api/client.ts`
- Create: `widget/src/api/__tests__/client.test.ts`

This task implements the basic `sendMessage` method without retry or debounce. Later tasks layer those on.

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatApiClient } from "../client";
import { ChatApiError } from "../errors";
import type { ChatMessage } from "../types";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const TEST_URL = "https://test.workers.dev";

function userMessage(content: string): ChatMessage {
  return { id: "msg-1", role: "user", content };
}

describe("ChatApiClient", () => {
  let client: ChatApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new ChatApiClient(TEST_URL);
  });

  describe("sendMessage", () => {
    it("sends POST to /api/chat with messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ reply: "Hello!" }),
      });

      const messages = [userMessage("Hi")];
      const result = await client.sendMessage(messages);

      expect(result).toEqual({ reply: "Hello!" });
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_URL}/api/chat`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        }),
      );
    });

    it("throws ChatApiError on 400 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: () =>
          Promise.resolve({ error: "Messages required", code: "VALIDATION_ERROR" }),
      });

      await expect(client.sendMessage([])).rejects.toThrow(ChatApiError);
      await expect(client.sendMessage([])).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("throws ChatApiError on 500 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: () =>
          Promise.resolve({ error: "Internal error", code: "UNKNOWN_ERROR" }),
      });

      await expect(client.sendMessage([userMessage("Hi")])).rejects.toThrow(
        ChatApiError,
      );
    });

    it("throws ChatApiError on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(
        client.sendMessage([userMessage("Hi")]),
      ).rejects.toThrow();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd widget && pnpm test -- --run src/api/__tests__/client.test.ts`
Expected: FAIL -- module not found

**Step 3: Write the minimal implementation**

```typescript
import type { ChatMessage, ChatRequest, ChatResponse, ChatErrorResponse } from "./types";
import { ChatApiError } from "./errors";

export interface ChatApiClientOptions {
  maxRetries?: number;
  debounceMs?: number;
}

export class ChatApiClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly debounceMs: number;

  constructor(baseUrl: string, options?: ChatApiClientOptions) {
    this.baseUrl = baseUrl;
    this.maxRetries = options?.maxRetries ?? 2;
    this.debounceMs = options?.debounceMs ?? 300;
  }

  async sendMessage(messages: ChatMessage[]): Promise<ChatResponse> {
    const request: ChatRequest = { messages };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body: ChatErrorResponse = await response.json();
      const retryAfter = response.headers.get("Retry-After");
      throw new ChatApiError(
        body.error,
        response.status,
        body.code,
        retryAfter ? parseInt(retryAfter, 10) : undefined,
      );
    }

    return response.json() as Promise<ChatResponse>;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd widget && pnpm test -- --run src/api/__tests__/client.test.ts`
Expected: 3 of 4 PASS. The network failure test may need adjustment depending on how we want to wrap TypeError -- update the test expectation if needed. The core send tests must all pass.

**Step 5: Commit**

```bash
git add widget/src/api/client.ts widget/src/api/__tests__/client.test.ts
git commit -m "feat: add ChatApiClient with typed send"
```

---

### Task 4: Retry Logic (429 and 503)

**Files:**
- Modify: `widget/src/api/client.ts`
- Modify: `widget/src/api/__tests__/client.test.ts`

**Step 1: Add retry tests to the existing test file**

Add a new `describe("retry logic")` block:

```typescript
describe("retry logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries on 429 respecting Retry-After header", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "1" }),
        json: () =>
          Promise.resolve({ error: "Rate limited", code: "RATE_LIMITED" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ reply: "Hello!" }),
      });

    const promise = client.sendMessage([userMessage("Hi")]);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ reply: "Hello!" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 with exponential backoff", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: () =>
          Promise.resolve({ error: "Unavailable", code: "SERVICE_ERROR" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ reply: "Hello!" }),
      });

    const promise = client.sendMessage([userMessage("Hi")]);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ reply: "Hello!" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on network error with exponential backoff", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ reply: "Hello!" }),
      });

    const promise = client.sendMessage([userMessage("Hi")]);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ reply: "Hello!" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () =>
        Promise.resolve({ error: "Bad request", code: "VALIDATION_ERROR" }),
    });

    await expect(client.sendMessage([])).rejects.toThrow(ChatApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exhausted", async () => {
    mockFetch
      .mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: () =>
          Promise.resolve({ error: "Unavailable", code: "SERVICE_ERROR" }),
      });

    const promise = client.sendMessage([userMessage("Hi")]);
    // First retry at 1s, second at 3s
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).rejects.toThrow(ChatApiError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("caps Retry-After at 60 seconds", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "999" }),
        json: () =>
          Promise.resolve({ error: "Rate limited", code: "RATE_LIMITED" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({ reply: "Hello!" }),
      });

    const promise = client.sendMessage([userMessage("Hi")]);
    // Should cap at 60s, not wait 999s
    await vi.advanceTimersByTimeAsync(60000);
    const result = await promise;

    expect(result).toEqual({ reply: "Hello!" });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd widget && pnpm test -- --run src/api/__tests__/client.test.ts`
Expected: New retry tests FAIL

**Step 3: Add retry logic to client.ts**

Refactor `sendMessage` to use a private `fetchWithRetry` method:

```typescript
private isRetryable(status: number): boolean {
  return status === 429 || status === 503;
}

private getRetryDelay(response: Response | null, attempt: number): number {
  if (response?.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      return Math.min(seconds, 60) * 1000;
    }
  }
  // Exponential backoff: 1s, 3s
  return attempt === 0 ? 1000 : 3000;
}

private delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async sendMessage(messages: ChatMessage[]): Promise<ChatResponse> {
  const request: ChatRequest = { messages };
  const url = `${this.baseUrl}/api/chat`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  };

  let lastError: ChatApiError | Error | undefined;

  for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok) {
        return response.json() as Promise<ChatResponse>;
      }

      const body: ChatErrorResponse = await response.json();
      const retryAfter = response.headers.get("Retry-After");
      const error = new ChatApiError(
        body.error,
        response.status,
        body.code,
        retryAfter ? parseInt(retryAfter, 10) : undefined,
      );

      if (!this.isRetryable(response.status) || attempt === this.maxRetries) {
        throw error;
      }

      lastError = error;
      await this.delay(this.getRetryDelay(response, attempt));
    } catch (err) {
      if (err instanceof ChatApiError) {
        if (!this.isRetryable(err.status) || attempt === this.maxRetries) {
          throw err;
        }
        lastError = err;
        await this.delay(this.getRetryDelay(null, attempt));
      } else {
        // Network error
        if (attempt === this.maxRetries) {
          throw new ChatApiError(
            "Failed to connect. Please try again.",
            0,
          );
        }
        lastError = err as Error;
        await this.delay(this.getRetryDelay(null, attempt));
      }
    }
  }

  throw lastError ?? new ChatApiError("Request failed", 0);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd widget && pnpm test -- --run src/api/__tests__/client.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add widget/src/api/client.ts widget/src/api/__tests__/client.test.ts
git commit -m "feat: add retry logic with exponential backoff and Retry-After support"
```

---

### Task 5: Debounce Logic

**Files:**
- Modify: `widget/src/api/client.ts`
- Modify: `widget/src/api/__tests__/client.test.ts`

**Step 1: Add debounce tests**

Add a new `describe("debounce")` block:

```typescript
describe("debounce", () => {
  it("rejects rapid calls within debounce window", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    const fastClient = new ChatApiClient(TEST_URL, { debounceMs: 300 });
    await fastClient.sendMessage([userMessage("First")]);

    const { DebounceError } = await import("../errors");
    await expect(
      fastClient.sendMessage([userMessage("Second")]),
    ).rejects.toBeInstanceOf(DebounceError);
  });

  it("allows calls after debounce window", async () => {
    vi.useFakeTimers();

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    const fastClient = new ChatApiClient(TEST_URL, { debounceMs: 300 });
    await fastClient.sendMessage([userMessage("First")]);

    vi.advanceTimersByTime(301);
    const result = await fastClient.sendMessage([userMessage("Second")]);
    expect(result).toEqual({ reply: "Hello!" });

    vi.useRealTimers();
  });

  it("can disable debounce with debounceMs: 0", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    const noDebounce = new ChatApiClient(TEST_URL, { debounceMs: 0 });
    await noDebounce.sendMessage([userMessage("First")]);
    const result = await noDebounce.sendMessage([userMessage("Second")]);
    expect(result).toEqual({ reply: "Hello!" });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd widget && pnpm test -- --run src/api/__tests__/client.test.ts`
Expected: Debounce tests FAIL

**Step 3: Add debounce to client.ts**

Add a `lastSendTime` field and check at the top of `sendMessage`:

```typescript
// Add to class fields:
private lastSendTime = 0;

// Add to top of sendMessage, before the retry loop:
if (this.debounceMs > 0) {
  const now = Date.now();
  if (now - this.lastSendTime < this.debounceMs) {
    throw new DebounceError();
  }
  this.lastSendTime = now;
}
```

Add the import: `import { ChatApiError, DebounceError } from "./errors";`

**Step 4: Run tests to verify they pass**

Run: `cd widget && pnpm test -- --run src/api/__tests__/client.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add widget/src/api/client.ts widget/src/api/__tests__/client.test.ts
git commit -m "feat: add debounce logic to ChatApiClient"
```

---

### Task 6: Public Exports

**Files:**
- Create: `widget/src/api/index.ts`
- Modify: `widget/src/index.ts`

**Step 1: Create the barrel export**

File: `widget/src/api/index.ts`

```typescript
export { ChatApiClient } from "./client";
export type { ChatApiClientOptions } from "./client";
export { ChatApiError, DebounceError } from "./errors";
export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatErrorResponse,
} from "./types";
```

**Step 2: Update widget public exports**

In `widget/src/index.ts`, add the API client exports and update ChatMessage to come from api/types:

```typescript
export { ChatWidget } from "./components/ChatWidget";
export type {
  ChatWidgetProps,
  WidgetPosition,
  ClaudiusTranslations,
} from "./components/ChatWidget";
export { defaultTranslations, createTranslations } from "./i18n";
export { ChatApiClient } from "./api/client";
export type { ChatApiClientOptions } from "./api/client";
export { ChatApiError, DebounceError } from "./api/errors";
export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatErrorResponse,
} from "./api/types";
```

**Step 3: Commit**

```bash
git add widget/src/api/index.ts widget/src/index.ts
git commit -m "feat: export API client and types from widget package"
```

---

### Task 7: Integrate with useChat Hook

**Files:**
- Modify: `widget/src/hooks/useChat.ts`
- Modify: `widget/src/hooks/__tests__/useChat.test.ts`

**Step 1: Update useChat.ts**

Key changes:
- Import `ChatMessage` from `../api/types` instead of local definition
- Import `ChatApiClient`, `ChatApiError`, `DebounceError` from `../api`
- Create client with `useMemo(() => new ChatApiClient(apiUrl, { debounceMs: 0 }), [apiUrl])` -- debounce is 0 because the hook already has its own `isLoadingRef` guard
- Replace inline fetch (lines 127-158) with `client.sendMessage(updatedMessages)`
- In the catch block: `ChatApiError` -> use `getErrorMessage(err.code, err.message)`; `DebounceError` -> return silently; other -> connection error
- Re-export `ChatMessage` type for backwards compatibility

The updated `sendMessage` callback body (inside the try/catch):

```typescript
try {
  const data = await client.sendMessage(
    updatedMessages.map(({ role, content }) => ({
      id: "",
      role,
      content,
    })),
  );

  const assistantMessage: ChatMessage = {
    id: nextId(),
    role: "assistant",
    content: data.reply,
  };
  const withReply = [...updatedMessages, assistantMessage];
  messagesRef.current = withReply;
  setMessages(withReply);
  saveMessages(withReply);
} catch (err) {
  if (err instanceof DebounceError) return;
  if (err instanceof ChatApiError) {
    setError(getErrorMessage(err.code, err.message));
  } else {
    setError(
      translations?.errorConnection ??
        "Failed to connect. Please try again.",
    );
  }
} finally {
  setIsLoading(false);
  isLoadingRef.current = false;
}
```

**Step 2: Update useChat tests**

The existing tests mock `globalThis.fetch` directly. Since `ChatApiClient` also uses `fetch` internally, the tests should continue to work with the same mock pattern. Verify:

Run: `cd widget && pnpm test -- --run src/hooks/__tests__/useChat.test.ts`
Expected: All existing tests PASS (the mock fetch still intercepts the client's internal fetch calls)

If any tests fail due to the response shape (the client now requires `headers` on the mock), update the mocks to include `headers: new Headers()`.

**Step 3: Run the full widget test suite**

Run: `cd widget && pnpm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add widget/src/hooks/useChat.ts widget/src/hooks/__tests__/useChat.test.ts
git commit -m "feat: integrate ChatApiClient into useChat hook"
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add API client section**

Add after the useChat Hook section in CLAUDE.md:

```markdown
### API Client

`ChatApiClient` in `widget/src/api/client.ts` handles communication with the Worker:
- Typed requests/responses (`ChatRequest`, `ChatResponse`)
- Retry on 429 (respects `Retry-After`) and 503 (exponential backoff: 1s, 3s)
- Max 2 retries (3 total attempts)
- Debounced sends (configurable, default 300ms)
- Typed errors (`ChatApiError` with status/code, `DebounceError`)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add API client section to CLAUDE.md"
```
