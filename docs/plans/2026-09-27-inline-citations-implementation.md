# Inline Citations and Source Cards Implementation Plan (issue #56)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opt-in `citations` option that renders `[n]` markers in grounded replies as numbered chips and lists the sources as cards in a collapsible footer, with the worker numbering its excerpts and asking the model to cite them.

**Architecture:** The widget option drives everything: `useChat` tells `ChatApiClient` to send `citations: true`, the worker's `buildRagContext` numbers the retrieved excerpts to match `sources` and appends a citing instruction, and the stream route announces the sources before the first text chunk so chips render live. On the widget, pure helpers in `utils/citations.ts` tokenize markers and resolve the option, `SourceCards` owns the footer, and `ChatMessage` threads a citation context through its existing inline renderer. When the option is off, nothing changes on either side.

**Tech Stack:** React 18/19, TypeScript strict, Tailwind 3.4 theme tokens, Vitest 4 + React Testing Library + user-event 14, Playwright, Hono on Cloudflare Workers. No new dependencies.

**Spec:** `docs/plans/2026-09-27-inline-citations-design.md`. Read it first. This plan argues from it.

## Global Constraints

- **No new runtime or dev dependencies.**
- **Off by default, fails closed.** Only the literal `true` or a plain object enables the widget option. `"true"`, `"false"`, `1`, and arrays must not. The worker enables numbering only for `citations === true` on the request body.
- **Renders nothing new when off.** No chips, no footer, no new request field. The existing source icon and sidebar keep working exactly as today.
- **Names:** `citations` (prop, `ClaudiusConfig` key, client JSON key, request field), `citations` / `citations-max-sources` / `citations-favicons` (HTML attributes), `snippet` (source field), `sources` (SSE event name and data key).
- **Snippets are cut to 200 characters** at the last space, with a trailing ellipsis `…`, on the worker and again on the widget.
- **A marker is a citation only when every number is between 1 and the source count.** Otherwise it is literal text.
- **The `sources` SSE event is yielded after the model connection opens**, never before, so a bad API key still produces a JSON 500.
- **No em dashes** in code comments, strings, or docs. The repo avoids them.
- **Every new exported symbol and public member needs a TSDoc comment.** CI runs `typedoc --emit none`, which fails on undocumented public API.
- **Run tools directly on the maintainer's machine.** pnpm 11 breaks `pnpm test` / `pnpm build` in `widget/`. From `widget/` use `./node_modules/.bin/vitest`, `./node_modules/.bin/tsc`, `./node_modules/.bin/eslint`, `./node_modules/.bin/prettier`, `./node_modules/.bin/vite`, `./node_modules/.bin/typedoc`, `./node_modules/.bin/size-limit`. From `worker/` use `./node_modules/.bin/vitest run`. Scripts tests run with `pnpm test:scripts` from the repo root. CI uses the pnpm scripts and is unaffected.
- **Stage explicit paths only.** Never `git add -A` or `git add .`. The working tree holds unrelated local changes (`.mcp.json`, `.claude/`, `signup-state.png`) and untracked `pnpm-workspace.yaml` scaffolds that must never be committed.
- **Format before every commit.** From `widget/`, run `./node_modules/.bin/prettier --write` on each `src/` file the task created or changed, then `./node_modules/.bin/eslint` on the same files. Code blocks in this plan are not all wrapped the way Prettier wants, and CI's `format:check` fails on the difference. The widget has no `eslint-disable` comments; do not add one.
- **Repo-local git identity:** `user.name "PMullz"`, `user.email "paul@pmds.info"` (already configured; check with `git config user.name`).
- End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

Input classes the spec implies but no acceptance criterion names. Each has a test in the task that owns the code.

1. **A grounded reply that cites nothing.** The model is free to ignore the instruction. The footer must still appear (collapsed) with its cards, and no chip must appear. Test in Task 9.
2. **Sources without a `snippet`**, from a worker that predates this release or from a persisted conversation. The card must render without an empty paragraph. Test in Task 8.
3. **A stream that fails after the `sources` event and before any text.** No assistant message may be created from the stashed sources; the error path must run as today. Test in Task 5.
4. **`citations: "true"` (a string) on the worker request**, from a hand-written client. Numbering must stay off. Test in Task 3.
5. **Two cited replies in one conversation.** Each footer keeps its own expanded state; opening one must not open the other. Test in Task 10.

## File Structure

Create:

| File | Responsibility |
|------|----------------|
| `widget/src/utils/citations.ts` | Pure: `resolveCitationsConfig`, `citationsOptionsFromAttributes`, `parseCitations`, `stripCitationMarkers`, `hideTrailingCitationOpener`, `truncateSnippet`, `faviconUrl`, `sourceDomain`. |
| `widget/src/components/SourceCards.tsx` | The footer: toggle, cards, "Show all", reveal behaviour. |
| `widget/src/utils/__tests__/citations.test.ts` | |
| `widget/src/components/__tests__/SourceCards.test.tsx` | |
| `widget/src/components/__tests__/ChatMessage.citations.test.tsx` | |
| `widget/src/components/__tests__/ChatWindow.citations.test.tsx` | |
| `widget/src/components/__tests__/ChatWidget.citations.test.tsx` | |
| `widget/src/api/__tests__/client.citations.test.ts` | |
| `widget/src/hooks/__tests__/useChat.citations.test.ts` | |
| `widget/e2e/citations.spec.ts` | |
| `worker/src/__tests__/chat-route-citations.test.ts` | |
| `scripts/lib/__tests__/citations-config.test.ts` | |
| `docs/src/content/docs/configuration/citations.md` | |

Modify: `worker/src/rag/retrieval.ts`, `worker/src/rag/index.ts`, `worker/src/chat.ts`, `worker/src/index.ts`, `worker/src/__tests__/rag.test.ts`, `worker/src/__tests__/chat-rag.test.ts`, `widget/src/api/types.ts`, `widget/src/api/client.ts`, `widget/src/hooks/useChat.ts`, `widget/src/i18n.ts`, `widget/src/locales/{en,es,fr,de}.ts`, `widget/src/components/ChatMessage.tsx`, `widget/src/components/ChatWindow.tsx`, `widget/src/components/ChatWidget.tsx`, `widget/src/embed.tsx`, `widget/src/index.ts`, `widget/src/main.tsx`, `widget/src/components/ChatMessage.stories.tsx`, `widget/src/__tests__/embed.test.tsx`, `scripts/lib/config.ts`, `scripts/lib/snippet.ts`, `clients/_schema.json`, six docs pages, `CLAUDE.md`, `widget/.size-limit.json`.

---

### Task 1: Snippets on worker sources

**Files:**
- Modify: `worker/src/rag/retrieval.ts`
- Modify: `worker/src/rag/index.ts`
- Test: `worker/src/__tests__/rag.test.ts`, `worker/src/__tests__/chat-rag.test.ts`

**Interfaces:**
- Produces: `ChatSource.snippet?: string`; `snippetFromContent(content: string, maxChars?: number): string | undefined`; `SOURCE_SNIPPET_MAX_CHARS = 200`. Task 2 and the widget rely on the field.

- [ ] **Step 1: Write the failing tests**

Add to `worker/src/__tests__/rag.test.ts`. Extend the import from `"../rag"` with `snippetFromContent`.

```ts
describe("snippetFromContent", () => {
  it("collapses whitespace and strips heading, bold, and backtick markers", () => {
    expect(
      snippetFromContent("## Pricing\n\nPlans start at **$75** per `hour`.")
    ).toBe("Pricing Plans start at $75 per hour.");
  });

  it("keeps text at the limit and cuts longer text at a word boundary", () => {
    const exact = "a".repeat(200);
    expect(snippetFromContent(exact)).toBe(exact);

    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const cut = snippetFromContent(words)!;
    expect(cut.length).toBeLessThanOrEqual(201);
    expect(cut.endsWith("…")).toBe(true);
    const body = cut.slice(0, -1);
    expect(body).toMatch(/word\d+$/);
    expect(words.startsWith(body)).toBe(true);
  });

  it("hard-cuts a single long token", () => {
    expect(snippetFromContent("x".repeat(250))).toBe(`${"x".repeat(200)}…`);
  });

  it("returns undefined for blank content", () => {
    expect(snippetFromContent("  \n\t ")).toBeUndefined();
  });
});
```

In the existing `describe("ragDocumentsToSources")`, add two tests and update two expectations:

```ts
  it("adds a snippet from the first chunk of each page", () => {
    const sources = ragDocumentsToSources([
      doc({ id: "p#0", content: "First chunk." }),
      doc({ id: "p#1", content: "Second chunk." }),
    ]);
    expect(sources).toEqual([
      {
        url: "https://example.com/pricing",
        title: "Pricing",
        type: "page",
        snippet: "First chunk.",
      },
    ]);
  });

  it("omits the snippet when the chunk has no text", () => {
    const [source] = ragDocumentsToSources([doc({ content: "   " })]);
    expect(source).not.toHaveProperty("snippet");
  });
```

Update "maps url/title/type metadata to widget sources" to expect
`{ url: "https://e.com/blog/a", title: "A", type: "blog", snippet: "Plans start at $75/hour." }`
and "falls back to type 'page' and url-as-title" to expect
`{ url: "https://e.com/x", title: "https://e.com/x", type: "page", snippet: "Plans start at $75/hour." }`.

In `worker/src/__tests__/chat-rag.test.ts`, both `toEqual([{ url: "https://example.com/pricing", title: "Pricing", type: "page" }])` expectations gain `snippet: "Plans start at $1,000/month."`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && ./node_modules/.bin/vitest run src/__tests__/rag.test.ts src/__tests__/chat-rag.test.ts`
Expected: FAIL. `snippetFromContent` is not exported; the `toEqual` expectations with `snippet` fail.

- [ ] **Step 3: Implement**

In `worker/src/rag/retrieval.ts`, extend `ChatSource` and add the helper above `ragDocumentsToSources`:

```ts
/** Source link shape the widget renders (see widget `Source`). */
export interface ChatSource {
  url: string;
  title: string;
  type: "blog" | "page" | "external";
  /** Plain-text preview of the page, cut to about 200 characters. */
  snippet?: string;
}

/** Longest snippet the worker sends; the widget applies the same cut. */
export const SOURCE_SNIPPET_MAX_CHARS = 200;

/**
 * Plain-text preview of a chunk for the widget's source cards: heading
 * markers, bold markers, and backticks removed, whitespace collapsed, cut at
 * the last space before `maxChars` (or hard when there is none) with a
 * trailing ellipsis. Undefined when nothing is left.
 */
export function snippetFromContent(
  content: string,
  maxChars: number = SOURCE_SNIPPET_MAX_CHARS
): string | undefined {
  const text = content
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/\*\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,;:]+$/,
    ""
  );
  return `${head}…`;
}
```

In `ragDocumentsToSources`, replace `sources.push({ url, title, type });` with:

```ts
    const snippet = snippetFromContent(doc.content);
    sources.push({ url, title, type, ...(snippet ? { snippet } : {}) });
```

In `worker/src/rag/index.ts`, add `snippetFromContent` and `SOURCE_SNIPPET_MAX_CHARS` to the `export { ... } from "./retrieval";` list.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd worker && ./node_modules/.bin/vitest run`
Expected: all worker tests PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/src/rag/retrieval.ts worker/src/rag/index.ts worker/src/__tests__/rag.test.ts worker/src/__tests__/chat-rag.test.ts
git commit -m "feat(worker): attach a snippet to each RAG source

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Numbered excerpts, citing instruction, and budget-consistent sources

**Files:**
- Modify: `worker/src/rag/retrieval.ts`
- Modify: `worker/src/rag/index.ts`
- Modify: `worker/src/chat.ts`
- Modify: `worker/src/index.ts` (`getChatConfig`)
- Test: `worker/src/__tests__/rag.test.ts`, `worker/src/__tests__/chat-rag.test.ts`

**Interfaces:**
- Consumes: `ChatSource` and `ragDocumentsToSources` from Task 1.
- Produces: `buildRagContext(documents, rag?, options?): RagContext` where `RagContext = { context?: string; sources: ChatSource[] }` and `options: RagContextOptions = { citations?: boolean }`; `CITATION_INSTRUCTIONS: string`; `ChatRequest.citations?: boolean`; `ChatConfig.citations?: boolean`. `formatRagContext` keeps its signature. Task 3 relies on `prepareRag` returning `rag.sources`.

- [ ] **Step 1: Write the failing tests**

Add to `worker/src/__tests__/rag.test.ts` (extend the import with `buildRagContext` and `CITATION_INSTRUCTIONS`):

```ts
describe("buildRagContext", () => {
  const faq = doc({
    id: "faq.md#0",
    content: "We are open 9 to 5.",
    metadata: { url: "https://example.com/faq", title: "FAQ" },
  });

  it("returns no context and no sources for no documents", () => {
    expect(buildRagContext([])).toEqual({ sources: [] });
  });

  it("matches formatRagContext and stays unnumbered when citations are off", () => {
    const docs = [doc(), faq];
    const { context, sources } = buildRagContext(docs);
    expect(context).toBe(formatRagContext(docs));
    expect(context).toContain("### [Pricing](https://example.com/pricing)");
    expect(context).not.toContain("[1]");
    expect(context).not.toContain(CITATION_INSTRUCTIONS);
    expect(sources.map((s) => s.url)).toEqual([
      "https://example.com/pricing",
      "https://example.com/faq",
    ]);
  });

  it("numbers pages in order of first appearance and shares the number across chunks", () => {
    const pricing1 = doc({
      id: "pricing.md#1",
      content: "Enterprise plans are quoted.",
    });
    const { context, sources } = buildRagContext([doc(), faq, pricing1], {}, {
      citations: true,
    });
    expect(context).toContain(
      "### [1] [Pricing](https://example.com/pricing)\nPlans start at $75/hour."
    );
    expect(context).toContain(
      "### [2] [FAQ](https://example.com/faq)\nWe are open 9 to 5."
    );
    expect(context).toContain(
      "### [1] [Pricing](https://example.com/pricing)\nEnterprise plans are quoted."
    );
    expect(sources.map((s) => s.url)).toEqual([
      "https://example.com/pricing",
      "https://example.com/faq",
    ]);
    expect(context!.endsWith(CITATION_INSTRUCTIONS)).toBe(true);
  });

  it("leaves documents without a url unnumbered and uncited", () => {
    const orphan = doc({ id: "notes.md#0", metadata: { title: "Notes" } });
    const { context, sources } = buildRagContext([orphan], {}, { citations: true });
    expect(context).toContain("### [Notes]\n");
    expect(context).not.toContain("[1]");
    expect(context).not.toContain(CITATION_INSTRUCTIONS);
    expect(sources).toEqual([]);
  });

  it("drops a document past the budget from the sources too", () => {
    const third = doc({
      id: "team.md#0",
      content: "z".repeat(50),
      metadata: { url: "https://example.com/team", title: "Team" },
    });
    const docs = [
      doc({ content: "x".repeat(50) }),
      doc({ ...faq, content: "y".repeat(50) }),
      third,
    ];
    const { context, sources } = buildRagContext(docs, { maxContextChars: 200 }, {
      citations: true,
    });
    expect(context).toContain("[1] [Pricing]");
    expect(context).toContain("[2] [FAQ]");
    expect(context).not.toContain("[3]");
    expect(context).not.toContain("zzz");
    expect(sources.map((s) => s.title)).toEqual(["Pricing", "FAQ"]);
  });
});
```

Add to `worker/src/__tests__/chat-rag.test.ts`, inside `describe("handleChat with RAG")`:

```ts
  it("numbers the excerpts and asks for citations when the request opts in", async () => {
    await handleChat({ ...request, citations: true }, "key", {
      rag: ragWith([pricingDoc]),
    });
    const system = createSpy.mock.calls[0][0].system as string;
    expect(system).toContain("### [1] [Pricing](https://example.com/pricing)");
    expect(system).toContain("end it with the excerpt's number");
  });

  it("leaves the prompt unnumbered when the request does not opt in", async () => {
    await handleChat(request, "key", { rag: ragWith([pricingDoc]) });
    const system = createSpy.mock.calls[0][0].system as string;
    expect(system).toContain("### [Pricing](https://example.com/pricing)");
    expect(system).not.toContain("[1]");
    expect(system).not.toContain("end it with the excerpt's number");
  });

  it("returns sources only for the excerpts that fit the context budget", async () => {
    const faqDoc: RagDocument = {
      id: "faq.md#0",
      content: "We are open 9 to 5.",
      metadata: { url: "https://example.com/faq", title: "FAQ", type: "page" },
      score: 0.8,
    };
    const result = await handleChat(request, "key", {
      rag: { ...ragWith([pricingDoc, faqDoc]), maxContextChars: 60 },
    });
    expect(result.response.sources?.map((s) => s.url)).toEqual([
      "https://example.com/pricing",
    ]);
  });
```

