# ChatSources Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a slide-out sidebar that displays grouped source links on assistant messages, triggered by an icon button with badge count.

**Architecture:** New `Source` type added to API types. `ChatSources` sidebar and `SourceIcon` button are new components. `MessageBubble` renders the icon for assistant messages with sources. `ChatWindow` manages sidebar open/close state and renders the overlay. Worker filtering is out of scope.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, React Testing Library

---

### Task 1: Add Source type and update API types

**Files:**
- Modify: `widget/src/api/types.ts`
- Test: `widget/src/api/__tests__/types.test.ts`

**Step 1: Write the failing test**

Create `widget/src/api/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Source, ChatMessage, ChatResponse } from "../types";

describe("Source type", () => {
  it("accepts valid source objects", () => {
    const source: Source = {
      url: "https://pmds.info/blog/seo-tips",
      title: "SEO Tips for Small Businesses",
      type: "blog",
    };
    expect(source.type).toBe("blog");
  });

  it("accepts all source types", () => {
    const types: Source["type"][] = ["blog", "page", "external"];
    expect(types).toHaveLength(3);
  });
});

describe("ChatMessage with sources", () => {
  it("supports optional sources field", () => {
    const msg: ChatMessage = {
      id: "msg-1",
      role: "assistant",
      content: "Here are some resources.",
      sources: [
        { url: "https://pmds.info/blog/test", title: "Test", type: "blog" },
      ],
    };
    expect(msg.sources).toHaveLength(1);
  });

  it("works without sources", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "user",
      content: "Hello",
    };
    expect(msg.sources).toBeUndefined();
  });
});

describe("ChatResponse with sources", () => {
  it("supports optional sources field", () => {
    const res: ChatResponse = {
      reply: "Here you go.",
      sources: [
        { url: "https://pmds.info/services", title: "Services", type: "page" },
      ],
    };
    expect(res.sources).toHaveLength(1);
  });

  it("works without sources", () => {
    const res: ChatResponse = { reply: "Hello!" };
    expect(res.sources).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && pnpm test -- --run src/api/__tests__/types.test.ts`
Expected: FAIL - `Source` type does not exist

**Step 3: Write minimal implementation**

Update `widget/src/api/types.ts`:

```typescript
export interface Source {
  url: string;
  title: string;
  type: "blog" | "page" | "external";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  sources?: Source[];
}

export interface ChatErrorResponse {
  error: string;
  code?: string;
}
```

**Step 4: Run test to verify it passes**

Run: `cd widget && pnpm test -- --run src/api/__tests__/types.test.ts`
Expected: PASS

**Step 5: Export Source type from index**

Update `widget/src/index.ts` - add `Source` to the type exports from `./api/types`.

**Step 6: Run full test suite**

Run: `cd widget && pnpm test -- --run`
Expected: All tests PASS (no regressions)

**Step 7: Commit**

```bash
git add widget/src/api/types.ts widget/src/api/__tests__/types.test.ts widget/src/index.ts
git commit -m "feat: add Source type and update ChatMessage/ChatResponse"
```

---

### Task 2: Build SourceIcon component

**Files:**
- Create: `widget/src/components/SourceIcon.tsx`
- Test: `widget/src/components/__tests__/SourceIcon.test.tsx`

**Step 1: Write the failing test**

Create `widget/src/components/__tests__/SourceIcon.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SourceIcon } from "../SourceIcon";

describe("SourceIcon", () => {
  it("renders with source count badge", () => {
    render(<SourceIcon count={3} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("has tooltip text", () => {
    render(<SourceIcon count={2} isActive={false} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: /view sources/i });
    expect(button).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SourceIcon count={1} isActive={false} onClick={onClick} />);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies active styling when isActive is true", () => {
    render(<SourceIcon count={2} isActive={true} onClick={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-claudius-primary");
  });

  it("applies inactive styling when isActive is false", () => {
    render(<SourceIcon count={2} isActive={false} onClick={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.className).not.toContain("bg-claudius-primary");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && pnpm test -- --run src/components/__tests__/SourceIcon.test.tsx`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `widget/src/components/SourceIcon.tsx`:

