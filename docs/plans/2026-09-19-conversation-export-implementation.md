# Conversation Export Implementation Plan (issue #55)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opt-in header menu that copies the conversation as Markdown, or downloads it as Markdown or JSON, entirely in the browser.

**Architecture:** A pure serializer module holds all transcript logic. A generic accessible `HeaderMenu` component knows nothing about export. A `useConversationExport` hook turns messages into menu items plus a transient status. `useChat` starts stamping `createdAt` on every message so there are timestamps to export.

**Tech Stack:** React 18/19, TypeScript strict, Tailwind 3.4 theme tokens, Vitest 4 + React Testing Library + user-event 14, Playwright, `Intl.DateTimeFormat`. No new dependencies.

**Spec:** `docs/plans/2026-09-19-conversation-export-design.md`. Read it first. This plan argues from it.

## Global Constraints

- **No new runtime or dev dependencies.**
- **Off by default, fails closed.** Only the literal `true` enables the feature. The string `"false"`, `"true"`, `1`, or an object must not.
- **Renders nothing when off.** No menu, no status region. An existing test does `screen.getByRole("status")` for the typing indicator; a second always-present status region would break it.
- **The option is named `conversationExport`** (prop, `ClaudiusConfig` key, client JSON key) and `conversation-export` (HTML attribute). Never `export`.
- **The timestamp field is `createdAt`**, an ISO 8601 string, optional.
- **Code inside a fenced block is never modified.**
- **Serialization never throws on message content.**
- **No em dashes** in code comments, strings, or docs. The repo avoids them.
- **Every new key in `ClaudiusTranslations`, the new prop, and `createdAt` need a TSDoc comment.** CI runs `typedoc --emit none`, which fails on undocumented public API.
- **Run tools directly on the maintainer's machine.** pnpm 11 breaks `pnpm test` / `pnpm build` in `widget/`. From `widget/` use `./node_modules/.bin/vitest`, `./node_modules/.bin/tsc`, `./node_modules/.bin/eslint`, `./node_modules/.bin/prettier`, `./node_modules/.bin/vite`. CI uses the pnpm scripts and is unaffected.
- **Stage explicit paths only.** Never `git add -A` or `git add .`. The working tree holds unrelated local changes (`.mcp.json`, `.claude/`, `signup-state.png`) and untracked `pnpm-workspace.yaml` scaffolds that must never be committed.
- **Format before every commit.** From `widget/`, run `./node_modules/.bin/prettier --write` on each `src/` file the task created or changed, then `./node_modules/.bin/eslint` on the same files. Code blocks in this plan are not all wrapped the way Prettier wants, and CI's `format:check` fails on the difference. The pre-commit hook also runs `eslint --fix` and `prettier --write` on staged `widget/src/**/*.{ts,tsx}`, but do not rely on it alone. The widget has no `eslint-disable` comments; do not add one.
- **CI runs widget tests on Node 20**, whose ICU puts U+202F before "PM". Local Node 24 does not. Never assert on raw `Intl` output. Assert on serializer output, which normalizes it, and pin `timeZone: "Asia/Kolkata"` (fixed +05:30, no DST) wherever an exact date string is compared.
- End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Structure

Create:

| File | Responsibility |
|------|----------------|
| `widget/src/utils/exportConversation.ts` | `protectMessageText`, `conversationToMarkdown`, `conversationToJson`, `exportFilename`. Pure. |
| `widget/src/utils/saveText.ts` | `copyText`, `downloadTextFile`. The only DOM side effects. |
| `widget/src/components/HeaderMenu.tsx` | Generic menu button. |
| `widget/src/hooks/useConversationExport.ts` | Messages to menu items plus status. |
| `widget/src/utils/__tests__/exportConversation.test.ts` | |
| `widget/src/utils/__tests__/saveText.test.ts` | |
| `widget/src/components/__tests__/HeaderMenu.test.tsx` | |
| `widget/src/hooks/__tests__/useConversationExport.test.ts` | |
| `widget/src/hooks/__tests__/useChat.timestamps.test.ts` | |
| `widget/src/components/__tests__/ChatWindow.export.test.tsx` | |
| `widget/src/components/__tests__/ChatWidget.export.test.tsx` | |
| `widget/e2e/export.spec.ts` | |
| `scripts/lib/__tests__/conversation-export-config.test.ts` | |
| `docs/src/content/docs/configuration/conversation-export.md` | |

Modify: `widget/src/api/types.ts`, `widget/src/hooks/useChat.ts`, `widget/src/i18n.ts`, `widget/src/locales/{en,es,fr,de}.ts`, `widget/src/components/ChatHeader.tsx`, `widget/src/components/ChatHeader.stories.tsx`, `widget/src/components/ChatWindow.tsx`, `widget/src/components/ChatWidget.tsx`, `widget/src/embed.tsx`, `widget/src/main.tsx`, `widget/src/__tests__/embed.test.tsx`, `scripts/lib/config.ts`, `scripts/lib/snippet.ts`, `clients/_schema.json`, four docs pages, `CLAUDE.md`, `widget/.size-limit.json`.

---

### Task 1: Record `createdAt` on every message

**Files:**
- Modify: `widget/src/api/types.ts` (the `ChatMessage` interface)
- Modify: `widget/src/hooks/useChat.ts`
- Test: `widget/src/hooks/__tests__/useChat.timestamps.test.ts` (create)

**Interfaces:**
- Produces: `ChatMessage.createdAt?: string` (ISO 8601). Tasks 3 and 7 read it.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/hooks/__tests__/useChat.timestamps.test.ts`. Only `Date` is faked: faking timers too would stall `waitFor`.

```ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChat } from "../useChat";
import type { ClaudiusPlugin } from "../../plugins/types";

const API_URL = "https://test.workers.dev";
const STORAGE_KEY = "claudius:messages:test.workers.dev";
const T1 = "2026-09-19T14:03:00.000Z";
const T2 = "2026-09-19T14:03:05.000Z";
const T3 = "2026-09-19T14:03:09.000Z";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const encoder = new TextEncoder();

function sseStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body,
    },
    emit(event: string, data: unknown) {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    },
    close() {
      controller.close();
    },
  };
}

/** Resolve a blocking reply, moving the clock to `at` as it arrives. */
function mockReplyAt(reply: string, at: string) {
  mockFetch.mockImplementationOnce(async () => {
    vi.setSystemTime(new Date(at));
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ reply }),
    };
  });
}

describe("useChat timestamps", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T1));
  });
  afterEach(() => vi.useRealTimers());

  it("stamps the visitor message on send and the reply on arrival", async () => {
    mockReplyAt("Hello!", T2);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.messages[0].createdAt).toBe(T1);
    expect(result.current.messages[1].createdAt).toBe(T2);
  });

  it("keeps a streamed reply's time from its first token", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date(T2));
    act(() => stream.emit("chunk", { text: "Hel" }));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1].createdAt).toBe(T2);

    vi.setSystemTime(new Date(T3));
    act(() => {
      stream.emit("done", { reply: "Hello!" });
      stream.close();
    });
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.messages[1].content).toBe("Hello!");
    expect(result.current.messages[1].createdAt).toBe(T2);
  });

  it("persists the timestamps with the history", async () => {
    mockReplyAt("Hello!", T2);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored.map((m: { createdAt?: string }) => m.createdAt)).toEqual([
      T1,
      T2,
    ]);
  });

  it("leaves messages restored from an older version without a time", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "msg-1", role: "user", content: "old" }]),
    );
    const { result } = renderHook(() => useChat({ apiUrl: API_URL }));

    expect(result.current.messages[0].createdAt).toBeUndefined();
  });

  it("restores the time when a plugin returns a fresh message object", async () => {
    mockReplyAt("hello", T2);
    const rebuild: ClaudiusPlugin = {
      name: "rebuild",
      onBeforeSend: (m) => ({ id: m.id, role: m.role, content: m.content }),
      onAfterReceive: (m) => ({
        id: m.id,
        role: m.role,
        content: m.content.toUpperCase(),
      }),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, plugins: [rebuild] }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.messages[0].createdAt).toBe(T1);
    expect(result.current.messages[1]).toMatchObject({
      content: "HELLO",
      createdAt: T2,
    });
  });

  it("stamps both sides of a reply a plugin answered locally", async () => {
    const canned: ClaudiusPlugin = {
      name: "canned",
      onBeforeSend: (_m, ctx) => ctx.respondWith("We open at 9."),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, plugins: [canned] }),
    );

    await act(async () => {
      await result.current.sendMessage("hours?");
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.messages.map((m) => m.createdAt)).toEqual([T1, T1]);
  });

  it("stamps a fallback reply a plugin supplied after an error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.resolve({ error: "boom", code: "UNKNOWN_ERROR" }),
    });
    const recover: ClaudiusPlugin = {
      name: "recover",
      onError: (_e, ctx) => ctx.respondWith("We're offline."),
    };
    const { result } = renderHook(() =>
      useChat({ apiUrl: API_URL, plugins: [recover] }),
    );

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      createdAt: T1,
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run from `widget/`: `./node_modules/.bin/vitest run src/hooks/__tests__/useChat.timestamps.test.ts`
Expected: FAIL. TypeScript-level: `createdAt` does not exist on `ChatMessage`. Runtime: `expected undefined to be '2026-09-19T14:03:00.000Z'`. The "older version" test passes already; that is fine.

- [ ] **Step 3: Add the field to the type**

In `widget/src/api/types.ts`, inside `interface ChatMessage`, after the `toolUses` member:

```ts
  /**
   * ISO 8601 time the message was added to the conversation. Absent on
   * messages persisted by widget versions that predate conversation export.
   */
  createdAt?: string;
```

- [ ] **Step 4: Stamp it in `useChat`**

All edits are in `widget/src/hooks/useChat.ts`.

After the `DEFAULT_STORAGE_KEY_PREFIX` constant add:

```ts
/** Timestamp for a message entering the conversation. */
const timestamp = () => new Date().toISOString();
```

In `upsertPlaceholder`, replace the placeholder literal:

```ts
            {
              id: placeholderId,
              role: "assistant",
              content: "",
              createdAt: timestamp(),
              ...patch,
            },
```

Replace the block that builds the settled reply and runs `runAfterReceive`:

```ts
        // A streamed reply keeps the time its first token arrived.
        const createdAt =
          messagesRef.current.find((m) => m.id === placeholderId)?.createdAt ??
          timestamp();
        let assistantMessage: ChatMessage = {
          id: placeholderId ?? nextId(),
          role: "assistant",
          content: reply,
          createdAt,
          sources,
          toolUses,
        };
        // A cancelled reply is intentionally partial; don't hand it to
        // afterReceive plugins as if it were a complete answer.
        if (pluginsRef.current.length > 0 && !aborted) {
          assistantMessage = await runAfterReceive(
            pluginsRef.current,
            assistantMessage,
            { messages: msgsToSend, apiUrl },
          );
          // A plugin that returns a fresh object should not erase the time.
          if (!assistantMessage.createdAt) {
            assistantMessage = { ...assistantMessage, createdAt };
          }
        }
```

In the `runError` recovery branch, add `createdAt: timestamp(),` to the `assistantMessage` literal, after `content`.

In `sendMessage`, add `createdAt: timestamp(),` to the `userMessage` literal, after `content`. Then, inside `if (pluginsRef.current.length > 0) {`, directly after the `runBeforeSend` call and the `abort` check, add:

```ts
        // A plugin that returns a fresh object should not erase the time.
        const keepTime = (m: ChatMessage): ChatMessage =>
          m.createdAt ? m : { ...m, createdAt: userMessage.createdAt };
```

In the `respond` branch, add `createdAt: timestamp(),` to its `assistantMessage` literal, and change the `next` array to use `keepTime(outcome.message)` in place of `outcome.message`. Change the final assignment to `outgoing = keepTime(outcome.message);`.

- [ ] **Step 5: Run the new tests, then the whole suite**

Run: `./node_modules/.bin/vitest run src/hooks/__tests__/useChat.timestamps.test.ts`
Expected: 7 passed.