The last test fails against today's code because `prepareRag` builds sources from every retrieved document.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && ./node_modules/.bin/vitest run src/__tests__/rag.test.ts src/__tests__/chat-rag.test.ts`
Expected: FAIL. `buildRagContext` and `CITATION_INSTRUCTIONS` are not exported; the request's `citations` is not typed; the budget test gets two sources.

- [ ] **Step 3: Implement the worker changes**

In `worker/src/rag/retrieval.ts`, replace the whole `formatRagContext` function with:

```ts
/** Options for {@link buildRagContext}. */
export interface RagContextOptions {
  /**
   * Number each excerpt to match its page's position in the returned
   * `sources` and append {@link CITATION_INSTRUCTIONS}, so the model can cite
   * with `[n]`. Set from the request's `citations` flag.
   */
  citations?: boolean;
}

/** What {@link buildRagContext} produces for one request. */
export interface RagContext {
  /** System-prompt suffix, or undefined when there was nothing to inject. */
  context?: string;
  /** Source links for exactly the excerpts that made it into `context`. */
  sources: ChatSource[];
}

/**
 * Appended after the context block when the request asked for citations.
 * Kept outside the template so custom templates get it too.
 */
export const CITATION_INSTRUCTIONS =
  "The excerpts above are numbered. When a sentence draws on one, end it with the excerpt's number in square brackets, like [1], or [1][3] for several. Cite only numbers that appear above and never invent one. Add no citation when the excerpts do not apply, and do not list the sources or their URLs yourself: the reader sees them beside your answer.";

/**
 * Renders retrieved documents into the context block that gets appended to
 * the system prompt, and returns the widget sources for the same excerpts.
 * Documents that would push the block past `maxContextChars` are dropped,
 * lowest-ranked first, from both. With `citations`, each excerpt with a URL
 * gets its page's 1-based position in `sources` as a `[n]` prefix.
 */
export function buildRagContext(
  documents: RagDocument[],
  rag: Pick<RagConfig, "contextTemplate" | "maxContextChars"> = {},
  options: RagContextOptions = {}
): RagContext {
  if (documents.length === 0) return { sources: [] };

  const maxChars = rag.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
  const template = rag.contextTemplate ?? DEFAULT_CONTEXT_TEMPLATE;
  const numbered = options.citations === true;

  const parts: string[] = [];
  const included: RagDocument[] = [];
  const numberByUrl = new Map<string, number>();
  let used = 0;
  for (const doc of documents) {
    const title =
      typeof doc.metadata?.title === "string" ? doc.metadata.title : doc.id;
    const url = typeof doc.metadata?.url === "string" ? doc.metadata.url : "";
    const link = url ? `[${title}](${url})` : `[${title}]`;
    // Tentative: a new page gets its number only once its block fits.
    const number =
      numbered && url ? (numberByUrl.get(url) ?? numberByUrl.size + 1) : undefined;
    const header = number === undefined ? link : `[${number}] ${link}`;
    const block = `### ${header}\n${doc.content.trim()}`;
    if (used + block.length > maxChars && parts.length > 0) break;
    parts.push(block);
    used += block.length;
    included.push(doc);
    if (number !== undefined && !numberByUrl.has(url)) {
      numberByUrl.set(url, number);
    }
  }

  const sources = ragDocumentsToSources(included);
  let context = template.replace("{context}", parts.join("\n\n"));
  if (numbered && sources.length > 0) {
    context += `\n\n${CITATION_INSTRUCTIONS}`;
  }
  return { context, sources };
}

/**
 * The context block alone, unnumbered. See {@link buildRagContext}.
 */
export function formatRagContext(
  documents: RagDocument[],
  rag: Pick<RagConfig, "contextTemplate" | "maxContextChars"> = {}
): string | undefined {
  return buildRagContext(documents, rag).context;
}
```

`ragDocumentsToSources` is defined below `buildRagContext` in the file; function declarations hoist, so the order is fine.

In `worker/src/rag/index.ts`, extend the retrieval export list with `buildRagContext`, `CITATION_INSTRUCTIONS`, `type RagContextOptions`, `type RagContext`.

In `worker/src/chat.ts`:

```ts
// import: replace formatRagContext and ragDocumentsToSources with buildRagContext
import { retrieveRagDocuments, buildRagContext } from "./rag";

export interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
  /**
   * Set by widgets that render `[n]` citations: numbers the retrieved
   * excerpts to match `sources` and asks the model to cite them.
   */
  citations?: boolean;
}

export interface ChatConfig {
  // ...existing fields...
  /** Number RAG excerpts and ask the model to cite them as `[n]`. */
  citations?: boolean;
}
```

And in `prepareRag`, replace the last four lines with:

```ts
  const documents = await retrieveRagDocuments(config.rag, lastUser.content);
  const built = buildRagContext(documents, config.rag, {
    citations: config.citations === true,
  });
  return { systemSuffix: built.context ?? "", sources: built.sources };
```

In `worker/src/index.ts`, add to the object returned by `getChatConfig`, after `rag: createRagFromEnv(env),`:

```ts
    // Only the literal true: a hand-written client sending "true" gets the
    // unnumbered prompt it has always had.
    citations: body?.citations === true,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd worker && ./node_modules/.bin/vitest run && npx tsc --noEmit -p .`
Expected: all PASS, no type errors. (If `npx tsc` is unavailable, `./node_modules/.bin/tsc --noEmit -p .`.)

- [ ] **Step 5: Commit**

```bash
git add worker/src/rag/retrieval.ts worker/src/rag/index.ts worker/src/chat.ts worker/src/index.ts worker/src/__tests__/rag.test.ts worker/src/__tests__/chat-rag.test.ts
git commit -m "feat(worker): number RAG excerpts and ask for citations when the request opts in

Sources now come from the excerpts that fit the context budget, so the
numbers in the prompt and on the cards are the same list.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The `sources` stream event

**Files:**
- Modify: `worker/src/chat.ts` (`ChatStreamEvent`, `streamChat`)
- Modify: `worker/src/index.ts` (stream route and its comment block)
- Test: `worker/src/__tests__/chat-rag.test.ts`, `worker/src/__tests__/chat-route-citations.test.ts` (create)

**Interfaces:**
- Consumes: `prepareRag` returning `sources` (Task 2).
- Produces: `ChatStreamEvent` member `{ type: "sources"; sources: ChatSource[] }`; SSE frame `event: sources` with data `{"sources":[...]}`. The widget client (Task 4) parses exactly this.

- [ ] **Step 1: Write the failing tests**

Add to `worker/src/__tests__/chat-rag.test.ts`, inside `describe("streamChat with RAG")`:

```ts
  it("announces the sources once the model call is made, before the first text", async () => {
    const events: Array<{ type: string }> = [];
    let createCallsAtSources = -1;
    for await (const event of streamChat(request, "key", {
      rag: ragWith([pricingDoc]),
    })) {
      if (event.type === "sources") createCallsAtSources = createSpy.mock.calls.length;
      events.push(event);
    }
    expect(events.map((e) => e.type)).toEqual(["sources", "text", "done"]);
    // Yielded after the connection opened, so a bad key still fails as JSON.
    expect(createCallsAtSources).toBe(1);
    expect(events[0]).toEqual({
      type: "sources",
      sources: [
        {
          url: "https://example.com/pricing",
          title: "Pricing",
          type: "page",
          snippet: "Plans start at $1,000/month.",
        },
      ],
    });
  });

  it("announces nothing when retrieval found no sources", async () => {
    const events = [];
    for await (const event of streamChat(request, "key", { rag: ragWith([]) })) {
      events.push(event);
    }
    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
  });
```

Create `worker/src/__tests__/chat-route-citations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createSpy = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createSpy };
  },
}));

import app from "../index";

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
  } as unknown as KVNamespace;
}

function createMockCtx(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

/** Env with the RAG bindings, so retrieval runs and yields one source. */
function ragEnv() {
  return {
    ANTHROPIC_API_KEY: "test-key",
    ALLOWED_ORIGIN: "http://localhost:5173",
    RATE_LIMIT: createMockKV(),
    AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }) },
    VECTORIZE_INDEX: {
      query: vi.fn().mockResolvedValue({
        matches: [
          {
            id: "pricing.md#0",
            score: 0.9,
            metadata: {
              content: "Plans start at $10.",
              url: "https://example.com/pricing",
              title: "Pricing",
            },
          },
        ],
      }),
    },
  };
}

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const messages = [{ role: "user", content: "What are your prices?" }];

async function* textStream() {
  yield { type: "message_start", message: { usage: { input_tokens: 3 } } };
  yield {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Plans start at $10 [1]." },
  };
  yield {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 4 },
  };
  yield { type: "message_stop" };
}

describe("citations on the chat routes", () => {
  beforeEach(() => {
    createSpy.mockReset();
  });

  it("numbers the prompt when the body carries citations: true", async () => {
    createSpy.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Plans start at $10 [1]." }],
      usage: { input_tokens: 3, output_tokens: 4 },
    });

    const res = await app.fetch(
      request("/api/chat", { messages, citations: true }),
      ragEnv(),
      createMockCtx()
    );

    expect(res.status).toBe(200);
    const system = createSpy.mock.calls[0][0].system as string;
    expect(system).toContain("### [1] [Pricing](https://example.com/pricing)");
    expect(await res.json()).toMatchObject({
      sources: [{ url: "https://example.com/pricing", snippet: "Plans start at $10." }],
    });
  });

  it.each([[undefined], ["true"], [1]])(
    "leaves the prompt unnumbered for citations = %j",
    async (citations) => {
      createSpy.mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Plans start at $10." }],
        usage: { input_tokens: 3, output_tokens: 4 },
      });

      const res = await app.fetch(
        request("/api/chat", { messages, citations }),
        ragEnv(),
        createMockCtx()
      );

      expect(res.status).toBe(200);
      const system = createSpy.mock.calls[0][0].system as string;
      expect(system).toContain("### [Pricing](https://example.com/pricing)");
      expect(system).not.toContain("[1]");
    }
  );

  it("streams a sources event before the first chunk", async () => {
    createSpy.mockImplementation(() => textStream());

    const res = await app.fetch(
      request("/api/chat/stream", { messages, citations: true }),
      ragEnv(),
      createMockCtx()
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    const sourcesAt = text.indexOf("event: sources");
    const chunkAt = text.indexOf("event: chunk");
    expect(sourcesAt).toBeGreaterThanOrEqual(0);
    expect(chunkAt).toBeGreaterThanOrEqual(0);
    expect(sourcesAt).toBeLessThan(chunkAt);
    expect(text).toContain(
      'event: sources\ndata: {"sources":[{"url":"https://example.com/pricing","title":"Pricing","type":"page","snippet":"Plans start at $10."}]}'
    );
    expect(text).toContain('"reply":"Plans start at $10 [1]."');
  });

  it("still returns JSON 500 when the model connection fails with RAG on", async () => {
    createSpy.mockImplementation(() => {
      throw new Error("authentication failed");
    });

    const res = await app.fetch(
      request("/api/chat/stream", { messages, citations: true }),
      ragEnv(),
      createMockCtx()
    );

    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ code: "CONFIG_ERROR" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && ./node_modules/.bin/vitest run src/__tests__/chat-rag.test.ts src/__tests__/chat-route-citations.test.ts`
Expected: the two new `streamChat` tests and "streams a sources event" FAIL (no `sources` event). The others pass already; that is expected, they pin behaviour the event must not break.

- [ ] **Step 3: Implement**

In `worker/src/chat.ts`, extend `ChatStreamEvent`:

```ts
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; toolUse: ToolUseSummary }
  | { type: "sources"; sources: ChatSource[] }
  | {
      type: "done";
      reply: string;
      toolUses?: ToolUseSummary[];
      sources?: ChatSource[];
      telemetry: ChatTelemetry;
    };
```

Update its doc comment to mention that `sources` events "announce the reply's sources once, before the first text delta". In `streamChat`, right after `const stream = await client.messages.create({ ... });` inside the `for` loop, add:

```ts
    // Announce the sources once the model connection is open, so the widget
    // can render citation chips while the text streams. Not before: the
    // route pulls the first event before opening the SSE response, and a
    // bad API key must still surface there as a JSON error.
    if (round === 0 && rag.sources.length > 0) {
      yield { type: "sources", sources: rag.sources };
    }
```

In `worker/src/index.ts`, update the comment block above the stream route:

```ts
// Streaming variant of /api/chat. Emits SSE events:
//   event: sources data: {"sources": [...]}      once, before the first chunk, when RAG found any
//   event: chunk   data: {"text": "..."}         one per model text delta
//   event: tool    data: {...ToolUseSummary}     one per executed tool call
//   event: done    data: {"reply": "..."}        full assembled reply, stream end
//   event: error   data: {"error": ..., "code"}  failure after streaming began
```

and add a branch before the final `else`:

```ts
          } else if (event.type === "sources") {
            await sse.writeSSE({
              event: "sources",
              data: JSON.stringify({ sources: event.sources }),
            });
          } else {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd worker && ./node_modules/.bin/vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/src/chat.ts worker/src/index.ts worker/src/__tests__/chat-rag.test.ts worker/src/__tests__/chat-route-citations.test.ts
git commit -m "feat(worker): announce RAG sources before the first streamed chunk

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Widget types and `ChatApiClient`

**Files:**
- Modify: `widget/src/api/types.ts`
- Modify: `widget/src/api/client.ts`
- Test: `widget/src/api/__tests__/client.citations.test.ts` (create)

**Interfaces:**
- Consumes: the worker's `event: sources` frame (Task 3) and `snippet` field (Task 1).
- Produces: `Source.snippet?: string`; `ChatRequest.citations?: boolean`; `ChatStreamOptions.onSources?: (sources: Source[]) => void`; `ChatApiClientOptions.citations?: boolean`. Task 5 passes the option and the callback.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/api/__tests__/client.citations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatApiClient } from "../client";
import type { ChatMessage, Source } from "../types";

const BASE_URL = "https://test.workers.dev";
const messages: ChatMessage[] = [{ id: "1", role: "user", content: "Prices?" }];
const pricing: Source = {
  url: "https://example.com/pricing",
  title: "Pricing",
  type: "page",
  snippet: "Plans start at $10.",
};
const faq: Source = { url: "https://example.com/faq", title: "FAQ", type: "page" };

const encoder = new TextEncoder();

function sseResponse(chunks: string[]) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "text/event-stream" }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  };
}

function jsonResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve(body),
  };
}

const sourcesFrame = `event: sources\ndata: ${JSON.stringify({ sources: [pricing] })}\n\n`;

describe("ChatApiClient citations", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function sentBody(call = 0): Record<string, unknown> {
    const init = mockFetch.mock.calls[call][1] as RequestInit;
    return JSON.parse(init.body as string);
  }

  it("sends citations: true in the JSON body of both endpoints when the option is on", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ reply: "Hi" }));
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0, citations: true });

    await client.sendMessage(messages);
    expect(sentBody(0)).toEqual({ messages, citations: true });

    await client.streamMessage(messages);
    expect(sentBody(1)).toEqual({ messages, citations: true });
  });

  it("omits the citations key entirely when the option is off", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ reply: "Hi" }));
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    await client.sendMessage(messages);
    expect(sentBody(0)).toEqual({ messages });
    expect(sentBody(0)).not.toHaveProperty("citations");
  });

  it("carries citations: true inside the multipart payload", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ reply: "Hi" }));
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0, citations: true });
    const withFile: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        content: "What is this?",
        attachments: [
          { id: "f1", name: "a.png", mediaType: "image/png", size: 1, data: "iVBORw0=" },
        ],
      },
    ];

    await client.sendMessage(withFile);

    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    const payload = JSON.parse((init.body as FormData).get("payload") as string);
    expect(payload.citations).toBe(true);
    expect(payload.messages[0].attachments[0]).not.toHaveProperty("data");
  });

  it("reports a sources event through onSources and uses it when done has none", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        sourcesFrame,
        'event: chunk\ndata: {"text":"Plans start at $10 [1]."}\n\n',
        'event: done\ndata: {"reply":"Plans start at $10 [1]."}\n\n',
      ]),
    );
    const onSources = vi.fn();
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    const result = await client.streamMessage(messages, { onSources });

    expect(onSources).toHaveBeenCalledExactlyOnceWith([pricing]);
    expect(result.sources).toEqual([pricing]);
  });

  it("prefers the sources on the done event over the early announcement", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        sourcesFrame,
        'event: chunk\ndata: {"text":"Hi"}\n\n',
        `event: done\ndata: ${JSON.stringify({ reply: "Hi", sources: [pricing, faq] })}\n\n`,
      ]),
    );
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    const result = await client.streamMessage(messages);

    expect(result.sources).toEqual([pricing, faq]);
  });

  it("keeps the announced sources on a reply the caller aborted", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(
          encoder.encode(sourcesFrame + 'event: chunk\ndata: {"text":"Partial"}\n\n'),
        );
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body,
    });
    const abort = new AbortController();
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    const result = await client.streamMessage(messages, {
      signal: abort.signal,
      onChunk: () => abort.abort(),
    });

    expect(result).toEqual({ reply: "Partial", aborted: true, sources: [pricing] });
    expect(controller).toBeDefined();
  });

  it("ignores a sources event whose data is not an array", async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        'event: sources\ndata: {"sources":"nope"}\n\n',
        'event: done\ndata: {"reply":"Hi"}\n\n',
      ]),
    );
    const onSources = vi.fn();
    const client = new ChatApiClient(BASE_URL, { debounceMs: 0 });

    const result = await client.streamMessage(messages, { onSources });

    expect(onSources).not.toHaveBeenCalled();
    expect(result.sources).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd widget && ./node_modules/.bin/vitest run src/api/__tests__/client.citations.test.ts`