```tsx
import { memo } from "react";

interface SourceIconProps {
  count: number;
  isActive: boolean;
  onClick: () => void;
}

export const SourceIcon = memo(function SourceIcon({
  count,
  isActive,
  onClick,
}: SourceIconProps) {
  return (
    <button
      onClick={onClick}
      aria-label="View sources"
      title="View sources"
      className={`group relative flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
        isActive
          ? "bg-claudius-primary text-white"
          : "text-claudius-gray hover:bg-claudius-light hover:text-claudius-dark dark:hover:bg-gray-700"
      }`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-claudius-primary px-1 text-[10px] font-bold text-white">
        {count}
      </span>
    </button>
  );
});
```

**Step 4: Run test to verify it passes**

Run: `cd widget && pnpm test -- --run src/components/__tests__/SourceIcon.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/components/SourceIcon.tsx widget/src/components/__tests__/SourceIcon.test.tsx
git commit -m "feat: add SourceIcon component with badge count"
```

---

### Task 3: Build ChatSources sidebar component

**Files:**
- Create: `widget/src/components/ChatSources.tsx`
- Test: `widget/src/components/__tests__/ChatSources.test.tsx`

**Step 1: Write the failing test**

Create `widget/src/components/__tests__/ChatSources.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatSources } from "../ChatSources";
import type { Source } from "../../api/types";

const mockSources: Source[] = [
  { url: "https://pmds.info/blog/seo-tips", title: "SEO Tips", type: "blog" },
  { url: "https://pmds.info/blog/web-design", title: "Web Design Guide", type: "blog" },
  { url: "https://pmds.info/services", title: "Our Services", type: "page" },
  { url: "https://example.com/resource", title: "External Resource", type: "external" },
];

describe("ChatSources", () => {
  it("renders source count header", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    expect(screen.getByText("4 sources found")).toBeInTheDocument();
  });

  it("renders singular count for one source", () => {
    render(<ChatSources sources={[mockSources[0]]} onClose={vi.fn()} />);
    expect(screen.getByText("1 source found")).toBeInTheDocument();
  });

  it("renders Sources heading", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    expect(screen.getByText("Sources")).toBeInTheDocument();
  });

  it("groups sources by type with blogs first", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    const headings = screen.getAllByRole("heading", { level: 4 });
    const texts = headings.map((h) => h.textContent);
    expect(texts).toEqual(["Blog", "Page", "External"]);
  });

  it("does not render empty type groups", () => {
    const blogOnly = mockSources.filter((s) => s.type === "blog");
    render(<ChatSources sources={blogOnly} onClose={vi.fn()} />);
    expect(screen.queryByText("Page")).not.toBeInTheDocument();
    expect(screen.queryByText("External")).not.toBeInTheDocument();
  });

  it("renders source titles as links", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    const link = screen.getByRole("link", { name: /SEO Tips/i });
    expect(link).toHaveAttribute("href", "https://pmds.info/blog/seo-tips");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("displays domain for each source", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    expect(screen.getAllByText("pmds.info").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChatSources sources={mockSources} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && pnpm test -- --run src/components/__tests__/ChatSources.test.tsx`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `widget/src/components/ChatSources.tsx`:

```tsx
import { memo } from "react";
import type { Source } from "../api/types";

interface ChatSourcesProps {
  sources: Source[];
  onClose: () => void;
}

const TYPE_ORDER: Source["type"][] = ["blog", "page", "external"];

const TYPE_LABELS: Record<Source["type"], string> = {
  blog: "Blog",
  page: "Page",
  external: "External",
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const ChatSources = memo(function ChatSources({
  sources,
  onClose,
}: ChatSourcesProps) {
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    items: sources.filter((s) => s.type === type),
  })).filter((group) => group.items.length > 0);

  const countText = sources.length === 1 ? "1 source found" : `${sources.length} sources found`;

  return (
    <div className="absolute inset-y-0 left-0 z-10 flex w-[280px] flex-col border-r-2 border-claudius-border bg-white dark:bg-gray-900 rounded-r-card transition-transform duration-200 ease-out">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-claudius-border px-4 py-3">
        <div>
          <h3 className="text-sm font-heading font-semibold text-claudius-dark dark:text-gray-100">
            Sources
          </h3>
          <p className="text-xs text-claudius-gray">{countText}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close sources"
          className="flex h-7 w-7 items-center justify-center rounded-full text-claudius-gray transition-colors hover:bg-claudius-light hover:text-claudius-dark dark:hover:bg-gray-700"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {grouped.map((group) => (
          <div key={group.type}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-claudius-gray">
              {group.label}
            </h4>
            <div className="space-y-2">
              {group.items.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-[12px] border-2 border-claudius-border bg-claudius-light p-3 transition-colors hover:bg-claudius-border dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  <p className="truncate text-sm font-medium text-claudius-dark dark:text-gray-100">
                    {source.title}
                  </p>
                  <p className="mt-0.5 text-xs text-claudius-gray">
                    {extractDomain(source.url)}
                  </p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
```

