---
title: Theming
description: Design tokens, theme files, built-in themes, and dark mode.
sidebar:
  order: 5
---

Every visual decision in the widget — colors, radii, shadows, fonts — resolves
through a `--cl-*` CSS custom property, so a theme can restyle all of it
without forking CSS. Try combinations live in the
[theme editor](/theme-editor/).

## The `theme` option

One option accepts four kinds of values (React prop, `window.ClaudiusConfig`
key, or `<claudius-chat theme="...">` attribute):

| Value | Example | Effect |
|-------|---------|--------|
| Mode string | `"light"`, `"dark"`, `"auto"` | Color scheme only (the original API, unchanged) |
| Built-in theme name | `"minimal"`, `"playful"`, `"corporate"`, `"default"` | Applies a bundled theme |
| Theme object | `{ colors: { accent: "#0057a3" } }` | Inline design tokens (React / `ClaudiusConfig` only) |
| URL string | `"https://your-site.example/claudius-theme.json"` | Fetches a JSON theme file validated against [the schema](https://claudius-docs.pages.dev/schema/theme.v1.json) |

If a theme URL is unreachable or invalid, the widget logs a console error and
keeps the default theme — it never breaks because a theme file is down.

```js
window.ClaudiusConfig = {
  apiUrl: "...",
  theme: {
    colorScheme: "auto",
    colors: { accent: "#0057a3", surfaceMuted: "#eef4fa" },
    radii: { lg: "12px" },
  },
};
```

## Theme files

A theme file is JSON validated against
`https://claudius-docs.pages.dev/schema/theme.v1.json` (reference it via
`$schema` for IDE autocomplete):

```json
{
  "$schema": "https://claudius-docs.pages.dev/schema/theme.v1.json",
  "name": "acme",
  "colorScheme": "light",
  "colors": { "accent": "#aa0000", "userBubbleText": "#fff8f0" },
  "colorsDark": { "accent": "#ff6666" },
  "radii": { "sm": "4px", "md": "6px", "lg": "10px" },
  "shadows": { "elevated": "0 8px 24px rgb(0 0 0 / 0.18)" },
  "fonts": { "body": "'Inter', system-ui" }
}
```

The [theme editor](/theme-editor/) builds and exports these files visually.

## Token reference

### Colors (`colors` / `colorsDark`)

`colors` apply to **both** light and dark mode; `colorsDark` overrides
individual tokens in dark mode only. Untouched tokens use the built-in
palette of whichever mode is active.

| Key | CSS property | Used for | Light default | Dark default |
|-----|--------------|----------|---------------|--------------|
| `accent` | `--cl-color-accent` | Header, toggle bubble, send button, focus rings | `#2563eb` | `#2563eb` |
| `accentText` | `--cl-color-accent-text` | Text/icons on accent surfaces | `#ffffff` | `#ffffff` |
| `accentSoft` | `--cl-color-accent-soft` | Avatar circle, hover overlay on the header | `rgb(255 255 255 / 0.2)` | same |
| `accentTextMuted` | `--cl-color-accent-text-muted` | Dimmed header icons | `rgb(255 255 255 / 0.7)` | same |
| `surface` | `--cl-color-surface` | Window, panels, greeting card | `#ffffff` | `#111827` |
| `surfaceMuted` | `--cl-color-surface-muted` | Assistant bubble, hovers, source cards | `#f1f5f9` | `#1f2937` |
| `text` | `--cl-color-text` | Primary text | `#1e293b` | `#f3f4f6` |
| `textMuted` | `--cl-color-text-muted` | Secondary text, placeholders | `#64748b` | `#9ca3af` |
| `border` | `--cl-color-border` | Borders, dividers, drag handle | `#e2e8f0` | `#374151` |
| `userBubble` | `--cl-color-user-bubble` | User message background | follows `accent` | follows `accent` |
| `userBubbleText` | `--cl-color-user-bubble-text` | User message text | `#ffffff` | `#ffffff` |
| `assistantBubble` | `--cl-color-assistant-bubble` | Assistant message background | follows `surfaceMuted` | follows `surfaceMuted` |
| `assistantBubbleText` | `--cl-color-assistant-bubble-text` | Assistant message text | `#1e293b` | `#e5e7eb` |
| `field` | `--cl-color-field` | Input field background | `#ffffff` | `#1f2937` |
| `error` | `--cl-color-error` | Error text, retry button | `#dc2626` | `#f87171` |
| `errorSurface` | `--cl-color-error-surface` | Error chip background | `#fef2f2` | `rgb(127 29 29 / 0.3)` |
| `errorText` | `--cl-color-error-text` | Text on the retry button | `#ffffff` | `#ffffff` |
| `link` | `--cl-color-link` | Links in messages | inherits text | `#60a5fa` |
| `scrim` | `--cl-color-scrim` | Mobile backdrop | `rgb(0 0 0 / 0.5)` | same |

### Radii (`radii`)

| Key | CSS property | Used for | Default |
|-----|--------------|----------|---------|
| `sm` | `--cl-radius-sm` | Input field, send button, error chip | `8px` |
| `md` | `--cl-radius-md` | Buttons, source cards | `12px` |
| `lg` | `--cl-radius-lg` | Window, message bubbles, greeting card | `16px` |
| `full` | `--cl-radius-full` | Toggle bubble, pills, avatars | `9999px` |
| `tail` | `--cl-radius-tail` | The "tail" corner of message bubbles | `2px` |

### Shadows (`shadows`)

| Key | CSS property | Used for |
|-----|--------------|----------|
| `elevated` | `--cl-shadow-elevated` | Chat window |
| `floating` | `--cl-shadow-floating` | Toggle bubble, greeting card |
| `floatingHover` | `--cl-shadow-floating-hover` | Greeting card hover |

### Fonts (`fonts`)

| Key | CSS property | Default |
|-----|--------------|---------|
| `heading` | `--cl-font-heading` | `system-ui` |
| `body` | `--cl-font-body` | `system-ui` |

## Built-in themes

| Name | Personality |
|------|-------------|
| `default` | The stock Claudius look (blue accent, 16px cards) |
| `minimal` | Monochrome, square-ish corners, hairline shadows |
| `playful` | Violet accent, pill-shaped bubbles, soft colored shadows, rounded type |
| `corporate` | Navy accent, tight radii, subdued grays |

```js
window.ClaudiusConfig = { apiUrl: "...", theme: "corporate" };
```

Built-ins are exported for composing — e.g. corporate in dark mode:

```tsx
import { ChatWidget, builtinThemes } from "claudius-chat-widget";

<ChatWidget
  apiUrl="..."
  theme={{ ...builtinThemes.corporate, colorScheme: "dark" }}
/>;
```

## Dark mode

`colorScheme` inside a theme (or the plain `"light"` / `"dark"` / `"auto"`
strings) controls the mode; `"auto"` follows `prefers-color-scheme` live. In
dark mode every color token swaps to its dark value: your `colors`, your
`colorsDark` overrides, or the built-in dark palette, in that order.

## Still works: `accentColor` and `--claudius-*`

The v1 `accentColor` option still works and overrides the theme's accent —
see the [migration guide](/migration/accent-color-to-themes/). Pre-token
`--claudius-*` custom properties (e.g. `--claudius-primary`) also keep
working and win over theme tokens; treat them as deprecated.