Expected: FAIL. The option is not accepted (type error at runtime is not enforced, but the body lacks `citations`), `onSources` is never called, the aborted result lacks `sources`.

- [ ] **Step 3: Implement**

In `widget/src/api/types.ts`:

```ts
export interface Source {
  /** Absolute URL of the source. */
  url: string;
  /** Human-readable link title shown to the user. */
  title: string;
  /** Origin category, used to group and label the source. */
  type: "blog" | "page" | "external";
  /**
   * Short plain-text excerpt of the page, shown on its source card. About
   * 200 characters. Absent from workers that predate citations.
   */
  snippet?: string;
}

export interface ChatRequest {
  /** The full conversation so far, oldest message first. */
  messages: ChatMessage[];
  /**
   * Ask the worker to number its retrieved excerpts to match `sources` and
   * to have the model cite them as `[n]`. Sent by widgets with citations on.
   */
  citations?: boolean;
}
```

Add to `ChatStreamOptions`, after `onToolUse`:

```ts
  /**
   * Called when the worker announces the reply's sources ahead of the text,
   * so citation chips can render while the reply streams. The `done` event
   * carries the final list.
   */
  onSources?: (sources: Source[]) => void;
```

In `widget/src/api/client.ts`:

```ts
// imports: add Source to the type import from "./types"

export interface ChatApiClientOptions {
  // ...existing options...
  /**
   * Send `citations: true` with every request, asking the worker to number
   * its retrieved excerpts and have the model cite them as `[n]`.
   * @defaultValue `false`
   */
  citations?: boolean;
}

// class fields
  private readonly citations: boolean;

// constructor
    this.citations = options?.citations ?? false;
```

In `buildRequest`, add before the `needsMultipart` check and use it in both branches:

```ts
    // Widgets with citations on ask the worker to number its excerpts.
    const flags = this.citations ? { citations: true } : {};
    if (!needsMultipart) {
      return {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, ...flags }),
      };
    }
    // ...
    form.append("payload", JSON.stringify({ messages: payloadMessages, ...flags }));
```

In `readSseStream`, declare `let earlySources: Source[] | undefined;` next to `toolUses`, add a branch after the `tool` branch:

```ts
          } else if (parsed.event === "sources") {
            if (Array.isArray(parsed.data.sources)) {
              earlySources = parsed.data.sources as Source[];
              options.onSources?.(earlySources);
            }
          } else if (parsed.event === "done") {
```

change the `done` object's `sources` line to:

```ts
              sources: (Array.isArray(parsed.data.sources)
                ? parsed.data.sources
                : earlySources) as ChatStreamResult["sources"],
```

and extend the aborted return:

```ts
    if (options.signal?.aborted) {
      return {
        reply: fullText,
        aborted: true,
        ...(toolUses.length > 0 ? { toolUses } : {}),
        ...(earlySources ? { sources: earlySources } : {}),
      };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd widget && ./node_modules/.bin/vitest run src/api && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, including the existing `client.stream.test.ts` (`{ reply: "Hello!", sources: undefined }` still holds).

- [ ] **Step 5: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write src/api/types.ts src/api/client.ts src/api/__tests__/client.citations.test.ts && ./node_modules/.bin/eslint src/api && cd ..
git add widget/src/api/types.ts widget/src/api/client.ts widget/src/api/__tests__/client.citations.test.ts
git commit -m "feat(widget): request citations and read the early sources event

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `useChat` holds early sources

**Files:**
- Modify: `widget/src/hooks/useChat.ts`
- Test: `widget/src/hooks/__tests__/useChat.citations.test.ts` (create)

**Interfaces:**
- Consumes: `ChatApiClientOptions.citations`, `ChatStreamOptions.onSources` (Task 4).
- Produces: `UseChatOptions.citations?: boolean`. Task 11 passes it from `ChatWidget`.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/hooks/__tests__/useChat.citations.test.ts`:

```ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChat } from "../useChat";
import type { Source } from "../../api/types";

const API_URL = "https://test.workers.dev";
const pricing: Source = {
  url: "https://example.com/pricing",
  title: "Pricing",
  type: "page",
  snippet: "Plans start at $10.",
};
const faq: Source = { url: "https://example.com/faq", title: "FAQ", type: "page" };

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

/** Let the reader loop consume what was enqueued. */
const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

describe("useChat citations", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
  });

  it("asks the worker for citations only when the option is on", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: () => Promise.resolve({ reply: "Hi" }),
    });

    const on = renderHook(() => useChat({ apiUrl: API_URL, citations: true }));
    await act(async () => {
      await on.result.current.sendMessage("Prices?");
    });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).citations).toBe(true);

    const off = renderHook(() => useChat({ apiUrl: API_URL }));
    await act(async () => {
      await off.result.current.sendMessage("Prices?");
    });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).not.toHaveProperty("citations");
  });

  it("holds early sources until the first token, then attaches them", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL, citations: true }));

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("Prices?");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    stream.emit("sources", { sources: [pricing] });
    await settle();
    // Only the visitor's message: an announcement alone creates no bubble.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("user");

    stream.emit("chunk", { text: "Plans start at $10 [1]." });
    await settle();
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Plans start at $10 [1].",
      sources: [pricing],
    });

    stream.emit("done", { reply: "Plans start at $10 [1]." });
    stream.close();
    await act(async () => {
      await sending;
    });
    expect(result.current.messages[1].sources).toEqual([pricing]);
  });

  it("lets the done event's sources replace the early ones", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL, citations: true }));

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("Prices?");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    stream.emit("chunk", { text: "Hi" });
    stream.emit("sources", { sources: [pricing] });
    await settle();
    expect(result.current.messages[1].sources).toEqual([pricing]);

    stream.emit("done", { reply: "Hi", sources: [pricing, faq] });
    stream.close();
    await act(async () => {
      await sending;
    });
    expect(result.current.messages[1].sources).toEqual([pricing, faq]);
  });

  it("creates no message when the stream fails after the announcement", async () => {
    const stream = sseStream();
    mockFetch.mockResolvedValueOnce(stream.response);
    const { result } = renderHook(() => useChat({ apiUrl: API_URL, citations: true }));

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.sendMessage("Prices?");
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    stream.emit("sources", { sources: [pricing] });
    stream.emit("error", { error: "AI service temporarily unavailable.", code: "STREAM_ERROR" });
    stream.close();
    await act(async () => {
      await sending;
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.error).toBe("AI service temporarily unavailable.");
    expect(result.current.canRetry).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd widget && ./node_modules/.bin/vitest run src/hooks/__tests__/useChat.citations.test.ts`
Expected: the first test FAILS (no `citations` in the body); "holds early sources" FAILS (the streamed message has no `sources` until done). The last test may pass already; it pins the error path.

- [ ] **Step 3: Implement**

In `widget/src/hooks/useChat.ts`:

```ts
// type import: add Source
import type { ChatAttachment, ChatMessage, Source, StoredAttachment } from "../api/types";

interface UseChatOptions {
  // ...existing...
  /**
   * Ask the worker for numbered, citable sources with every request.
   * @defaultValue `false`
   */
  citations?: boolean;
}

export function useChat({
  // ...existing...
  citations = false,
}: UseChatOptions): UseChatReturn {
  const client = useMemo(
    () => new ChatApiClient(apiUrl, { debounceMs: 0, timeoutMs, citations }),
    [apiUrl, timeoutMs, citations],
  );
```

Inside `submit`, after `let placeholderId: string | null = null;`:

```ts
      // The worker may announce the sources before the first token. They wait
      // here until the placeholder exists, so an announcement alone never
      // creates an empty bubble.
      let earlySources: Source[] | undefined;
```

In `upsertPlaceholder`'s create branch, spread them before `patch`:

```ts
            {
              id: placeholderId,
              role: "assistant",
              content: "",
              createdAt: timestamp(),
              ...(earlySources ? { sources: earlySources } : {}),
              ...patch,
            },
```

In the `streamMessage` call, add the callback and use the fallback:

```ts
          const result = await client.streamMessage(msgsToSend, {
            signal: controller.signal,
            onChunk: (_text, fullText) =>
              upsertPlaceholder({ content: fullText }),
            onToolUse: (_toolUse, allToolUses) =>
              upsertPlaceholder({ toolUses: [...allToolUses] }),
            onSources: (announced) => {
              earlySources = announced;
              if (placeholderId !== null) {
                upsertPlaceholder({ sources: announced });
              }
            },
          });
          reply = result.reply;
          sources = result.sources ?? earlySources;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd widget && ./node_modules/.bin/vitest run src/hooks && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write src/hooks/useChat.ts src/hooks/__tests__/useChat.citations.test.ts && ./node_modules/.bin/eslint src/hooks && cd ..
git add widget/src/hooks/useChat.ts widget/src/hooks/__tests__/useChat.citations.test.ts
git commit -m "feat(widget): keep announced sources on the streaming reply

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Pure citation helpers

**Files:**
- Create: `widget/src/utils/citations.ts`
- Test: `widget/src/utils/__tests__/citations.test.ts` (create)

**Interfaces:**
- Produces (all exported from `utils/citations.ts`):
  - `interface CitationsOptions { maxSources?: number; favicons?: boolean }`
  - `type ResolvedCitationsConfig = Required<CitationsOptions>`
  - `const DEFAULT_CITATIONS_OPTIONS: ResolvedCitationsConfig` (`{ maxSources: 5, favicons: true }`)
  - `resolveCitationsConfig(input: boolean | CitationsOptions | undefined | null): ResolvedCitationsConfig | null`
  - `citationsOptionsFromAttributes(getAttribute: (name: string) => string | null): boolean | CitationsOptions | undefined`
  - `type CitationSegment = { type: "text"; value: string } | { type: "cite"; indexes: number[]; raw: string }`
  - `parseCitations(text: string, sourceCount: number): CitationSegment[]` (indexes are zero-based)
  - `stripCitationMarkers(text: string, sourceCount: number): string`
  - `hideTrailingCitationOpener(text: string): string`
  - `SNIPPET_MAX_CHARS = 200`, `truncateSnippet(text: string, maxChars?: number): string`
  - `faviconUrl(url: string): string | null`, `sourceDomain(url: string): string`

- [ ] **Step 1: Write the failing tests**

Create `widget/src/utils/__tests__/citations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CITATIONS_OPTIONS,
  citationsOptionsFromAttributes,
  faviconUrl,
  hideTrailingCitationOpener,
  parseCitations,
  resolveCitationsConfig,
  sourceDomain,
  stripCitationMarkers,
  truncateSnippet,
} from "../citations";

describe("resolveCitationsConfig", () => {
  it("is off for anything but true or an options object", () => {
    for (const value of [undefined, null, false, "true", "false", 1, 0, [], [true]]) {
      expect(resolveCitationsConfig(value as never)).toBeNull();
    }
  });

  it("uses the defaults for true and an empty object", () => {
    expect(resolveCitationsConfig(true)).toEqual({ maxSources: 5, favicons: true });
    expect(resolveCitationsConfig({})).toEqual(DEFAULT_CITATIONS_OPTIONS);
  });

  it("accepts a positive integer maxSources and falls back otherwise", () => {
    expect(resolveCitationsConfig({ maxSources: 3 })!.maxSources).toBe(3);
    for (const bad of [0, -1, 2.5, "3", NaN, Infinity]) {
      expect(resolveCitationsConfig({ maxSources: bad as never })!.maxSources).toBe(5);
    }
  });

  it("turns favicons off only for the literal false", () => {
    expect(resolveCitationsConfig({ favicons: false })!.favicons).toBe(false);
    expect(resolveCitationsConfig({ favicons: true })!.favicons).toBe(true);
    expect(resolveCitationsConfig({ favicons: "false" as never })!.favicons).toBe(true);
  });
});

describe("citationsOptionsFromAttributes", () => {
  const attrs = (map: Record<string, string>) => (name: string) =>
    name in map ? map[name] : null;

  it("is undefined when the attribute is absent", () => {
    expect(citationsOptionsFromAttributes(attrs({}))).toBeUndefined();
  });

  it.each([[""], ["true"], ["TRUE"], [" true "]])("enables for citations=%j", (value) => {
    expect(citationsOptionsFromAttributes(attrs({ citations: value }))).toBe(true);
  });

  it.each([["false"], ["False"], ["0"], ["no"], ["yes"], ["1"]])(
    "stays off for citations=%j",
    (value) => {
      expect(citationsOptionsFromAttributes(attrs({ citations: value }))).toBe(false);
    },
  );

  it("reads a positive integer max and ignores junk", () => {
    expect(
      citationsOptionsFromAttributes(attrs({ citations: "", "citations-max-sources": " 3 " })),
    ).toEqual({ maxSources: 3 });
    for (const bad of ["0", "-2", "2.5", "many", ""]) {
      expect(
        citationsOptionsFromAttributes(attrs({ citations: "", "citations-max-sources": bad })),
      ).toBe(true);
    }
  });

  it("turns favicons off for citations-favicons=false only", () => {
    expect(
      citationsOptionsFromAttributes(attrs({ citations: "", "citations-favicons": "false" })),
    ).toEqual({ favicons: false });
    expect(
      citationsOptionsFromAttributes(attrs({ citations: "", "citations-favicons": " FALSE " })),
    ).toEqual({ favicons: false });
    expect(
      citationsOptionsFromAttributes(attrs({ citations: "", "citations-favicons": "0" })),
    ).toBe(true);
  });

  it("companion attributes do nothing while citations is off", () => {
    expect(
      citationsOptionsFromAttributes(attrs({ "citations-max-sources": "3" })),
    ).toBeUndefined();
    expect(
      citationsOptionsFromAttributes(
        attrs({ citations: "false", "citations-favicons": "false" }),
      ),
    ).toBe(false);
  });
});

describe("parseCitations", () => {
  it("turns an in-range marker into a citation and keeps the text around it", () => {
    expect(parseCitations("Plans start at $10 [1].", 2)).toEqual([
      { type: "text", value: "Plans start at $10 " },
      { type: "cite", indexes: [0], raw: "[1]" },
      { type: "text", value: "." },
    ]);
  });

  it("leaves out-of-range, zero, and leading-zero markers as text", () => {
    for (const text of ["See [3].", "See [0].", "See [01].", "See [1000]."]) {
      expect(parseCitations(text, 2)).toEqual([{ type: "text", value: text }]);
    }
  });

  it("treats every marker as text when there are no sources", () => {
    expect(parseCitations("See [1].", 0)).toEqual([{ type: "text", value: "See [1]." }]);
  });

  it("returns nothing for empty text", () => {
    expect(parseCitations("", 3)).toEqual([]);
  });

  it("splits a comma group into one citation with several indexes, deduplicated", () => {
    expect(parseCitations("[1, 2,2]", 2)).toEqual([
      { type: "cite", indexes: [0, 1], raw: "[1, 2,2]" },
    ]);
  });

  it("rejects a comma group when any number is out of range", () => {
    expect(parseCitations("[1, 7]", 3)).toEqual([{ type: "text", value: "[1, 7]" }]);
  });

  it("reads adjacent markers as separate citations", () => {
    expect(parseCitations("Yes [1][3].", 3)).toEqual([
      { type: "text", value: "Yes " },
      { type: "cite", indexes: [0], raw: "[1]" },
      { type: "cite", indexes: [2], raw: "[3]" },
      { type: "text", value: "." },
    ]);
  });

  it("does not need a space before the marker", () => {
    expect(parseCitations("word[2]", 2)).toEqual([
      { type: "text", value: "word" },
      { type: "cite", indexes: [1], raw: "[2]" },
    ]);
  });

  it("leaves the outer brackets of a doubled marker as text", () => {
    expect(parseCitations("[[1]]", 1)).toEqual([
      { type: "text", value: "[" },
      { type: "cite", indexes: [0], raw: "[1]" },
      { type: "text", value: "]" },
    ]);
  });
});