**Step 4: Run test to verify it passes**

Run: `cd widget && pnpm test -- --run src/components/__tests__/ChatSources.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/components/ChatSources.tsx widget/src/components/__tests__/ChatSources.test.tsx
git commit -m "feat: add ChatSources sidebar with grouped source links"
```

---

### Task 4: Integrate SourceIcon into MessageBubble

**Files:**
- Modify: `widget/src/components/MessageBubble.tsx`
- Modify: `widget/src/components/__tests__/MessageBubble.test.tsx`

**Step 1: Write the failing tests**

Add to `widget/src/components/__tests__/MessageBubble.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { Source } from "../../api/types";

const mockSources: Source[] = [
  { url: "https://pmds.info/blog/test", title: "Test Post", type: "blog" },
  { url: "https://pmds.info/services", title: "Services", type: "page" },
];

// Add these test cases to the existing describe block:

it("renders source icon for assistant messages with sources", () => {
  render(
    <MessageBubble
      role="assistant"
      content="Here are resources."
      sources={mockSources}
      onSourceClick={vi.fn()}
      isSourceActive={false}
    />
  );
  expect(screen.getByRole("button", { name: /view sources/i })).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

it("does not render source icon for user messages", () => {
  render(
    <MessageBubble
      role="user"
      content="Hello"
      sources={mockSources}
      onSourceClick={vi.fn()}
      isSourceActive={false}
    />
  );
  expect(screen.queryByRole("button", { name: /view sources/i })).not.toBeInTheDocument();
});

it("does not render source icon when no sources", () => {
  render(
    <MessageBubble role="assistant" content="No sources here." />
  );
  expect(screen.queryByRole("button", { name: /view sources/i })).not.toBeInTheDocument();
});

it("calls onSourceClick when source icon is clicked", async () => {
  const user = userEvent.setup();
  const onSourceClick = vi.fn();
  render(
    <MessageBubble
      role="assistant"
      content="Resources."
      sources={mockSources}
      onSourceClick={onSourceClick}
      isSourceActive={false}
    />
  );
  await user.click(screen.getByRole("button", { name: /view sources/i }));
  expect(onSourceClick).toHaveBeenCalledOnce();
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && pnpm test -- --run src/components/__tests__/MessageBubble.test.tsx`
Expected: FAIL - props not accepted

**Step 3: Update MessageBubble implementation**

Update `widget/src/components/MessageBubble.tsx`:

- Add optional props: `sources?: Source[]`, `onSourceClick?: () => void`, `isSourceActive?: boolean`
- Import `SourceIcon` and `Source` type
- Below the message content div, conditionally render `SourceIcon` when `role === "assistant"` and `sources` has items
- Wrap the bubble + icon in a container div

The updated component structure:

```tsx
interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  onSourceClick?: () => void;
  isSourceActive?: boolean;
}

// In the render, wrap existing div and add icon below:
<div className={`${isUser ? "ml-auto" : "mr-auto"} max-w-[85%]`}>
  <div className={`rounded-bubble px-4 py-2.5 text-sm leading-relaxed font-body ${
    isUser
      ? "bg-claudius-user-bg text-claudius-user-text rounded-br-sm"
      : "bg-claudius-assistant-bg text-claudius-assistant-text dark:bg-gray-800 dark:text-gray-200 rounded-bl-sm"
  }`}>
    {renderFormattedContent(content)}
  </div>
  {!isUser && sources && sources.length > 0 && onSourceClick && (
    <div className="mt-1">
      <SourceIcon
        count={sources.length}
        isActive={isSourceActive ?? false}
        onClick={onSourceClick}
      />
    </div>
  )}
</div>
```

