---
title: Localization
description: Bundled locales, automatic detection, and custom translations.
sidebar:
  order: 4
---

The widget ships English (`en`), Spanish (`es`), French (`fr`), and German
(`de`) UI strings.

## Locale resolution

1. Explicit `locale` option, if set
2. `<html lang>` attribute of the host page
3. `navigator.language`
4. Fallback: English

Region subtags are normalized (`fr-CA` → `fr`); unknown languages fall back to
English.

```js
window.ClaudiusConfig = {
  apiUrl: "...",
  locale: "de", // force German regardless of page/browser language
};
```

## Overriding individual strings

`translations` merges over the resolved locale, so you can override just the
strings you care about:

```js
window.ClaudiusConfig = {
  apiUrl: "...",
  locale: "es",
  translations: {
    title: "Soporte PMDS",
    welcomeMessage: "¡Hola! ¿En qué puedo ayudarte hoy?",
  },
};
```

## Available keys

| Group | Keys |
|-------|------|
| Window | `title`, `subtitle`, `welcomeMessage`, `closeChat`, `chatMessages`, `typingIndicator` |
| Input | `placeholder`, `sendMessage`, `typeYourMessage` |
| Toggle / bubble | `openChat`, `dismissGreeting` |
| Errors | `errorGeneric`, `errorConnection`, `errorTimeout`, `errorRateLimitMinute`, `errorRateLimitHour`, `errorRetry` |

Note these localize the widget UI only. The AI's reply language follows the
conversation and your [system prompt](/configuration/worker/#system-prompt) —
instruct the bot there if you want replies pinned to a language.