Run: `./node_modules/.bin/vitest run`
Expected: all files pass (46 existing files plus this one). No existing test should change: they use `toMatchObject`, and the only exact-shape assertions are on messages loaded from storage, which are not stamped.

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/typedoc --emit none`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add widget/src/api/types.ts widget/src/hooks/useChat.ts widget/src/hooks/__tests__/useChat.timestamps.test.ts
git commit -m "feat(widget): record createdAt on chat messages" -m "Conversation export (#55) needs timestamps, and messages had none. Stamped where useChat creates a message, kept from the streaming placeholder to the settled reply, and restored when a plugin returns a fresh object. Workers discard unknown message fields, so nothing changes on the wire that matters." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Message text protections

**Files:**
- Create: `widget/src/utils/exportConversation.ts`
- Test: `widget/src/utils/__tests__/exportConversation.test.ts` (create)

**Interfaces:**
- Produces: `protectMessageText(text: string): string`. Task 3 calls it once per message.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/utils/__tests__/exportConversation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { protectMessageText } from "../exportConversation";

describe("protectMessageText", () => {
  describe("code fences", () => {
    it("keeps a long code block byte for byte", () => {
      const code = Array.from(
        { length: 5000 },
        (_, i) => `  line ${i}   `,
      ).join("\n");
      const text = "Here:\n\n```txt\n" + code + "\n```";
      expect(protectMessageText(text)).toBe(text);
    });

    it("closes a fence left open by a stopped reply", () => {
      expect(protectMessageText("Try:\n\n```js\nconst a = 1;")).toBe(
        "Try:\n\n```js\nconst a = 1;\n```",
      );
    });

    it("closes with the opener's character, length, and indentation", () => {
      expect(protectMessageText("1. Run:\n\n   ~~~~bash\n   npm i")).toBe(
        "1. Run:\n\n   ~~~~bash\n   npm i\n   ~~~~",
      );
    });

    it("does not end a longer fence at a shorter one inside it", () => {
      const text = "````md\n```js\ncode\n```\n````";
      expect(protectMessageText(text)).toBe(text);
    });

    it("does not end a fence at a line that carries an info string", () => {
      expect(protectMessageText("```\n```js\nx")).toBe("```\n```js\nx\n```");
    });

    it("does not end a backtick fence with tildes", () => {
      expect(protectMessageText("```\n~~~\nx")).toBe("```\n~~~\nx\n```");
    });

    it("treats three backticks followed by more backticks as inline code", () => {
      expect(protectMessageText("```not a fence``` here\nnext")).toBe(
        "```not a fence``` here  \nnext",
      );
    });
  });

  describe("hard line breaks", () => {
    it("turns a single newline into a hard break, and leaves blank lines", () => {
      expect(protectMessageText("One.\nTwo.\n\nThree.")).toBe(
        "One.  \nTwo.\n\nThree.",
      );
    });

    it("adds none inside code, on indented lines, or after a backslash", () => {
      expect(protectMessageText("```\na\nb\n```")).toBe("```\na\nb\n```");
      expect(protectMessageText("    a\n    b")).toBe("    a\n    b");
      expect(protectMessageText("\ta\n\tb")).toBe("\ta\n\tb");
      expect(protectMessageText("a\\\nb")).toBe("a\\\nb");
    });

    it("replaces existing trailing whitespace instead of stacking on it", () => {
      expect(protectMessageText("One. \t\nTwo.")).toBe("One.  \nTwo.");
    });
  });

  describe("HTML blocks", () => {
    it("escapes a line-leading < that could open an unterminated block", () => {
      expect(protectMessageText("<!-- note")).toBe("\\<!-- note");
      expect(protectMessageText("<script>alert(1)")).toBe("\\<script>alert(1)");
      expect(protectMessageText("</div>")).toBe("\\</div>");
      expect(protectMessageText("  <?php")).toBe("  \\<?php");
    });

    it("leaves < alone inside code, mid-line, and when it is not a tag", () => {
      expect(protectMessageText("```html\n<script>\n```")).toBe(
        "```html\n<script>\n```",
      );
      expect(protectMessageText("a < b and <b>bold</b>")).toBe(
        "a < b and <b>bold</b>",
      );
      expect(protectMessageText("< 5 items")).toBe("< 5 items");
    });
  });

  it("normalizes CRLF and drops trailing blank lines", () => {
    expect(protectMessageText("One.\r\nTwo.\r\n\r\n")).toBe("One.  \nTwo.");
  });

  it("passes emoji and right-to-left text through untouched", () => {
    const text = "שלום 👋 مرحبا";
    expect(protectMessageText(text)).toBe(text);
  });

  it("returns an empty string for empty or whitespace-only text", () => {
    expect(protectMessageText("")).toBe("");
    expect(protectMessageText("  \n\n")).toBe("");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `./node_modules/.bin/vitest run src/utils/__tests__/exportConversation.test.ts`
Expected: FAIL, cannot resolve `../exportConversation`.

- [ ] **Step 3: Implement**

Create `widget/src/utils/exportConversation.ts`:

```ts
interface OpenFence {
  indent: string;
  char: string;
  length: number;
}

const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
// A line-leading "<" that CommonMark could read as the start of an HTML block.
const HTML_BLOCK_START = /^( {0,3})<(?=[A-Za-z!?/])/;
const INDENTED = /^(?: {4}|\t)/;

/**
 * CommonMark fences, except that any indentation is accepted: models indent
 * fences inside list items all the time and almost never write indented code.
 */
function parseFenceOpen(line: string): OpenFence | null {
  const match = FENCE_OPEN.exec(line);
  if (!match) return null;
  const [, indent, run, info] = match;
  // A backtick fence's info string cannot contain a backtick. Such a line is
  // inline code that happens to start the line.
  if (run[0] === "`" && info.includes("`")) return null;
  return { indent, char: run[0], length: run.length };
}

/** A closer is the opener's character alone, at least as many times. */
function closesFence(line: string, fence: OpenFence): boolean {
  const trimmed = line.trim();
  if (trimmed.length < fence.length) return false;
  for (const ch of trimmed) {
    if (ch !== fence.char) return false;
  }
  return true;
}

/**
 * Prepare one message's text for a Markdown transcript. The text is kept as
 * written, with protections that stop it damaging the rest of the file or
 * rendering differently from how the widget showed it:
 *
 * - an unclosed code fence is closed, so a reply stopped inside a code block
 *   does not swallow every later message;
 * - a single newline becomes a hard line break, because the widget shows
 *   every newline as a line break while Markdown treats it as a space;
 * - a line-leading `<` is escaped, so an unterminated HTML block or comment
 *   cannot hide what follows it;
 * - line endings are normalized and trailing blank lines dropped.
 *
 * Text inside a fenced block is never modified.
 */
export function protectMessageText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n");
  const out: string[] = [];
  let fence: OpenFence | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (fence) {
      out.push(line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }

    const opened = parseFenceOpen(line);
    if (opened) {
      fence = opened;
      out.push(line);
      continue;
    }

    let result = line.replace(HTML_BLOCK_START, "$1\\<");
    const next = lines[i + 1];
    const breakable =
      line.trim() !== "" &&
      next !== undefined &&
      next.trim() !== "" &&
      // Possibly indented code, where trailing spaces would be content.
      !INDENTED.test(line) &&
      // Already a hard break.
      !line.endsWith("\\");
    if (breakable) result = result.replace(/[ \t]+$/, "") + "  ";
    out.push(result);
  }

  if (fence) out.push(fence.indent + fence.char.repeat(fence.length));
  return out.join("\n");
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `./node_modules/.bin/vitest run src/utils/__tests__/exportConversation.test.ts`
Expected: 15 passed.

- [ ] **Step 5: Commit**

```bash
git add widget/src/utils/exportConversation.ts widget/src/utils/__tests__/exportConversation.test.ts
git commit -m "feat(widget): message text protections for Markdown export" -m "Closes unclosed code fences, turns single newlines into hard breaks outside code, and escapes a line-leading < so an unterminated HTML block cannot hide later messages. Code inside a fence is never touched." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Markdown and JSON serializers

**Files:**
- Modify: `widget/src/utils/exportConversation.ts`
- Test: `widget/src/utils/__tests__/exportConversation.test.ts`

**Interfaces:**
- Consumes: `protectMessageText` (Task 2); `ChatMessage.createdAt` (Task 1); existing `formatBytes` and `stripAttachmentData` from `./attachments`, `interpolate` from `./interpolate`, `sanitizeUrl` from `./sanitize`.
- Produces:
  ```ts
  interface TranscriptLabels {
    title: string; exported: string; user: string; assistant: string;
    attachments: string; sources: string; toolUsed: string;
  }
  interface MarkdownExportOptions {
    labels: TranscriptLabels; locale?: string; timeZone?: string;
    now?: Date; formatDate?: (date: Date) => string;
  }
  conversationToMarkdown(messages: readonly ChatMessage[], options: MarkdownExportOptions): string
  conversationToJson(messages: readonly ChatMessage[]): string
  exportFilename(extension: "md" | "json", options?: { now?: Date; timeZone?: string }): string
  ```
  `labels.attachments`, `labels.sources`, and `labels.toolUsed` **include their own colon** (`"Sources:"`), like the existing `toolUsed` string, because French puts a space before it.

- [ ] **Step 1: Write the failing tests**

Change the imports at the top of `exportConversation.test.ts` to:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  conversationToJson,
  conversationToMarkdown,
  exportFilename,
  protectMessageText,
  type TranscriptLabels,
} from "../exportConversation";
import type { ChatMessage } from "../../api/types";
```

Append to the file:

```ts
const labels: TranscriptLabels = {
  title: "Chat transcript",
  exported: "Exported {date}",
  user: "User",
  assistant: "Assistant",
  attachments: "Attachments:",
  sources: "Sources:",
  toolUsed: "Used tool:",
};

// Asia/Kolkata is a fixed +05:30 with no DST, so exact strings are stable
// across ICU versions. 14:32 UTC is 8:02 PM there.
const base = {
  labels,
  locale: "en-US",
  timeZone: "Asia/Kolkata",
  now: new Date("2026-09-19T14:32:00.000Z"),
};
const T = "2026-09-19T14:03:00.000Z";

describe("conversationToMarkdown", () => {
  it("writes a title, the export time, and one heading per message", () => {
    const messages: ChatMessage[] = [
      { id: "msg-1", role: "user", content: "Hi", createdAt: T },
      { id: "msg-2", role: "assistant", content: "Hello!", createdAt: T },
    ];
    expect(conversationToMarkdown(messages, base)).toBe(
      [
        "# Chat transcript",
        "",
        "Exported Sep 19, 2026, 8:02 PM (GMT+05:30)",
        "",
        "## User · Sep 19, 2026, 7:33 PM",
        "",
        "Hi",
        "",
        "## Assistant · Sep 19, 2026, 7:33 PM",
        "",
        "Hello!",
        "",
      ].join("\n"),
    );
  });

  it("formats dates in the given locale", () => {
    const md = conversationToMarkdown(
      [{ id: "1", role: "user", content: "Hallo", createdAt: T }],
      { ...base, locale: "de-DE" },
    );
    expect(md).toContain("## User · 19.09.2026, 19:33");
  });

  it("falls back to the default locale when the tag is invalid", () => {
    expect(() =>
      conversationToMarkdown(
        [{ id: "1", role: "user", content: "Hi", createdAt: T }],
        { ...base, locale: "not a locale!" },
      ),
    ).not.toThrow();
  });

  it("replaces the no-break spaces some engines put in dates", () => {
    const md = conversationToMarkdown(
      [{ id: "1", role: "user", content: "Hi", createdAt: T }],
      { ...base, formatDate: () => "2:03\u202fPM\u00a0IST" },
    );
    expect(md).toContain("## User · 2:03 PM IST");
    expect(md).not.toMatch(/[\u00a0\u202f]/);
  });

  it("omits the offset where longOffset is unsupported", () => {
    const Real = Intl.DateTimeFormat;
    // A regular function, not an arrow: it is called with `new`.
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      if (options?.timeZoneName) throw new RangeError("unsupported");
      return new Real(locale, options);
    } as unknown as typeof Intl.DateTimeFormat);

    const md = conversationToMarkdown([], base);
    spy.mockRestore();

    expect(md).toBe("# Chat transcript\n\nExported Sep 19, 2026, 8:02 PM\n");
  });

  it("shows the role alone when a message has no usable time", () => {
    const md = conversationToMarkdown(
      [
        { id: "1", role: "user", content: "old" },
        { id: "2", role: "assistant", content: "bad", createdAt: "nonsense" },
      ],
      base,
    );
    expect(md).toContain("## User\n\nold");
    expect(md).toContain("## Assistant\n\nbad");
  });

  it("applies the text protections to each message", () => {
    const md = conversationToMarkdown(
      [
        { id: "1", role: "assistant", content: "```js\nconst a = 1;" },
        { id: "2", role: "user", content: "Thanks.\nBye." },
      ],
      base,
    );
    expect(md).toContain("```js\nconst a = 1;\n```\n\n## User");
    expect(md).toContain("Thanks.  \nBye.");
  });

  it("lists attachments by name, type, and size, and never their bytes", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "user",
          content: "",
          attachments: [
            {
              id: "att-1",
              name: "_draft_*final*.png",
              mediaType: "image/png",
              size: 49152,
              data: "QUJDREVGRw==",
              url: "https://files.example.com/att/1?sig=secret",
            },
          ],
        },
      ],
      base,
    );
    expect(md).toContain(
      "## User\n\nAttachments:\n\n- `_draft_*final*.png` (image/png, 48 KB)",
    );
    expect(md).not.toContain("QUJDREVGRw==");
    expect(md).not.toContain("sig=secret");
  });

  it("sizes a code span to the backticks inside the name", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "user",
          content: "",
          attachments: [
            { id: "a", name: "we`ird``.pdf", mediaType: "application/pdf", size: 10 },
            { id: "b", name: "`edge`", mediaType: "application/pdf", size: 10 },
          ],
        },
      ],
      base,
    );
    expect(md).toContain("- ```we`ird``.pdf``` (application/pdf, 10 B)");
    expect(md).toContain("- `` `edge` `` (application/pdf, 10 B)");
  });

  it("names the tools a reply used, without their inputs or results", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "assistant",
          content: "It is noon.",
          toolUses: [
            { name: "get_current_time", input: { tz: "UTC" }, result: "12:00" },
            { name: "search_knowledge_base" },
          ],
        },
      ],
      base,
    );
    expect(md).toContain(
      "Used tool: `get_current_time`  \nUsed tool: `search_knowledge_base`",
    );
    expect(md).not.toContain("12:00");
  });

  it("writes citations as a numbered list of escaped links", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "assistant",
          content: "See these.",
          sources: [
            {
              title: "Parsing [JSON]\nguide \\ notes",
              url: "https://example.com/json_(format)?q=a b&x=<y>",
              type: "page",
            },
            { title: "MDN", url: "https://developer.mozilla.org/", type: "external" },
          ],
        },
      ],
      base,
    );
    expect(md).toContain(
      "Sources:\n\n" +
        "1. [Parsing \\[JSON\\] guide \\\\ notes](https://example.com/json_%28format%29?q=a%20b&x=%3Cy%3E)\n" +
        "2. [MDN](https://developer.mozilla.org/)",
    );
  });

  it("drops the link, not the citation, when a URL is not http(s)", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "assistant",
          content: "x",
          sources: [{ title: "Click me", url: "javascript:alert(1)", type: "external" }],
        },
      ],
      base,
    );
    expect(md).toContain("1. Click me");
    expect(md).not.toContain("javascript:");
  });

  it("exports an empty conversation as the header alone", () => {
    expect(conversationToMarkdown([], base)).toBe(
      "# Chat transcript\n\nExported Sep 19, 2026, 8:02 PM (GMT+05:30)\n",
    );
  });
});