**Step 4: Run test to verify it passes**

Run: `cd widget && pnpm test -- --run src/components/__tests__/MessageBubble.test.tsx`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd widget && pnpm test -- --run`
Expected: All PASS

**Step 6: Commit**

```bash
git add widget/src/components/MessageBubble.tsx widget/src/components/__tests__/MessageBubble.test.tsx
git commit -m "feat: integrate SourceIcon into MessageBubble for assistant messages"
```

---

### Task 5: Wire sources through useChat hook

**Files:**
- Modify: `widget/src/hooks/useChat.ts:128-135`
- Modify: `widget/src/hooks/__tests__/useChat.test.ts`

**Step 1: Write the failing test**

Add to `widget/src/hooks/__tests__/useChat.test.ts` (find the existing test that verifies assistant messages are added - add a new test near it):

```typescript
it("includes sources from API response in assistant message", async () => {
  // Mock fetch to return response with sources
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      reply: "Here are resources.",
      sources: [
        { url: "https://pmds.info/blog/test", title: "Test", type: "blog" },
      ],
    }),
  });

  const { result } = renderHook(() =>
    useChat({ apiUrl: "https://test.workers.dev/api/chat" })
  );

  await act(async () => {
    await result.current.sendMessage("Help me");
  });

  const assistantMsg = result.current.messages.find((m) => m.role === "assistant");
  expect(assistantMsg?.sources).toEqual([
    { url: "https://pmds.info/blog/test", title: "Test", type: "blog" },
  ]);
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && pnpm test -- --run src/hooks/__tests__/useChat.test.ts`
Expected: FAIL - sources is undefined on assistant message

**Step 3: Update useChat implementation**

In `widget/src/hooks/useChat.ts`, update the assistant message creation (around line 131-135):

```typescript
const assistantMessage: ChatMessage = {
  id: nextId(),
  role: "assistant",
  content: data.reply,
  sources: data.sources,
};
```

No other changes needed - `sources` is optional on `ChatMessage` so existing messages without sources still work.

**Step 4: Run test to verify it passes**

Run: `cd widget && pnpm test -- --run src/hooks/__tests__/useChat.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add widget/src/hooks/useChat.ts widget/src/hooks/__tests__/useChat.test.ts
git commit -m "feat: pass sources from API response into ChatMessage"
```

---

### Task 6: Integrate ChatSources sidebar into ChatWindow

**Files:**
- Modify: `widget/src/components/ChatWindow.tsx`
- Modify: `widget/src/components/__tests__/ChatWindow.test.tsx`

**Step 1: Write the failing tests**

Add to `widget/src/components/__tests__/ChatWindow.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event";

const messagesWithSources = [
  { id: "msg-1", role: "user" as const, content: "Help me" },
  {
    id: "msg-2",
    role: "assistant" as const,
    content: "Here are resources.",
    sources: [
      { url: "https://pmds.info/blog/seo", title: "SEO Tips", type: "blog" as const },
      { url: "https://pmds.info/services", title: "Services", type: "page" as const },
    ],
  },
];

it("renders source icon on assistant messages with sources", () => {
  render(
    <ChatWindow
      messages={messagesWithSources}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={vi.fn()}
    />
  );
  expect(screen.getByRole("button", { name: /view sources/i })).toBeInTheDocument();
});

it("opens sources sidebar when source icon is clicked", async () => {
  const user = userEvent.setup();
  render(
    <ChatWindow
      messages={messagesWithSources}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: /view sources/i }));
  expect(screen.getByText("Sources")).toBeInTheDocument();
  expect(screen.getByText("2 sources found")).toBeInTheDocument();
  expect(screen.getByText("SEO Tips")).toBeInTheDocument();
});

