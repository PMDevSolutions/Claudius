# Theming v2 Design (issue #73)

Design tokens via CSS custom properties, schema-validated theme files, four
built-in themes, a theme editor, and a documented migration path from the
`accentColor`-only API.

## Constraints

- **No breaking changes.** The CDN `@1` channel auto-updates production sites.
  `theme: "light" | "dark" | "auto"`, `accentColor`, and the existing
  `--claudius-*` custom properties must keep working unchanged.
- Default appearance must be pixel-identical before/after the refactor; the
  existing 220 widget tests are the regression net.

## Token set (`--cl-*`)

| Group | Tokens | Notes |
|-------|--------|-------|
| Colors | `accent`, `accent-text`, `surface`, `surface-muted`, `text`, `text-muted`, `border`, `user-bubble`, `user-bubble-text`, `assistant-bubble`, `assistant-bubble-text`, `error`, `error-surface`, `scrim` | `user-bubble` defaults to `var(--cl-color-accent)`; `assistant-bubble` to `surface-muted` (fixes the wart where `accentColor` recolored the header but not user bubbles) |
| Radii | `sm` (8px), `md` (12px), `lg` (16px), `full` (9999px), `tail` (2px) | window/bubbles=lg, buttons/inputs=md, bubble tail=tail |
| Shadows | `elevated` (window), `floating` (toggle), `floating-hover` | |
| Fonts | `heading`, `body` | carried over from `--claudius-font-*` |

**Dark mode:** light values are token defaults; `[data-claudius-dark="true"]`
reassigns each color token to `var(--cl-color-<name>-dark, <current dark value>)`.
The wrapper splits into an outer div carrying inline theme vars and an inner
div carrying `data-claudius-dark`, so the attribute rule beats inherited
inline light values. Today's hard-coded `dark:` utilities become the `-dark`
defaults, keeping default dark mode pixel-identical.

**Legacy aliases:** Tailwind palette entries become fallback chains, e.g.
`var(--claudius-primary, var(--cl-color-accent, #2563eb))` — anyone setting
`--claudius-*` externally keeps working and still wins.

## API

```ts
type ClaudiusThemeInput =
  | "light" | "dark" | "auto"                       // existing: mode only
  | "default" | "minimal" | "playful" | "corporate" // built-in themes
  | ClaudiusTheme                                   // inline token object
  | (string & {});                                  // URL to a theme JSON

interface ClaudiusTheme {
  $schema?: string;
  name?: string;
  colorScheme?: "light" | "dark" | "auto";  // defaults to "light"
  colors?: Partial<Record<ThemeColorToken, string>>;     // camelCase keys
  colorsDark?: Partial<Record<ThemeColorToken, string>>; // dark overrides
  radii?: Partial<Record<"sm" | "md" | "lg" | "full" | "tail", string>>;
  shadows?: Partial<Record<"elevated" | "floating" | "floatingHover", string>>;
  fonts?: Partial<Record<"heading" | "body", string>>;
}
```

- Strings `light|dark|auto` keep their exact current meaning (mode only).
- Built-in names resolve to exported theme objects (`builtinThemes`); each
  carries its own `colorScheme`. Combining a built-in with a different mode:
  `theme={{ ...builtinThemes.corporate, colorScheme: "dark" }}`.
- Any other string is treated as a URL: fetched, JSON-parsed, structurally
  checked. On fetch/parse/shape failure: console.error and fall back to the
  default theme — the widget never breaks because a theme file is down.
- `accentColor` still works and **wins over** the theme's accent (it is the
  older, more specific contract). Internally it now sets `--cl-color-accent`.
- Web component: `theme` attribute accepts mode strings, built-in names, and
  URLs (attributes can't express objects; documented).
- Package exports gain `ClaudiusTheme` and `builtinThemes`.

## Built-in themes

- `default` — empty overrides (the baked-in defaults)
- `minimal` — monochrome: near-black accent, square-ish radii (4/6/10px), hairline shadows
- `playful` — violet accent, pill radii (16/20/24px), soft colored shadows, rounded font stack
- `corporate` — navy accent, tight radii (4/6/8px), subtle shadows, neutral grays

## Schema

JSON Schema draft-07 (same dialect as `clients/_schema.json`), source of truth
at `widget/src/theme/theme.v1.schema.json`, committed copy served from
`docs/public/schema/theme.v1.json` → published at
`https://claudius-docs.pages.dev/schema/theme.v1.json` (the issue's
`claudius.dev` host doesn't exist yet; same "or equivalent" precedent as #74 —
when the domain is attached the path carries over). A widget test asserts the
two files are byte-identical (drift guard, no cross-package build coupling).
All leaf values: non-empty strings (CSS color syntax is too varied to regex);
`additionalProperties: false` everywhere catches typos. Runtime widget
validation is a lightweight structural check (no AJV in the bundle); AJV is a
widget devDependency for tests, which validate all four built-ins against the
schema.

## Theme editor

A custom docs-site page at `/theme-editor/` (Starlight `<StarlightPage>` +
vanilla JS island): grouped controls for all tokens (light + dark), a live
preview pane — a static widget replica styled exclusively by the same
`--cl-*` tokens — and export as download/copy of a JSON file containing only
non-default values plus `$schema`. Built-ins selectable as starting points.
The issue places the editor on the playground site, which doesn't exist yet
(#48/#83); the docs site is its interim home, and the editor moves when the
playground lands.

## Out of scope

- Playground site itself (#48/#83); per-tenant theme storage; CLI validation
  of theme files (possible follow-up to `pnpm claudius validate`).
