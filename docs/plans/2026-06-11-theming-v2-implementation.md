# Theming v2 Implementation Plan (issue #73)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Design-token theming per `2026-06-11-theming-v2-design.md`, fully backward compatible.

**Architecture:** Tokens defined in `styles.css` (light defaults + dark reassignment block), consumed via Tailwind theme mappings; a small theme module (`widget/src/theme/`) resolves the `theme` prop union into CSS vars applied inline on a new outer wrapper; schema + docs + editor ride on the docs site.

**Tech Stack:** Tailwind 3 custom properties, Vitest (+ AJV for schema tests), Astro/Starlight custom page.

---

### Task 1: Token foundation (no behavior change)

**Files:** `widget/src/styles.css`, `widget/tailwind.config.ts`, all `widget/src/components/*.tsx` (class refactor), `widget/src/components/ChatWidget.tsx` (wrapper split).

1. Add to `styles.css`: `:where()` -scoped token defaults? No — tokens must inherit into the widget subtree only: define defaults on the outer wrapper class `.claudius-root` (light values) and a `[data-claudius-dark="true"]` block reassigning color tokens to `var(--cl-color-X-dark, <dark default>)`.
2. Rewrite `tailwind.config.ts`: semantic classes (`claudius-surface`, `claudius-text`, …) → `var(--cl-*)`; keep legacy `claudius-*` entries as `var(--claudius-X, var(--cl-*, default))` chains; radii/shadows/fonts from tokens.
3. Component sweep: replace every hard-coded color/`dark:` pair with token classes (mapping table in design doc); `rounded-2xl`→`rounded-claudius-lg`, `shadow-2xl`→`shadow-claudius-elevated`, etc.
4. ChatWidget: split wrapper (`<div className="claudius-root" style={vars}>` outer, inner keeps `data-claudius-dark`); `accentColor` now sets `--cl-color-accent`.
5. Run `pnpm test` (220 green), `pnpm lint`, `pnpm typecheck`, `pnpm build`. Commit: `refactor(widget): move all visual styles onto --cl-* design tokens`.

### Task 2: Theme engine (TDD)

**Files:** `widget/src/theme/types.ts`, `themes.ts` (builtins), `resolve.ts` (`resolveThemeInput`, `themeToCssVars`), `__tests__/resolve.test.ts`, `__tests__/themes.test.ts`; export from `widget/src/index.ts`.

Tests first: mode strings → `{mode, theme: undefined}`; builtin names → builtin object; objects pass through; `themeToCssVars` maps camelCase→`--cl-color-kebab` (+`-dark` from `colorsDark`, radii/shadows/fonts groups); unknown keys warned & skipped; non-string values skipped. Commit per red-green cycle.

### Task 3: theme prop + URL fetch (TDD)

**Files:** `widget/src/theme/useTheme.ts` (hook: resolves input, fetches URLs with AbortController, falls back to default on any failure with one console.error), `ChatWidget.tsx` wiring (mode resolution: object `colorScheme` feeds existing light/dark/auto logic), `embed.tsx` (config + attribute pass-through), tests in `hooks/__tests__/` and `__tests__/embed.test.tsx`.

Key tests: `theme="corporate"` sets vars on wrapper; URL success applies fetched tokens; URL 404/invalid-JSON/bad-shape → defaults + error logged; `accentColor` overrides theme accent; `theme="dark"` regression (mode only, attr set); web component `theme="minimal"` works.

### Task 4: Schema + validation tests

**Files:** `widget/src/theme/theme.v1.schema.json`, copy at `docs/public/schema/theme.v1.json`, `widget/src/theme/__tests__/schema.test.ts` (AJV devDep: all builtins + a kitchen-sink fixture validate; bad fixtures fail; docs copy byte-identical).

### Task 5: Docs + theme editor

**Files:** `docs/src/content/docs/configuration/theming.md` (rewrite: tokens table, theme prop forms, builtins gallery, schema link), `docs/src/content/docs/migration/accent-color-to-themes.md`, `docs/src/pages/theme-editor.astro` (+ sidebar link in `docs/astro.config.mjs`), `docs/src/content/docs/api/widget.md` (type updates).

Editor: token controls grouped (colors light/dark tabs, radii, shadows, fonts), static preview replica driven by the same tokens, export = JSON of non-default values + `$schema`, builtin starting points. `pnpm build` green.

### Task 6: Verify + PR

Widget: test/lint/typecheck/build. Worker tests (untouched). Docs build. Push `73-theming-v2-design-tokens`, PR body includes `Closes #73` (criteria fully met by the PR per [[feedback-close-issues-via-pr-keyword]] — schema URL goes live on merge via docs auto-deploy).