describe("stripCitationMarkers", () => {
  it("removes in-range markers and the space before them", () => {
    expect(stripCitationMarkers("Plans start at $10 [1]. More [2][3].", 3)).toBe(
      "Plans start at $10. More.",
    );
  });

  it("keeps out-of-range markers and text without markers", () => {
    expect(stripCitationMarkers("See [7] and [1].", 2)).toBe("See [7] and.");
    expect(stripCitationMarkers("No markers here.", 2)).toBe("No markers here.");
  });

  it("does nothing when there are no sources", () => {
    expect(stripCitationMarkers("See [1].", 0)).toBe("See [1].");
  });
});

describe("hideTrailingCitationOpener", () => {
  it.each([
    ["Plans start at $10 [", "Plans start at $10"],
    ["Plans start at $10 [1", "Plans start at $10"],
    ["Plans start at $10 [1, ", "Plans start at $10"],
    ["Plans start at $10[1", "Plans start at $10"],
  ])("hides %j as %j", (input, expected) => {
    expect(hideTrailingCitationOpener(input)).toBe(expected);
  });

  it.each(["Plans start at $10 [1].", "Plans start at $10 [1]", "See [Pricing", "Plain text"])(
    "leaves %j alone",
    (text) => {
      expect(hideTrailingCitationOpener(text)).toBe(text);
    },
  );
});

describe("truncateSnippet", () => {
  it("collapses whitespace and keeps text within the limit", () => {
    expect(truncateSnippet("  Plans\nstart   at $10. ")).toBe("Plans start at $10.");
    const exact = "a".repeat(200);
    expect(truncateSnippet(exact)).toBe(exact);
  });

  it("cuts longer text at the last space and adds an ellipsis", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const cut = truncateSnippet(words);
    expect(cut.length).toBeLessThanOrEqual(201);
    expect(cut.endsWith("…")).toBe(true);
    expect(words.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1)).toMatch(/word\d+$/);
  });

  it("hard-cuts a single long token and drops trailing punctuation before the ellipsis", () => {
    expect(truncateSnippet("x".repeat(250))).toBe(`${"x".repeat(200)}…`);
    const text = `${"y".repeat(150)}, ${"z".repeat(100)}`;
    expect(truncateSnippet(text)).toBe(`${"y".repeat(150)}…`);
  });
});

