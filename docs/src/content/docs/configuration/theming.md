---
title: Theming
description: Light, dark, and auto themes; brand colors; deeper customization.
sidebar:
  order: 5
---

## Theme modes

| Mode | Behavior |
|------|----------|
| `"light"` (default) | Light background, dark text |
| `"dark"` | Dark background, light text |
| `"auto"` | Follows the OS via `prefers-color-scheme`, live-updating |

```js
window.ClaudiusConfig = { apiUrl: "...", theme: "auto" };
```

## Brand color

`accentColor` overrides the primary color (toggle bubble, header, send
button) at runtime via CSS custom properties — no rebuild needed:

```js
window.ClaudiusConfig = { apiUrl: "...", accentColor: "#0057a3" };
```

## Position

`position` anchors the widget to any corner: `bottom-right` (default),
`bottom-left`, `top-right`, `top-left`.

## Deeper customization

For changes beyond the accent color — fonts, radii, the full palette — edit
`widget/tailwind.config.ts` (brand colors like `pmds-blue`, `pmds-dark`,
`pmds-light-green`) and rebuild the embed:

```bash
cd widget
pnpm build:embed   # dist/claudius.iife.js + dist/claudius.css
```

Then [self-host the bundle](/deployment/self-hosted/) instead of using the
shared CDN build.

:::note[Planned]
Design tokens via CSS custom properties with a JSON theme schema are planned —
see [#73](https://github.com/PMDevSolutions/Claudius/issues/73).
:::
