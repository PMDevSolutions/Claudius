# i18n: Ship en/es/fr/de translations + contributor guide

Date: 2026-05-26
Issue: #67

## Goal

Ship first-party translations of every widget UI string for English, Spanish,
French, and German. Auto-detect the locale, allow an explicit override, surface
locale switching in Storybook, guard key parity in CI, and document how
contributors add new locales.

## Current state

- `widget/src/i18n.ts` defines `ClaudiusTranslations` (the full string shape)
  and `defaultTranslations` (English). `createTranslations(overrides)` merges a
  partial override onto the defaults.
- `ChatWidget` accepts `translations?: Partial<ClaudiusTranslations>` and builds
  the active set in a `useMemo`. Per-string props (`title`, `subtitle`, etc.)
  override the resolved translations.
- No `locale` prop, no auto-detection.
- No Storybook in the repo.
- CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, test,
  build for the widget.

## Design

### Locale modules

```
widget/src/locales/
  en.ts        # English (full ClaudiusTranslations) — single source of English truth
  es.ts        # Spanish
  fr.ts        # French
  de.ts        # German
  index.ts     # registry, LocaleCode type, detectLocale, resolveTranslations
```

- English strings move from `i18n.ts` into `locales/en.ts`. `i18n.ts` re-exports
  them as `defaultTranslations` so English is not duplicated.
- Each non-English module exports a `const` annotated `: ClaudiusTranslations`,
  making a missing key a compile error.

### Registry + resolution (`locales/index.ts`)

- `type LocaleCode = "en" | "es" | "fr" | "de"`
- `locales: Record<LocaleCode, ClaudiusTranslations>`
- `detectLocale(): LocaleCode` — reads `document.documentElement.lang`, then
  `navigator.language`; normalizes the primary subtag (`es-MX` → `es`); returns
  a known `LocaleCode` or `"en"`. SSR-guarded (`typeof document`/`navigator`).
- `resolveTranslations({ locale, translations })` — base = `locales[locale ??
  detectLocale()]`; apply partial `translations` overrides on top.

Resolution order: explicit per-string props > `translations` override >
resolved locale (`locale` prop > `<html lang>` > `navigator.language` > `en`).

### ChatWidget

- Add `locale?: LocaleCode`.
- Replace `createTranslations(overrides)` in the `useMemo` with
  `resolveTranslations({ locale, translations: overrides })`.
- Existing per-string prop precedence unchanged; API change is additive.

### Storybook

- Initialize `@storybook/react-vite` (latest stable) in `widget/`.
- Locale switcher via Storybook globals + toolbar item in `.storybook/preview.ts`
  (no custom addon package). A decorator injects the selected `locale` into the
  widget.
- Stories: `ChatWidget.stories.tsx` (open by default) and `ChatWindow.stories.tsx`.
- Import Tailwind styles in `preview.ts`.
- Add `build-storybook` to the widget CI job to prevent silent breakage.

### CI key-parity test

`widget/src/locales/__tests__/parity.test.ts`:

- Canonical key set = `Object.keys(en)`.
- For each locale, assert key set deep-equals English's (missing AND extra keys).
- Assert no empty-string values.
- Runs in the existing `pnpm test` step.

### CONTRIBUTING.md

New "Adding a new locale" section:

1. Copy `en.ts`, translate all values.
2. Register in `locales/index.ts`.
3. Run `pnpm test` and `pnpm typecheck`.

Call out strings needing cultural review (not literal translation):
- `welcomeMessage`, `subtitle` — greeting warmth/formality (e.g. tu vs. usted).
- `error*` — tone (apologetic vs. neutral).

## Testing

- Key-parity test (above).
- `detectLocale` units: html lang, navigator fallback, subtag normalization,
  unknown → en, SSR guard.
- `resolveTranslations` units: locale selection + override layering.
- Visual check in Storybook across all four locales.

## Out of scope

- Locales beyond en/es/fr/de (contributor path documented instead).
- RTL languages (none of the four are RTL).
- Translating bot responses (server-side; this is UI chrome only).
