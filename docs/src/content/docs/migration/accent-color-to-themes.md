---
title: accentColor → design tokens
description: Moving from the v1 accent-only API to full theme files.
sidebar:
  order: 5
---

Theming v2 (1.5.0) introduces design-token themes. Nothing breaks: every
pre-existing option keeps its exact behavior, and this guide is only about
adopting the new capabilities.

## What stays the same

- `theme: "light" | "dark" | "auto"` — unchanged meaning (color scheme)
- `accentColor` — still supported. It overrides the active theme's accent in
  both modes, so existing embeds render the same
- External `--claudius-*` custom-property overrides — still honored, and they
  win over theme tokens. Consider them deprecated in favor of `--cl-*` tokens

One intentional fix: user message bubbles now follow `accentColor` (and the
theme accent). Previously the header recolored but user bubbles stayed blue.
Set `colors.userBubble` explicitly if you relied on that.

## Upgrading an accent-only embed

Before:

```js
window.ClaudiusConfig = {
  apiUrl: "...",
  theme: "auto",
  accentColor: "#0057a3",
};
```

After — same result, expressed as a theme (and room to grow):

```js
window.ClaudiusConfig = {
  apiUrl: "...",
  theme: {
    colorScheme: "auto",
    colors: { accent: "#0057a3" },
  },
};
```

From there, add brand fonts, radii, and full palettes token by token — see
the [token reference](/configuration/theming/#token-reference) — or build the
file visually in the [theme editor](/theme-editor/) and host it:

```js
window.ClaudiusConfig = {
  apiUrl: "...",
  theme: "https://your-site.example/claudius-theme.json",
};
```

## Precedence summary

From weakest to strongest:

1. Built-in defaults (light or dark palette per mode)
2. Active theme's `colors` / other token groups
3. Theme's `colorsDark` (dark mode only)
4. `accentColor` (accent token only)
5. External `--claudius-*` overrides (deprecated)
