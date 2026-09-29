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