describe("faviconUrl and sourceDomain", () => {
  it("points at /favicon.ico on the source origin", () => {
    expect(faviconUrl("https://example.com/pricing?x=1#top")).toBe(
      "https://example.com/favicon.ico",
    );
    expect(faviconUrl("http://docs.example.com:8080/a/b")).toBe(
      "http://docs.example.com:8080/favicon.ico",
    );
  });

  it("returns null for non-http schemes and garbage", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "ftp://x.com/a", "nope", ""]) {
      expect(faviconUrl(url)).toBeNull();
    }
  });

  it("gives the hostname, or the input when it is not a URL", () => {
    expect(sourceDomain("https://docs.example.com/a")).toBe("docs.example.com");
    expect(sourceDomain("not a url")).toBe("not a url");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd widget && ./node_modules/.bin/vitest run src/utils/__tests__/citations.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `widget/src/utils/citations.ts`:

```ts
/**
 * Inline citations. Pass to {@link ChatWidget} via the `citations` prop (or
 * `true` for the defaults). `[n]` markers in a grounded reply become chips
 * and its sources become a footer of cards.
 */
export interface CitationsOptions {
  /**
   * Source cards shown before the "Show all" control. Positive integer.
   * @defaultValue `5`
   */
  maxSources?: number;
  /**
   * Show each source's favicon, fetched from `/favicon.ico` on the source's
   * own origin with no referrer. Set to `false` to make no such requests.
   * @defaultValue `true`
   */
  favicons?: boolean;
}

/** {@link CitationsOptions} with every field filled in. */
export type ResolvedCitationsConfig = Required<CitationsOptions>;

/** Defaults applied when citations are enabled with `true` or a partial config. */
export const DEFAULT_CITATIONS_OPTIONS: ResolvedCitationsConfig = {
  maxSources: 5,
  favicons: true,
};

/**
 * Turn the `citations` prop into a full config, or `null` when citations are
 * off. Fails closed: only `true` or a plain object enables them, so a
 * templated string such as `"false"` cannot.
 */
export function resolveCitationsConfig(
  input: boolean | CitationsOptions | undefined | null,
): ResolvedCitationsConfig | null {
  const isOptions =
    typeof input === "object" && input !== null && !Array.isArray(input);
  if (input !== true && !isOptions) return null;
  const options: CitationsOptions = input === true ? {} : input;
  const max = options.maxSources;
  return {
    maxSources:
      typeof max === "number" && Number.isInteger(max) && max >= 1
        ? max
        : DEFAULT_CITATIONS_OPTIONS.maxSources,
    favicons: options.favicons !== false,
  };
}

/**
 * Build the `citations` option from `<claudius-chat>` attributes. `citations`
 * switches it on only when present with no value or `"true"` (trimmed, any
 * case), like `conversation-export`; `citations-max-sources` takes a positive
 * integer and `citations-favicons="false"` turns favicons off.
 */
export function citationsOptionsFromAttributes(
  getAttribute: (name: string) => string | null,
): boolean | CitationsOptions | undefined {
  const raw = getAttribute("citations");
  if (raw === null) return undefined;
  const value = raw.trim().toLowerCase();
  if (value !== "" && value !== "true") return false;

  const options: CitationsOptions = {};
  const max = getAttribute("citations-max-sources");
  if (max !== null && /^\s*\d+\s*$/.test(max)) {
    const parsed = Number(max);
    if (parsed >= 1) options.maxSources = parsed;
  }
  const favicons = getAttribute("citations-favicons");
  if (favicons !== null && favicons.trim().toLowerCase() === "false") {
    options.favicons = false;
  }
  return Object.keys(options).length > 0 ? options : true;
}

/** One piece of a text run: plain text, or a group of citation markers. */
export type CitationSegment =
  | { type: "text"; value: string }
  | {
      type: "cite";
      /** Zero-based source indexes, in the order written, without repeats. */
      indexes: number[];
      /** The marker as written, e.g. `"[1, 3]"`. */
      raw: string;
    };

// `[1]`, `[12]`, `[1, 3]`: one to three digits, no leading zero. Models write
// both `[1][3]` and `[1, 3]`, so a comma list is one group.
const CITATION_GROUP = /\[([1-9]\d{0,2}(?:\s*,\s*[1-9]\d{0,2})*)\]/g;

/**
 * Split text into plain runs and citation groups. A group counts only when
 * every number is between 1 and `sourceCount`; anything else stays text, so
 * `[7]` with three sources, `[0]`, and every bracket in a reply without
 * sources render as written.
 */
export function parseCitations(
  text: string,
  sourceCount: number,
): CitationSegment[] {
  if (!text) return [];
  if (sourceCount <= 0 || !text.includes("[")) {
    return [{ type: "text", value: text }];
  }
  const segments: CitationSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION_GROUP)) {
    const numbers = match[1].split(",").map((n) => Number(n.trim()));
    if (numbers.some((n) => n > sourceCount)) continue;
    const start = match.index ?? 0;
    if (start > last) {
      segments.push({ type: "text", value: text.slice(last, start) });
    }
    segments.push({
      type: "cite",
      indexes: [...new Set(numbers)].map((n) => n - 1),
      raw: match[0],
    });
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
}

/**
 * Text without its citation markers, for screen-reader announcements and
 * read-aloud: the marker goes, and so does the space before it.
 */
export function stripCitationMarkers(text: string, sourceCount: number): string {
  let out = "";
  for (const segment of parseCitations(text, sourceCount)) {
    if (segment.type === "text") out += segment.value;
    else out = out.replace(/[ \t]+$/, "");
  }
  return out;
}

/**
 * Hide an unfinished marker at the very end of streaming text (`[`, `[1`,
 * `[1, `), the way the bold stabilizer hides a bare `**`. The characters
 * return with the next token.
 */
export function hideTrailingCitationOpener(text: string): string {
  return text.replace(/[ \t]?\[[\d,\s]*$/, "");
}

/** Longest snippet a card shows; the worker applies the same cut. */
export const SNIPPET_MAX_CHARS = 200;

/**
 * Collapse whitespace and cut at the last space before `maxChars` (hard when
 * there is none), adding an ellipsis. A no-op for snippets the worker
 * already cut; protects against long ones from plugins or custom workers.
 */
export function truncateSnippet(
  text: string,
  maxChars: number = SNIPPET_MAX_CHARS,
): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,;:]+$/,
    "",
  );
  return `${head}…`;
}

/** `/favicon.ico` on the source's origin, or null unless the URL is http(s). */
export function faviconUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

/** The hostname shown under a card's title, or the input when it is not a URL. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd widget && ./node_modules/.bin/vitest run src/utils/__tests__/citations.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write src/utils/citations.ts src/utils/__tests__/citations.test.ts && ./node_modules/.bin/eslint src/utils && cd ..
git add widget/src/utils/citations.ts widget/src/utils/__tests__/citations.test.ts
git commit -m "feat(widget): pure helpers for citation markers and the citations option

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Strings

**Files:**
- Modify: `widget/src/i18n.ts`
- Modify: `widget/src/locales/en.ts`, `widget/src/locales/es.ts`, `widget/src/locales/fr.ts`, `widget/src/locales/de.ts`
- Test: `widget/src/locales/__tests__/parity.test.ts` (existing; it fails while the locales disagree)

**Interfaces:**
- Produces: `ClaudiusTranslations.sources`, `.showAllSources` (takes `{count}`), `.showFewerSources`, `.citation` (takes `{n}` and `{title}`), `.opensInNewTab`. Tasks 8 to 10 read them.

- [ ] **Step 1: Add the keys to the interface and to English only**

In `widget/src/i18n.ts`, after `transcriptSources: string;`:

```ts
  /** Label of the sources footer under a cited reply, and of its list. */
  sources: string;
  /** Button that reveals the remaining source cards; supports `{count}`. */
  showAllSources: string;
  /** Button that hides the extra source cards again. */
  showFewerSources: string;
  /** Accessible name of a citation chip; supports `{n}` and `{title}`. */
  citation: string;
  /** Visually hidden hint appended to links that open a new tab. */
  opensInNewTab: string;
```

In `widget/src/locales/en.ts`, after `transcriptSources: "Sources:",`:

```ts

  // Citations
  sources: "Sources",
  showAllSources: "Show all ({count})",
  showFewerSources: "Show fewer",
  citation: "Source {n}: {title}",
  opensInNewTab: "(opens in a new tab)",
```

- [ ] **Step 2: Run the parity test and typecheck to verify they fail**

Run: `cd widget && ./node_modules/.bin/vitest run src/locales && ./node_modules/.bin/tsc --noEmit`
Expected: the parity test FAILS naming the five keys missing from es, fr, de; `tsc` reports the three locale objects as missing properties.

- [ ] **Step 3: Add the translations**

`widget/src/locales/es.ts`, after `transcriptSources: "Fuentes:",`:

```ts

  // Citations
  sources: "Fuentes",
  showAllSources: "Mostrar todas ({count})",
  showFewerSources: "Mostrar menos",
  citation: "Fuente {n}: {title}",
  opensInNewTab: "(se abre en una pestaña nueva)",
```

`widget/src/locales/fr.ts`, after `transcriptSources: "Sources :",` (French puts a space before the colon):

```ts

  // Citations
  sources: "Sources",
  showAllSources: "Tout afficher ({count})",
  showFewerSources: "Afficher moins",
  citation: "Source {n} : {title}",
  opensInNewTab: "(s'ouvre dans un nouvel onglet)",
```

`widget/src/locales/de.ts`, after `transcriptSources: "Quellen:",`:

```ts

  // Citations
  sources: "Quellen",
  showAllSources: "Alle anzeigen ({count})",
  showFewerSources: "Weniger anzeigen",
  citation: "Quelle {n}: {title}",
  opensInNewTab: "(öffnet in einem neuen Tab)",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd widget && ./node_modules/.bin/vitest run src/locales && ./node_modules/.bin/tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write src/i18n.ts src/locales/en.ts src/locales/es.ts src/locales/fr.ts src/locales/de.ts && ./node_modules/.bin/eslint src/i18n.ts src/locales && cd ..
git add widget/src/i18n.ts widget/src/locales/en.ts widget/src/locales/es.ts widget/src/locales/fr.ts widget/src/locales/de.ts
git commit -m "feat(widget): strings for citation chips and the sources footer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The `SourceCards` footer

**Files:**
- Create: `widget/src/components/SourceCards.tsx`
- Test: `widget/src/components/__tests__/SourceCards.test.tsx` (create)

**Interfaces:**
- Consumes: `Source` (Task 4), `faviconUrl`, `sourceDomain`, `truncateSnippet` (Task 6), `interpolate`, `sanitizeUrl`.
- Produces: `SourceCards` (memo component) with props `{ sources: Source[]; maxSources: number; favicons: boolean; labels: SourceCardsLabels; reveal?: SourceReveal | null }`; `interface SourceCardsLabels { sources: string; showAllSources: string; showFewerSources: string; opensInNewTab: string }`; `interface SourceReveal { index: number; key: number }`. Task 9 renders it and drives `reveal`.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/components/__tests__/SourceCards.test.tsx`:

```tsx
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { SourceCards } from "../SourceCards";
import type { Source } from "../../api/types";

const labels = {
  sources: "Sources",
  showAllSources: "Show all ({count})",
  showFewerSources: "Show fewer",
  opensInNewTab: "(opens in a new tab)",
};

function source(n: number, overrides: Partial<Source> = {}): Source {
  return {
    url: `https://example.com/page-${n}`,
    title: `Page ${n}`,
    type: "page",
    snippet: `Snippet ${n}.`,
    ...overrides,
  };
}

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => source(i + 1));

type Props = React.ComponentProps<typeof SourceCards>;

function renderCards(props: Partial<Props> = {}) {
  const all: Props = {
    sources: many(2),
    maxSources: 5,
    favicons: true,
    labels,
    ...props,
  };
  const view = render(<SourceCards {...all} />);
  return {
    ...view,
    rerender: (next: Partial<Props>) =>
      view.rerender(<SourceCards {...all} {...next} />),
  };
}

const toggle = () => screen.getByRole("button", { name: /Sources/ });

describe("SourceCards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts collapsed, with the count on the toggle", () => {
    renderCards();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveTextContent("2");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("expands to an ordered list of cards and collapses again", async () => {
    const user = userEvent.setup();
    renderCards();
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Sources" });
    expect(list.tagName).toBe("OL");
    expect(toggle()).toHaveAttribute("aria-controls", list.id);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await user.click(toggle());
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows the title link, snippet, and domain on a card", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1)] });
    await user.click(toggle());
    const link = screen.getByRole("link", {
      name: "Page 1 (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://example.com/page-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Snippet 1.")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("renders no snippet paragraph when the source has none", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1, { snippet: undefined })] });
    await user.click(toggle());
    const card = screen.getByRole("listitem");
    // Only the domain line is left.
    expect(card.querySelectorAll("p")).toHaveLength(1);
    expect(card).toHaveTextContent("example.com");
  });

  it("cuts a long snippet to 200 characters", async () => {
    const user = userEvent.setup();
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    renderCards({ sources: [source(1, { snippet: words })] });
    await user.click(toggle());
    const snippet = screen.getByText(/^word0 /);
    expect(snippet.textContent!.length).toBeLessThanOrEqual(201);
    expect(snippet.textContent!.endsWith("…")).toBe(true);
  });

  it("keeps a numbered card, without a link or favicon, for an unsafe URL", async () => {
    const user = userEvent.setup();
    renderCards({
      sources: [source(1), source(2, { url: "javascript:alert(1)", title: "Bad" })],
    });
    await user.click(toggle());
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[1]).toHaveTextContent("Bad");
    expect(within(cards[1]).queryByRole("link")).toBeNull();
    expect(cards[1].querySelector("img")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("requests the favicon from the source origin without a referrer, and falls back on error", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1)] });
    await user.click(toggle());
    const card = screen.getByRole("listitem");
    const img = card.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://example.com/favicon.ico");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("alt", "");
    // The external-link icon is the only svg while the favicon shows.
    expect(card.querySelectorAll("svg")).toHaveLength(1);

    fireEvent.error(img);

    expect(card.querySelector("img")).toBeNull();
    // Now the generic icon too.
    expect(card.querySelectorAll("svg")).toHaveLength(2);
  });

  it("requests no favicon when favicons is off", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1)], favicons: false });
    await user.click(toggle());
    const card = screen.getByRole("listitem");
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelectorAll("svg")).toHaveLength(2);
  });

  it("shows only maxSources cards until Show all, then all, then fewer again", async () => {
    const user = userEvent.setup();
    renderCards({ sources: many(7), maxSources: 5 });
    await user.click(toggle());
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    const more = screen.getByRole("button", { name: "Show all (7)" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    await user.click(fewer);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("offers no Show all when every card already fits", async () => {
    const user = userEvent.setup();
    renderCards({ sources: many(5), maxSources: 5 });
    await user.click(toggle());
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("a reveal opens the footer, scrolls to the card, focuses and highlights it", () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const { rerender } = renderCards({ sources: many(3), reveal: null });
    expect(screen.queryByRole("list")).toBeNull();

    rerender({ reveal: { index: 1, key: 1 } });

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(cards[1]).toHaveFocus();
    expect(cards[1]).toHaveAttribute("data-highlight", "true");
    expect(cards[0]).not.toHaveAttribute("data-highlight");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(cards[1]);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("a reveal past the cut shows all cards first", () => {
    const { rerender } = renderCards({ sources: many(7), maxSources: 5, reveal: null });
    rerender({ reveal: { index: 6, key: 1 } });
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(7);
    expect(cards[6]).toHaveFocus();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
  });

  it("scrolls instantly when the visitor prefers reduced motion", () => {
    // Same override as the theme=auto test: the setup file defines
    // matchMedia as a writable, non-configurable property, which spyOn
    // cannot replace but defineProperty can.
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    try {
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      const { rerender } = renderCards({ reveal: null });
      rerender({ reveal: { index: 0, key: 1 } });
      expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
    } finally {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: original,
      });
    }
  });

  it("clears the highlight after 1.5 seconds and flashes again on a new reveal", () => {
    vi.useFakeTimers();
    const { rerender } = renderCards({ reveal: null });
    rerender({ reveal: { index: 0, key: 1 } });
    const card = () => screen.getAllByRole("listitem")[0];
    expect(card()).toHaveAttribute("data-highlight", "true");

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(card()).toHaveAttribute("data-highlight", "true");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(card()).not.toHaveAttribute("data-highlight");

    rerender({ reveal: { index: 0, key: 2 } });
    expect(card()).toHaveAttribute("data-highlight", "true");
    expect(card()).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd widget && ./node_modules/.bin/vitest run src/components/__tests__/SourceCards.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `widget/src/components/SourceCards.tsx`:

```tsx
import { forwardRef, memo, useEffect, useId, useRef, useState } from "react";
import type { Source } from "../api/types";
import { sanitizeUrl } from "../utils/sanitize";
import { interpolate } from "../utils/interpolate";
import { faviconUrl, sourceDomain, truncateSnippet } from "../utils/citations";

/** The strings the footer is rendered with. */
export interface SourceCardsLabels {
  /** Footer toggle text and the list's accessible name. */
  sources: string;
  /** Reveals the remaining cards; takes `{count}`. */
  showAllSources: string;
  /** Hides the extra cards again. */
  showFewerSources: string;
  /** Visually hidden hint appended to each card's link. */
  opensInNewTab: string;
}

/** A request to open the footer and bring one card into view and focus. */
export interface SourceReveal {
  /** Zero-based source index. */
  index: number;
  /** Changes on every request, so the same card can be revealed twice. */
  key: number;
}

interface SourceCardsProps {
  sources: Source[];
  /** Cards shown before the "Show all" control. */
  maxSources: number;
  /** Fetch `/favicon.ico` from each source's origin. */
  favicons: boolean;
  labels: SourceCardsLabels;
  /** Set by a citation chip; each new `key` reveals its card again. */
  reveal?: SourceReveal | null;
}

const HIGHLIGHT_MS = 1500;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

const BADGE_CLASS =
  "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-claudius-full bg-claudius-accent px-1 text-[10px] font-bold leading-none text-claudius-accent-text";

interface SourceCardProps {
  source: Source;
  /** One-based, matching the chips in the reply. */
  number: number;
  favicons: boolean;
  labels: SourceCardsLabels;
  highlighted: boolean;
}

const SourceCard = forwardRef<HTMLLIElement, SourceCardProps>(
  function SourceCard({ source, number, favicons, labels, highlighted }, ref) {
    // An unsafe URL still gets a card, so the numbering holds, but no link.
    const safeUrl = sanitizeUrl(source.url);
    const [iconFailed, setIconFailed] = useState(false);
    const icon = favicons && safeUrl ? faviconUrl(safeUrl) : null;
    const snippet = source.snippet ? truncateSnippet(source.snippet) : "";

    return (
      <li
        ref={ref}
        tabIndex={-1}
        data-highlight={highlighted || undefined}
        className={`flex gap-2 rounded-claudius-md border bg-claudius-surface-muted p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent ${
          highlighted
            ? "border-claudius-accent ring-2 ring-claudius-accent"
            : "border-claudius-border"
        }`}
      >
        <span aria-hidden="true" className={`mt-0.5 ${BADGE_CLASS}`}>
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {icon && !iconFailed ? (
              <img
                src={icon}
                alt=""
                width={14}
                height={14}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setIconFailed(true)}
                className="h-3.5 w-3.5 shrink-0 rounded-sm"
              />
            ) : (
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
                className="shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            )}
            {safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-medium text-claudius-text hover:underline"
              >
                {source.title}
                <span className="sr-only"> {labels.opensInNewTab}</span>
              </a>
            ) : (
              <span className="truncate font-medium text-claudius-text">
                {source.title}
              </span>
            )}
            {safeUrl && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
            )}
          </div>
          {snippet && <p className="mt-0.5">{snippet}</p>}
          {safeUrl && <p className="mt-0.5 truncate">{sourceDomain(safeUrl)}</p>}
        </div>
      </li>
    );
  },
);

/**
 * Collapsible "Sources" footer under a cited reply: one card per source with
 * favicon, title link, snippet, and domain. A `reveal` request from a chip
 * opens it, shows the whole list when the card is past `maxSources`, scrolls
 * the card into view, focuses it, and flashes a ring around it.
 */
export const SourceCards = memo(function SourceCards({
  sources,
  maxSources,
  favicons,
  labels,
  reveal = null,
}: SourceCardsProps) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<SourceReveal | null>(null);
  const [highlighted, setHighlighted] = useState<SourceReveal | null>(null);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());

  // A reveal opens the footer and, when the card is past the cut, the whole
  // list. The scroll and focus wait for the render that adds the card.
  useEffect(() => {
    if (!reveal) return;
    setPending(reveal);
    setExpanded(true);
    if (reveal.index >= maxSources) setShowAll(true);
  }, [reveal, maxSources]);

  useEffect(() => {
    if (!pending) return;
    const card = cardRefs.current.get(pending.index);
    if (!card) return;
    if (typeof card.scrollIntoView === "function") {
      card.scrollIntoView({
        block: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
    card.focus({ preventScroll: true });
    setHighlighted(pending);
    setPending(null);
  }, [pending]);

  // The ring is a flash, not a state. A second reveal of the same card is a
  // new object, so the timer restarts.
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  const count = sources.length;
  const visible = showAll ? sources : sources.slice(0, maxSources);

  return (
    <div className="mt-1 text-xs text-claudius-text-muted">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        className="flex items-center gap-1.5 rounded-claudius-full border border-claudius-border bg-claudius-surface px-2 py-0.5 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent"
      >
        <svg
          width="11"
          height="11"
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
        <span>{labels.sources}</span>
        <span className={BADGE_CLASS}>{count}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={expanded ? "rotate-180" : undefined}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <>
          <ol id={listId} aria-label={labels.sources} className="mt-1 space-y-1.5">
            {visible.map((source, index) => (
              <SourceCard
                key={`${index}-${source.url}`}
                ref={(el) => {
                  if (el) cardRefs.current.set(index, el);
                  else cardRefs.current.delete(index);
                }}
                source={source}
                number={index + 1}
                favicons={favicons}
                labels={labels}
                highlighted={highlighted?.index === index}
              />
            ))}
          </ol>
          {count > maxSources && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-1 font-medium text-claudius-link underline hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent"
            >
              {showAll
                ? labels.showFewerSources
                : interpolate(labels.showAllSources, { count })}
            </button>
          )}
        </>
      )}
    </div>
  );
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd widget && ./node_modules/.bin/vitest run src/components/__tests__/SourceCards.test.tsx && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint src/components/SourceCards.tsx`
Expected: PASS, no type or lint errors. If `jsx-a11y/no-noninteractive-tabindex` fires on the `<li tabIndex={-1}>`, the plugin version differs from the one checked; a negative `tabIndex` is meant to be allowed, so fix the rule's options rather than the markup only if you have confirmed the rule's documentation says so.

- [ ] **Step 5: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write src/components/SourceCards.tsx src/components/__tests__/SourceCards.test.tsx && ./node_modules/.bin/eslint src/components/SourceCards.tsx src/components/__tests__/SourceCards.test.tsx && cd ..
git add widget/src/components/SourceCards.tsx widget/src/components/__tests__/SourceCards.test.tsx
git commit -m "feat(widget): collapsible source-card footer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Citation chips in `ChatMessage`

**Files:**
- Modify: `widget/src/components/ChatMessage.tsx`
- Test: `widget/src/components/__tests__/ChatMessage.citations.test.tsx` (create)

**Interfaces:**
- Consumes: `SourceCards`, `SourceCardsLabels`, `SourceReveal` (Task 8); `parseCitations`, `hideTrailingCitationOpener`, `ResolvedCitationsConfig` (Task 6); `interpolate`.
- Produces: `ChatMessage` props `citations?: MessageCitations` and `linkNewTabLabel?: string`, where `export interface MessageCitations extends ResolvedCitationsConfig { labels: SourceCardsLabels & { citation: string } }`. Task 10 builds that object.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/components/__tests__/ChatMessage.citations.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatMessage, type MessageCitations } from "../ChatMessage";
import type { Source } from "../../api/types";

const sources: Source[] = [
  {
    url: "https://example.com/pricing",
    title: "Pricing",
    type: "page",
    snippet: "Plans start at $10 a month.",
  },
  { url: "https://example.com/faq", title: "FAQ", type: "page" },
];

const citations: MessageCitations = {
  maxSources: 5,
  favicons: false,
  labels: {
    sources: "Sources",
    showAllSources: "Show all ({count})",
    showFewerSources: "Show fewer",
    citation: "Source {n}: {title}",
    opensInNewTab: "(opens in a new tab)",
  },
};

type Props = React.ComponentProps<typeof ChatMessage>;

function renderCited(content: string, props: Partial<Props> = {}) {
  return render(
    <ChatMessage
      role="assistant"
      content={content}
      sources={sources}
      citations={citations}
      {...props}
    />,
  );
}

describe("ChatMessage citations", () => {
  it("renders an in-range marker as a chip named after its source", () => {
    renderCited("Plans start at $10 [1].");
    const chip = screen.getByRole("button", { name: "Source 1: Pricing" });
    expect(chip).toHaveTextContent("1");
    expect(chip).toHaveAttribute("title", "Pricing");
    expect(screen.queryByText(/\[1\]/)).toBeNull();
    expect(screen.getByText(/Plans start at \$10/)).toBeInTheDocument();
  });

  it("leaves out-of-range, zero, and leading-zero markers as text", () => {
    renderCited("See [3], [0] and [01].");
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    expect(screen.getByText("See [3], [0] and [01].")).toBeInTheDocument();
  });

  it("renders a chip inside bold text", () => {
    renderCited("**Plans start at $10 [1]**");
    const chip = screen.getByRole("button", { name: "Source 1: Pricing" });
    expect(chip.closest("strong")).not.toBeNull();
  });

  it("renders each number of a group as its own chip", () => {
    renderCited("Both apply [1, 2].");
    expect(screen.getByRole("button", { name: "Source 1: Pricing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source 2: FAQ" })).toBeInTheDocument();
  });

  it("renders no chips and no footer without the citations prop, keeping the source icon", () => {
    render(
      <ChatMessage
        role="assistant"
        content="Plans start at $10 [1]."
        sources={sources}
        onSourceClick={vi.fn()}
        isSourceActive={false}
      />,
    );
    expect(screen.getByText("Plans start at $10 [1].")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sources/ })).toBeNull();
    expect(screen.getByRole("button", { name: /view sources/i })).toBeInTheDocument();
  });

  it("replaces the source icon with the footer when citations are on", () => {
    renderCited("Plans start at $10 [1].", {
      onSourceClick: vi.fn(),
      isSourceActive: false,
    });
    expect(screen.queryByRole("button", { name: /view sources/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^Sources/ })).toBeInTheDocument();
  });

  it("renders no chips for a user message", () => {
    render(
      <ChatMessage role="user" content="I read [1]." sources={sources} citations={citations} />,
    );
    expect(screen.getByText("I read [1].")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the footer, collapsed, even when the reply cites nothing", () => {
    renderCited("Plans start at $10.");
    expect(screen.getByRole("button", { name: /^Sources/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
  });

  it("a chip click opens the footer and focuses the matching card", async () => {
    const user = userEvent.setup();
    renderCited("Plans start at $10 [1]. See the FAQ [2].");
    await user.click(screen.getByRole("button", { name: "Source 2: FAQ" }));
    expect(screen.getByRole("button", { name: /^Sources/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[1]).toHaveFocus();
    expect(cards[1]).toHaveTextContent("FAQ");
  });

  it("clicking the same chip again focuses the card again", async () => {
    const user = userEvent.setup();
    renderCited("Plans start at $10 [1].");
    const chip = screen.getByRole("button", { name: "Source 1: Pricing" });
    await user.click(chip);
    const card = screen.getByRole("listitem");
    expect(card).toHaveFocus();
    chip.focus();
    expect(card).not.toHaveFocus();
    await user.click(chip);
    expect(card).toHaveFocus();
  });

  it("hides an unfinished marker at the end of a streaming reply", () => {
    const { rerender } = render(
      <ChatMessage
        role="assistant"
        content="Plans start at $10 [1"
        isStreaming
        sources={sources}
        citations={citations}
      />,
    );
    expect(screen.getByText("Plans start at $10")).toBeInTheDocument();
    expect(screen.queryByText(/\[1/)).toBeNull();

    rerender(
      <ChatMessage
        role="assistant"
        content="Plans start at $10 [1"
        sources={sources}
        citations={citations}
      />,
    );
    expect(screen.getByText("Plans start at $10 [1")).toBeInTheDocument();
  });

  it("keeps a trailing bracket while streaming a reply without sources", () => {
    render(<ChatMessage role="assistant" content="See [1" isStreaming citations={citations} />);
    expect(screen.getByText("See [1")).toBeInTheDocument();
  });

  it("announces new-tab links with the given label", () => {
    render(
      <ChatMessage
        role="assistant"
        content="Visit https://example.com/a now"
        linkNewTabLabel="(ouvre un nouvel onglet)"
      />,
    );
    expect(
      screen.getByRole("link", { name: "example.com/a (ouvre un nouvel onglet)" }),
    ).toBeInTheDocument();
  });

  it("links a URL inside bold text", () => {
    render(<ChatMessage role="assistant" content="**See https://example.com/a**" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.com/a");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd widget && ./node_modules/.bin/vitest run src/components/__tests__/ChatMessage.citations.test.tsx`
Expected: FAIL. `MessageCitations` does not exist; no chips render.

- [ ] **Step 3: Implement**

In `widget/src/components/ChatMessage.tsx`, change the imports:

```tsx
import { Fragment, memo, useRef, useState, type ReactNode } from "react";
import { SourceIcon } from "./SourceIcon";
import {
  SourceCards,
  type SourceCardsLabels,
  type SourceReveal,
} from "./SourceCards";
import { AttachmentPreview } from "./AttachmentPreview";
import {
  MessageSpeechControls,
  type MessageSpeechState,
} from "./MessageSpeechControls";
import type { ChatAttachment, Source, ToolUse } from "../api/types";
import { sanitizeUrl } from "../utils/sanitize";
import { stabilizeStreamingMarkdown } from "../utils/stabilizeStreamingMarkdown";
import {
  hideTrailingCitationOpener,
  parseCitations,
  type ResolvedCitationsConfig,
} from "../utils/citations";
import { interpolate } from "../utils/interpolate";
```

Add the props and the exported type:

```tsx
/** Citation rendering for one message: the resolved option plus its strings. */
export interface MessageCitations extends ResolvedCitationsConfig {
  labels: SourceCardsLabels & {
    /** Accessible name of a chip; takes `{n}` and `{title}`. */
    citation: string;
  };
}

interface ChatMessageProps {
  // ...existing props...
  /**
   * Render `[n]` markers as chips and the sources as a card footer. Omit to
   * keep the source icon and sidebar.
   */
  citations?: MessageCitations;
  /** Visually hidden hint appended to links that open a new tab. */
  linkNewTabLabel?: string;
}
```

Replace everything from `const URL_REGEX` through the end of `renderFormattedContent` with:

```tsx
const URL_REGEX = /(https?:\/\/[^\s)]+)/;
const BOLD_REGEX = /(\*\*[^*]+\*\*)/;
const ITALIC_REGEX = /(\*[^*]+\*)/;

/** Everything the inline renderer needs beyond the text itself. */
interface RenderContext {
  /** Visually hidden hint appended to links that open a new tab. */
  newTabLabel: string;
  /** Present only when `[n]` markers should become chips. */
  citations?: CitationContext;
}

interface CitationContext {
  sources: Source[];
  /** Chip accessible name; takes `{n}` and `{title}`. */
  label: string;
  onCite: (index: number) => void;
}

function renderLink(rawUrl: string, key: string, ctx: RenderContext): ReactNode {
  // Strip trailing punctuation that's likely not part of the URL
  const trailingPunct = rawUrl.match(/[.,;:!?'"]+$/);
  const url = trailingPunct
    ? rawUrl.slice(0, -trailingPunct[0].length)
    : rawUrl;
  const suffix = trailingPunct ? trailingPunct[0] : "";

  // Validate URL scheme to prevent javascript:, data:, vbscript: attacks
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) {
    // If URL is not safe, render as plain text
    return rawUrl;
  }

  return (
    <Fragment key={key}>
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium hover:opacity-80 text-claudius-link"
      >
        {safeUrl.replace(/^https?:\/\//, "")}
        <span className="sr-only"> {ctx.newTabLabel}</span>
      </a>
      {suffix}
    </Fragment>
  );
}

/** `[n]` markers become chips; everything else stays text. */
function renderCitations(
  text: string,
  keyPrefix: string,
  ctx: RenderContext,
): ReactNode[] {
  const cites = ctx.citations;
  if (!cites) return text ? [text] : [];
  return parseCitations(text, cites.sources.length).map((segment, index) => {
    if (segment.type === "text") return segment.value;
    return (
      <span key={`${keyPrefix}-c${index}`} className="inline-flex gap-0.5 align-super">
        {segment.indexes.map((sourceIndex) => (
          <button
            key={sourceIndex}
            type="button"
            onClick={() => cites.onCite(sourceIndex)}
            aria-label={interpolate(cites.label, {
              n: sourceIndex + 1,
              title: cites.sources[sourceIndex].title,
            })}
            title={cites.sources[sourceIndex].title}
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-claudius-full bg-claudius-accent px-1 text-[10px] font-semibold leading-none text-claudius-accent-text hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent focus-visible:ring-offset-1"
          >
            {sourceIndex + 1}
          </button>
        ))}
      </span>
    );
  });
}

/** Text with no bold or italic left in it: links first, then citation chips. */
function renderLeaf(text: string, keyPrefix: string, ctx: RenderContext): ReactNode[] {
  const result: ReactNode[] = [];
  text.split(URL_REGEX).forEach((part, index) => {
    if (URL_REGEX.test(part)) {
      result.push(renderLink(part, `${keyPrefix}-u${index}`, ctx));
    } else if (part) {
      result.push(...renderCitations(part, `${keyPrefix}-u${index}`, ctx));
    }
  });
  return result;
}

function renderInlineFormatting(
  text: string,
  keyPrefix: string,
  ctx: RenderContext,
): ReactNode[] {
  const result: ReactNode[] = [];
  text.split(BOLD_REGEX).forEach((part, bIdx) => {
    if (BOLD_REGEX.test(part)) {
      // Strip the ** markers; the inside still gets links and chips.
      result.push(
        <strong key={`${keyPrefix}-b${bIdx}`}>
          {renderLeaf(part.slice(2, -2), `${keyPrefix}-b${bIdx}`, ctx)}
        </strong>,
      );
      return;
    }
    part.split(ITALIC_REGEX).forEach((iPart, iIdx) => {
      const key = `${keyPrefix}-b${bIdx}-i${iIdx}`;
      if (ITALIC_REGEX.test(iPart)) {
        result.push(<em key={key}>{renderLeaf(iPart.slice(1, -1), key, ctx)}</em>);
      } else {
        result.push(...renderLeaf(iPart, key, ctx));
      }
    });
  });
  return result;
}

function renderFormattedContent(content: string, ctx: RenderContext): ReactNode[] {
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => (
    <span key={lineIndex}>
      {renderInlineFormatting(line, `l${lineIndex}`, ctx)}
      {lineIndex < lines.length - 1 && <br />}
    </span>
  ));
}
```

In the component, destructure the new props (`citations`, `linkNewTabLabel = "(opens in a new tab)"`) and replace the body's opening lines up to `showBubble` with:

```tsx
  const isUser = role === "user";
  const [reveal, setReveal] = useState<SourceReveal | null>(null);
  const revealCount = useRef(0);
  // Chips and the footer need both the option and something to cite.
  const cited =
    !isUser && citations && sources && sources.length > 0
      ? { config: citations, sources }
      : null;
  const hasAttachments = !!attachments && attachments.length > 0;
  const streamed = isStreaming ? stabilizeStreamingMarkdown(content) : content;
  // A half-typed `[1` would flash as text before its chip; hide it like the
  // bold stabilizer hides a bare `**`.
  const displayContent =
    isStreaming && cited ? hideTrailingCitationOpener(streamed) : streamed;
  const renderContext: RenderContext = {
    newTabLabel: linkNewTabLabel,
    citations: cited
      ? {
          sources: cited.sources,
          label: cited.config.labels.citation,
          onCite: (index) => {
            revealCount.current += 1;
            setReveal({ index, key: revealCount.current });
          },
        }
      : undefined,
  };
  // While a tool runs before any reply text streams in, there is nothing to
  // put in a bubble yet — show only the tool chips.
  const showBubble = isUser || content !== "" || !toolUses?.length;
```

Change the render call to `renderFormattedContent(displayContent, renderContext)`, and replace the `SourceIcon` block with:

```tsx
      {cited ? (
        <SourceCards
          sources={cited.sources}
          maxSources={cited.config.maxSources}
          favicons={cited.config.favicons}
          labels={cited.config.labels}
          reveal={reveal}
        />
      ) : (
        !isUser &&
        sources &&
        sources.length > 0 &&
        onSourceClick && (
          <div className="mt-1">
            <SourceIcon
              count={sources.length}
              isActive={isSourceActive ?? false}
              onClick={onSourceClick}
            />
          </div>
        )
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd widget && ./node_modules/.bin/vitest run src/components && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, including the existing `ChatMessage.test.tsx`, `ChatMessage.attachments.test.tsx`, and `ChatMessage.voice.test.tsx`.

- [ ] **Step 5: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write src/components/ChatMessage.tsx src/components/__tests__/ChatMessage.citations.test.tsx && ./node_modules/.bin/eslint src/components/ChatMessage.tsx src/components/__tests__/ChatMessage.citations.test.tsx && cd ..
git add widget/src/components/ChatMessage.tsx widget/src/components/__tests__/ChatMessage.citations.test.tsx
git commit -m "feat(widget): render citation markers as chips with a source-card footer

Text inside bold and italic now goes through the same link step as the
rest of a line, so URLs inside ** are linked too.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `ChatWindow` wiring and the live region

**Files:**
- Modify: `widget/src/components/ChatWindow.tsx`
- Test: `widget/src/components/__tests__/ChatWindow.citations.test.tsx` (create)

**Interfaces:**
- Consumes: `MessageCitations` (Task 9), `ResolvedCitationsConfig`, `stripCitationMarkers` (Task 6), the five strings (Task 7).
- Produces: `ChatWindow` prop `citations?: ResolvedCitationsConfig | null` (default `null`). Task 11 passes it.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/components/__tests__/ChatWindow.citations.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWindow } from "../ChatWindow";
import { de } from "../../locales/de";
import type { ChatMessage, Source } from "../../api/types";

const sources: Source[] = [
  { url: "https://example.com/pricing", title: "Pricing", type: "page" },
];

const messages: ChatMessage[] = [
  { id: "msg-1", role: "user", content: "What are your prices?" },
  {
    id: "msg-2",
    role: "assistant",
    content: "Plans start at $10 [1].",
    sources,
  },
];

const config = { maxSources: 5, favicons: false };

function renderWindow(
  props: Partial<React.ComponentProps<typeof ChatWindow>> = {},
) {
  render(
    <ChatWindow
      messages={messages}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={vi.fn()}
      citations={config}
      {...props}
    />,
  );
  return userEvent.setup();
}

const liveText = () =>
  document.querySelector('[data-claudius-live="assistant"]')!.textContent;

describe("ChatWindow citations", () => {
  it("renders chips and the footer, and never the sidebar", async () => {
    const user = renderWindow();
    await user.click(screen.getByRole("button", { name: "Source 1: Pricing" }));
    expect(screen.getByRole("list", { name: "Sources" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view sources/i })).toBeNull();
    expect(screen.queryByText("1 source found")).toBeNull();
  });

  it("keeps the source icon and sidebar when citations are off", async () => {
    const user = renderWindow({ citations: null });
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /view sources/i }));
    expect(screen.getByText("1 source found")).toBeInTheDocument();
  });

  it("strips citation markers from the live region", () => {
    renderWindow();
    expect(liveText()).toBe("Plans start at $10.");
  });

  it("leaves the markers in the live region when citations are off", () => {
    renderWindow({ citations: null });
    expect(liveText()).toBe("Plans start at $10 [1].");
  });

  it("labels chips and the footer in the widget's language", () => {
    renderWindow({ translations: de });
    expect(screen.getByRole("button", { name: "Quelle 1: Pricing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Quellen/ })).toBeInTheDocument();
  });

  it("each cited reply keeps its own footer state", async () => {
    const user = renderWindow({
      messages: [
        ...messages,
        { id: "msg-3", role: "user", content: "And support?" },
        {
          id: "msg-4",
          role: "assistant",
          content: "Email support is included [1].",
          sources: [{ url: "https://example.com/support", title: "Support", type: "page" }],
        },
      ],
    });
    const toggles = screen.getAllByRole("button", { name: /^Sources/ });
    expect(toggles).toHaveLength(2);
    await user.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    expect(toggles[1]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("list", { name: "Sources" })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd widget && ./node_modules/.bin/vitest run src/components/__tests__/ChatWindow.citations.test.tsx`
Expected: FAIL. The prop is unknown, chips do not render, the live region keeps `[1]`.

- [ ] **Step 3: Implement**

In `widget/src/components/ChatWindow.tsx`:

```tsx
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChatMessage, type MessageCitations } from "./ChatMessage";
// ...
import {
  stripCitationMarkers,
  type ResolvedCitationsConfig,
} from "../utils/citations";

interface ChatWindowProps {
  // ...existing...
  /** Citation rendering, or `null` to keep the source icon and sidebar. */
  citations?: ResolvedCitationsConfig | null;
}

export function ChatWindow({
  // ...existing...
  citations = null,
}: ChatWindowProps) {
```

After the `exporter` block, add:

```tsx
  const newTabLabel = translations?.opensInNewTab ?? "(opens in a new tab)";
  // One object per config or language change, so memoized messages do not
  // re-render on every keystroke elsewhere in the window.
  const messageCitations = useMemo<MessageCitations | undefined>(
    () =>
      citations
        ? {
            ...citations,
            labels: {
              sources: translations?.sources ?? "Sources",
              showAllSources:
                translations?.showAllSources ?? "Show all ({count})",
              showFewerSources: translations?.showFewerSources ?? "Show fewer",
              citation: translations?.citation ?? "Source {n}: {title}",
              opensInNewTab: newTabLabel,
            },
          }
        : undefined,
    [citations, translations, newTabLabel],
  );

  // What a screen reader or the read-aloud voice gets: no markdown markers,
  // hostnames for URLs, and no citation markers when chips render them.
  const announceText = (message: ChatMessageData) =>
    stripAnnouncementFormatting(
      messageCitations && message.sources?.length
        ? stripCitationMarkers(message.content, message.sources.length)
        : message.content,
    );
```

In the `<ChatMessage>` element, add `citations={messageCitations}` and `linkNewTabLabel={newTabLabel}`, and make the sidebar wiring conditional:

```tsx
              isSourceActive={
                messageCitations ? undefined : activeSources?.messageId === msg.id
              }
              onSourceClick={
                messageCitations
                  ? undefined
                  : () => {
                      if (activeSources?.messageId === msg.id) {
                        setActiveSources(null);
                      } else if (msg.sources && msg.sources.length > 0) {
                        setActiveSources({
                          messageId: msg.id,
                          sources: msg.sources,
                        });
                      }
                    }
              }
```

Replace `stripAnnouncementFormatting(msg.content)` in `onPlay` with `announceText(msg)`, and `stripAnnouncementFormatting(lastAssistantMessage.content)` in the live region with `announceText(lastAssistantMessage)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd widget && ./node_modules/.bin/vitest run src/components && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, including `ChatWindow.test.tsx`, `ChatWindow.export.test.tsx`, and `ChatWindow.voice.test.tsx`.

- [ ] **Step 5: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write src/components/ChatWindow.tsx src/components/__tests__/ChatWindow.citations.test.tsx && ./node_modules/.bin/eslint src/components/ChatWindow.tsx src/components/__tests__/ChatWindow.citations.test.tsx && cd ..
git add widget/src/components/ChatWindow.tsx widget/src/components/__tests__/ChatWindow.citations.test.tsx
git commit -m "feat(widget): wire citations through the chat window and its live region

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `ChatWidget`, the embed, exports, dev app, and story

**Files:**
- Modify: `widget/src/components/ChatWidget.tsx`
- Modify: `widget/src/embed.tsx`
- Modify: `widget/src/index.ts`
- Modify: `widget/src/main.tsx`
- Modify: `widget/src/components/ChatMessage.stories.tsx`
- Test: `widget/src/components/__tests__/ChatWidget.citations.test.tsx` (create), `widget/src/__tests__/embed.test.tsx`

**Interfaces:**
- Consumes: `resolveCitationsConfig`, `citationsOptionsFromAttributes`, `CitationsOptions`, `ResolvedCitationsConfig`, `DEFAULT_CITATIONS_OPTIONS` (Task 6); `UseChatOptions.citations` (Task 5); `ChatWindow.citations` (Task 10).
- Produces: `ChatWidgetProps.citations?: boolean | CitationsOptions`; `ClaudiusConfig.citations`; `<claudius-chat citations citations-max-sources citations-favicons>`; package exports `CitationsOptions`, `ResolvedCitationsConfig`, `DEFAULT_CITATIONS_OPTIONS`.

- [ ] **Step 1: Write the failing tests**

Create `widget/src/components/__tests__/ChatWidget.citations.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatWidget } from "../ChatWidget";
import type { Source } from "../../api/types";

const sources: Source[] = [
  {
    url: "https://example.com/pricing",
    title: "Pricing",
    type: "page",
    snippet: "Plans start at $10.",
  },
  { url: "https://example.com/faq", title: "FAQ", type: "page" },
];

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// A JSON reply on the stream endpoint: the client treats it as a blocking
// reply, so one mock serves both endpoints.
function jsonReply(reply: string) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve({ reply, sources }),
  };
}

async function ask(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /open chat/i }));
  await user.type(screen.getByLabelText(/type your message/i), "Prices?");
  await user.keyboard("{Enter}");
  await screen.findByText(/Plans start at/);
}

function sentBody(): Record<string, unknown> {
  return JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
}

describe("ChatWidget citations option", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(jsonReply("Plans start at $10 [1]."));
    sessionStorage.clear();
  });

  it("is off by default: literal markers, the source icon, and no request flag", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="en" />);
    await ask(user);
    expect(screen.getByText("Plans start at $10 [1].")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    expect(screen.getByRole("button", { name: /view sources/i })).toBeInTheDocument();
    expect(sentBody()).not.toHaveProperty("citations");
  });

  it("renders chips and asks the worker for citations when enabled", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="en" citations />);
    await ask(user);
    expect(screen.getByRole("button", { name: "Source 1: Pricing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view sources/i })).toBeNull();
    expect(sentBody().citations).toBe(true);
  });

  it.each([["true"], ["false"], [1], [[]]])(
    "fails closed for %j, which is neither true nor an options object",
    async (value) => {
      const user = userEvent.setup();
      render(
        <ChatWidget
          apiUrl="https://test.workers.dev"
          locale="en"
          citations={value as unknown as boolean}
        />,
      );
      await ask(user);
      expect(screen.getByText("Plans start at $10 [1].")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
      expect(sentBody()).not.toHaveProperty("citations");
    },
  );

  it("applies maxSources and favicons from an options object", async () => {
    const user = userEvent.setup();
    render(
      <ChatWidget
        apiUrl="https://test.workers.dev"
        locale="en"
        citations={{ maxSources: 1, favicons: false }}
      />,
    );
    await ask(user);
    await user.click(screen.getByRole("button", { name: "Source 1: Pricing" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Show all (2)" })).toBeInTheDocument();
    expect(screen.getByRole("listitem").querySelector("img")).toBeNull();
  });

  it("labels chips in the widget's language", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="de" citations />);
    await ask(user);
    expect(screen.getByRole("button", { name: "Quelle 1: Pricing" })).toBeInTheDocument();
  });
});
```

Append to `widget/src/__tests__/embed.test.tsx`:

```tsx
describe("embed citations option", () => {
  const mockFetch = vi.fn();
  const sources = [
    { url: "https://example.com/pricing", title: "Pricing", type: "page" },
    { url: "https://example.com/faq", title: "FAQ", type: "page" },
  ];

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
    window.ClaudiusConfig = undefined;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: () => Promise.resolve({ reply: "Plans start at $10 [1].", sources }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    window.ClaudiusConfig = undefined;
  });

  function mountElement(attributes: Record<string, string>) {
    const el = document.createElement("claudius-chat");
    el.setAttribute("api-url", "https://test.example/api");
    for (const [name, value] of Object.entries(attributes)) {
      el.setAttribute(name, value);
    }
    document.body.appendChild(el);
  }

  async function ask() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /open chat/i }));
    await user.type(screen.getByLabelText(/type your message/i), "Prices?");
    await user.keyboard("{Enter}");
    await screen.findByText(/Plans start at/);
    return user;
  }

  function sentBody(): Record<string, unknown> {
    return JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
  }

  it("enables chips from ClaudiusConfig", async () => {
    window.ClaudiusConfig = { apiUrl: "https://test.example/api", citations: true };
    await import("../embed");
    await ask();
    expect(screen.getByRole("button", { name: "Source 1: Pricing" })).toBeInTheDocument();
    expect(sentBody().citations).toBe(true);
  });

  it("enables chips for a bare citations attribute", async () => {
    await import("../embed");
    mountElement({ citations: "" });
    await ask();
    expect(screen.getByRole("button", { name: "Source 1: Pricing" })).toBeInTheDocument();
    expect(sentBody().citations).toBe(true);
  });

  it("stays off for citations=\"false\"", async () => {
    await import("../embed");
    mountElement({ citations: "false" });
    await ask();
    expect(screen.getByText("Plans start at $10 [1].")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    expect(sentBody()).not.toHaveProperty("citations");
  });

  it("reads the companion attributes", async () => {
    await import("../embed");
    mountElement({
      citations: "true",
      "citations-max-sources": "1",
      "citations-favicons": "false",
    });
    const user = await ask();
    await user.click(screen.getByRole("button", { name: "Source 1: Pricing" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Show all (2)" })).toBeInTheDocument();
    expect(screen.getByRole("listitem").querySelector("img")).toBeNull();
  });
});
```

The file already imports `screen` and the vitest helpers; add `import userEvent from "@testing-library/user-event";` at the top if it is not there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd widget && ./node_modules/.bin/vitest run src/components/__tests__/ChatWidget.citations.test.tsx src/__tests__/embed.test.tsx`
Expected: the "enabled" cases FAIL (no chips, no flag). The "off" cases pass already and pin today's behaviour.

- [ ] **Step 3: Implement**

`widget/src/components/ChatWidget.tsx`:

```tsx
import {
  resolveCitationsConfig,
  type CitationsOptions,
} from "../utils/citations";

// in ChatWidgetProps, after conversationExport:
  /**
   * Render `[n]` citations in grounded replies as numbered chips, with a
   * collapsible footer of source cards under the reply. `true` enables the
   * defaults (five cards before "Show all", favicons on); pass a
   * {@link CitationsOptions} to tune them. The widget also asks the worker to
   * number its retrieved excerpts, so this needs a worker from 1.18.0 or
   * later with RAG on to have any effect. Only `true` or an object enables
   * it. See the Inline citations guide.
   * @defaultValue `false`
   */
  citations?: boolean | CitationsOptions;

// destructure with default
  citations = false,

// after voiceConfig
  const citationsConfig = useMemo(
    () => resolveCitationsConfig(citations),
    [citations],
  );

// useChat call
    citations: citationsConfig !== null,

// ChatWindow element
            citations={citationsConfig}
```

`widget/src/embed.tsx`:

```tsx
import {
  citationsOptionsFromAttributes,
  type CitationsOptions,
} from "./utils/citations";

// ClaudiusConfig
  citations?: boolean | CitationsOptions;

// init(): pass it through
      citations={config.citations}

// observedAttributes: add after "conversation-export"
      "citations",
      "citations-max-sources",
      "citations-favicons",

// render(): after the voice prop
        citations={citationsOptionsFromAttributes((name) =>
          this.getAttribute(name),
        )}
```

`widget/src/index.ts`, after the voice type export:

```ts
export { DEFAULT_CITATIONS_OPTIONS } from "./utils/citations";
export type {
  CitationsOptions,
  ResolvedCitationsConfig,
} from "./utils/citations";
```

`widget/src/main.tsx`: add `citations` to the `<ChatWidget>` props, after `conversationExport`.

`widget/src/components/ChatMessage.stories.tsx`, after `WithSources`:

```tsx
// Inline citations: [n] markers become chips, and a collapsible footer lists
// one card per source. favicons is off so Storybook makes no network requests.
export const WithCitations: Story = {
  args: {
    role: "assistant",
    content:
      "Plans start at $10 a month [1].\n" +
      "Every plan includes support by email [2].",
    sources: [
      {
        url: "https://pmds.info/pricing",
        title: "Pricing",
        type: "page",
        snippet:
          "Plans start at $10 a month, billed annually. Every plan includes support by email and a 14-day trial.",
      },
      {
        url: "https://pmds.info/support",
        title: "Support",
        type: "page",
        snippet: "Email support answers within one business day.",
      },
    ],
    citations: {
      maxSources: 5,
      favicons: false,
      labels: {
        sources: "Sources",
        showAllSources: "Show all ({count})",
        showFewerSources: "Show fewer",
        citation: "Source {n}: {title}",
        opensInNewTab: "(opens in a new tab)",
      },
    },
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd widget && ./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/typedoc --emit none`
Expected: every widget test PASS; no type errors; typedoc reports no undocumented exports.

- [ ] **Step 5: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write src/components/ChatWidget.tsx src/embed.tsx src/index.ts src/main.tsx src/components/ChatMessage.stories.tsx src/components/__tests__/ChatWidget.citations.test.tsx src/__tests__/embed.test.tsx && ./node_modules/.bin/eslint src/ && cd ..
git add widget/src/components/ChatWidget.tsx widget/src/embed.tsx widget/src/index.ts widget/src/main.tsx widget/src/components/ChatMessage.stories.tsx widget/src/components/__tests__/ChatWidget.citations.test.tsx widget/src/__tests__/embed.test.tsx
git commit -m "feat(widget): citations option on the component, ClaudiusConfig, and <claudius-chat>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Client configs, snippets, and the schema

**Files:**
- Modify: `scripts/lib/config.ts`
- Modify: `scripts/lib/snippet.ts`
- Modify: `clients/_schema.json`
- Test: `scripts/lib/__tests__/citations-config.test.ts` (create)

**Interfaces:**
- Produces: `WidgetConfig.citations?: boolean | WidgetCitationsConfig` with `WidgetCitationsConfig = { maxSources?: number; favicons?: boolean }`; `widget.citations` in the JSON schema; both snippet generators emit it.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/__tests__/citations-config.test.ts`:

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

describe("validateConfig: citations", () => {
  it("accepts a boolean or an options object", () => {
    for (const citations of [true, false, {}, { maxSources: 3 }, { favicons: false }]) {
      expect(validateConfig(base({ widget: { citations } }), "test-client")).toEqual([]);
    }
  });

  it("rejects other shapes, naming the field", () => {
    for (const value of ["true", 1, null, []]) {
      const errors = validateConfig(
        base({ widget: { citations: value as never } }),
        "test-client"
      );
      expect(fields(errors)).toEqual(["widget.citations"]);
      expect(errors[0].message).toBe("widget.citations must be a boolean or an object");
    }
  });

  it("requires a positive integer maxSources and a boolean favicons", () => {
    for (const maxSources of [0, -1, 2.5, "3"]) {
      const errors = validateConfig(
        base({ widget: { citations: { maxSources: maxSources as never } } }),
        "test-client"
      );
      expect(fields(errors)).toEqual(["widget.citations.maxSources"]);
    }
    const errors = validateConfig(
      base({ widget: { citations: { favicons: "false" as never } } }),
      "test-client"
    );
    expect(fields(errors)).toEqual(["widget.citations.favicons"]);
    expect(errors[0].message).toBe("widget.citations.favicons must be a boolean");
  });
});

describe("snippets: citations", () => {
  it("passes true and the options object into the script snippet", () => {
    const on = base({ widget: { citations: true } }) as unknown as ClientConfig;
    expect(generateScriptSnippet(on, SCRIPT_URL)).toContain('"citations": true');

    const tuned = base({
      widget: { citations: { maxSources: 3, favicons: false } },
    }) as unknown as ClientConfig;
    const snippet = generateScriptSnippet(tuned, SCRIPT_URL);
    expect(snippet).toContain('"maxSources": 3');
    expect(snippet).toContain('"favicons": false');
  });

  it("emits the attributes for the web component", () => {
    const on = base({ widget: { citations: true } }) as unknown as ClientConfig;
    const plain = generateWebComponentSnippet(on, SCRIPT_URL);
    expect(plain).toContain('citations="true"');
    expect(plain).not.toContain("citations-max-sources");
    expect(plain).not.toContain("citations-favicons");

    const tuned = base({
      widget: { citations: { maxSources: 3, favicons: false } },
    }) as unknown as ClientConfig;
    const snippet = generateWebComponentSnippet(tuned, SCRIPT_URL);
    expect(snippet).toContain('citations="true"');
    expect(snippet).toContain('citations-max-sources="3"');
    expect(snippet).toContain('citations-favicons="false"');
  });

  it("emits nothing when off or unset", () => {
    for (const widget of [{ citations: false }, {}]) {
      const off = base({ widget }) as unknown as ClientConfig;
      expect(generateScriptSnippet(off, SCRIPT_URL)).not.toContain("citations");
      expect(generateWebComponentSnippet(off, SCRIPT_URL)).not.toContain("citations");
    }
  });
});

describe("_schema.json: citations", () => {
  it("declares widget.citations as a boolean or a closed options object", () => {
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, "../../../clients/_schema.json"), "utf-8")
    );
    const citations = schema.properties.widget.properties.citations;
    expect(citations.oneOf[0]).toEqual({ type: "boolean" });
    expect(citations.oneOf[1].additionalProperties).toBe(false);
    expect(citations.oneOf[1].properties.maxSources).toEqual({ type: "integer", minimum: 1 });
    expect(citations.oneOf[1].properties.favicons).toEqual({ type: "boolean" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:scripts`
Expected: FAIL. Snippets do not emit `citations`; the schema has no such property.

- [ ] **Step 3: Implement**

`scripts/lib/config.ts`, types:

```ts
export interface WidgetCitationsConfig {
  maxSources?: number;
  favicons?: boolean;
}

export interface WidgetConfig {
  // ...existing...
  conversationExport?: boolean;
  citations?: boolean | WidgetCitationsConfig;
}
```

Validation, after the `conversationExport` check inside `if (config.widget !== undefined)`:

```ts
    if (widget.citations !== undefined) {
      const citations = widget.citations;
      if (typeof citations === "boolean") {
        // fine
      } else if (citations && typeof citations === "object" && !Array.isArray(citations)) {
        const options = citations as Record<string, unknown>;
        if (options.maxSources !== undefined && !isPositiveInt(options.maxSources)) {
          errors.push({
            field: "widget.citations.maxSources",
            message: "widget.citations.maxSources must be a positive integer",
          });
        }
        if (options.favicons !== undefined && typeof options.favicons !== "boolean") {
          errors.push({
            field: "widget.citations.favicons",
            message: "widget.citations.favicons must be a boolean",
          });
        }
      } else {
        errors.push({
          field: "widget.citations",
          message: "widget.citations must be a boolean or an object",
        });
      }
    }
```

`scripts/lib/snippet.ts`, script snippet, after the `conversationExport` block:

```ts
    // `true` or the options object both pass straight through to ClaudiusConfig.
    if (config.widget.citations !== undefined && config.widget.citations !== false) {
      configObj.citations = config.widget.citations;
    }
```

Web component snippet, after the `conversation-export` block:

```ts
    const citations = config.widget.citations;
    if (citations !== undefined && citations !== false) {
      attrs.push(["citations", "true"]);
      if (citations !== true) {
        if (citations.maxSources !== undefined) {
          attrs.push(["citations-max-sources", String(citations.maxSources)]);
        }
        if (citations.favicons === false) attrs.push(["citations-favicons", "false"]);
      }
    }
```

`clients/_schema.json`, in `properties.widget.properties`, after `conversationExport`:

```json
        "citations": {
          "description": "Render [n] citations in grounded replies as chips with a footer of source cards, and ask the worker to number its excerpts. true enables the defaults (5 cards before Show all, favicons on). Off by default; needs RAG on the worker.",
          "oneOf": [
            { "type": "boolean" },
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "maxSources": { "type": "integer", "minimum": 1 },
                "favicons": { "type": "boolean" }
              }
            }
          ]
        }
```

Match the file's existing indentation (check with `python3 -m json.tool clients/_schema.json > /dev/null` that it still parses).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:scripts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/config.ts scripts/lib/snippet.ts clients/_schema.json scripts/lib/__tests__/citations-config.test.ts
git commit -m "feat(cli): widget.citations in client configs, snippets, and the schema

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Documentation

**Files:**
- Create: `docs/src/content/docs/configuration/citations.md`
- Modify: `docs/src/content/docs/configuration/widget.md`, `docs/src/content/docs/configuration/localization.md`, `docs/src/content/docs/configuration/clients.md`, `docs/src/content/docs/configuration/theming.md`, `docs/src/content/docs/rag/index.md`, `docs/src/content/docs/api/rest.md`, `CLAUDE.md`

- [ ] **Step 1: Write the new page**

Create `docs/src/content/docs/configuration/citations.md`:

````markdown
---
title: Inline citations
description: Show numbered citation chips in grounded replies and a footer of source cards, and understand what the option asks of the worker.
sidebar:
  order: 10
---

When the worker grounds replies in your own content with [RAG](/rag/), each
reply carries the pages it drew on as `sources`. By default the widget shows
them behind a small source icon that opens a sidebar. With **citations** on,
the reply itself shows its evidence:

- The model cites the excerpts it used, and each `[1]`, `[2]` in the reply
  renders as a small numbered chip in the accent colour.
- A collapsible **Sources** footer under the reply lists one card per source:
  favicon, title, a short snippet, the domain, and a link that opens in a new
  tab.
- Clicking a chip opens the footer, scrolls to the matching card, and moves
  focus to it.
- Only the first five cards show until the visitor chooses **Show all**.

Citations are **off by default**. They need a worker from 1.18.0 or later
with RAG switched on. With an older worker the widget still shows the cards it
can build, but no chips, because that worker never asks the model to cite.

## Enabling it

```tsx
<ChatWidget apiUrl="https://your-worker.workers.dev" citations />
```

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    citations: true,
  };
</script>
```

```html
<claudius-chat api-url="https://your-worker.workers.dev" citations></claudius-chat>
```

In a [client config](/configuration/clients/), set `widget.citations` to `true`
or to the options object below and regenerate the snippet.

Only the literal `true` or an options object enables it. A string such as
`"true"` or `"false"`, which a CMS template can produce, leaves it off. The web
component attribute follows the same rule as `conversation-export`: it enables
citations only when `citations` is present with no value or set to `"true"`
(case and surrounding spaces do not matter). `"False"`, `"0"`, `"no"`, and
`"1"` all leave it off.

| Option | Default | Description |
|--------|---------|-------------|
| `maxSources` | `5` | Cards shown before the **Show all** control. A positive integer; anything else uses the default |
| `favicons` | `true` | Fetch each source's `/favicon.ico`. Set to `false` to make no such requests |

```tsx
<ChatWidget apiUrl="…" citations={{ maxSources: 3, favicons: false }} />
```

| Attribute | Example |
|-----------|---------|
| `citations` | `citations` or `citations="true"` to enable |
| `citations-max-sources` | `citations-max-sources="3"` |
| `citations-favicons` | `citations-favicons="false"` |

## How it works

1. With citations on, every request the widget sends carries
   `"citations": true`. That is the only change to what leaves the browser.
2. The worker retrieves its excerpts as usual, then numbers them in the system
   prompt to match the `sources` it will return: two chunks of the same page
   share one number, and the number is that page's position in the list.
   It appends an instruction to cite with `[n]`, to invent no numbers, and
   not to list the sources itself, since the widget shows them.
3. The model answers. Whether and where it cites is up to the model.
4. The streaming endpoint announces the sources once, before the first text
   chunk, so chips render while the reply is still arriving. The `done` event
   and the blocking endpoint carry `sources` as before.
5. The widget renders a `[n]` as a chip only when every number in it is
   between 1 and the number of sources. `[7]` with three sources, `[0]`, and
   `[01]` stay literal text, and so does every bracket in a reply that has no
   sources. `[1][3]` and `[1, 3]` both work.

## What a source card shows

- **Favicon**, requested from `/favicon.ico` on the source's own origin, never
  from a third-party service, and with `referrerPolicy="no-referrer"`. When
  the request fails, or the host page's policy blocks it, a generic icon shows
  instead. `favicons: false` skips the request entirely.
- **Title**, linking to the source in a new tab.
- **Snippet**: the first 200 characters of the first excerpt retrieved from
  that page, with Markdown markers removed. It comes from the chunk text
  stored at [ingestion](/rag/#quick-start-vectorize), so a page's snippet
  depends on which of its chunks matched the question.
- **Domain**.

A source whose URL is not `http:` or `https:` still gets a card, so the
numbering holds, but its title is plain text and it has no favicon.

## Styling and accessibility

Everything uses [theme tokens](/configuration/theming/). Chips and number
badges are `accent` under `accentText`, the one pairing every theme guarantees
to be readable. Cards use `surfaceMuted`, `border`, `text`, and `textMuted`;
**Show all** uses `link`. Dark mode and custom themes need no extra work.

Chips are buttons named "Source 1: Pricing". The footer toggle and **Show
all** expose their state with `aria-expanded`. Cards form an ordered list, so
a screen reader announces "1 of 3" and the position matches the chip. Clicking
a chip moves focus to its card, which then flashes an accent ring for a
moment; the scroll respects `prefers-reduced-motion`. The live region that
announces new replies, and the [read-aloud](/configuration/voice/) voice, skip
the markers, so a visitor hears "Plans start at $10." rather than "left
bracket one right bracket".

## Privacy posture

- **The `citations` flag is the only thing added to requests.** No new data
  about the visitor leaves the browser.
- **Favicons are requests to the source origins.** Each card with a favicon
  fetches one image from the page it links to, with no referrer. For RAG
  sources those are normally your own pages. If any of your sources are
  third-party sites and you would rather not tell them a visitor saw the card,
  set `favicons: false`.

## Customizing the text

Five [translation keys](/configuration/localization/): `sources` (footer label),
`showAllSources` (takes `{count}`), `showFewerSources`, `citation` (the chip's
accessible name; takes `{n}` and `{title}`), and `opensInNewTab` (the hidden
hint on links that open a new tab, also used by links in message text).

## Limitations

- The model decides whether to cite. A reply may cite nothing, in which case
  the footer still lists the sources, or cite a number that does not exist, in
  which case the bracket stays as text.
- A bracketed number in code or a quotation, such as `items[1]`, becomes a chip
  when it is in range.
- Snippets come from the chunk that matched, not from the top of the page.
- The sidebar's own labels ("View sources", "Close sources") are not yet
  translatable; the footer's are.
````

- [ ] **Step 2: Update the existing pages**

`docs/src/content/docs/configuration/widget.md`: add a table row after `conversationExport`:

```markdown
| `citations` | `boolean \| CitationsOptions` | `false` | Render `[n]` markers in grounded replies as chips with a footer of source cards, and ask the worker to number its excerpts; `true` for the defaults or an object with `maxSources`, `favicons`. Needs RAG on the worker. See [Inline citations](/configuration/citations/) |
```

and extend the attributes paragraph so the list ends with `... conversation-export (see [Conversation export](/configuration/conversation-export/#enabling-it)), and citations with its companions citations-max-sources and citations-favicons (see [Inline citations](/configuration/citations/#enabling-it)).` Keep the existing link formatting.

`docs/src/content/docs/configuration/localization.md`, add a row to the "Available keys" table:

```markdown
| [Inline citations](/configuration/citations/) | `sources`, `showAllSources`, `showFewerSources`, `citation`, `opensInNewTab` |
```

`docs/src/content/docs/configuration/clients.md`, in the `widget` row, append after the `conversationExport` entry: `; \`citations\` (\`true\` or \`{ maxSources, favicons }\`, see [Inline citations](/configuration/citations/))`.

`docs/src/content/docs/configuration/theming.md`, token table: change the `accent` row's "Used for" to `Header, toggle bubble, send button, focus rings, citation chips` and the `surfaceMuted` row's to `Assistant bubble, hovers, source cards`.

`docs/src/content/docs/rag/index.md`:
- Intro paragraph: replace "which the widget renders as a source icon with a slide-out sidebar." with "which the widget renders as a source icon with a slide-out sidebar, or, with [citations](/configuration/citations/) on, as numbered chips in the reply and a footer of source cards."
- "How it works", step 4: replace with "Returns deduplicated `sources` (one per page, each with a 200-character `snippet` of its first matching chunk) on the response: the JSON body for `/api/chat`, and for `/api/chat/stream` a `sources` event before the first chunk plus the `done` event. When the request carries `citations: true`, the excerpts in step 3 are numbered to match and the model is asked to cite them as `[n]`."
- Add a note after that list: "Only excerpts that fit `maxContextChars` become sources, so the model never gets credit for a page it did not see."
- "Related": replace the #56 bullet with "**Inline citations and source cards** rendered from these sources are described in [Inline citations](/configuration/citations/)."

`docs/src/content/docs/api/rest.md`:
- Request table: add `| \`citations\` | boolean, optional | \`true\` asks the worker to number its RAG excerpts to match \`sources\` and to have the model cite them as \`[n]\`. Anything else is ignored |` after `conversationId`.
- Response example: add `"snippet": "We're available Monday through Friday, 9am to 5pm."` to the source object, and after the example paragraph about `sources` say: "Each source has `url`, `title`, `type`, and, from 1.18.0, a `snippet` of about 200 characters."
- Replace the paragraph starting "`POST /api/chat/stream` accepts the same JSON or multipart body." with a new section placed after "### Errors":

````markdown
## POST /api/chat/stream

Accepts the same JSON or multipart body as `/api/chat` and answers with
`text/event-stream`. Failures before the first byte (validation, rate limit,
attachments, a bad API key) return the same JSON errors as `/api/chat`, so
clients can share their error handling.

| Event | Data | When |
|-------|------|------|
| `sources` | `{ "sources": [...] }` | Once, before the first chunk, when retrieval found sources |
| `chunk` | `{ "text": "..." }` | One per model text delta |
| `tool` | a tool-use summary | One per executed tool call |
| `done` | `{ "reply", "sources"?, "toolUses"?, "attachments"? }` | Last event: the full reply plus everything the JSON response would carry |
| `error` | `{ "error", "code": "STREAM_ERROR" }` | A failure after streaming began; the stream ends |

```
event: sources
data: {"sources":[{"url":"https://example.com/contact","title":"Contact","type":"page","snippet":"We're available Monday through Friday."}]}

event: chunk
data: {"text":"We're available Monday through Friday [1]."}

event: done
data: {"reply":"We're available Monday through Friday [1].","sources":[...]}
```

`sources` on `done` is the authoritative list; the early event exists so a
widget can render citation chips while the text is still arriving.
````

`CLAUDE.md`:
- Widget components table: add `| \`SourceCards\` | Collapsible footer of source cards under a cited reply; reveals a card when its chip is clicked |`.
- Worker API table: after the `/api/chat/stream` row's description, change it to "Same request; streams the reply as SSE (`sources`/`chunk`/`tool`/`done`/`error` events)".
- Chat request example: add `citations?: true` as a top-level field with a comment `// widget asks for numbered, citable excerpts`; response `sources` entries gain `snippet?: "..."`.
- Add a section after "### Conversation Export":

```markdown
### Citations

Widget-only opt-in (`citations` prop / `ClaudiusConfig` key /
`<claudius-chat citations citations-max-sources citations-favicons>` /
`widget.citations` in client configs), failing closed like `conversationExport`.
When on, the client sends `citations: true`, the worker numbers its RAG
excerpts to match `sources` and appends `CITATION_INSTRUCTIONS`
(`worker/src/rag/retrieval.ts`, `buildRagContext`), the stream route emits
`event: sources` before the first chunk, and `ChatMessage` renders in-range
`[n]` markers as chips with a `SourceCards` footer instead of the source icon.
Sources carry a 200-character `snippet`. Pure helpers live in
`widget/src/utils/citations.ts` (`parseCitations`, `stripCitationMarkers`,
`hideTrailingCitationOpener`, `resolveCitationsConfig`,
`citationsOptionsFromAttributes`). Only markers whose numbers are all within
`sources.length` become chips. Docs: configuration/citations.md; design:
docs/plans/2026-09-27-inline-citations-design.md.
```

- [ ] **Step 3: Build the docs site to check the page and its anchors**

Run: `cd docs && ./node_modules/.bin/astro build 2>&1 | tail -5 && grep -c 'id="enabling-it"' dist/configuration/citations/index.html`
Expected: the build succeeds and the grep prints `1`. Then confirm the new page has no em dashes: `grep -c $'\u2014' docs/src/content/docs/configuration/citations.md` must print `0`.

- [ ] **Step 4: Commit**

```bash
git add docs/src/content/docs/configuration/citations.md docs/src/content/docs/configuration/widget.md docs/src/content/docs/configuration/localization.md docs/src/content/docs/configuration/clients.md docs/src/content/docs/configuration/theming.md docs/src/content/docs/rag/index.md docs/src/content/docs/api/rest.md CLAUDE.md
git commit -m "docs: inline citations guide, streaming events, and the citations request field

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Playwright spec

**Files:**
- Create: `widget/e2e/citations.spec.ts`

**Interfaces:**
- Consumes: the dev app (`widget/src/main.tsx`) with `citations` on (Task 11); `mockChatApi` from `widget/e2e/helpers.ts`, whose `enqueueReply(reply, sources)` already takes sources.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { mockChatApi } from "./helpers";

/**
 * Inline citations in a real browser: the chip, the request flag, and the
 * reveal (scroll plus focus), which jsdom cannot exercise. Marker parsing and
 * the footer's states are covered by the unit tests.
 */
test.describe("inline citations", () => {
  test("a chip reveals and focuses its source card", async ({ page }) => {
    // No real request to example.com for the favicon: abort it so the
    // fallback icon renders and the run stays offline.
    await page.route("https://example.com/**", (route) => route.abort());

    const api = await mockChatApi(page);
    api.enqueueReply("Plans start at $10 a month [1].", [
      {
        url: "https://example.com/pricing",
        title: "Pricing",
        type: "page",
        snippet: "Plans start at $10 a month, billed annually.",
      },
    ]);
    const bodies: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/chat")) {
        bodies.push(request.postData() ?? "");
      }
    });

    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();
    const input = page.getByLabel(/type your message/i);
    await input.fill("What are your prices?");
    await input.press("Enter");

    const chip = page.getByRole("button", { name: "Source 1: Pricing" });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText("1");
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0])).toMatchObject({ citations: true });

    const toggle = page.getByRole("button", { name: /^Sources/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await chip.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const card = page.getByRole("listitem").filter({ hasText: "Pricing" });
    await expect(card).toHaveCount(1);
    await expect(card).toBeFocused();
    await expect(card).toBeInViewport();
    await expect(card).toContainText("Plans start at $10 a month, billed annually.");
    const link = card.getByRole("link", { name: /Pricing/ });
    await expect(link).toHaveAttribute("href", "https://example.com/pricing");
    await expect(link).toHaveAttribute("target", "_blank");
  });
});
```

- [ ] **Step 2: Run it**

Start the dev server yourself first if `pnpm dev` is unreliable under pnpm 11: `cd widget && ./node_modules/.bin/vite --port 5173 &`. Then:

Run: `cd widget && ./node_modules/.bin/playwright test e2e/citations.spec.ts --project=chromium-desktop`
Expected: 1 passed. If Chromium is not installed, `./node_modules/.bin/playwright test --project=chromium-desktop e2e/citations.spec.ts` with `channel: "chrome"` per the local Playwright notes in memory.

- [ ] **Step 3: Format and commit**

```bash
cd widget && ./node_modules/.bin/prettier --write e2e/citations.spec.ts && cd ..
git add widget/e2e/citations.spec.ts
git commit -m "test(widget): e2e for citation chips and the source-card reveal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Verification, review, budget, PR

- [ ] **Step 1: Run everything CI runs**

```bash
cd widget && ./node_modules/.bin/eslint src/ && ./node_modules/.bin/prettier --check "src/**/*.{ts,tsx,css}" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/typedoc --emit none && ./node_modules/.bin/vitest run && ./node_modules/.bin/vite build && ./node_modules/.bin/vite build --config vite.config.embed.ts && node scripts/emit-dts-cts.mjs && cd ..
cd worker && ./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit -p . && cd ..
pnpm test:scripts
```

Expected: everything green except `size-limit`, which is expected to exceed the old budgets.

- [ ] **Step 2: Independent review, then fixes**

Use `superpowers:requesting-code-review` on the whole branch against `main`, with the spec and this plan as the requirements. Apply every fix in its own commit, re-running the affected tests. Per the maintainer's history, the review must finish before the PR opens.

- [ ] **Step 3: Measure and bump the bundle budgets (last)**

Follow the bundle-budget procedure from memory: build `main` in a detached worktree under `.superpowers/` that symlinks `widget/node_modules`, run `./node_modules/.bin/size-limit --json` there and on the branch, compute per-artifact raw/gzip/brotli deltas, set every limit in `widget/.size-limit.json` to `ceil(branch_size * 1.05)` bytes, and quote the exact byte deltas in the commit message.

```bash
git add widget/.size-limit.json
git commit -m "chore(widget): raise bundle budgets for inline citations

<deltas here>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin 56-inline-citations
gh pr create --title "feat: inline citations and source cards for RAG results" --body "$(cat <<'BODY'
Closes #56

## What

- ... (summarize from the commit log: worker numbering + snippet + sources event; widget chips + footer + option; CLI + schema; docs; e2e)

## Decisions to review

(copy the "Decisions made without the maintainer" list from the design doc)

## Verification

(list the commands run and their results, the size deltas, and the e2e run)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Then watch `gh pr checks` until green and report the URL.
