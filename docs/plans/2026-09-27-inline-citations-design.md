# Inline citations and source cards: design

Issue: [#56](https://github.com/PMDevSolutions/Claudius/issues/56)
Date: 2026-09-27
Status: implemented in the same PR as this document. The maintainer was not
available while it was written, so every judgement call is listed under
"Decisions made without the maintainer" for review.

## Summary

Add an opt-in `citations` option to the widget. When it is on and the worker
returns `sources` with a reply, the widget renders `[1]`, `[2]` markers in the
reply as small numbered chips, and puts a collapsible "Sources" footer under
the bubble with one card per source: favicon, title, snippet, domain, and an
external link. Clicking a chip opens the footer, scrolls to the matching card,
and focuses it. Only the first `maxSources` cards (default 5) show until the
visitor chooses "Show all".

The worker learns two things. It attaches a `snippet` to each source, and,
when a request carries `citations: true`, it numbers the retrieved excerpts in
the system prompt to match `sources` and tells the model to cite them. The
streaming endpoint also emits the sources once at the start of the reply, so
chips render while the text is still arriving. The `done` event carries
`sources` exactly as before.

## Facts that constrain the design

Checked against the code and git history on 2026-09-27.

1. **The issue predates both streaming and RAG.** It was filed on
   2026-05-19. Streaming (`ab0360b`) and RAG (`6f88a46`) landed on
   2026-08-30. Since then the `done` SSE event has carried `sources` after the
   last text chunk, so the first acceptance criterion, "worker streams
   `sources` as a final SSE event after the assistant text", is already met.
   The question left for this design is whether sources are also needed
   *before* the text, for streaming (see fact 6).
2. **Sources today are `{ url, title, type }` and nothing else.** The worker's
   `ragDocumentsToSources` drops the chunk text, so there is no snippet on the
   wire. A source card with a snippet needs a new optional field on both the
   worker's `ChatSource` and the widget's `Source`.
3. **The model is not asked to cite.** The default RAG context template lists
   excerpts under `### [Title](url)` headings with no numbers and no
   instruction to cite them. Without numbering that matches `sources`, a
   `[1]` in the reply would point at nothing in particular.
4. **Sources can name pages the model never saw.** `formatRagContext` drops
   the lowest-ranked excerpts past `maxContextChars`, but `prepareRag` builds
   `sources` from every retrieved document. With the defaults (four excerpts
   of about 1,200 characters against a 6,000 character budget) nothing is
   dropped, so this has not mattered. With numbered citations it would: the
   numbers in the prompt and the numbers on the cards must come from the same
   list.
5. **Embeds load a floating tag.** The quick start documents
   `cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js`, so a
   feature that is on by default appears on every live site the moment the
   release is tagged. The same fact decided `attachments`, `voice`, and
   `conversationExport`, which are all opt-in and fail closed.
6. **Streaming text renders per token.** `stabilizeStreamingMarkdown` exists
   so that a `**` does not flash as literal asterisks before its partner
   arrives. If sources arrive only on `done`, every `[1]` renders as plain
   text for the whole stream and then turns into a chip when the reply
   settles. The repo already treats that kind of pop as a defect.
7. **Unknown SSE events and unknown request fields are ignored on both
   sides.** The widget's `readSseStream` handles `chunk`, `tool`, `done`, and
   `error` and skips anything else. The worker's `validateMessages` keeps only
   `role`, `content`, and `attachments` from each message, and `parseChatRequest`
   already tolerates a top-level `conversationId` that only analytics read. So
   a new event and a new top-level request field are safe in both directions:
   old widget with new worker, new widget with old worker.
8. **The first `stream.next()` happens before the SSE response opens.** The
   stream route pulls one event before calling `streamSSE`, so that a bad API
   key or an upstream connection failure returns a JSON 500 instead of a 200
   stream that dies. Anything yielded before the model connection is
   established would defeat that.
9. **The renderer is hand-rolled.** `ChatMessage` splits each line on bold,
   then italic, then URLs, and renders everything else as text. Text inside a
   bold or italic span is rendered as a plain string, so URLs inside `**` are
   not linked today. Citation markers have to be found in the same leaf
   segments.
10. **The widget is embedded in someone else's page.** An in-page anchor
    (`<a href="#card">`) would change the host page's URL fragment and push a
    history entry. jsdom, where the unit tests run, has no `scrollIntoView`
    (the test setup stubs it) and no layout.
11. **A favicon is a request to the source's origin.** There is no way to show
    one without fetching it, either from the origin itself or from a
    third-party favicon service. RAG sources are almost always the client's
    own pages, but `type: "external"` exists for a reason.
12. **The accent colour is not guaranteed to read on the surface.** The
    default accent `#2563eb` sits at about 3.5:1 against the default dark
    surface `#111827`, below the 4.5:1 needed for small text. The one pairing
    every theme guarantees is `accent` under `accentText`, which is why the
    header, the send button, and the source-count badge all use it. Chips
    that use the accent as a text colour would fail in dark mode.
13. **`Source[]` also comes from plugins.** `PluginReply.sources` lets an
    `onBeforeSend` or `onError` plugin attach sources with no worker involved,
    so the widget cannot assume snippets are short or URLs are safe.
14. **Sources already appear in the export.** `conversationToMarkdown` writes
    a message's sources as a numbered list, `1. [Title](url)`, in array order.
    Citation numbers in the message text therefore already agree with the
    transcript's list. The JSON export is the raw message array and will
    include `snippet`.

## Approaches considered

**A. Widget option that also drives the worker; numbering by the worker
(chosen).** The widget's `citations` option turns on the rendering and makes
the client send `citations: true` with each request. The worker numbers the
excerpts and adds the citing instruction only when asked. Nothing changes for
any deployment that has not opted in, on either side, and a client that
upgrades only its worker sees no `[1]` markers appear in replies.

**B. Worker environment variable (`RAG_CITATIONS`).** Rejected. It puts the
same switch in two places that have to agree, and a worker with it on serves
literal `[1]` markers to every widget that has not been updated. The request
field is one switch that the side doing the rendering owns.

**C. Always number and always instruct.** Rejected for the same reason: it
changes model output for existing RAG deployments as soon as the worker is
redeployed, with no way to turn it off short of a custom context template.

**D. Widget-only, matching `[n]` against whatever `sources` arrive, without
teaching the model to cite.** Rejected. Today's prompt never produces `[n]`,
so the chips would never appear. Snippets also need worker support.

For the source cards, replacing the existing sidebar outright was considered
and rejected: the sidebar is what every current embed shows, and removing it
is a visible change for sites that never asked for one. When `citations` is
on, the footer replaces the source icon and sidebar for that widget, because
the cards show a superset of what the sidebar shows. When it is off, nothing
changes.

For favicons, a third-party favicon service was rejected: it reports every
source domain a visitor sees to that service. The widget requests
`/favicon.ico` from the source's own origin, with `referrerPolicy="no-referrer"`,
falls back to a generic icon when that fails, and can be switched off.

## Public API

```ts
// ChatWidgetProps / window.ClaudiusConfig / clients/*.json widget
citations?: boolean | CitationsOptions; // default false

interface CitationsOptions {
  /** Cards shown before "Show all". Positive integer. Default 5. */
  maxSources?: number;
  /** Fetch each source's /favicon.ico. Default true. */
  favicons?: boolean;
}
type ResolvedCitationsConfig = Required<CitationsOptions>;

// Source (widget) and ChatSource (worker)
snippet?: string;

// ChatRequest (widget and worker)
citations?: boolean;

// ChatApiClientOptions
citations?: boolean;

// ChatStreamOptions
onSources?: (sources: Source[]) => void;
```

- **Off by default and fails closed.** Only the literal `true` or a plain
  object enables it. `"true"`, `"false"`, `1`, and arrays leave it off. This
  departs from the issue, which describes the new rendering as *the* way
  sources appear. Fact 5 is why: switching it on later is not a breaking
  change, switching it off later would be. The option also causes network
  requests (favicons) and changes what the worker asks of the model, both of
  which a site should choose.
- `maxSources` must be a positive integer; anything else uses 5. `favicons` is
  on unless it is exactly `false`, mirroring how `voice.input` and
  `voice.output` read their sub-options.
- `<claudius-chat>` gains `citations`, `citations-max-sources`, and
  `citations-favicons`. `citations` follows the strict rule
  `conversation-export` set: on only when present with no value or with
  `"true"`, trimmed and lowercased. `citations-max-sources` is parsed as an
  integer and ignored unless positive. `citations-favicons="false"` (trimmed,
  lowercased) turns favicons off; any other value leaves them on.
- `clients/_schema.json`, the CLI validator, and both snippet generators
  accept `widget.citations` as a boolean or the options object. The script
  snippet passes the value through; the web component snippet emits
  `citations="true"` plus `citations-max-sources` and
  `citations-favicons="false"` when set.
- `Source.snippet` is optional, so persisted conversations and plugin-made
  sources stay valid. The JSON export includes it.
- `ChatRequest.citations` travels next to `messages`. The worker reads it in
  `getChatConfig`, and only the literal `true` counts.
- `ChatApiClient` gets a `citations` option because the request body is its
  business; `useChat` passes it through. `onSources` is a new stream callback
  beside `onChunk` and `onToolUse`.

## Architecture

```
ChatWidget   citations -> resolveCitationsConfig -> { maxSources, favicons } | null
  useChat      citations: config !== null
    ChatApiClient   body.citations = true; onSources from the early SSE event
  ChatWindow   passes the config plus labels to each assistant message
    ChatMessage   renderFormattedContent(text, citationContext) -> chips
      SourceCards   footer: toggle, cards, "Show all", reveal on chip click

worker
  index.ts      getChatConfig: citations = body.citations === true
                stream route: event "sources" once, before the first chunk
  chat.ts       prepareRag -> buildRagContext({ citations })
  rag/retrieval buildRagContext: numbered headers, citing instruction,
                sources with snippets, both computed from the excerpts that fit
```

| Unit | Responsibility |
|------|----------------|
| `widget/src/utils/citations.ts` | Pure: `resolveCitationsConfig`, `citationsOptionsFromAttributes`, `parseCitations`, `stripCitationMarkers`, `hideTrailingCitationOpener`, `truncateSnippet`, `faviconUrl`, `sourceDomain`. No React, no DOM. |
| `widget/src/components/SourceCards.tsx` | The footer: collapsed toggle, ordered list of cards, "Show all", and the reveal behaviour (expand, scroll, focus, highlight). |
| `widget/src/components/ChatMessage.tsx` | Threads a citation context into the renderer, renders chips, owns the `reveal` request, renders `SourceCards` instead of `SourceIcon` when citations are on. |
| `widget/src/components/ChatWindow.tsx` | Builds the labels, chooses footer or sidebar per message, strips markers from the live region and read-aloud text. |
| `widget/src/api/client.ts` | Sends `citations: true`; handles the `sources` event; falls back to early sources when `done` has none. |
| `widget/src/hooks/useChat.ts` | Holds early sources until the placeholder message exists. |
| `worker/src/rag/retrieval.ts` | `buildRagContext`, `snippetFromContent`, `CITATION_INSTRUCTIONS`; `formatRagContext` stays as a wrapper. |
| `worker/src/chat.ts` | `citations` on the request and config; a `sources` stream event. |
| `worker/src/index.ts` | Maps the event to SSE; reads `citations` from the body. |

## Behaviour

### Worker: numbering, instruction, snippet

`buildRagContext(documents, rag, { citations })` replaces the body of
`formatRagContext` and returns `{ context, sources }` computed from the same
loop, which fixes fact 4: a document that does not fit the budget contributes
neither an excerpt nor a source.

- Numbers are assigned per page, in order of first appearance among the
  excerpts that fit, so two chunks of one page share a number and the number
  equals the page's 1-based position in `sources`. The header for a numbered
  excerpt is `### [1] [Pricing](https://example.com/pricing)`. Excerpts
  without a URL cannot be cited and keep today's `### [Title]` header.
- When `citations` is off, headers are exactly what they are today, so the
  existing `formatRagContext` tests keep passing unchanged.
- When `citations` is on and at least one source exists, this instruction is
  appended after the template output, so custom templates get it too:

  > The excerpts above are numbered. When a sentence draws on one, end it with
  > the excerpt's number in square brackets, like [1], or [1][3] for several.
  > Cite only numbers that appear above and never invent one. Add no citation
  > when the excerpts do not apply, and do not list the sources or their URLs
  > yourself: the reader sees them beside your answer.

- `ragDocumentsToSources` sets `snippet` from the first chunk seen for each
  URL: heading markers, `**`, and backticks removed, whitespace collapsed,
  cut to 200 characters at the last space (or hard if there is none) with a
  trailing ellipsis (U+2026). An empty result leaves `snippet` off.
- `prepareRag` passes `config.citations`, and `getChatConfig` sets it from
  `body.citations === true`. The blocking endpoint gets the same numbering
  through the same path.

### Wire format

Streaming, with RAG and sources present:

```
event: sources   data: {"sources":[{"url":"…","title":"…","type":"page","snippet":"…"}]}
event: chunk     data: {"text":"Plans start at $10 "}
event: chunk     data: {"text":"[1]."}
event: done      data: {"reply":"Plans start at $10 [1].","sources":[…]}
```

- The `sources` event is emitted once, after the model connection for the
  first round is established and before its first delta, so fact 8 still
  holds: a bad API key is still a JSON 500. It is emitted whether or not the
  request asked for citations, because an old widget ignores it (fact 7) and
  a new one uses it to know that `[1]` is a citation.
- `done` carries `sources` as it does today. It is the authoritative copy; the
  client uses the early copy only when `done` has none, and keeps it on the
  partial reply when the visitor stops the stream.
- The blocking endpoint's response is unchanged apart from `snippet`.

### Widget: chips

`parseCitations(text, sourceCount)` tokenizes one text segment into text and
citation groups using `\[([1-9]\d{0,2}(?:\s*,\s*[1-9]\d{0,2})*)\]`. A match
is a citation group only when every number is between 1 and `sourceCount`;
otherwise it stays literal text, so `[7]` with three sources, `[0]`, `[01]`,
and every bracket in a reply with no sources render as written. Duplicates in
a group collapse. `[1][3]` is two groups; `[1, 3]` is one group with two
chips.

The renderer gains a leaf step: after the URL split, each remaining text run
goes through `parseCitations`. Bold and italic inner text now goes through
the same leaf renderer, so `**Plans start at $10 [1]**` gets its chip. A side
effect is that URLs inside bold are linked from now on; that is an
improvement and is noted in the changelog.

A chip is a `<button type="button">` showing the number, with
`aria-label` "Source 1: Pricing" and `title` set to the source title. It is
a small pill in `bg-claudius-accent text-claudius-accent-text` (fact 12),
raised with `align-super`, with the widget's usual `focus-visible` ring.
Chips in one group sit side by side. Nothing changes the reply text itself:
the markers stay in `content`, in storage, and in the export, where they
already line up with the numbered source list (fact 14).

While a reply streams, `hideTrailingCitationOpener` hides an unfinished
`[`, `[1`, or `[1, ` at the very end of the text, the way
`stabilizeStreamingMarkdown` hides a bare `**`. It runs only when the message
has sources, and the characters return the moment the next token arrives.

### Widget: the footer

`SourceCards` renders under the bubble, in place of the source icon, when
citations are on and an assistant message has sources.

- **Collapsed by default.** A toggle in the same style as the "used tool"
  chip: a document icon, the word "Sources", a count badge, and a chevron,
  with `aria-expanded` and `aria-controls`. A compact widget cannot afford
  five cards with snippets under every answer, and the chips plus the count
  already tell the visitor the answer is grounded.
- Expanded, it shows an `<ol>` labelled "Sources" with one `<li>` per source.
  Each card shows the number badge (matching its chips), the favicon or a
  generic icon, the title as a link (`target="_blank"`,
  `rel="noopener noreferrer"`, with the visually hidden "(opens in a new tab)"
  the widget's other links carry), the snippet, and the domain. A source
  whose URL fails `sanitizeUrl` still gets a card, so the numbering holds, but
  its title is plain text and it has no favicon.
- Only the first `maxSources` cards render until "Show all (N)" is pressed;
  it then reads "Show fewer". The buttons carry `aria-expanded`.
- **Reveal.** A chip click sets a `{ index, key }` request on the message.
  The footer expands, switches to "Show all" if the card is past
  `maxSources`, then scrolls the card into view (`block: "nearest"`, smooth
  unless `prefers-reduced-motion: reduce`), focuses it (`tabIndex={-1}`,
  `preventScroll`), and marks it highlighted for 1.5 seconds with an accent
  ring. The key makes clicking the same chip twice work.
- **Favicon.** `faviconUrl` gives `<origin>/favicon.ico` for an `http:` or
  `https:` source and `null` otherwise. The image is decorative (`alt=""`),
  lazy, `referrerPolicy="no-referrer"`, and swaps for the generic icon on
  `error`, which also covers mixed content and host-page CSP blocks. With
  `favicons: false` no image is ever requested.
- **Snippet.** `truncateSnippet` applies the worker's rule again on the
  widget, so a long snippet from a plugin or a custom worker (fact 13) is also
  cut at 200 characters.

### Live region and read-aloud

When citations are on and a message has sources, `stripCitationMarkers`
removes the citation groups, and any whitespace right before them, from the
text handed to `stripAnnouncementFormatting` for the live region and for
read-aloud. A screen reader should hear "Plans start at $10." rather than
"left bracket one right bracket". Out-of-range groups are not markers and stay.

## Errors and edge cases

| Situation | Result |
|-----------|--------|
| Worker predates this release (no `snippet`, no numbering) | Cards without snippets; no chips because no `[n]` is produced; nothing breaks |
| Widget predates this release | Ignores the `sources` event and `snippet`; sidebar as today |
| `[n]` out of range, `[0]`, `[01]`, `[1` unclosed at the end of a settled reply | Literal text |
| Reply cites but `sources` is empty (model invented one) | Literal text |
| Favicon request fails or is blocked | Generic icon; no console error is thrown |
| Source URL is not `http(s)` | Card with plain title, no link, no favicon |
| Visitor stops the stream after `sources` arrived | Partial reply keeps its sources; chips work |
| `sources` arrives before the first token | Held until the placeholder message exists, so no empty bubble is created |
| `scrollIntoView` missing (jsdom, very old browsers) | Focus still moves; no scroll |
| Snippet from a plugin is 2,000 characters | Cut to 200 on the widget |
| `maxSources` is `0`, `-1`, `2.5`, or `"3"` | Default 5 |

## Accessibility

- Chips are buttons with a full accessible name and a visible focus ring. A
  16 px pill is below the 24 px target minimum of WCAG 2.5.8, which exempts
  targets inline in a sentence; the same rule covers the footnote pattern this
  copies.
- The footer toggle and the "Show all" control expose `aria-expanded`; the
  toggle also names the list it controls.
- Cards are list items in an ordered list, so a screen reader announces
  "1 of 3" and the position matches the chip number. A card takes focus only
  programmatically (`tabIndex={-1}`), so the Tab order gains nothing but the
  title links.
- Reveal focuses the card, so a keyboard user who activates a chip lands on
  the card and can Tab straight to its link. The highlight is a static ring,
  so there is nothing to reduce for motion; scrolling respects
  `prefers-reduced-motion`.
- The focus trap needs no change: the new controls are never the first or last
  focusable element in the dialog.
- Colours come from theme tokens: `accent` and `accentText` for chips and
  badges, `border`, `surface`, `surfaceMuted`, `text`, and `textMuted` for the
  cards, `link` for "Show all". Dark mode and custom themes need no extra work.

## Strings

Five keys, translated in en, es, fr, and de (the parity test enforces it):
`sources` ("Sources"), `showAllSources` ("Show all ({count})"),
`showFewerSources` ("Show fewer"), `citation` ("Source {n}: {title}", the
chip's accessible name), and `opensInNewTab` ("(opens in a new tab)"). The last
replaces the English literal that `ChatMessage` already appends to links, so
that text is now localized too. The sidebar's own strings stay as they are.

## Testing

Test-first, with tests that fail before the code exists.

- `utils/citations`: every row of the edge-case table above; `parseCitations`
  with in-range, out-of-range, zero, leading-zero, comma groups, adjacent
  groups, duplicates, and no sources; `stripCitationMarkers` removes the
  marker and the space before it and leaves out-of-range brackets;
  `hideTrailingCitationOpener` hides `[`, `[1`, `[1, ` and leaves `[1]`;
  `truncateSnippet` at 199, 200, and 201 characters, with and without spaces,
  with newlines; `faviconUrl` for https, http, `javascript:`, and garbage;
  `resolveCitationsConfig` and `citationsOptionsFromAttributes` for every
  accepted and rejected value.
- `ChatMessage`: chips render as buttons named "Source 1: Pricing"; `[3]` with
  two sources stays text; a chip inside bold renders; a chip click expands the
  footer, calls `scrollIntoView` on the card, and focuses it; the footer is
  collapsed by default and toggles; seven sources with `maxSources: 5` show
  five cards and "Show all (7)", then seven and "Show fewer"; a chip for the
  sixth source reveals it; an unsafe URL renders a card with no link; the
  favicon has the expected `src` and `referrerPolicy`, and an `error` event
  swaps it for the fallback; `favicons: false` renders no image; the source
  icon is absent when citations are on and present when they are off; a user
  message never gets chips; a streaming message with sources gets chips and
  hides a trailing `[1`.
- `ChatWindow`: with the config, chips render and the sidebar never opens; the
  live region text has no markers; without the config the existing sidebar
  tests still pass.
- `ChatWidget` and the embed: `true` and an object enable it; `"true"`, `1`,
  `"false"`, and `[]` do not; each attribute value in the accepted and
  rejected lists; `ClaudiusConfig.citations` passes through; the request body
  contains `citations: true` when on and no `citations` key when off.
- `ChatApiClient`: `event: sources` calls `onSources` and lands in the result;
  `done` without `sources` falls back to the early copy; an aborted stream
  keeps the early copy; the JSON body and the multipart `payload` both carry
  `citations: true` only when the option is set.
- `useChat`: a `sources` event before the first token adds no message; the
  first chunk creates the placeholder with those sources; `done` sources win.
- Worker `rag`: `ragDocumentsToSources` snippets (first chunk per URL,
  cleanup, cut); `buildRagContext` numbers by page with interleaved chunks
  and the numbers match `sources` order; the instruction appears only with
  `citations` and at least one source; a document dropped by the budget is
  missing from `sources` (fails against today's code); with `citations` off
  the output equals `formatRagContext`'s.
- Worker `chat`: `streamChat` yields `sources` after the model call is made
  and before the first `text`; not at all without sources; `citations: true`
  on the request numbers the prompt, and its absence leaves the prompt as
  today. The stream route emits `event: sources` before the first `chunk`
  and still returns JSON 500 for an upstream failure with RAG on. The route
  passes `citations` from the body into the chat config.
- Scripts: `widget.citations` validation for booleans, objects, bad
  `maxSources`, non-boolean `favicons`, and unknown keys; both snippet
  generators; the schema.
- One Playwright spec against the mocked JSON endpoint: a reply with `[1]`
  shows a chip, the request body carried `citations: true`, clicking the chip
  reveals and focuses the card, and the card's link points at the source and
  opens in a new tab.

## Documentation

New `configuration/citations.md`: what it looks like, enabling it in each
embed style and in a client config, the two options and three attributes, how
numbering works end to end, what a card shows, styling tokens, the strings, a
privacy section (favicon requests go to each source's origin with no
referrer; `favicons: false` stops them; the `citations` flag is the only thing
added to requests), requirements (worker from this release; RAG on), and
limitations (the model decides whether to cite; brackets in code that happen
to be in range become chips). Updates to the widget options table and
attribute list, the localization key table, the clients page, the RAG page
(intro, "How it works", and the "Related" pointer to #56), a new streaming
section in the REST reference listing all five events and the `citations`
request field and `snippet` response field, the theming token table, and
`CLAUDE.md`.

## Bundle budget

Everything ships in the main bundle. Budgets are raised to measured size plus
5%, in their own commit with the deltas against `main`, per CONTRIBUTING.

## Acceptance criteria

| Criterion | How it is met |
|-----------|---------------|
| Worker streams `sources` as a final SSE event after the assistant text | Already true through `done` (fact 1). Added: a `sources` event before the first chunk, so chips render during streaming |
| `[1]`, `[2]` render as superscript chips | `parseCitations` in the renderer's leaf step; chips are accent pills raised with `align-super`; only in-range numbers qualify |
| Clicking a chip scrolls to the matching card | Reveal: expand, "Show all" if needed, `scrollIntoView`, focus, 1.5 s highlight |
| Card shows favicon, title, snippet (about 200 chars), external link | Favicon from the source origin with fallback; `snippet` added to the wire format and cut to 200 characters on both sides; title link with the new-tab hint |
| Configurable max-sources (default 5) with "Show all" | `maxSources` on the option, attribute, and client config; "Show all (N)" / "Show fewer" |
| Styling respects the accent colour and theme | Theme tokens only; chips use the one accent pairing every theme guarantees |

## Decisions made without the maintainer

Each of these would have been a question. The choice and the reason are here
so any of them can be reversed quickly.

1. **Opt-in, fail closed**, against the issue's implied default. Fact 5, and
   the precedent of #55.
2. **The footer replaces the source icon and sidebar only when `citations` is
   on.** Sites that did not opt in see no change at all.
3. **The widget drives the worker** through `ChatRequest.citations`. No new
   worker variable. See approaches B and C.
4. **An early `sources` SSE event**, in addition to `done.sources`, emitted
   after the model connection opens. Facts 6 and 8.
5. **Favicons come from `<origin>/favicon.ico`**, no third party, no
   referrer, switchable with `favicons: false`, on by default because the
   issue asks for them.
6. **The footer is collapsed by default.** A chip click or the toggle opens
   it.
7. **Snippets are 200 characters, built by the worker from the first chunk
   of each page**, and cut again by the widget for sources from elsewhere.
8. **Sources are limited to the excerpts that fit the context budget** (fact
   4). This is a behaviour change for RAG deployments only when the budget
   drops an excerpt, which the defaults do not do.
9. **`[1, 3]` groups are supported** as well as `[1][3]`, because models write
   both, even though the instruction asks for the second.
10. **Text inside bold and italic now goes through the URL and citation
    step**, so URLs inside `**` become links. A small behaviour change
    outside the feature, kept because the alternative was a second renderer.

## Out of scope, possible follow-ups

- Flipping the default to on, once the feature has run in production.
- Localizing the sidebar's own strings ("View sources", "Close sources", the
  type labels), which this design leaves untouched.
- Hover cards or tooltips showing the snippet on the chip itself.
- A per-message "Sources" toggle that remembers its state across reloads.
- Letting the worker resolve favicons at ingestion time (a `favicon` field in
  source metadata), which would remove the runtime request altogether.
- A real Markdown renderer (#71), at which point `parseCitations` becomes a
  plugin for it rather than a leaf step in the hand-rolled one.
