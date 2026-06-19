---
title: Plugins & Tools
description: The Claudius plugin SDK — client and server middleware for message transforms, PII redaction, canned responses, and analytics.
---

Claudius plugins are small middleware that run around the chat message
lifecycle. The same three lifecycle hooks exist on the **client** (the React
widget) and the **server** (the Worker), so you can inject context, redact PII,
route to different models, log analytics events, or answer locally — without
forking the widget.

## Lifecycle hooks

| Hook | Runs | Can |
|------|------|-----|
| `onBeforeSend` | before a message is sent | modify it, replace it, answer locally (`respondWith`), or cancel it (`abort`) |
| `onAfterReceive` | after the reply arrives | modify or replace the reply |
| `onError` | when a send fails | observe the error; on the client, recover with a fallback reply |

All hooks may be `async`. A hook that throws is caught and logged, so a single
misbehaving plugin will not break the chat — write security-sensitive
transforms (like redaction) defensively.

## Client plugins (widget)

Pass an array of plugins to `ChatWidget`. Hooks run in array order.

```tsx
import { ChatWidget, pluginRedactPII, pluginAnalytics } from "claudius-chat-widget";

export function App() {
  return (
    <ChatWidget
      apiUrl="https://your-worker.workers.dev"
      plugins={[
        pluginRedactPII(),
        pluginAnalytics({ onEvent: (e) => console.log(e) }),
      ]}
    />
  );
}
```

`onBeforeSend` returns the (possibly modified) message — and the returned
message is what is **both displayed and sent**, so a redaction is visible to the
user.

### Short-circuiting

The `onBeforeSend` context can answer without a network call, or cancel the
send entirely:

```ts
import type { ClaudiusPlugin } from "claudius-chat-widget";

const slashCommands: ClaudiusPlugin = {
  name: "slash-commands",
  onBeforeSend(message, ctx) {
    if (message.content === "/clear") return ctx.abort();
    if (message.content.startsWith("/help")) {
      ctx.respondWith("Type a question and press Enter.");
    }
  },
};
```

- `ctx.respondWith(reply)` — render `reply` as the assistant message and skip
  the API. `reply` is a string or `{ content, sources }`.
- `ctx.abort()` — drop the message and render nothing.

`onError` can recover the same way, replacing the error UI with a reply:

```ts
const fallback: ClaudiusPlugin = {
  name: "fallback",
  onError: (_err, ctx) =>
    ctx.respondWith("We're offline right now — email help@example.com."),
};
```

### Reference plugins

Three plugins ship with `claudius-chat-widget`.

**`pluginAnalytics`** — emit a structured event for every sent message, reply,
and error:

```ts
import { pluginAnalytics } from "claudius-chat-widget";

pluginAnalytics({
  onEvent: (event) => window.gtag?.("event", event.type, event),
  includeContent: false, // record only character counts, not message text
});
```

**`pluginRedactPII`** — strip emails, phone numbers, SSNs, and card-like
numbers before the message leaves the browser:

```ts
import { pluginRedactPII } from "claudius-chat-widget";

pluginRedactPII();                                  // sensible defaults
pluginRedactPII({ replacement: "***", redactReplies: true });
```

**`pluginCannedResponses`** — answer matched intents locally, with no API call:

```ts
import { pluginCannedResponses } from "claudius-chat-widget";

pluginCannedResponses({
  rules: [
    { match: "hours", reply: "We're open 9–5, Mon–Fri." },
    { match: /pricing|cost/i, reply: "See https://example.com/pricing." },
  ],
});
```

### Writing your own

A plugin is an object with a `name` and any of the three hooks:

```ts
import type { ClaudiusPlugin } from "claudius-chat-widget";

const pageContext: ClaudiusPlugin = {
  name: "page-context",
  onBeforeSend(message) {
    return { ...message, content: `[on ${location.pathname}] ${message.content}` };
  },
};
```

## Server plugins (Worker)

The Worker exposes the equivalent hooks as Hono middleware. Server hooks
operate on the whole request (the messages array) and the reply string, rather
than on a single widget message.

Register plugins in `worker/src/index.ts` — the file ships this block with an
empty list, so just drop your plugins in:

```ts
import { chatPlugins, pluginRedactPII } from "./plugins";

const serverPlugins = [pluginRedactPII({ redactReplies: true })];
if (serverPlugins.length > 0) {
  app.use("/api/chat", chatPlugins(serverPlugins));
}
```

### Server hooks

```ts
import type { ClaudiusServerPlugin } from "./plugins";

const example: ClaudiusServerPlugin = {
  name: "example",
  onBeforeSend(messages, ctx) {
    // Inspect ctx.env, transform messages, or short-circuit the model:
    //   ctx.respondWith("a canned reply");
    return messages;
  },
  onAfterReceive(reply) {
    return reply.trim();
  },
  onError(error) {
    console.error("chat failed:", error.message);
  },
};
```

- `onBeforeSend(messages, ctx)` — return a new messages array, or call
  `ctx.respondWith(text)` to answer without calling Claude.
- `onAfterReceive(reply, ctx)` — return a new reply string.
- `onError(error, ctx)` — observe failures.

### Server reference plugins

The same three plugins, adapted for the request lifecycle:

```ts
import {
  chatPlugins,
  pluginAnalytics,
  pluginRedactPII,
  pluginCannedResponses,
} from "./plugins";

const serverPlugins = [
  pluginRedactPII(), // redact every message before it reaches Claude
  pluginCannedResponses({
    rules: [{ match: /refund/i, reply: "See our refund policy at /refunds." }],
  }),
  pluginAnalytics({ onEvent: (e) => console.log(e) }),
];

app.use("/api/chat", chatPlugins(serverPlugins));
```

Redacting server-side is defense in depth — it runs even for clients that don't
ship the widget redactor. A canned (short-circuit) response skips the model, and
with it the built-in D1 analytics for that turn.

## Notes

- Hooks run in array order; the first `respondWith` / `abort` wins and stops
  that hook's chain.
- A throwing hook is caught and logged — it never breaks the chat.
- The client and server interfaces are parallel but not identical: a widget
  message carries an `id` and `sources`; the server works on plain
  `{ role, content }` messages.

## Other extension points

These complement plugins and cover most customization without code:

| Extension point | What it controls |
|-----------------|------------------|
| [System prompt](/configuration/worker/#system-prompt) (`worker/src/system-prompt.ts`) | The bot's personality, knowledge, guardrails, and FAQ answers |
| [Translations](/configuration/localization/) | Every user-facing UI string |
| [Theming](/configuration/theming/) and `widget/tailwind.config.ts` | Colors, fonts, radii |
| [Proactive triggers](/configuration/triggers/) | When the widget opens or greets proactively |
| Worker env vars (`CLAUDE_MODEL`, `MAX_TOKENS`, rate limits) | Model behavior and abuse protection |

## Planned

- **Anthropic tool-use / function calling** with a declarative tool registry,
  so the bot can call your APIs mid-conversation —
  [#51](https://github.com/PMDevSolutions/Claudius/issues/51)
- **Plugin SDK RFC for Claudius v2** — the longer-term plugin architecture —
  [#79](https://github.com/PMDevSolutions/Claudius/issues/79)
