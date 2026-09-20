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

A pretty-printed array of `ChatMessage` objects, exactly as the widget
[keeps them in `sessionStorage`](/api/widget/#message-persistence):

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
