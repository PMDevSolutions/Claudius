# Conversation export: design

Issue: [#55](https://github.com/PMDevSolutions/Claudius/issues/55)
Date: 2026-09-19
Status: approved, implemented in the same PR as this document

## Summary

Add an opt-in `conversationExport` option to the widget. It puts an overflow
menu in the chat header with three actions: copy the conversation to the
clipboard as Markdown, download it as a Markdown file, and download it as a
JSON file. Everything happens in the browser. Nothing is sent to the worker.

Exporting timestamps requires recording them, so `ChatMessage` gains an
optional `createdAt`. That is the only change outside the new feature. There
is no worker, API, or wire-format change.

## Facts that constrain the design

These were checked against the code, MDN, and a local Node 24 (ICU 78.3) on
2026-09-19. Several shaped the design more than the issue text did.

1. **Messages carry no timestamp.** `ChatMessage` has `id`, `role`, `content`,
   `sources`, `attachments`, and `toolUses`. The issue requires timestamps in
   the Markdown export, so they have to be recorded first.
2. **The worker ignores unknown message fields, and always has.** Today
   `validateMessages` returns `{ role, content, attachments? }`. The very
   first version of `worker/src/chat.ts` (b53d64a) already mapped each message
   to `{ role, content }`. The widget has always sent `id`, and later
   `sources` and `toolUses`, which every deployed worker discards. A new
   optional field is therefore safe even for a worker that is never
   redeployed.
3. **Embeds load a floating tag.** The quick start documents
   `cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js`. A
   minor release reaches every live site with no action by its owner, so a
   feature that is on by default appears everywhere at once.
4. **The widget renders very little Markdown.** `ChatMessage` handles bold,
   italic, and URLs, and turns every newline into a `<br>`. Everything else,
   code fences included, is shown as literal text. So "preserves code blocks"
   cannot mean converting anything: it means not damaging text that is
   already Markdown. It also means a single newline is a visible line break
   on screen, while CommonMark treats it as a space. The default system
   prompt tells the bot to "ALWAYS use line breaks between sentences", so
   this is the normal case, not an edge case.
5. **Partial replies are kept.** When a visitor stops a stream, or a stream
   breaks after text has rendered, `useChat` keeps the partial reply as a
   settled message. A reply cut off inside a code block leaves an unclosed
   fence in the history.
6. **Escape closes the chat from a document-level listener**
   (`ChatWindow`), and the focus trap treats every enabled `button` as
   focusable, whatever its `tabindex`.
7. **Inline attachment bytes exist only in memory.** A `ChatAttachment` holds
   base64 `data` until the worker stores the file. `stripAttachmentData`
   removes it before anything is persisted.
8. **Clipboard writes are restricted.** MDN: writing "can only be done in a
   secure context"; in Firefox and Safari "writing requires transient
   activation"; and `clipboard-write` "must be allowed for `<iframe>` elements
   that access the clipboard". A refused write rejects with `NotAllowedError`.
9. **`Intl.DateTimeFormat` has two traps.** `dateStyle` and `timeStyle` cannot
   be combined with `timeZoneName` (it throws a `TypeError`). And the
   separator before AM/PM depends on the engine and ICU version: some emit
   U+202F (narrow no-break space), which looks identical but breaks string
   comparison and some plain-text tools. ICU 78.3 emits a plain space, so the
   behaviour cannot be reproduced locally and tests must not depend on it.

## Approaches considered

**A. A pure serializer, a small generic menu component, and thin wiring, with
no dependencies (chosen).** The logic worth unit testing lives in one pure
module. The menu knows nothing about export and can host later items.

**B. A menu library** (Radix, Headless UI). Rejected. Either costs more gzip
than the whole voice feature did (3.9 KB). Both render through a portal by
default, which moves the popup outside `.claudius-root` and
`[data-claudius-dark]`, losing theme tokens and dark mode, and outside the
dialog's focus trap.

**C. The native `popover` attribute.** Light dismiss and the top layer come
free, but it supplies no menu keyboard behaviour, so roving focus still has
to be written. Positioning it against the trigger needs CSS anchor
positioning, which is not yet available everywhere, and jsdom implements
none of it, so it could not be unit tested. Rejected.

For timestamps, the alternative to a field on the message was a separate
`id -> time` map inside `useChat`. It would keep the public type untouched,
but the times would not persist with the history and would be missing from
the JSON export, which the issue defines as the message array itself.
Rejected.

## Public API

```ts
// ChatWidgetProps / window.ClaudiusConfig
conversationExport?: boolean; // Default false

// ChatMessage
createdAt?: string; // ISO 8601
```

- **Off by default. This departs from the issue**, whose wording ("can be
  disabled per widget") implies on by default. Because of fact 3, on by
  default would add a header button to every live embed the moment the
  release is tagged, including any privacy-sensitive client, until that
  client's snippet was changed. Opt-in matches `attachments` and `voice`,
  keeps the new code unrendered for embeds that did not ask for it, and can
  be flipped later without breaking anyone. The reverse change could not.
- **Fails closed**, like `voice`. Only the literal `true` enables it. The
  string `"false"` from a CMS template is truthy and must not switch it on.
- **A boolean, not an options object.** One switch satisfies the issue.
  Widening to `boolean | ConversationExportOptions` later is not a breaking
  change.
- Not named `export`: a reserved word cannot be destructured from props.
- `<claudius-chat>` gains `conversation-export`. It enables the feature only
  when the attribute is present and its value, trimmed and lowercased, is
  `""` or `"true"`. Every other value, `"False"`, `"0"`, `"no"`, `"yes"`,
  leaves it off. This is deliberately stricter than `attachments`, which takes
  any value but `"false"`: a Python or Jinja template renders a false value as
  `"False"`, and a privacy switch must not be turned on by it.
- `clients/_schema.json`, CLI validation, and both snippet generators accept
  `widget.conversationExport`. Snippets emit it only when it is `true`.

### `createdAt`

- Set when `useChat` first adds a message to the conversation: on send for a
  visitor message, on the first streamed token or tool call for a streamed
  reply, on arrival for a blocking reply, and for replies synthesized by a
  plugin (`respondWith` in `onBeforeSend` or `onError`).
- Carried from the streaming placeholder to the settled message, so the time
  does not jump when the reply completes.
- Restored when a plugin returns a replacement message without it. A plugin
  that builds a fresh object should not silently erase the time.
- **Always recorded, whether or not export is enabled.** The message shape
  should not depend on a display option, and a client that enables export
  later gets timestamps for the conversations already in progress.
- Optional. Messages persisted by an earlier version have none, and export
  without a time.
- It travels in the request body like `id` does, and the worker discards it
  (fact 2).

## Architecture

```
useChat      stamps createdAt on every message it creates
ChatWidget   conversationExport === true
             resolveSpeechLang(locale ?? detectLocale())  -> date locale
  ChatWindow   useConversationExport(...)     menu items + status text
    ChatHeader   actions={<HeaderMenu />}     nothing when the option is off
    status pill  role="status", over the message list
```

| Unit | Responsibility |
|------|----------------|
| `utils/exportConversation.ts` | `conversationToMarkdown`, `conversationToJson`, `exportFilename`. Pure: no DOM, no clock unless one is passed in. |
| `utils/saveText.ts` | `copyText` and `downloadTextFile`. The only code that touches the clipboard, `Blob`, and object URLs. No React. |
| `hooks/useConversationExport.ts` | Turns messages, labels, and locale into the three menu items and a transient status message. |
| `components/HeaderMenu.tsx` | Generic menu button: trigger, popup, roving focus, dismissal. Knows nothing about export. |
| `components/ChatHeader.tsx` | Gains an optional `actions` slot, rendered before the close button. |

The date locale reuses `resolveSpeechLang` from the voice feature. It already
answers the same question, "which regional variant of the widget language
does this visitor use", from `<html lang>` and `navigator.language`, so a UK
visitor to an English widget gets `19 Sept 2026, 15:03` with no
configuration.

## Behavior

### Markdown format

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

Used tool: `get_current_time`

Sources:

1. [Parsing JSON \[guide\]](https://example.com/json_%28format%29)
````

- **Roles are "User" and "Assistant", not "You".** Every use case in the
  issue is about handing the transcript to someone else, and "You" is wrong
  for the person reading it.
- **One heading per message** (`##`), role first, then the time when there is
  one. Headings make a long transcript navigable and give a correct outline
  under the `#` title.
- **Dates** use `Intl.DateTimeFormat(locale, { dateStyle: "medium",
  timeStyle: "short" })` in the visitor's time zone. No-break spaces (U+00A0,
  U+202F) in the result are replaced with plain spaces (fact 9). An invalid
  locale tag falls back to the browser default instead of throwing.
- **The time zone appears once**, on the "Exported" line, as a UTC offset
  from a second formatter using `timeZoneName: "longOffset"`, because the two
  option styles cannot be combined (fact 9). An offset is enough for a reader
  in another zone. An IANA name such as `America/Chicago` would disclose
  coarse location for no extra benefit. Where `longOffset` is unsupported the
  offset is omitted.
- **Tool calls** appear as one line per tool, by name only, reusing the
  existing `toolUsed` string. Inputs and results stay out of the Markdown:
  the UI keeps them behind a disclosure, and they are in the JSON.
- **Attachments** are listed by name, media type, and size. No bytes and no
  signed URL: the URL expires, and a transcript is meant to be forwarded.
- The welcome message is not exported. It is not part of `messages`, and the
  window stops showing it once the conversation starts.

### Message text

Text is exported as written, with four protections. All of them exist to
keep one message from damaging the rest of the transcript, or to make the
rendered file match what the visitor saw.

1. **An unclosed code fence is closed** (fact 5). Without this, a reply that
   was stopped inside a code block swallows every later message into the
   block when the file is rendered. The scanner follows CommonMark: a fence is
   three or more backticks or tildes; it is closed only by the same character,
   at least as long, with nothing after it; a backtick fence's info string
   cannot contain a backtick. So a four-backtick block that contains
   three-backtick lines survives intact. Indentation is treated differently at
   each end. An opener accepts any amount of leading whitespace, unlike
   CommonMark, because models routinely indent fences inside list items and
   almost never write indented code blocks. A closer does not: it must not be
   indented more than three columns beyond its opener, which is the CommonMark
   rule. Without that limit, a message that shows Markdown inside Markdown has
   its outer block ended by the indented fence of the example, and the
   example's own code is then escaped and given trailing spaces, breaking the
   rule below that code inside a fence is never modified. Both indents are
   measured in columns, with tabs expanded to four-column stops. The closing
   fence that gets added copies the opener's indentation so it stays inside
   the same list item.
2. **Single newlines become hard line breaks** (fact 4). Outside fenced code,
   a non-blank line followed by another non-blank line has its trailing
   whitespace replaced with two spaces. That is invisible in the raw file,
   is ignored by viewers that already break on newlines, and makes strict
   viewers show the sentence-per-line layout the visitor saw. Lines that
   start with four or more spaces or a tab, or that end in a backslash, are
   left alone: the first may be indented code and the second is already a
   hard break. Two trailing spaces were chosen over a trailing backslash
   because a viewer that does not understand the backslash prints it.
3. **A `<` that could open an HTML block is escaped.** Outside fenced code, a
   line that starts with `<` followed by a letter, `!`, `?`, or `/` gets a
   backslash in front. In CommonMark a `<!--`, `<script`, `<pre`, `<style`,
   or `<textarea` block runs until its terminator, across blank lines, so an
   unterminated one hides the rest of the transcript, and GitHub drops
   comments entirely. The widget shows such text literally, so the escaped
   form is also the more faithful one. Inline HTML later in a line is left
   alone: it cannot extend past its own paragraph.

   One exception: a line-leading autolink, `<https://example.com>` or
   `<help@example.com>`, is left alone. It can never open an HTML block, and
   escaping it shows the brackets and links the wrong destination. The
   address form must start with a letter or digit. `!`, `?`, and `[` begin
   exactly the blocks that span blank lines, so `<!--a@b>` is an unterminated
   comment wearing an address, not an autolink, and is escaped. The first
   version of this exception accepted any local part, shipped in 1.17.0, and
   let such a line hide the rest of a rendered transcript.
4. **Line endings are normalized** to `\n`, and trailing blank lines dropped,
   unless the text ends inside an open code block. There the trailing lines
   are code, so they are left alone and only the block is closed.

Code inside a fence is never modified: no hard breaks, no escaping, no
trimming. That is what makes "long code blocks" safe. It holds for a fence
that was never closed too, which is why protection 4 cannot simply trim the
whole text before looking for fences: the first implementation did, and lost
trailing spaces and blank lines from the code of a stopped reply.

### Citations, filenames, and tool names

- Source titles have `\`, `[`, and `]` escaped and whitespace collapsed to
  single spaces, so a title cannot close the link text or span lines.
- Source URLs go through the existing `sanitizeUrl`, which allows only
  `http:` and `https:`. A source that fails is written as its title with no
  link. In a passing URL the characters `(`, `)`, `<`, `>`, and whitespace are
  percent-encoded so they cannot end the link destination.
- Filenames and tool names go in a code span whose delimiter is one backtick
  longer than the longest backtick run in the name, padded with a space when
  the name starts or ends with a backtick. Nothing inside a code span needs
  escaping, so `_draft_*final*.png` comes out intact, and so does a name that
  itself contains backticks.

### JSON format

`JSON.stringify(stripAttachmentData(messages), null, 2)` plus a final
newline: a bare `ChatMessage[]`, as the issue asks, with no envelope. Running
it through `stripAttachmentData` makes the export exactly what the widget
persists, and guarantees it never contains base64 (fact 7). `JSON.stringify`
handles every special character.

### The menu

- A vertical-ellipsis button, 40 px like the close button beside it, labelled
  "More options". It is rendered only when the option is on.
- The trigger always works. **The items are disabled, not the trigger**, while
  the conversation is empty or a reply is in flight. A menu that opens onto
  three greyed-out actions explains what it is for, and a generic menu should
  not be disabled as a whole once it holds items that are not about export.
  Items use `aria-disabled` rather than `disabled`, so a focused control never
  disappears from under the focus trap (fact 6).
- Export waits for the reply instead of including it. A transcript whose last
  message is silently cut short is worse than a control that is unavailable
  for a few seconds.
- Choosing an item closes the menu, returns focus to the trigger, and runs
  the action.

### Actions

- **Copy** builds the Markdown synchronously and calls
  `navigator.clipboard.writeText` inside the click handler, so the transient
  activation Firefox and Safari require is still present (fact 8). If the API
  is missing or rejects, as it does on an insecure origin or in an iframe
  without `clipboard-write`, it falls back to a hidden `textarea` and
  `document.execCommand("copy")`.
- **Download** creates a `Blob` (`text/markdown;charset=utf-8` or
  `application/json`), clicks a temporary `<a download>`, and revokes the
  object URL afterwards. No byte-order mark: it is invalid in JSON and breaks
  some Markdown tools.
- Files are named `chat-transcript-YYYY-MM-DD.md` and `.json`, using the
  visitor's local date assembled from `formatToParts`. The UTC date would be
  a day off for part of the world, and assembling the parts avoids depending
  on one locale's date pattern staying put.
- **Status.** A copy reports "Copied to clipboard" or "Could not copy. Try
  downloading instead." in a pill over the top of the message list, cleared
  after four seconds or when the menu is next opened. Downloads show nothing:
  the browser's own download UI is the confirmation.

## Errors

| Failure | Result |
|---------|--------|
| `clipboard.writeText` missing or rejected | Falls back to `execCommand("copy")` |
| The fallback also fails | "Could not copy. Try downloading instead." |
| Invalid locale tag | Dates use the browser's default locale |
| `longOffset` unsupported | The "Exported" line omits the offset |
| A source URL that is not http(s) | Title exported without a link |
| A message with no `createdAt` | Heading shows the role alone |
| Download blocked, as some in-app browsers do | Nothing the page can detect. Documented; copy still works |

Serialization never throws on message content.

## Accessibility

- The WAI-ARIA menu button pattern. The trigger has `aria-haspopup="menu"`,
  `aria-expanded`, and `aria-controls`. The popup is `role="menu"` labelled by
  the trigger, and items are `role="menuitem"` buttons with `tabindex="-1"`.
- Keys on the trigger: Enter, Space, and ArrowDown open the menu on its first
  item; ArrowUp opens it on its last. In the menu: ArrowDown and ArrowUp wrap,
  Home and End jump, Enter and Space activate, and Escape closes and returns
  focus to the trigger. Tab is left to the browser, and the menu closes as
  focus leaves it; closing on the keystroke instead would unmount the focused
  item before the browser had moved on from it. Shift+Tab closes the menu and
  returns to the trigger, where it would land anyway. A pointer press outside
  closes it too, which a blur handler alone would miss in Safari, since Safari
  does not focus a button when it is clicked.
- **Escape closes only the menu.** The menu's handler calls `preventDefault()`
  and `stopPropagation()`, and the chat's document-level listener (fact 6)
  now also ignores events that are already `defaultPrevented`. With React 18
  and 19, the supported range, the first alone would do, because React
  listens on the root container, below `document`. The second makes the
  behaviour independent of where a listener happens to be attached.
- The focus trap needs no change. It counts the items as focusable, but they
  are never the first or last control in the dialog, which is all it checks.
- The status pill sits in a container that is always mounted with
  `role="status"`, so the text is announced when it changes rather than when
  the element appears, which screen readers handle unreliably.
- Menu items are 40 px tall, above the WCAG 2.5.8 minimum. Nothing animates,
  so there is nothing to reduce. Colours come from theme tokens, so the dark,
  high-contrast, and custom themes apply without extra work.

## Strings

Twelve keys, translated in en, es, fr, and de (the parity test enforces it):
`moreOptions`, `copyAsMarkdown`, `downloadAsMarkdown`, `downloadAsJson`,
`copiedToClipboard`, `copyFailed`, `transcriptTitle`, `transcriptExported`
(takes `{date}`), `transcriptUser`, `transcriptAssistant`,
`transcriptAttachments`, `transcriptSources`.

The transcript is written in the widget's language, because the visitor is
the one who reads it first. The two list labels carry their own colon, as the
existing `toolUsed` string does, because French puts a space before it.

## Testing

Test-first.

- `utils/exportConversation`: roles and headings; timestamps present and
  absent; per-locale dates with a fixed `timeZone`; no-break space
  normalization through an injected formatter, since the local ICU does not
  emit one; a 5,000-line code block byte for byte; unclosed fences with
  backticks and tildes, nested longer fences, info strings, and fences
  indented inside list items; hard breaks only outside code, and none on
  indented or backslash-terminated lines; `<!--` and `<script` at line start;
  CRLF; source titles with brackets, backslashes, and newlines; URLs with
  parentheses, spaces, and angle brackets; `javascript:` URLs; filenames with
  backticks, underscores, and asterisks; emoji and right-to-left text; a
  message with attachments and no text; an empty conversation; no base64 in
  either format; the JSON parses back to the stripped messages; filenames use
  the local date.
- `HeaderMenu`: ARIA wiring, every key above, outside press, focus return,
  disabled items do not fire, and Escape closing the menu while the chat
  stays open.
- `useChat`: `createdAt` on visitor, streamed, blocking, canned, and recovered
  messages; unchanged from placeholder to settled reply; persisted; restored
  after a plugin replaces the message. Fake timers keep it deterministic.
- `ChatWindow` and `ChatWidget`: no menu by default; items disabled when empty
  or loading; copy success, fallback, and failure; download type and filename;
  non-`true` values do not enable the option.
- Embed attribute and `ClaudiusConfig`, client-config validation, both
  snippet generators.
- One Playwright spec: a real download (`page.waitForEvent("download")`), the
  clipboard in Chromium, where the permission can be granted, and Escape.

## Documentation

New `configuration/conversation-export.md`: enabling it in each embed style,
what each format contains with an example, and a privacy section. That
section says plainly that export runs entirely in the browser; that a
transcript contains whatever the conversation contains, including anything
the PII plugin did not redact; that the JSON can include attachment storage
keys and signed URLs when R2 storage is on; and that a transcript is an
editable text file, so it is not proof of what the assistant said. Updates to
the widget options table, the localization string table, the clients page,
the FAQ, and `CLAUDE.md`.

## Bundle budget

Everything ships in the main bundle: the IIFE build cannot code-split.
Budgets are raised to measured size plus 5%, in their own commit with the
deltas against `main`, per CONTRIBUTING.

## Acceptance criteria

| Criterion | How it is met |
|-----------|---------------|
| Header overflow menu with Copy as Markdown, Download as Markdown, Download as JSON | A generic `HeaderMenu` in the chat header with those three items |
| Markdown preserves roles, timestamps, code blocks, and citations | Met. Timestamps needed a new `createdAt`, so messages persisted before the upgrade export without one |
| JSON is the raw `Message[]` shape the widget stores | Met: a bare `ChatMessage[]`, as persisted, which means without inline attachment bytes |
| Can be disabled per widget for privacy-sensitive deployments | Met across all four configuration surfaces, **as an opt-in**. See Public API for why this departs from the issue |
| Unit tests for serialization edge cases | Met. See Testing |

## Out of scope, possible follow-ups

- Flipping the default to on, once the feature has run in production.
- A "Clear conversation" menu item. `useChat` already exposes
  `clearMessages`, and the menu is now there to hold it.
- Importing a JSON export to restore a conversation.
- Per-format switches, PDF or HTML export, emailing a transcript.
- Escaping inline HTML, which needs a code-span-aware scanner. A Markdown
  viewer is responsible for sanitizing what it renders, as with any file.
- Exporting the welcome message.
- Three residual divergences between the fence scanner and a real parser,
  each of which leaves the transcript worse than it needs to be for a message
  no test has ever produced. A fence opened inside a list item but closed at
  column 0 still swallows the messages after it, because CommonMark reads
  that closer as a new opener rather than as the end of the block;
  re-indenting an under-indented closer was measured against a differential
  fuzz and made as many transcripts worse as better, so it is deliberately
  not attempted. Fences inside a blockquote are not recognised at all, so
  their code gains the trailing spaces of protection 2. And a fence whose own
  opener is indented four columns or more is code to CommonMark, so the
  scanner protects a block the renderer does not see.