describe("conversationToJson", () => {
  const messages: ChatMessage[] = [
    {
      id: "msg-1",
      role: "user",
      content: 'Quote " slash \\ emoji 👋 separator \u2028 end',
      createdAt: T,
      attachments: [
        { id: "att-1", name: "a.png", mediaType: "image/png", size: 3, data: "QUJD" },
      ],
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "Hello!",
      createdAt: T,
      sources: [{ title: "Docs", url: "https://example.com", type: "page" }],
    },
  ];

  it("is the message array itself, pretty-printed, ending in a newline", () => {
    const json = conversationToJson(messages);
    expect(json.endsWith("\n")).toBe(true);
    expect(json).toContain('\n  {\n    "id": "msg-1"');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].content).toBe(messages[0].content);
    expect(parsed[1]).toEqual(messages[1]);
  });

  it("never includes inline attachment bytes", () => {
    const json = conversationToJson(messages);
    expect(json).not.toContain("QUJD");
    expect(JSON.parse(json)[0].attachments[0]).toEqual({
      id: "att-1",
      name: "a.png",
      mediaType: "image/png",
      size: 3,
    });
  });

  it("does not modify the messages it was given", () => {
    conversationToJson(messages);
    expect(messages[0].attachments?.[0].data).toBe("QUJD");
  });
});

describe("exportFilename", () => {
  it("uses the visitor's local date, not the UTC date", () => {
    const now = new Date("2026-09-19T14:03:00.000Z");
    expect(exportFilename("md", { now, timeZone: "Pacific/Auckland" })).toBe(
      "chat-transcript-2026-09-20.md",
    );
    expect(exportFilename("json", { now, timeZone: "America/Los_Angeles" })).toBe(
      "chat-transcript-2026-09-19.json",
    );
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `./node_modules/.bin/vitest run src/utils/__tests__/exportConversation.test.ts`
Expected: FAIL. `conversationToMarkdown` is not exported. The 15 `protectMessageText` tests still pass.

- [ ] **Step 3: Implement**

At the top of `widget/src/utils/exportConversation.ts` add:

```ts
import type { ChatAttachment, ChatMessage, Source } from "../api/types";
import { formatBytes, stripAttachmentData } from "./attachments";
import { interpolate } from "./interpolate";
import { sanitizeUrl } from "./sanitize";

/**
 * The strings a transcript is written with. `attachments`, `sources`, and
 * `toolUsed` carry their own colon, because French puts a space before it.
 */
export interface TranscriptLabels {
  title: string;
  /** Takes `{date}`. */
  exported: string;
  user: string;
  assistant: string;
  attachments: string;
  sources: string;
  toolUsed: string;
}

export interface MarkdownExportOptions {
  labels: TranscriptLabels;
  /** BCP-47 tag for dates. An invalid tag falls back to the browser default. */
  locale?: string;
  /** IANA zone. Defaults to the visitor's. */
  timeZone?: string;
  /** The export time. Defaults to now. */
  now?: Date;
  /** Replaces the built-in date formatting. The result is still normalized. */
  formatDate?: (date: Date) => string;
}
```

At the bottom of the file add:

```ts
// Some engines separate the time from AM/PM with U+202F. It looks like a
// space but breaks string comparison and some plain-text tools.
const NO_BREAK_SPACES = /[\u00a0\u202f]/g;

function makeDateFormatter(
  options: MarkdownExportOptions,
): (date: Date) => string {
  const custom = options.formatDate;
  if (custom) return (date) => custom(date).replace(NO_BREAK_SPACES, " ");

  const build = (locale?: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: options.timeZone,
    });
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = build(options.locale);
  } catch {
    formatter = build(undefined);
  }
  return (date) => formatter.format(date).replace(NO_BREAK_SPACES, " ");
}

/**
 * "GMT+01:00" for the zone at that moment. A second formatter is needed
 * because `timeZoneName` cannot be combined with `dateStyle`/`timeStyle`. An
 * offset tells a reader in another zone what they need; an IANA name would
 * also disclose roughly where the visitor is.
 */
function utcOffset(date: Date, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * A code span whose delimiter is one backtick longer than the longest run
 * inside it, so nothing in the text needs escaping.
 */
function codeSpan(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean === "") return "";
  const longest = Math.max(
    0,
    ...(clean.match(/`+/g) ?? []).map((run) => run.length),
  );
  const ticks = "`".repeat(longest + 1);
  const pad = clean.startsWith("`") || clean.endsWith("`") ? " " : "";
  return `${ticks}${pad}${clean}${pad}${ticks}`;
}

const URL_ESCAPES: Record<string, string> = {
  "(": "%28",
  ")": "%29",
  "<": "%3C",
  ">": "%3E",
};

function sourceLine(source: Source, index: number): string {
  // The title must not close the link text or span lines.
  const title = (source.title || source.url)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\[\]]/g, "\\$&");
  const safe = sanitizeUrl(source.url);
  if (!safe) return `${index + 1}. ${title}`;
  // Nor may the URL end the link destination.
  const url = safe
    .replace(/[()<>]/g, (ch) => URL_ESCAPES[ch])
    .replace(/\s/g, "%20");
  return `${index + 1}. [${title}](${url})`;
}

function attachmentLine(attachment: ChatAttachment): string {
  return `- ${codeSpan(attachment.name)} (${attachment.mediaType}, ${formatBytes(attachment.size)})`;
}

/**
 * The conversation as a Markdown transcript: a title, the export time, then
 * one `##` heading per message with its text, attachments, tools, and
 * citations. Never throws on message content.
 */
export function conversationToMarkdown(
  messages: readonly ChatMessage[],
  options: MarkdownExportOptions,
): string {
  const { labels } = options;
  const formatDate = makeDateFormatter(options);
  const now = options.now ?? new Date();
  const offset = utcOffset(now, options.timeZone);
  const exportedAt = formatDate(now) + (offset ? ` (${offset})` : "");

  const blocks: string[] = [
    `# ${labels.title}`,
    interpolate(labels.exported, { date: exportedAt }),
  ];

  for (const message of messages) {
    const role = message.role === "user" ? labels.user : labels.assistant;
    const created = message.createdAt ? new Date(message.createdAt) : null;
    const time =
      created && !Number.isNaN(created.getTime())
        ? ` · ${formatDate(created)}`
        : "";
    blocks.push(`## ${role}${time}`);

    const text = protectMessageText(message.content ?? "");
    if (text) blocks.push(text);

    if (message.attachments?.length) {
      blocks.push(
        labels.attachments,
        message.attachments.map(attachmentLine).join("\n"),
      );
    }
    if (message.toolUses?.length) {
      blocks.push(
        message.toolUses
          .map((toolUse) => `${labels.toolUsed} ${codeSpan(toolUse.name)}`)
          .join("  \n"),
      );
    }
    if (message.sources?.length) {
      blocks.push(labels.sources, message.sources.map(sourceLine).join("\n"));
    }
  }

  return blocks.join("\n\n") + "\n";
}

/**
 * The conversation as JSON: the `ChatMessage[]` the widget persists, which
 * means without inline attachment bytes.
 */
export function conversationToJson(messages: readonly ChatMessage[]): string {
  return JSON.stringify(stripAttachmentData([...messages]), null, 2) + "\n";
}

