---
title: Proactive triggers
description: Auto-open the chat or show a greeting bubble on time, scroll, exit intent, or URL match.
sidebar:
  order: 3
---

Triggers open the chat or pop a dismissable greeting bubble when a visitor
meets a condition. A dismissal is remembered in `sessionStorage`: once the
visitor closes an auto-opened chat or dismisses the bubble, no further
triggers fire that session.

```js
window.ClaudiusConfig = {
  apiUrl: "...",
  triggers: [
    // Greeting bubble after 30s on any page
    { on: "time", seconds: 30, action: { greeting: "Need a hand?" } },

    // Auto-open after scrolling 80% of the pricing page
    { on: "scroll", percent: 80, matchUrl: "/pricing", action: "open" },

    // Exit-intent greeting only on the contact page
    {
      on: "exit-intent",
      matchUrl: "/contact",
      action: { greeting: "Have a quick question before you go?" },
    },

    // Greet immediately when someone lands on /docs
    {
      on: "url",
      pattern: "/docs",
      action: { greeting: "Looking for something specific?" },
    },
  ],
};
```

Each trigger has an `on` type, an `action`, and an optional `matchUrl` scoping
it to certain pages. `matchUrl` (and the `url` trigger's `pattern`) accepts a
case-insensitive substring or a `RegExp` (RegExp only via the React component
or an inline script — JSON can't express it).

## Trigger types

| `on` | Extra fields | Fires |
|------|--------------|-------|
| `"time"` | `seconds: number` | After N seconds on the page |
| `"scroll"` | `percent: number` (0–100) | Once the visitor scrolls past N% of the page |
| `"exit-intent"` | — | When the mouse leaves the viewport via the top edge |
| `"url"` | `pattern: string \| RegExp` | Immediately on mount if the URL matches |

## Actions

| `action` | Behavior |
|----------|----------|
| `"open"` | Auto-opens the chat window |
| `{ greeting: string }` | Shows a dismissable greeting bubble next to the toggle button |
