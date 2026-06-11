---
title: RAG
description: Grounding answers in your content — what works today and the planned retriever interface.
---

## Today: prompt-grounded answers + source rendering

The shipped path for grounding answers in your content is the
[system prompt](/configuration/worker/#system-prompt): include your services,
pricing, FAQ, and key page URLs there, and the bot answers from that
knowledge. This works well for the small-to-medium knowledge bases the widget
is designed for.

On the widget side, the source-display UI already exists: the chat API's
response type allows an optional `sources` array, and the widget renders a
source icon with a badge count plus a slide-out sidebar
(`ChatSources`) grouping links by type:

```json
{
  "reply": "Our hourly rate is $75...",
  "sources": [
    { "url": "https://example.com/pricing", "title": "Pricing", "type": "page" }
  ]
}
```

| `type` | Meaning |
|--------|---------|
| `"blog"` | Blog post |
| `"page"` | Site page |
| `"external"` | Third-party link |

The bundled worker does not populate `sources` yet — if you run a custom
backend that performs retrieval, you can return `sources` today and the
widget will render them.

## Planned: pluggable retrieval

- **Pluggable retriever interface + Cloudflare Vectorize reference
  implementation** — embed your content, retrieve relevant chunks per
  question, and ground replies in them —
  [#52](https://github.com/PMDevSolutions/Claudius/issues/52)
- **Inline citations and source cards** rendered from RAG results —
  [#56](https://github.com/PMDevSolutions/Claudius/issues/56)

Neither is shipped yet; the issues track design and progress.