/** `chat-transcript-YYYY-MM-DD.<extension>`, by the visitor's local date. */
export function exportFilename(
  extension: "md" | "json",
  options: { now?: Date; timeZone?: string } = {},
): string {
  const now = options.now ?? new Date();
  let stamp: string;
  try {
    // Assembled from parts so it does not depend on any locale's pattern.
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: options.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    stamp = `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    stamp = now.toISOString().slice(0, 10);
  }
  return `chat-transcript-${stamp}.${extension}`;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `./node_modules/.bin/vitest run src/utils/__tests__/exportConversation.test.ts`
Expected: 32 passed (15 from Task 2, 17 new).

Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add widget/src/utils/exportConversation.ts widget/src/utils/__tests__/exportConversation.test.ts
git commit -m "feat(widget): Markdown and JSON conversation serializers" -m "Markdown: one heading per message with role and localized time, attachments by name only, tool names, and citations as escaped links. JSON: the ChatMessage[] the widget persists, never with inline bytes. Dates are normalized because Node 20 and some browsers emit U+202F before AM/PM." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Clipboard and download helpers

**Files:**
- Create: `widget/src/utils/saveText.ts`
- Test: `widget/src/utils/__tests__/saveText.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  copyText(text: string): Promise<boolean>   // never rejects
  downloadTextFile(filename: string, text: string, mimeType: string): void
  ```

- [ ] **Step 1: Write the failing tests**

jsdom has no `navigator.clipboard`, no `document.execCommand`, and no `URL.createObjectURL`, so each test installs what it needs.

Create `widget/src/utils/__tests__/saveText.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { copyText, downloadTextFile } from "../saveText";

type Doc = Document & { execCommand?: (command: string) => boolean };

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

/** jsdom's Blob has no text(), so read it the long way. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

afterEach(() => {
  setClipboard(undefined);
  delete (document as Doc).execCommand;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("copyText", () => {
  it("uses the async clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("calls writeText before yielding, inside the caller's user activation", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    void copyText("hello");

    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("falls back to execCommand when the API refuses", async () => {
    setClipboard({
      writeText: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")),
    });
    let copied = "";
    (document as Doc).execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(copied).toBe("hello");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when there is no clipboard API, as on an insecure origin", async () => {
    (document as Doc).execCommand = vi.fn(() => true);

    await expect(copyText("hello")).resolves.toBe(true);
    expect((document as Doc).execCommand).toHaveBeenCalledWith("copy");
  });

  it("resolves false, never rejects, when both paths fail", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("no")) });
    (document as Doc).execCommand = vi.fn(() => {
      throw new Error("blocked");
    });

    await expect(copyText("hello")).resolves.toBe(false);
  });

  it("returns focus to where it was after the fallback", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    (document as Doc).execCommand = vi.fn(() => true);

    await copyText("hello");

    expect(document.activeElement).toBe(button);
  });
});

describe("downloadTextFile", () => {
  it("clicks a temporary download link to a Blob of the text", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:claudius-test";
    });
    URL.revokeObjectURL = vi.fn();
    // Mocked so jsdom does not try to navigate. `contexts` holds each call's
    // `this`, which is the link that was clicked.
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadTextFile("chat.md", "# Hi", "text/markdown;charset=utf-8");

    const clicked = click.mock.contexts[0] as HTMLAnchorElement;
    expect(clicked.download).toBe("chat.md");
    expect(clicked.href).toBe("blob:claudius-test");
    expect(blob?.type).toBe("text/markdown;charset=utf-8");
    await expect(readBlob(blob as Blob)).resolves.toBe("# Hi");
    expect(document.querySelector("a")).toBeNull();
  });

  it("revokes the object URL later, not before the download starts", () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:claudius-test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadTextFile("chat.json", "[]", "application/json");

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:claudius-test");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `./node_modules/.bin/vitest run src/utils/__tests__/saveText.test.ts`
Expected: FAIL, cannot resolve `../saveText`.

- [ ] **Step 3: Implement**

Create `widget/src/utils/saveText.ts`:

```ts
/** Copy through a hidden textarea, for where the async API is unavailable. */
function legacyCopy(text: string): boolean {
  const previous = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  // select() alone does not focus the field everywhere (iOS Safari), and the
  // copy command acts on the focused element's selection.
  area.focus({ preventScroll: true });
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  previous?.focus();
  return ok;
}

/**
 * Copy text to the clipboard. Resolves to whether it worked and never
 * rejects.
 *
 * Call it synchronously from a click handler: `writeText` runs before the
 * first `await`, while the transient activation Firefox and Safari require is
 * still present. The async API is missing on insecure origins and refuses in
 * an iframe without `clipboard-write`, so both cases fall back to
 * `execCommand`.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused. Try the legacy path.
  }
  return legacyCopy(text);
}

// Revoking straight away cancels the download in some browsers. FileSaver.js
// settled on 40 seconds, and a pending timer costs nothing.
const REVOKE_AFTER_MS = 40_000;

/** Save text as a file through a temporary `<a download>`. */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType: string,
): void {
  // No byte-order mark: it is invalid in JSON and breaks some Markdown tools.
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `./node_modules/.bin/vitest run src/utils/__tests__/saveText.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add widget/src/utils/saveText.ts widget/src/utils/__tests__/saveText.test.ts
git commit -m "feat(widget): clipboard and download helpers" -m "copyText calls the async clipboard API before yielding so the click's user activation still holds, and falls back to execCommand on insecure origins and in iframes without clipboard-write. It resolves to a boolean and never rejects." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Strings in four locales

**Files:**
- Modify: `widget/src/i18n.ts`, `widget/src/locales/en.ts`, `es.ts`, `fr.ts`, `de.ts`
- Test: the existing `widget/src/locales/__tests__/parity.test.ts` enforces this task.

**Interfaces:**
- Produces twelve keys on `ClaudiusTranslations`: `moreOptions`, `copyAsMarkdown`, `downloadAsMarkdown`, `downloadAsJson`, `copiedToClipboard`, `copyFailed`, `transcriptTitle`, `transcriptExported`, `transcriptUser`, `transcriptAssistant`, `transcriptAttachments`, `transcriptSources`. Task 7 reads them.

- [ ] **Step 1: Add the keys to the interface**

In `widget/src/i18n.ts`, inside `ClaudiusTranslations`, after `stopReading` and before `errorGeneric`:

```ts
  /** Accessible label for the header's overflow menu button. */
  moreOptions: string;
  /** Menu item that copies the conversation to the clipboard as Markdown. */
  copyAsMarkdown: string;
  /** Menu item that downloads the conversation as a Markdown file. */
  downloadAsMarkdown: string;
  /** Menu item that downloads the conversation as a JSON file. */
  downloadAsJson: string;
  /** Status shown after the conversation was copied. */
  copiedToClipboard: string;
  /** Status shown when the conversation could not be copied. */
  copyFailed: string;
  /** Title of an exported transcript. */
  transcriptTitle: string;
  /** Line under the transcript title; supports `{date}`. */
  transcriptExported: string;
  /** Transcript heading for a visitor message. */
  transcriptUser: string;
  /** Transcript heading for an assistant message. */
  transcriptAssistant: string;
  /** Transcript label above a message's attachment list, including its colon. */
  transcriptAttachments: string;
  /** Transcript label above a message's citation list, including its colon. */
  transcriptSources: string;
```

- [ ] **Step 2: Run the parity test and confirm it fails on typing**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: FAIL. `en`, `es`, `fr`, and `de` are each missing twelve properties.

- [ ] **Step 3: Add the strings**

Each block goes after the `stopReading` line and before `// Errors`. Spanish is informal (tú), French and German formal, matching the existing files. French puts a space before the colon, as its `toolUsed` already does.

`widget/src/locales/en.ts`:

```ts
  // Conversation export
  moreOptions: "More options",
  copyAsMarkdown: "Copy as Markdown",
  downloadAsMarkdown: "Download as Markdown",
  downloadAsJson: "Download as JSON",
  copiedToClipboard: "Copied to clipboard",
  copyFailed: "Could not copy. Try downloading instead.",
  transcriptTitle: "Chat transcript",
  transcriptExported: "Exported {date}",
  transcriptUser: "User",
  transcriptAssistant: "Assistant",
  transcriptAttachments: "Attachments:",
  transcriptSources: "Sources:",
```

`widget/src/locales/es.ts`:

```ts
  // Conversation export
  moreOptions: "Más opciones",
  copyAsMarkdown: "Copiar como Markdown",
  downloadAsMarkdown: "Descargar como Markdown",
  downloadAsJson: "Descargar como JSON",
  copiedToClipboard: "Copiado al portapapeles",
  copyFailed: "No se pudo copiar. Prueba a descargarlo.",
  transcriptTitle: "Transcripción del chat",
  transcriptExported: "Exportado el {date}",
  transcriptUser: "Usuario",
  transcriptAssistant: "Asistente",
  transcriptAttachments: "Adjuntos:",
  transcriptSources: "Fuentes:",
```

`widget/src/locales/fr.ts`:

```ts
  // Conversation export
  moreOptions: "Plus d'options",
  copyAsMarkdown: "Copier en Markdown",
  downloadAsMarkdown: "Télécharger en Markdown",
  downloadAsJson: "Télécharger en JSON",
  copiedToClipboard: "Copié dans le presse-papiers",
  copyFailed: "Impossible de copier. Essayez plutôt de télécharger.",
  transcriptTitle: "Transcription du chat",
  transcriptExported: "Exporté le {date}",
  transcriptUser: "Utilisateur",
  transcriptAssistant: "Assistant",
  transcriptAttachments: "Pièces jointes :",
  transcriptSources: "Sources :",
```

`widget/src/locales/de.ts`:

```ts
  // Conversation export
  moreOptions: "Weitere Optionen",
  copyAsMarkdown: "Als Markdown kopieren",
  downloadAsMarkdown: "Als Markdown herunterladen",
  downloadAsJson: "Als JSON herunterladen",
  copiedToClipboard: "In die Zwischenablage kopiert",
  copyFailed:
    "Kopieren nicht möglich. Laden Sie die Unterhaltung stattdessen herunter.",
  transcriptTitle: "Chat-Protokoll",
  transcriptExported: "Exportiert am {date}",
  transcriptUser: "Nutzer",
  transcriptAssistant: "Assistent",
  transcriptAttachments: "Anhänge:",
  transcriptSources: "Quellen:",
```

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run src/locales && ./node_modules/.bin/typedoc --emit none`
Expected: all exit 0. The parity test reports every locale has exactly the English key set and no empty values.

- [ ] **Step 5: Commit**

```bash
git add widget/src/i18n.ts widget/src/locales/en.ts widget/src/locales/es.ts widget/src/locales/fr.ts widget/src/locales/de.ts
git commit -m "feat(widget): conversation export strings in en, es, fr, de" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `HeaderMenu` and the header's `actions` slot

**Files:**
- Create: `widget/src/components/HeaderMenu.tsx`
- Modify: `widget/src/components/ChatHeader.tsx`, `widget/src/components/ChatHeader.stories.tsx`
- Test: `widget/src/components/__tests__/HeaderMenu.test.tsx` (create)

**Interfaces:**
- Produces:
  ```ts
  interface HeaderMenuItem { id: string; label: string; disabled?: boolean; onSelect: () => void }
  <HeaderMenu label: string  items: HeaderMenuItem[]  onOpen?: () => void />
  <ChatHeader ... actions?: ReactNode />   // rendered before the close button
  ```

- [ ] **Step 1: Write the failing tests**

Create `widget/src/components/__tests__/HeaderMenu.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { HeaderMenu, type HeaderMenuItem } from "../HeaderMenu";

function setup(overrides: Partial<HeaderMenuItem>[] = []) {
  const items: HeaderMenuItem[] = ["Copy", "Download", "Archive"].map(
    (label, i) => ({
      id: label.toLowerCase(),
      label,
      onSelect: vi.fn(),
      ...overrides[i],
    }),
  );
  const onOpen = vi.fn();
  // The sibling stands in for the header's close button, so Tab has
  // somewhere to go.
  render(
    <>
      <HeaderMenu label="More options" items={items} onOpen={onOpen} />
      <button type="button">Close chat</button>
    </>,
  );
  return {
    items,
    onOpen,
    user: userEvent.setup(),
    trigger: screen.getByRole("button", { name: "More options" }),
  };
}

describe("HeaderMenu", () => {
  it("is a closed menu button until it is used", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on click, labelled by its trigger, with focus on the first item", async () => {
    const { user, trigger, onOpen } = setup();
    await user.click(trigger);

    const menu = screen.getByRole("menu", { name: "More options" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens from the keyboard: Enter and ArrowDown on the first item, ArrowUp on the last", async () => {
    const { user, trigger } = setup();
    trigger.focus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await user.keyboard("{Escape}");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await user.keyboard("{Escape}");

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
  });

  it("moves with the arrows, wrapping, and jumps with Home and End", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Download" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
  });

  it("keeps its items out of the tab order", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("tabindex", "-1");
    }
  });

  it("runs the chosen item, closes, and returns focus to the trigger", async () => {
    const { user, trigger, items } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Download" }));

    expect(items[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("activates the focused item with Enter", async () => {
    const { user, trigger, items } = setup();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(items[1].onSelect).toHaveBeenCalledTimes(1);
  });

  it("keeps a disabled item focusable but inert, and stays open", async () => {
    const { user, trigger, items } = setup([{ disabled: true }]);
    await user.click(trigger);
    const copy = screen.getByRole("menuitem", { name: "Copy" });

    expect(copy).toHaveAttribute("aria-disabled", "true");
    expect(copy).not.toBeDisabled();
    expect(copy).toHaveFocus();
    await user.click(copy);

    expect(items[0].onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape, returns focus, and keeps the key from the page", async () => {
    const onDocumentKeyDown = vi.fn();
    document.addEventListener("keydown", onDocumentKeyDown);
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onDocumentKeyDown).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocumentKeyDown);
  });

  it("lets Escape through when it is closed", async () => {
    const onDocumentKeyDown = vi.fn();
    document.addEventListener("keydown", onDocumentKeyDown);
    const { user, trigger } = setup();
    trigger.focus();

    await user.keyboard("{Escape}");

    expect(onDocumentKeyDown).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", onDocumentKeyDown);
  });

  it("closes on Tab once focus has moved on to the next control", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Close chat" })).toHaveFocus();
  });

  it("closes on Shift+Tab with focus back on the trigger", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on a press outside, and on a second click of the trigger", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `./node_modules/.bin/vitest run src/components/__tests__/HeaderMenu.test.tsx`
Expected: FAIL, cannot resolve `../HeaderMenu`.

- [ ] **Step 3: Implement the menu**

Create `widget/src/components/HeaderMenu.tsx`:

```tsx
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

export interface HeaderMenuItem {
  id: string;
  label: string;
  /** Shown greyed out and focusable, but does nothing when chosen. */
  disabled?: boolean;
  onSelect: () => void;
}

interface HeaderMenuProps {
  /** Accessible name of the trigger, and so of the menu. */
  label: string;
  items: HeaderMenuItem[];
  /** Called each time the menu opens. */
  onOpen?: () => void;
}

/**
 * The header's overflow menu, following the WAI-ARIA menu button pattern. It
 * is generic: it knows nothing about what its items do.
 *
 * It renders inline, not through a portal, so it stays inside the dialog's
 * focus trap and inherits the theme tokens and dark mode from
 * `.claudius-root`.
 */
export function HeaderMenu({ label, items, onOpen }: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The item to focus once the popup has rendered.
  const pendingFocus = useRef<number | null>(null);

  const openMenu = (focusIndex: number) => {
    pendingFocus.current = focusIndex;
    setOpen(true);
    onOpen?.();
  };

  const closeMenu = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    if (pendingFocus.current !== null) {
      itemRefs.current[pendingFocus.current]?.focus();
      pendingFocus.current = null;
    }
    // onBlur alone would miss this in Safari, which does not focus a button
    // when it is clicked.
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const focusItem = (index: number) => {
    const count = items.length;
    itemRefs.current[(index + count) % count]?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Enter and Space arrive as a click, which keeps them working the same
    // in every browser.
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(items.length - 1);
    }
  };

  // On the menu, not the wrapper: focus is always inside the menu while it is
  // open, so this is where the keys arrive, and a plain wrapper div with
  // handlers would need a role it does not have.
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        // -1 when the menu itself has focus, after a click on its padding.
        focusItem(current === -1 ? items.length - 1 : current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case "Escape":
        // Close the menu only. Without this the chat's document-level
        // Escape handler would close the whole window.
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        break;
      case "Tab":
        // Shift+Tab lands on the trigger anyway; going there ourselves
        // closes the menu in the same step. A forward Tab is left to the
        // browser, and onBlur closes the menu once focus has moved on.
        // Closing here instead would unmount the focused item mid-keystroke.
        if (event.shiftKey) {
          event.preventDefault();
          closeMenu(true);
        }
        break;
    }
  };

  const onMenuBlur = (event: FocusEvent<HTMLDivElement>) => {
    // Focus left the menu entirely: a Tab, or a click on another control.
    // Moving to the trigger does not count, or a click on it would close the
    // menu here and then reopen it in onClick.
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? closeMenu(true) : openMenu(0))}
        onKeyDown={onTriggerKeyDown}
        className="flex h-10 w-10 items-center justify-center rounded-claudius-full text-claudius-accent-text-muted transition-colors hover:bg-claudius-accent-soft hover:text-claudius-accent-text"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          // Focusable by script only, as an element with handlers must be.
          // The focus trap skips tabindex -1.
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          onBlur={onMenuBlur}
          className="absolute right-0 top-full z-20 mt-1 min-w-[12rem] rounded-claudius-md border border-claudius-border bg-claudius-surface py-1 shadow-claudius-elevated"
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              // Not `disabled`: a focused control must never drop out from
              // under the dialog's focus trap.
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                closeMenu(true);
                item.onSelect();
              }}
              className="flex min-h-[40px] w-full items-center whitespace-nowrap px-4 text-left text-sm text-claudius-text hover:bg-claudius-surface-muted focus:bg-claudius-surface-muted aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `./node_modules/.bin/vitest run src/components/__tests__/HeaderMenu.test.tsx`