it("closes sources sidebar when close button is clicked", async () => {
  const user = userEvent.setup();
  render(
    <ChatWindow
      messages={messagesWithSources}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={vi.fn()}
    />
  );
  await user.click(screen.getByRole("button", { name: /view sources/i }));
  expect(screen.getByText("Sources")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /close sources/i }));
  expect(screen.queryByText("Sources")).not.toBeInTheDocument();
});

it("toggles sidebar off when same source icon is clicked again", async () => {
  const user = userEvent.setup();
  render(
    <ChatWindow
      messages={messagesWithSources}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={vi.fn()}
    />
  );
  const icon = screen.getByRole("button", { name: /view sources/i });
  await user.click(icon);
  expect(screen.getByText("Sources")).toBeInTheDocument();
  await user.click(icon);
  expect(screen.queryByText("Sources")).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd widget && pnpm test -- --run src/components/__tests__/ChatWindow.test.tsx`
Expected: FAIL

**Step 3: Update ChatWindow implementation**

In `widget/src/components/ChatWindow.tsx`:

1. Add `useState` import (already imported via `useEffect, useRef` - add `useState`)
2. Import `ChatSources` and `Source` type
3. Add state: `const [activeSources, setActiveSources] = useState<{ messageId: string; sources: Source[] } | null>(null)`
4. Update the `ChatMessage` interface to include `sources?: Source[]`
5. In the messages map, pass source props to `MessageBubble`:

```tsx
{messages.map((msg) => (
  <MessageBubble
    key={msg.id}
    role={msg.role}
    content={msg.content}
    sources={msg.sources}
    isSourceActive={activeSources?.messageId === msg.id}
    onSourceClick={() => {
      if (activeSources?.messageId === msg.id) {
        setActiveSources(null);
      } else if (msg.sources && msg.sources.length > 0) {
        setActiveSources({ messageId: msg.id, sources: msg.sources });
      }
    }}
  />
))}
```

6. Render `ChatSources` inside the main container, positioned over the messages area. Add it as a sibling to the messages div, wrapped in a relative container:

The messages section needs `relative` added. Then add:

```tsx
{activeSources && (
  <ChatSources
    sources={activeSources.sources}
    onClose={() => setActiveSources(null)}
  />
)}
```

Place this inside a wrapper that has `relative overflow-hidden` around the messages area so the absolute-positioned sidebar stays contained.

**Step 4: Run test to verify it passes**

Run: `cd widget && pnpm test -- --run src/components/__tests__/ChatWindow.test.tsx`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd widget && pnpm test -- --run`
Expected: All PASS

**Step 6: Commit**

```bash
git add widget/src/components/ChatWindow.tsx widget/src/components/__tests__/ChatWindow.test.tsx
git commit -m "feat: integrate ChatSources sidebar into ChatWindow"
```

---

### Task 7: Visual verification with dev server

**Files:**
- Modify: `widget/src/main.tsx` (temporarily add mock sources for dev testing)

**Step 1: Add mock sources to dev app**

In `widget/src/main.tsx`, find where the dev app renders and add mock source data to test the visual appearance. This is temporary dev-only code.

**Step 2: Start dev server and verify**

Run: `cd widget && pnpm dev`

Verify:
- Source icon appears on assistant messages (with badge count)
- Clicking icon slides sidebar in from left
- Sources are grouped: blogs first, then pages, then external
- Source cards show title and domain
- Links open in new tab
- Close button and toggle work
- Dark mode works (if applicable)
- Sidebar doesn't overflow the chat window

**Step 3: Remove mock data from dev app**

Clean up temporary mock sources from `main.tsx`.

**Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: clean up after visual verification"
```

---

### Task 8: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update component table**

Add `ChatSources` and `SourceIcon` to the Widget Components table in CLAUDE.md:

| Component | Purpose |
|-----------|---------|
| `ChatSources` | Slide-out sidebar displaying grouped source links |
| `SourceIcon` | Icon button with badge count to trigger source sidebar |

**Step 2: Update ChatMessage type documentation**

Update the Chat Request/Response section to show the `sources` field:

```typescript
// Response
{
  reply: "How can I help you today?",
  sources?: [
    { url: "https://...", title: "...", type: "blog" | "page" | "external" }
  ]
}
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add ChatSources and SourceIcon to component documentation"
```
