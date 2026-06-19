---
title: Widget options
description: Every widget option with type, default, and which embed surfaces support it.
sidebar:
  order: 1
---

The same options are accepted as React props on `<ChatWidget>`, as keys on the
`window.ClaudiusConfig` global (script embed), and — for a subset — as
attributes on the `<claudius-chat>` web component.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | `string` | (required) | URL of your Cloudflare Worker |
| `title` | `string` | `"Chat"` | Header title |
| `subtitle` | `string` | `"Ask me anything"` | Header subtitle |
| `welcomeMessage` | `string` | `"Hi! How can I help you today?"` | First assistant message shown |
| `placeholder` | `string` | `"Type your message..."` | Input placeholder |
| `persistMessages` | `boolean` | `true` | Save history to `sessionStorage` (survives navigation, clears on tab close) |
| `storageKeyPrefix` | `string` | `"claudius:messages"` | Storage key prefix; set a unique value per widget when embedding several on one page |
| `requestTimeoutMs` | `number` | `30000` | Per-attempt request timeout; `0` disables. Timeouts surface a retryable error |
| `theme` | `"light" \| "dark" \| "auto"` \| theme name \| `ClaudiusTheme` \| URL | `"light"` | Color scheme, a [built-in theme](/configuration/theming/#built-in-themes), an inline [theme object](/configuration/theming/), or a URL to a theme JSON file |
| `accentColor` | `string` | `"#2563eb"` | Primary brand color override |
| `position` | `"bottom-right" \| "bottom-left" \| "top-right" \| "top-left"` | `"bottom-right"` | Corner the bubble and window anchor to |
| `locale` | `"en" \| "es" \| "fr" \| "de"` | auto-detected | UI language; see [Localization](/configuration/localization/) |
| `translations` | `Partial<ClaudiusTranslations>` | built-in | Override individual UI strings |
| `triggers` | `Trigger[]` | `undefined` | Proactive triggers; see [Proactive triggers](/configuration/triggers/) |
| `plugins` | `ClaudiusPlugin[]` | `undefined` | Message middleware run around each send (`onBeforeSend` / `onAfterReceive` / `onError`); see [Plugins](/plugins/) |

## Web component attributes

`<claudius-chat>` supports the scalar options as kebab-case attributes:
`api-url`, `title`, `subtitle`, `welcome-message`, `placeholder`,
`persist-messages`, `storage-key-prefix`, `request-timeout-ms`, `theme`,
`accent-color`, `position`.

```html
<claudius-chat
  api-url="https://your-worker.workers.dev"
  title="Support"
  theme="auto"
></claudius-chat>
```

`locale`, `translations`, `triggers`, and `plugins` are not available as
attributes — use `window.ClaudiusConfig` or the React component for those.
(`plugins` are functions, so set them in JS via `window.ClaudiusConfig` or as a
React prop.)

## Checking the deployed version

The embed sets `window.ClaudiusWidgetVersion`; inspect it in the browser
console to see which release a page is running.