Expected: 13 passed.

- [ ] **Step 5: Give `ChatHeader` an `actions` slot**

In `widget/src/components/ChatHeader.tsx`, add the import, the prop, and the slot:

```tsx
import type { ReactNode } from "react";

interface ChatHeaderProps {
  title: string;
  subtitle: string;
  /** id linked from the dialog's aria-labelledby; applied to the heading. */
  titleId?: string;
  closeLabel: string;
  onClose: () => void;
  /** Extra header controls, rendered before the close button. */
  actions?: ReactNode;
}
```

Update the doc comment's first sentence to read "avatar initial, title and subtitle, optional actions, and the close button". Add `actions,` to the destructured props, and render `{actions}` on its own line directly before the close `<button`.

- [ ] **Step 6: Add a story**

In `widget/src/components/ChatHeader.stories.tsx`, add `import { HeaderMenu } from "./HeaderMenu";` and append:

```tsx
// The overflow menu sits before the close button and opens over the messages.
export const WithMenu: Story = {
  args: {
    actions: (
      <HeaderMenu
        label="More options"
        items={[
          { id: "copy", label: "Copy as Markdown", onSelect: fn() },
          { id: "md", label: "Download as Markdown", onSelect: fn() },
          { id: "json", label: "Download as JSON", disabled: true, onSelect: fn() },
        ]}
      />
    ),
  },
};
```

- [ ] **Step 7: Verify and commit**

Run: `./node_modules/.bin/vitest run src/components && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint src/components/HeaderMenu.tsx src/components/ChatHeader.tsx src/components/ChatHeader.stories.tsx`
Expected: all pass, exit 0.

```bash
git add widget/src/components/HeaderMenu.tsx widget/src/components/__tests__/HeaderMenu.test.tsx widget/src/components/ChatHeader.tsx widget/src/components/ChatHeader.stories.tsx
git commit -m "feat(widget): accessible header menu" -m "A generic WAI-ARIA menu button for the chat header, rendered inline so it stays inside the focus trap and the theme scope. Escape closes only the menu. Disabled items use aria-disabled so a focused control never vanishes from under the trap." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `useConversationExport`

**Files:**
- Create: `widget/src/hooks/useConversationExport.ts`
- Test: `widget/src/hooks/__tests__/useConversationExport.test.ts` (create)

**Interfaces:**
- Consumes: `conversationToMarkdown`, `conversationToJson`, `exportFilename` (Task 3); `copyText`, `downloadTextFile` (Task 4); the twelve strings (Task 5); `HeaderMenuItem` (Task 6).
- Produces:
  ```ts
  useConversationExport(options: {
    enabled: boolean; messages: readonly ChatMessage[]; busy: boolean;
    locale: string; translations?: ClaudiusTranslations;
  }): { items: HeaderMenuItem[]; status: string | null; clearStatus: () => void }
  ```
  `items` is `[]` when `enabled` is false. Item ids are `copy-markdown`, `download-markdown`, `download-json`.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/hooks/__tests__/useConversationExport.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useConversationExport } from "../useConversationExport";
import { copyText, downloadTextFile } from "../../utils/saveText";
import { locales } from "../../locales";
import type { ChatMessage } from "../../api/types";

vi.mock("../../utils/saveText", () => ({
  copyText: vi.fn(),
  downloadTextFile: vi.fn(),
}));

const messages: ChatMessage[] = [
  { id: "msg-1", role: "user", content: "Hi", createdAt: "2026-09-19T14:03:00.000Z" },
  { id: "msg-2", role: "assistant", content: "Hello!" },
];

const base = { enabled: true, messages, busy: false, locale: "en-US" };

function item(result: { current: ReturnType<typeof useConversationExport> }, id: string) {
  const found = result.current.items.find((i) => i.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
}

describe("useConversationExport", () => {
  beforeEach(() => {
    vi.mocked(copyText).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("offers nothing when the feature is off", () => {
    const { result } = renderHook(() =>
      useConversationExport({ ...base, enabled: false }),
    );
    expect(result.current.items).toEqual([]);
  });

  it("offers copy, Markdown, and JSON, in that order", () => {
    const { result } = renderHook(() => useConversationExport(base));
    expect(result.current.items.map((i) => [i.id, i.label, i.disabled])).toEqual([
      ["copy-markdown", "Copy as Markdown", false],
      ["download-markdown", "Download as Markdown", false],
      ["download-json", "Download as JSON", false],
    ]);
  });

  it("disables every item while the conversation is empty or a reply is in flight", () => {
    const empty = renderHook(() => useConversationExport({ ...base, messages: [] }));
    expect(empty.result.current.items.every((i) => i.disabled)).toBe(true);

    const busy = renderHook(() => useConversationExport({ ...base, busy: true }));
    expect(busy.result.current.items.every((i) => i.disabled)).toBe(true);
  });

  it("copies the Markdown transcript and reports success", async () => {
    const { result } = renderHook(() => useConversationExport(base));

    await act(async () => item(result, "copy-markdown").onSelect());

    const text = vi.mocked(copyText).mock.calls[0][0];
    expect(text).toContain("# Chat transcript");
    expect(text).toContain("## User · ");
    expect(text).toContain("## Assistant\n\nHello!");
    expect(result.current.status).toBe("Copied to clipboard");
  });

  it("hands the text to copyText before yielding, to keep the user activation", () => {
    const { result } = renderHook(() => useConversationExport(base));

    act(() => item(result, "copy-markdown").onSelect());

    expect(copyText).toHaveBeenCalledTimes(1);
  });

  it("reports a failed copy", async () => {
    vi.mocked(copyText).mockResolvedValue(false);
    const { result } = renderHook(() => useConversationExport(base));

    await act(async () => item(result, "copy-markdown").onSelect());

    expect(result.current.status).toBe("Could not copy. Try downloading instead.");
  });

  it("clears the status after four seconds, or on request", async () => {
    // Only the timer the hook uses, so React's act() scheduling is untouched.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result } = renderHook(() => useConversationExport(base));

    await act(async () => item(result, "copy-markdown").onSelect());
    expect(result.current.status).not.toBeNull();
    act(() => vi.advanceTimersByTime(3999));
    expect(result.current.status).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.status).toBeNull();

    await act(async () => item(result, "copy-markdown").onSelect());
    act(() => result.current.clearStatus());
    expect(result.current.status).toBeNull();
  });

  it("downloads Markdown and JSON with a dated filename and the right type", () => {
    const { result } = renderHook(() => useConversationExport(base));

    act(() => item(result, "download-markdown").onSelect());
    act(() => item(result, "download-json").onSelect());

    const [md, json] = vi.mocked(downloadTextFile).mock.calls;
    expect(md[0]).toMatch(/^chat-transcript-\d{4}-\d{2}-\d{2}\.md$/);
    expect(md[1]).toContain("# Chat transcript");
    expect(md[2]).toBe("text/markdown;charset=utf-8");
    expect(json[0]).toMatch(/^chat-transcript-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(json[1])).toEqual(messages);
    expect(json[2]).toBe("application/json");
    expect(result.current.status).toBeNull();
  });

  it("writes the menu and the transcript in the widget's language", async () => {
    const { result } = renderHook(() =>
      useConversationExport({ ...base, locale: "de-DE", translations: locales.de }),
    );
    expect(result.current.items[0].label).toBe("Als Markdown kopieren");

    await act(async () => item(result, "copy-markdown").onSelect());

    const text = vi.mocked(copyText).mock.calls[0][0];
    expect(text).toContain("# Chat-Protokoll");
    expect(text).toContain("## Nutzer · ");
    expect(result.current.status).toBe("In die Zwischenablage kopiert");
  });

  it("does not set state after unmount", async () => {
    let resolve!: (ok: boolean) => void;
    vi.mocked(copyText).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useConversationExport(base));

    act(() => item(result, "copy-markdown").onSelect());
    unmount();
    await act(async () => resolve(true));

    expect(result.current.status).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `./node_modules/.bin/vitest run src/hooks/__tests__/useConversationExport.test.ts`
Expected: FAIL, cannot resolve `../useConversationExport`.

- [ ] **Step 3: Implement**

Create `widget/src/hooks/useConversationExport.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../api/types";
import type { HeaderMenuItem } from "../components/HeaderMenu";
import { defaultTranslations, type ClaudiusTranslations } from "../i18n";
import {
  conversationToJson,
  conversationToMarkdown,
  exportFilename,
} from "../utils/exportConversation";
import { copyText, downloadTextFile } from "../utils/saveText";

const STATUS_MS = 4000;

interface UseConversationExportOptions {
  enabled: boolean;
  messages: readonly ChatMessage[];
  /** True while a reply is in flight. Export waits for it. */
  busy: boolean;
  /** BCP-47 tag used for the dates in a transcript. */
  locale: string;
  translations?: ClaudiusTranslations;
}

interface UseConversationExportReturn {
  /** The header menu's items. Empty when the feature is off. */
  items: HeaderMenuItem[];
  /** The result of the last copy, shown briefly, or `null`. */
  status: string | null;
  clearStatus: () => void;
}

/**
 * The three export actions as header-menu items, plus the transient status a
 * copy reports. Everything happens in the browser.
 */
export function useConversationExport({
  enabled,
  messages,
  busy,
  locale,
  translations,
}: UseConversationExportOptions): UseConversationExportReturn {
  const t = translations ?? defaultTranslations;
  const [status, setStatus] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const clearStatus = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus(null);
  }, []);

  const showStatus = useCallback((text: string) => {
    // The copy can settle after the window has closed.
    if (!mounted.current) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus(text);
    timer.current = setTimeout(() => {
      timer.current = null;
      setStatus(null);
    }, STATUS_MS);
  }, []);

  const items = useMemo<HeaderMenuItem[]>(() => {
    if (!enabled) return [];

    // A transcript whose last message is cut short is worse than a control
    // that is unavailable for a few seconds.
    const disabled = busy || messages.length === 0;
    const markdown = () =>
      conversationToMarkdown(messages, {
        locale,
        labels: {
          title: t.transcriptTitle,
          exported: t.transcriptExported,
          user: t.transcriptUser,
          assistant: t.transcriptAssistant,
          attachments: t.transcriptAttachments,
          sources: t.transcriptSources,
          toolUsed: t.toolUsed,
        },
      });

    return [
      {
        id: "copy-markdown",
        label: t.copyAsMarkdown,
        disabled,
        onSelect: () => {
          // Built and handed over synchronously: Firefox and Safari only
          // allow a clipboard write during the click's user activation.
          void copyText(markdown()).then((ok) =>
            showStatus(ok ? t.copiedToClipboard : t.copyFailed),
          );
        },
      },
      {
        id: "download-markdown",
        label: t.downloadAsMarkdown,
        disabled,
        onSelect: () =>
          downloadTextFile(
            exportFilename("md"),
            markdown(),
            "text/markdown;charset=utf-8",
          ),
      },
      {
        id: "download-json",
        label: t.downloadAsJson,
        disabled,
        onSelect: () =>
          downloadTextFile(
            exportFilename("json"),
            conversationToJson(messages),
            "application/json",
          ),
      },
    ];
  }, [enabled, busy, messages, locale, t, showStatus]);

  return { items, status, clearStatus };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `./node_modules/.bin/vitest run src/hooks/__tests__/useConversationExport.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add widget/src/hooks/useConversationExport.ts widget/src/hooks/__tests__/useConversationExport.test.ts
git commit -m "feat(widget): useConversationExport hook" -m "Turns the conversation into the three header-menu actions and a transient copy status. Items are disabled while the conversation is empty or a reply is in flight." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The `conversationExport` option, wired into the window

**Files:**
- Modify: `widget/src/components/ChatWindow.tsx`, `widget/src/components/ChatWidget.tsx`
- Test: `widget/src/components/__tests__/ChatWindow.export.test.tsx`, `widget/src/components/__tests__/ChatWidget.export.test.tsx` (create both)

**Interfaces:**
- Consumes: `useConversationExport` (Task 7), `HeaderMenu` and `ChatHeader`'s `actions` (Task 6), `resolveSpeechLang` and `detectLocale` (existing).
- Produces: `ChatWindow` props `conversationExport?: boolean` (default `false`) and `locale?: string` (default `"en-US"`); `ChatWidgetProps.conversationExport?: boolean` (default `false`). Task 9 passes the latter.

- [ ] **Step 1: Write the failing `ChatWindow` tests**

`userEvent.setup()` installs a working `navigator.clipboard` stub, so the success path runs the real `copyText`.

Create `widget/src/components/__tests__/ChatWindow.export.test.tsx`:

```tsx
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWindow } from "../ChatWindow";
import type { ChatMessage } from "../../api/types";

