---
title: Widget API
description: TypeScript surface of the widget package — components, types, and globals.
sidebar:
  order: 2
---

## Exports

```ts
import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";
```

### `<ChatWidget />`

```ts
interface ChatWidgetProps {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  persistMessages?: boolean;
  storageKeyPrefix?: string;
  requestTimeoutMs?: number;
  theme?: ClaudiusThemeInput;
  accentColor?: string;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  locale?: "en" | "es" | "fr" | "de";
  translations?: Partial<ClaudiusTranslations>;
  triggers?: Trigger[];
}
```

Defaults and semantics: [widget options reference](/configuration/widget/).

### `Trigger`

```ts
type Trigger =
  | { on: "time"; seconds: number; matchUrl?: string | RegExp; action: TriggerAction }
  | { on: "scroll"; percent: number; matchUrl?: string | RegExp; action: TriggerAction }
  | { on: "exit-intent"; matchUrl?: string | RegExp; action: TriggerAction }
  | { on: "url"; pattern: string | RegExp; action: TriggerAction };

type TriggerAction = "open" | { greeting: string };
```

### `ClaudiusThemeInput` and `ClaudiusTheme`

```ts
type ClaudiusThemeInput =
  | "light" | "dark" | "auto"                       // color-scheme mode
  | "default" | "minimal" | "playful" | "corporate" // built-in themes
  | ClaudiusTheme                                   // inline tokens
  | (string & {});                                  // URL to theme JSON

interface ClaudiusTheme {
  $schema?: string;
  name?: string;
  colorScheme?: "light" | "dark" | "auto";
  colors?: Partial<Record<ThemeColorToken, string>>;
  colorsDark?: Partial<Record<ThemeColorToken, string>>;
  radii?: Partial<Record<"sm" | "md" | "lg" | "full" | "tail", string>>;
  shadows?: Partial<Record<"elevated" | "floating" | "floatingHover", string>>;
  fonts?: Partial<Record<"heading" | "body", string>>;
}
```

The four built-ins are exported as `builtinThemes`. Token semantics and
defaults: [theming reference](/configuration/theming/#token-reference).

### `ClaudiusTranslations`

All UI strings; see the [key table](/configuration/localization/#available-keys).
`Partial<ClaudiusTranslations>` merges over the resolved locale.

## Globals (script embed)

| Global | Direction | Purpose |
|--------|-----------|---------|
| `window.ClaudiusConfig` | you → widget | Configuration object read at load; same keys as `ChatWidgetProps` |
| `window.ClaudiusWidgetVersion` | widget → you | The bundle's release version (`"dev"` for local builds) |

## `<claudius-chat>` web component

Registered automatically when the embed bundle loads. Attributes (kebab-case
scalar options only): `api-url` (required), `title`, `subtitle`,
`welcome-message`, `placeholder`, `persist-messages`, `storage-key-prefix`,
`request-timeout-ms`, `theme`, `accent-color`, `position`. Attribute changes
re-render the widget.

## Message persistence

With `persistMessages` (default on), history is stored in `sessionStorage`
under `<storageKeyPrefix>` — it survives page navigation and clears when the
tab closes. Trigger dismissals are stored under
`claudius:triggers:dismissed`.