const messages: ChatMessage[] = [
  { id: "msg-1", role: "user", content: "What are your prices?" },
  { id: "msg-2", role: "assistant", content: "Plans start at $10." },
];

function renderWindow(props: Partial<React.ComponentProps<typeof ChatWindow>> = {}) {
  const onClose = vi.fn();
  render(
    <ChatWindow
      messages={messages}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={onClose}
      conversationExport
      {...props}
    />,
  );
  return { onClose, user: userEvent.setup() };
}

describe("ChatWindow conversation export", () => {
  it("renders no menu and no extra status region by default", () => {
    renderWindow({ conversationExport: false });
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("puts the menu in the header, before the close button", () => {
    renderWindow();
    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    const names = buttons.map((b) => b.getAttribute("aria-label"));
    expect(names.indexOf("More options")).toBe(names.indexOf("Close chat") - 1);
  });

  it("offers the three actions", async () => {
    const { user } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Copy as Markdown",
      "Download as Markdown",
      "Download as JSON",
    ]);
  });

  it("disables the actions while empty and while a reply is in flight", async () => {
    const { user } = renderWindow({ messages: [] });
    await user.click(screen.getByRole("button", { name: "More options" }));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("disables the actions while loading", async () => {
    const { user } = renderWindow({ isLoading: true });
    await user.click(screen.getByRole("button", { name: "More options" }));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("copies the transcript and announces it", async () => {
    const { user } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy as Markdown" }));

    expect(await screen.findByText("Copied to clipboard")).toBeInTheDocument();
    expect(screen.getByText("Copied to clipboard").closest('[role="status"]')).not.toBeNull();
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("## User\n\nWhat are your prices?");
    expect(copied).toContain("## Assistant\n\nPlans start at $10.");
  });

  it("clears the last status when the menu is opened again", async () => {
    const { user } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy as Markdown" }));
    await screen.findByText("Copied to clipboard");

    await user.click(screen.getByRole("button", { name: "More options" }));

    expect(screen.queryByText("Copied to clipboard")).toBeNull();
  });

  it("closes only the menu on the first Escape, and the chat on the second", async () => {
    const { user, onClose } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores an Escape that something else already handled", () => {
    const { onClose } = renderWindow();
    // A listener on body runs before the chat's listener on document.
    const handle = (event: Event) => event.preventDefault();
    document.body.addEventListener("keydown", handle);

    fireEvent.keyDown(document.body, { key: "Escape" });

    document.body.removeEventListener("keydown", handle);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the translated labels", async () => {
    const { locales } = await import("../../locales");
    const { user } = renderWindow({ translations: locales.fr });
    await user.click(screen.getByRole("button", { name: "Plus d'options" }));
    expect(
      screen.getByRole("menuitem", { name: "Copier en Markdown" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `./node_modules/.bin/vitest run src/components/__tests__/ChatWindow.export.test.tsx`
Expected: FAIL. `conversationExport` is not a prop of `ChatWindow`; no "More options" button is found.

- [ ] **Step 3: Wire `ChatWindow`**

In `widget/src/components/ChatWindow.tsx`:

Add imports:

```tsx
import { HeaderMenu } from "./HeaderMenu";
import { useConversationExport } from "../hooks/useConversationExport";
```

Add to `ChatWindowProps`, after `voice`:

```tsx
  /** Show the header menu that copies or downloads the conversation. */
  conversationExport?: boolean;
  /** BCP-47 tag for the dates in an exported transcript. */
  locale?: string;
```

Add to the destructured props, after `voice = null,`:

```tsx
  conversationExport = false,
  locale = "en-US",
```

After the `speechLabels` constant add:

```tsx
  const exporter = useConversationExport({
    enabled: conversationExport,
    messages,
    busy: isLoading,
    locale,
    translations,
  });
```

In the Escape effect, change the condition so an Escape the open menu already handled does not also close the chat:

```tsx
      if (e.key === "Escape" && !e.isComposing && !e.defaultPrevented) {
```

Pass the menu to the header:

```tsx
      <ChatHeader
        title={title}
        subtitle={subtitle}
        titleId={titleId}
        closeLabel={closeLabel}
        onClose={onClose}
        actions={
          conversationExport ? (
            <HeaderMenu
              label={translations?.moreOptions ?? "More options"}
              items={exporter.items}
              onOpen={exporter.clearStatus}
            />
          ) : undefined
        }
      />
```

Inside `<div className="relative flex-1 overflow-hidden">`, directly after the `{activeSources && ( ... )}` block, add:

```tsx
        {/* Mounted whenever export is on, so the text is announced when it
            changes. Absent otherwise: the typing indicator is a status too. */}
        {conversationExport && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-4"
          >
            {exporter.status && (
              <span className="rounded-claudius-full bg-claudius-text px-3 py-1 text-xs text-claudius-surface shadow-claudius-elevated">
                {exporter.status}
              </span>
            )}
          </div>
        )}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `./node_modules/.bin/vitest run src/components/__tests__/ChatWindow.export.test.tsx src/components/__tests__/ChatWindow.test.tsx`
Expected: 10 new tests pass, and every existing `ChatWindow` test still passes, including "shows typing indicator when loading".

- [ ] **Step 5: Write the failing `ChatWidget` tests**

Create `widget/src/components/__tests__/ChatWidget.export.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWidget } from "../ChatWidget";

globalThis.fetch = vi.fn();

// The toggle is the only button before the chat opens.
async function openChat() {
  await userEvent.setup().click(screen.getByRole("button"));
}

describe("ChatWidget conversationExport option", () => {
  it("is off by default", async () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="en" />);
    await openChat();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });

  it("shows the header menu when enabled", async () => {
    render(
      <ChatWidget apiUrl="https://test.workers.dev" locale="en" conversationExport />,
    );
    await openChat();
    expect(screen.getByRole("button", { name: "More options" })).toBeInTheDocument();
  });

  it.each([["true"], ["false"], [1], [{}]])(
    "fails closed for %j, which is not the literal true",
    async (value) => {
      render(
        <ChatWidget
          apiUrl="https://test.workers.dev"
          locale="en"
          conversationExport={value as unknown as boolean}
        />,
      );
      await openChat();
      expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
    },
  );

  it("labels the menu in the widget's language", async () => {
    render(
      <ChatWidget apiUrl="https://test.workers.dev" locale="de" conversationExport />,
    );
    await openChat();
    expect(
      screen.getByRole("button", { name: "Weitere Optionen" }),
    ).toBeInTheDocument();
  });
});
```

Run: `./node_modules/.bin/vitest run src/components/__tests__/ChatWidget.export.test.tsx`
Expected: FAIL. `conversationExport` is not a prop of `ChatWidget`.

- [ ] **Step 6: Wire `ChatWidget`**

In `widget/src/components/ChatWidget.tsx`:

Change the voice import to also bring in `resolveSpeechLang`:

```tsx
import {
  resolveSpeechLang,
  resolveVoiceConfig,
  type VoiceOptions,
} from "../utils/voice";
```

Add to `ChatWidgetProps`, after `voice`:

```tsx
  /**
   * Let visitors copy the conversation as Markdown, or download it as
   * Markdown or JSON, from a menu in the chat header. Everything happens in
   * the browser and nothing is sent to the Worker. Only the literal `true`
   * enables it. See the Conversation export guide.
   * @defaultValue `false`
   */
  conversationExport?: boolean;
```

Add `conversationExport = false,` to the destructured props after `voice = false,`.

Replace the `voiceConfig` memo with a shared locale, so speech and transcript dates agree:

```tsx
  // Speech and transcript dates follow the widget's language, detected the
  // same way as the translations when no locale is given.
  const activeLocale = useMemo(() => locale ?? detectLocale(), [locale]);
  const voiceConfig = useMemo(
    () => resolveVoiceConfig(voice, activeLocale),
    [voice, activeLocale],
  );
  // The regional variant the visitor uses (en-GB, fr-CA), for dates.
  const dateLocale = useMemo(
    () => resolveSpeechLang(activeLocale),
    [activeLocale],
  );
```

Pass both to `<ChatWindow>`, after `voice={voiceConfig}`:

```tsx
            // Fail closed: a templated "false" string is truthy.
            conversationExport={conversationExport === true}
            locale={dateLocale}
```

- [ ] **Step 7: Run everything**

Run: `./node_modules/.bin/vitest run`
Expected: every file passes, including all `ChatWidget.voice` tests, which depend on the locale memo just refactored.

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/typedoc --emit none`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add widget/src/components/ChatWindow.tsx widget/src/components/ChatWidget.tsx widget/src/components/__tests__/ChatWindow.export.test.tsx widget/src/components/__tests__/ChatWidget.export.test.tsx
git commit -m "feat(widget): conversationExport option and header menu wiring" -m "Opt-in and fails closed: only the literal true renders the menu, and nothing at all renders when it is off. The chat's Escape listener now skips events that are already defaultPrevented, so Escape closes an open menu without closing the window." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `ClaudiusConfig`, `<claudius-chat>`, and the dev app

**Files:**
- Modify: `widget/src/embed.tsx`, `widget/src/main.tsx`
- Test: `widget/src/__tests__/embed.test.tsx`

**Interfaces:**
- Consumes: `ChatWidgetProps.conversationExport` (Task 8).
- Produces: `ClaudiusConfig.conversationExport?: boolean`; attribute `conversation-export` (present, or any value but `"false"`, enables). The dev app enables it, which Task 11 relies on.

- [ ] **Step 1: Write the failing tests**

Append to `widget/src/__tests__/embed.test.tsx`:

```tsx
describe("embed conversationExport option", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
    window.ClaudiusConfig = undefined;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.ClaudiusConfig = undefined;
  });

  async function openChat() {
    (await screen.findByRole("button", { name: /open chat/i })).click();
    await screen.findByRole("dialog");
  }

  function mountElement(attributes: Record<string, string>) {
    const el = document.createElement("claudius-chat");
    el.setAttribute("api-url", "https://test.example/api");
    for (const [name, value] of Object.entries(attributes)) {
      el.setAttribute(name, value);
    }
    document.body.appendChild(el);
  }

  it("enables the header menu from ClaudiusConfig", async () => {
    window.ClaudiusConfig = {
      apiUrl: "https://test.example/api",
      conversationExport: true,
    };
    await import("../embed");
    await openChat();
    expect(screen.getByRole("button", { name: "More options" })).toBeInTheDocument();
  });

  it("stays off for a templated string in ClaudiusConfig", async () => {
    window.ClaudiusConfig = {
      apiUrl: "https://test.example/api",
      conversationExport: "false" as unknown as boolean,
    };
    await import("../embed");
    await openChat();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });

  it("enables it via the web component attribute", async () => {
    await import("../embed");
    mountElement({ "conversation-export": "" });
    await openChat();
    expect(screen.getByRole("button", { name: "More options" })).toBeInTheDocument();
  });

  it('stays off for conversation-export="false", and when absent', async () => {
    await import("../embed");
    mountElement({ "conversation-export": "false" });
    await openChat();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `./node_modules/.bin/vitest run src/__tests__/embed.test.tsx`
Expected: FAIL. TypeScript rejects `conversationExport` on `ClaudiusConfig`; the two "enables" tests find no button.

- [ ] **Step 3: Implement**

In `widget/src/embed.tsx`:

- Add `conversationExport?: boolean;` to `interface ClaudiusConfig`, after `voice`.
- In `init()`, add `conversationExport={config.conversationExport}` after `voice={config.voice}`.
- Add `"conversation-export",` to `observedAttributes`, after `"attachments",`.
- In `render()`, after the `attachments` constant:

```tsx
    // `conversation-export` / `="true"` enables it; "false" or absent does not.
    const exportAttr = this.getAttribute("conversation-export");
    const conversationExport =
      exportAttr === null ? undefined : exportAttr !== "false";
```

- Add `conversationExport={conversationExport}` after `attachments={attachments}`.

In `widget/src/main.tsx`, enable it in the dev app so it can be tried by hand and by Playwright:

```tsx
    <ChatWidget
      apiUrl="http://localhost:8787"
      attachments
      voice
      conversationExport
    />
```

- [ ] **Step 4: Run and confirm it passes**

Run: `./node_modules/.bin/vitest run src/__tests__/embed.test.tsx && ./node_modules/.bin/tsc --noEmit`
Expected: all embed tests pass (4 new), exit 0.

- [ ] **Step 5: Commit**

```bash
git add widget/src/embed.tsx widget/src/main.tsx widget/src/__tests__/embed.test.tsx
git commit -m "feat(widget): conversationExport in ClaudiusConfig and <claudius-chat>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Client config schema, validation, and snippets

**Files:**
- Modify: `scripts/lib/config.ts`, `scripts/lib/snippet.ts`, `clients/_schema.json`
- Test: `scripts/lib/__tests__/conversation-export-config.test.ts` (create)

**Interfaces:**
- Produces: `WidgetConfig.conversationExport?: boolean`. Snippets emit it only when it is `true`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/__tests__/conversation-export-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateConfig } from "../config.js";
import type { ClientConfig, ValidationError } from "../config.js";
import { generateScriptSnippet, generateWebComponentSnippet } from "../snippet.js";

function base(overrides: Partial<ClientConfig> = {}): Record<string, unknown> {
  return {
    name: "Test Client",
    slug: "test-client",
    apiUrl: "https://api.example.com",
    allowedDomains: ["example.com"],
    ...overrides,
  };
}

function fields(errors: ValidationError[]): string[] {
  return errors.map((e) => e.field);
}

const SCRIPT_URL = "https://cdn.example.com/claudius.js";

describe("validateConfig: conversationExport", () => {
  it("accepts a boolean", () => {
    expect(validateConfig(base({ widget: { conversationExport: true } }), "test-client")).toEqual([]);
    expect(validateConfig(base({ widget: { conversationExport: false } }), "test-client")).toEqual([]);
  });

  it("rejects anything else, naming the field", () => {
    for (const value of ["true", 1, {}, null]) {
      const errors = validateConfig(
        base({ widget: { conversationExport: value as never } }),
        "test-client",
      );
      expect(fields(errors)).toEqual(["widget.conversationExport"]);
      expect(errors[0].message).toBe("widget.conversationExport must be a boolean");
    }
  });
});

describe("snippets: conversationExport", () => {
  it("is emitted only when it is true", () => {
    const on = base({ widget: { conversationExport: true } }) as unknown as ClientConfig;
    expect(generateScriptSnippet(on, SCRIPT_URL)).toContain('"conversationExport": true');
    expect(generateWebComponentSnippet(on, SCRIPT_URL)).toContain('conversation-export="true"');

    for (const widget of [{ conversationExport: false }, {}]) {
      const off = base({ widget }) as unknown as ClientConfig;
      expect(generateScriptSnippet(off, SCRIPT_URL)).not.toContain("conversationExport");
      expect(generateWebComponentSnippet(off, SCRIPT_URL)).not.toContain("conversation-export");
    }
  });
});

describe("_schema.json: conversationExport", () => {
  it("declares widget.conversationExport as a boolean", () => {
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, "../../../clients/_schema.json"), "utf-8"),
    );
    expect(schema.properties.widget.properties.conversationExport.type).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run from `scripts/`: `../node_modules/.bin/vitest run --config vitest.config.ts lib/__tests__/conversation-export-config.test.ts`
Expected: FAIL. No error is reported for the invalid values, and the snippets and schema lack the option.

- [ ] **Step 3: Implement**

`scripts/lib/config.ts`: add `conversationExport?: boolean;` to `WidgetConfig` after `voice`. After the whole `if (widget.voice !== undefined) { ... }` block, still inside the widget section, add:

```ts
    if (
      widget.conversationExport !== undefined &&
      typeof widget.conversationExport !== "boolean"
    ) {
      errors.push({
        field: "widget.conversationExport",
        message: "widget.conversationExport must be a boolean",
      });
    }
```

`scripts/lib/snippet.ts`: in `generateScriptSnippet`, after the `voice` block:

```ts
    // Opt-in, so only `true` is worth emitting.
    if (config.widget.conversationExport === true) {
      configObj.conversationExport = true;
    }
```

In `generateWebComponentSnippet`, after the whole `voice` block:

```ts
    if (config.widget.conversationExport === true) {
      attrs.push(["conversation-export", "true"]);
    }
```

`clients/_schema.json`: inside `properties.widget.properties`, after the `voice` property, add (mind the comma after `voice`'s closing brace):

```json
        "conversationExport": {
          "type": "boolean",
          "description": "Let visitors copy the conversation as Markdown, or download it as Markdown or JSON, from a menu in the chat header. Off by default. Nothing is sent to the worker."
        }
```

- [ ] **Step 4: Run and confirm it passes**

Run from `scripts/`: `../node_modules/.bin/vitest run --config vitest.config.ts`
Expected: 7 files, 86 tests pass (82 existing, 4 new).

Run from the repo root: `node -e "JSON.parse(require('fs').readFileSync('clients/_schema.json','utf8')); console.log('schema ok')"`
Expected: `schema ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/config.ts scripts/lib/snippet.ts clients/_schema.json scripts/lib/__tests__/conversation-export-config.test.ts
git commit -m "feat(scripts): conversationExport in client config schema, validation, and snippets" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Playwright spec

**Files:**
- Create: `widget/e2e/export.spec.ts`

**Interfaces:**
- Consumes: the dev app with `conversationExport` on (Task 9); `mockChatApi` from `./helpers`.

- [ ] **Step 1: Write the spec**

Create `widget/e2e/export.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockChatApi } from "./helpers";

/**
 * Conversation export in a real browser: an actual file download, the real
 * clipboard where the permission can be granted, and Escape. Serialization
 * edge cases are covered by the unit tests in src/utils/__tests__.
 */
async function haveConversation(page: Page) {
  const api = await mockChatApi(page);
  api.enqueueReply("Plans start at $10.");
  await page.goto("/");
  await page.getByRole("button", { name: /open chat/i }).click();
  const input = page.getByLabel(/type your message/i);
  await input.fill("What are your prices?");
  await input.press("Enter");
  await expect(
    page.getByRole("log").getByText("Plans start at $10."),
  ).toBeVisible();
}

test.describe("conversation export", () => {
  test("downloads the conversation as Markdown", async ({ page }) => {
    await haveConversation(page);

    await page.getByRole("button", { name: "More options" }).click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download as Markdown" }).click();
    const download = await downloading;

    expect(download.suggestedFilename()).toMatch(
      /^chat-transcript-\d{4}-\d{2}-\d{2}\.md$/,
    );
    const text = await readFile(await download.path(), "utf8");
    expect(text).toContain("# Chat transcript");
    expect(text).toMatch(/## User · .+\n\nWhat are your prices\?/);
    expect(text).toMatch(/## Assistant · .+\n\nPlans start at \$10\./);
  });

  test("downloads the conversation as JSON", async ({ page }) => {
    await haveConversation(page);

    await page.getByRole("button", { name: "More options" }).click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download as JSON" }).click();
    const download = await downloading;

    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const messages = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(messages[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("copies the conversation as Markdown", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Only Chromium lets a test grant clipboard permissions",
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await haveConversation(page);

    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Copy as Markdown" }).click();

    await expect(page.getByText("Copied to clipboard")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("Plans start at $10.");
  });

  test("Escape closes the menu first, then the chat", async ({ page }) => {
    await haveConversation(page);
    const trigger = page.getByRole("button", { name: "More options" });

    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("the actions are unavailable until there is something to export", async ({
    page,
  }) => {
    await mockChatApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();

    await page.getByRole("button", { name: "More options" }).click();
    for (const item of await page.getByRole("menuitem").all()) {
      await expect(item).toHaveAttribute("aria-disabled", "true");
    }
  });
});
```

- [ ] **Step 2: Run it locally in Chromium**

Playwright cannot install browsers on this OS, and its global setup trips the pnpm 11 quirk, so build directly and use the system Chrome through a throwaway config. From `widget/`:

```bash
./node_modules/.bin/vite build --config vite.config.embed.ts
cat > playwright.local.config.ts <<'EOF'
import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  ...base,
  projects: (base.projects ?? [])
    .filter((p) => p.name === "chromium-desktop")
    .map((p) => ({ ...p, use: { ...p.use, channel: "chrome" } })),
});
EOF
E2E_SKIP_BUILD=1 ./node_modules/.bin/playwright test --config playwright.local.config.ts e2e/export.spec.ts
rm playwright.local.config.ts
```

Expected: 5 passed. If `pnpm dev` fails to start as the web server, start `./node_modules/.bin/vite` in another terminal first; the config reuses a server already on the port.

Then run the whole local suite the same way, without the spec path, to make sure the new header control broke no existing spec.
Expected: all chromium-desktop specs pass. WebKit and mobile-safari cannot run locally and are covered by CI.

- [ ] **Step 3: Confirm the throwaway config is gone, then commit**

Run: `git status --short widget/`
Expected: only `?? widget/e2e/export.spec.ts`. No `playwright.local.config.ts`.

```bash
git add widget/e2e/export.spec.ts
git commit -m "test(widget): e2e for conversation export" -m "A real download for both formats, the real clipboard in Chromium, and Escape closing the menu before the chat." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Documentation

**Files:**
- Create: `docs/src/content/docs/configuration/conversation-export.md`
- Modify: `docs/src/content/docs/configuration/widget.md`, `localization.md`, `clients.md`, `docs/src/content/docs/faq.md`, `CLAUDE.md`

- [ ] **Step 1: Write the guide**

Create `docs/src/content/docs/configuration/conversation-export.md`. The page itself contains a four-backtick block, so it is fenced with five here; copy what is between the five-backtick lines.

`````markdown
---
title: Conversation export
description: Let visitors copy or download the conversation as Markdown or JSON, and understand what an export contains.
sidebar:
  order: 9
---

Conversation export adds a **More options** menu to the chat header with three
actions:

- **Copy as Markdown** puts a transcript on the clipboard.
- **Download as Markdown** saves the same transcript as a `.md` file.
- **Download as JSON** saves the raw message array as a `.json` file.

Visitors use it to share an answer with a teammate, attach a transcript to a
support ticket, or keep a record. It is **off by default**. Everything happens
in the visitor's browser, and nothing is sent to your worker.

## Enabling it

```tsx
<ChatWidget apiUrl="https://api.example.com" conversationExport />
```

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://api.example.com",
    conversationExport: true,
  };
</script>
```

```html
<claudius-chat api-url="https://api.example.com" conversation-export></claudius-chat>
```

In a [client config](/configuration/clients/), set
`"widget": { "conversationExport": true }` and regenerate the snippet.

Only the literal `true` enables it. A value such as the string `"false"`, which
a CMS template can easily produce, leaves it off. On the web component,
`conversation-export="false"` also leaves it off.

The actions are greyed out while the conversation is empty and while a reply
is still arriving, so a transcript never ends in a half-finished answer.

## The Markdown transcript

````markdown
# Chat transcript

Exported Sep 19, 2026, 3:32 PM (GMT+01:00)

## User · Sep 19, 2026, 3:03 PM

What does the error in this screenshot mean?

Attachments:

- `error_v2.png` (image/png, 48 KB)

## Assistant · Sep 19, 2026, 3:03 PM

The response body is not valid JSON. Guard the parse:

```js
const data = JSON.parse(text);
```

Sources:

1. [Parsing JSON](https://example.com/docs/json)
````

- The transcript is written in the widget's [language](/configuration/localization/),
  and dates follow the visitor's regional format and time zone. The zone is
  given once, as a UTC offset.
- Message text is exported as written, so code blocks, lists, and links
  survive. A code block that a stopped reply left open is closed, so it cannot
  swallow the messages after it. Line breaks are kept as the visitor saw them.
- Citations become a numbered list of links. A source whose URL is not
  `http:` or `https:` keeps its title and loses its link.
- Attachments are listed by name, type, and size. The file itself is never
  included, and neither is its download link.
- Tools the assistant used are named. Their inputs and results are not.
- Messages from a conversation that began before you upgraded have no
  timestamp, and are exported without one.

## The JSON file

A pretty-printed array of [`ChatMessage`](/api/) objects, exactly as the widget
keeps them in `sessionStorage`:

```json
[
  {
    "id": "msg-1",
    "role": "user",
    "content": "What are your prices?",
    "createdAt": "2026-09-19T14:03:00.000Z"
  },
  {
    "id": "msg-2",
    "role": "assistant",
    "content": "Plans start at $10.",
    "createdAt": "2026-09-19T14:03:04.120Z",
    "sources": [
      { "url": "https://example.com/pricing", "title": "Pricing", "type": "page" }
    ]
  }
]
```

Inline attachment bytes are never included. `createdAt` is new in this
release; it is sent to the worker along with the rest of each message, and the
worker ignores it.

## Privacy posture

- **Export runs entirely in the browser.** No request is made, and your worker
  never learns that a conversation was exported.
- **A transcript contains whatever the conversation contains.** That includes
  anything a visitor typed that the [PII plugin](/plugins/) did not redact.
  Once it is a file or on the clipboard, it is outside the widget's control.
- **The JSON can include attachment storage details.** With the
  [R2 attachment backend](/configuration/attachments/), each stored attachment
  carries its storage key and a signed URL that works until it expires. The
  Markdown transcript leaves both out.
- **A transcript is not evidence.** It is an editable text file, and a visitor
  can type text into a message that looks like an assistant heading. If you
  need a reliable record of what the assistant said, keep it on the worker
  side.

This is why the option exists and is off by default: leave it off for
deployments where conversations should not leave the chat window.

## Limitations

- Copying needs a secure (HTTPS) page. In an `<iframe>`, the frame also needs
  `allow="clipboard-write"`. Where copying is refused, the widget says so and
  suggests downloading instead.
- Some in-app browsers (the ones inside social media apps) silently block
  downloads. The page cannot detect that. Copy still works there.
- A Markdown viewer decides how raw HTML in a message is shown. The transcript
  escapes HTML that could hide later messages, and leaves the rest as written.
`````

- [ ] **Step 2: Update the existing pages**

`docs/src/content/docs/configuration/widget.md`: in the options table, after the `voice` row, add:

```markdown
| `conversationExport` | `boolean` | `false` | Header menu that copies the conversation as Markdown, or downloads it as Markdown or JSON. Runs in the browser; nothing is sent to the worker. See [Conversation export](/configuration/conversation-export/) |
```

In the same file's "Web component attributes" section, replace the end of the attribute sentence, from `and `voice` with its companions` through `(see [Voice](/configuration/voice/#enable-voice)).`, with:

```markdown
`voice` with its companions
`voice-mode`, `voice-auto-submit`, `voice-input`, `voice-output`, and
`voice-lang` (see [Voice](/configuration/voice/#enable-voice)), and
`conversation-export` (see
[Conversation export](/configuration/conversation-export/#enabling-it)).
```

`docs/src/content/docs/configuration/localization.md`: in the "Available keys" table, after the Voice row, add:

```markdown
| [Conversation export](/configuration/conversation-export/) | `moreOptions`, `copyAsMarkdown`, `downloadAsMarkdown`, `downloadAsJson`, `copiedToClipboard`, `copyFailed`, `transcriptTitle`, `transcriptExported`, `transcriptUser`, `transcriptAssistant`, `transcriptAttachments`, `transcriptSources` |
```

`docs/src/content/docs/configuration/clients.md`: in the `widget` row of the config table, append before the closing ` |`:

```markdown
; `conversationExport` (`true` to enable, see [Conversation export](/configuration/conversation-export/))
```

`docs/src/content/docs/faq.md`: in "What data is stored, and where?", after the **Voice** bullet, add:

```markdown
- **Conversation export** (optional, off by default): copying or downloading a
  transcript happens entirely in the visitor's browser. Nothing is sent to your
  worker. Details in
  [Conversation export](/configuration/conversation-export/#privacy-posture).
```

- [ ] **Step 3: Update `CLAUDE.md`**

In the "Widget Components" table, after the `AttachmentPreview` row:

```markdown
| `HeaderMenu` | Generic accessible overflow menu in the chat header; hosts the export actions |
```

In "useChat Hook", extend the `messages` bullet to: `` `messages` - Array of chat messages, each stamped with an ISO `createdAt` when it enters the conversation ``.

After the "### Voice" section and before "### Chat Request/Response", add:

```markdown
### Conversation Export

Widget-only and opt-in (`conversationExport` prop / `ClaudiusConfig` key /
`<claudius-chat conversation-export>` / `widget.conversationExport` in client
configs). It fails closed: only the literal `true` enables it, and nothing
renders when it is off. A `HeaderMenu` in the chat header offers Copy as
Markdown, Download as Markdown, and Download as JSON, all in the browser with
no request to the worker.

Pure serializers live in `widget/src/utils/exportConversation.ts`
(`protectMessageText`, `conversationToMarkdown`, `conversationToJson`,
`exportFilename`); clipboard and download side effects in
`widget/src/utils/saveText.ts`; `useConversationExport` (owned by `ChatWindow`)
turns messages into menu items plus a transient status. Markdown keeps message
text as written but closes unclosed code fences, turns single newlines into
hard breaks outside code, and escapes a line-leading `<`. JSON is the
persisted `ChatMessage[]`, never with inline attachment bytes.

Never assert on raw `Intl` output in tests: CI's Node 20 emits U+202F before
"PM" and local Node 24 does not. Docs: configuration/conversation-export.md;
design: docs/plans/2026-09-19-conversation-export-design.md.
```

- [ ] **Step 4: Build the docs and check the links resolve**

From `docs/`: `./node_modules/.bin/astro build`
Expected: completes with no errors, one more page than before.

```bash
grep -c 'id="privacy-posture"' dist/configuration/conversation-export/index.html
grep -c 'id="enabling-it"' dist/configuration/conversation-export/index.html
```

Expected: `1` and `1`. The FAQ links to the first anchor and the widget page to the second.

- [ ] **Step 5: Commit**

```bash
git add docs/src/content/docs/configuration/conversation-export.md docs/src/content/docs/configuration/widget.md docs/src/content/docs/configuration/localization.md docs/src/content/docs/configuration/clients.md docs/src/content/docs/faq.md CLAUDE.md
git commit -m "docs: conversation export guide" -m "Enabling it in each embed style, what each format contains, and a privacy posture that says plainly what an export can carry and that a transcript is not evidence." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Bundle budget

CONTRIBUTING requires a budget bump in its own commit with the increase explained. The "exceeded by" figure size-limit prints is not the real cost, because the old limit already holds 5% headroom over `main`. Measure both.

**Files:**
- Modify: `widget/.size-limit.json`

- [ ] **Step 1: Measure the branch**

From `widget/`:

```bash
./node_modules/.bin/vite build && ./node_modules/.bin/vite build --config vite.config.embed.ts
./node_modules/.bin/size-limit --json > /tmp/claude-export-branch.json; echo "exit $?"
```

Expected: a non-zero exit, because at least the IIFE entries exceed their limits. That is the reason for this task.

- [ ] **Step 2: Measure `main` with the same tool**

```bash
SCRATCH=$(mktemp -d)
git worktree add --detach "$SCRATCH/main-wt" origin/main
ln -s "$PWD/node_modules" "$SCRATCH/main-wt/widget/node_modules"
( cd "$SCRATCH/main-wt/widget" && ./node_modules/.bin/vite build && ./node_modules/.bin/vite build --config vite.config.embed.ts && ./node_modules/.bin/size-limit --json > /tmp/claude-export-main.json )
git worktree remove --force "$SCRATCH/main-wt" && git worktree prune
```

- [ ] **Step 3: Compute deltas and new limits**

```bash
node -e '
const main = require("/tmp/claude-export-main.json"), branch = require("/tmp/claude-export-branch.json");
for (const b of branch) {
  const m = main.find((x) => x.name === b.name);
  console.log(b.name.padEnd(28), "main", m.size, "branch", b.size, "delta", b.size - m.size, "-> limit", Math.ceil(b.size * 1.05) + " B");
}'
```

Set each entry's `limit` in `widget/.size-limit.json` to the printed value. Change nothing else in the file.

- [ ] **Step 4: Verify the gate passes**

Run: `./node_modules/.bin/size-limit`
Expected: exit 0, every entry within its limit.

- [ ] **Step 5: Commit, quoting the measured deltas**

Replace the bracketed figures with the numbers from Step 3.

```bash
git add widget/.size-limit.json
git commit -m "chore(widget): raise bundle budgets for conversation export" -m "Measured against main with size-limit: claudius.iife.js [+N B raw, +N B gzip, +N B brotli]; claudius.js [+N B raw, +N B gzip, +N B brotli]; claudius.css [+N B raw, +N B gzip, +N B brotli]. The cost is the header menu, the transcript serializer, and twelve strings in four locales. Limits are the measured sizes plus 5%." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Verify, review, then open the PR

The maintainer merges within minutes of CI going green. A caveat in prose does not gate a merge, so **the independent review happens before the PR exists**, not after.

- [ ] **Step 1: Run everything CI runs**

From `widget/`:

```bash
./node_modules/.bin/eslint src/ && ./node_modules/.bin/prettier --check "src/**/*.{ts,tsx,css}" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/typedoc --emit none && ./node_modules/.bin/vitest run
./node_modules/.bin/vite build && ./node_modules/.bin/vite build --config vite.config.embed.ts && node scripts/emit-dts-cts.mjs
./node_modules/.bin/publint --strict && ./node_modules/.bin/attw --pack . --exclude-entrypoints ./embed ./style.css
./node_modules/.bin/size-limit
```

From `scripts/`: `../node_modules/.bin/vitest run --config vitest.config.ts`
From `worker/`: `./node_modules/.bin/vitest run` (untouched, but it shares the repo)

Expected: every command exits 0. Record the test counts.

- [ ] **Step 2: Try it by hand**

Start `./node_modules/.bin/vite` in `widget/`, open http://localhost:5173, and check what no test can: the menu sits correctly beside the close button and is not clipped; it looks right in dark mode and in the mobile bottom sheet (narrow the window below 640 px); the status pill is legible; a downloaded `.md` renders properly in a Markdown viewer.

- [ ] **Step 3: Confirm nothing unintended is staged or committed**

```bash
git status --short
git diff --stat origin/main...HEAD
```

Expected: the only uncommitted entries are the pre-existing local ones (`.mcp.json`, `.claude/`, `signup-state.png`). The diff lists only files named in this plan. No `pnpm-workspace.yaml`, no `playwright.local.config.ts`.

- [ ] **Step 4: Independent review, and fix what it finds**

Use superpowers:requesting-code-review against `origin/main...HEAD`. Point the reviewer at the spec and ask specifically about: an embed with the option **off** (the last feature shipped a bug that affected exactly those), Escape and the focus trap, the fence scanner's edge cases, and anything that could throw on odd message content. Apply fixes as new commits, re-run Step 1, and only then continue.

- [ ] **Step 5: Push and open the PR**

Per `CLAUDE.md`, finishing a branch means pushing and opening a PR without asking.

```bash
git push -u origin 55-conversation-export
gh pr create --title "feat(widget): conversation export (Markdown, JSON, copy to clipboard)" --body-file <(cat <<'EOF'
Closes #55.

## What

An opt-in **More options** menu in the chat header: Copy as Markdown, Download as Markdown, Download as JSON. Everything happens in the browser. Nothing is sent to the worker.

## Decisions worth a look

- **Off by default, which departs from the issue.** Embeds load the floating `@1` CDN tag, so an on-by-default feature would add a header button to every live site on release, including any privacy-sensitive client. Opt-in matches `attachments` and `voice`, and can be flipped later without breaking anyone. Only the literal `true` enables it.
- **New optional `ChatMessage.createdAt`.** The issue asks for timestamps and messages had none. It rides in the request body like `id` does; workers have discarded unknown message fields since the first commit.
- **Message text is exported as written, with protections** so one message cannot damage the rest of a rendered transcript: unclosed code fences are closed, single newlines become hard breaks outside code, and a line-leading `<` is escaped.
- **Escape closes only the menu.** The chat's document-level listener now skips `defaultPrevented` events.

Design: `docs/plans/2026-09-19-conversation-export-design.md`.

## Acceptance criteria

- [x] Header overflow menu with Copy as Markdown, Download as Markdown, Download as JSON
- [x] Markdown preserves roles, timestamps, code blocks, and source citations
- [x] JSON is the raw `ChatMessage[]` the widget stores, without inline attachment bytes
- [x] Configurable per widget, across the React prop, `ClaudiusConfig`, `<claudius-chat>`, and client configs
- [x] Unit tests for serialization edge cases

## Testing

[Fill in the real counts from Step 1, and state that e2e ran locally in Chromium only; WebKit runs in CI.]

## Bundle

[Fill in the measured deltas from the budget commit.]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```

- [ ] **Step 6: Confirm CI is judging this commit**

```bash
gh pr view --json state,headRefOid,url
git rev-parse HEAD
```

Expected: `state` is `OPEN` and `headRefOid` equals `HEAD`. A merged PR silently ignores new pushes and keeps showing the old commit's green checks. Report the PR URL.
