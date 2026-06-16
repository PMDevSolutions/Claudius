# Design: TypeScript Types + Hosted API Reference

Date: 2026-06-16
Issue: #44 — ship `.d.ts` types and generate an API reference with TypeDoc
Branch: `44-ship-dts-types-and-generate-an-api-reference-with-typedoc`

## Goal

Guarantee that consumers of the `claudius-chat-widget` npm package get full
TypeScript IntelliSense, and auto-generate a hosted API reference from
TSDoc comments that is published under the existing docs domain.

## Background (current state)

- `widget` publishes as `claudius-chat-widget`. It already declares
  `types: "./dist/index.d.ts"` and ships declarations, but the build runs
  `tsc --emitDeclarationOnly`, which emits a **37-file tree** (including
  dev-only `main.d.ts`, `embed.d.ts`, and `test-utils/`) rather than one
  bundled entry.
- The public surface is the barrel `widget/src/index.ts`: `ChatWidget` +
  `ChatWidgetProps`, `WidgetPosition`, translations API, locales API,
  `Trigger`/`TriggerAction`/`UrlPattern`, themes + theme token types,
  `ChatApiClient` + options, error classes, and the `Source`/`ChatMessage`/
  `Chat*` request/response types. Only the `theme` prop currently has a
  TSDoc comment.
- Docs are an Astro + Starlight site in `docs/`, deployed to the
  `claudius-docs` Cloudflare Pages project by `.github/workflows/docs.yml`.
  The sidebar already has an **API Reference** group, and there is an
  existing precedent for linking a sibling Pages site (Storybook, with
  `target: _blank` and a badge).
- `ci.yml` runs the widget job: lint, format:check, typecheck, test, build.
  There is no TypeDoc and no doc-coverage gate yet.

## Decisions (validated with user)

1. **Type bundling:** single rolled-up `dist/index.d.ts` via
   `vite-plugin-dts` (`rollupTypes: true`), replacing `tsc --emitDeclarationOnly`.
2. **API-reference hosting:** TypeDoc emits **HTML** to `widget/dist/api`;
   that HTML is copied into the Astro site and deployed with the existing
   `claudius-docs` Pages project at **`/api/`**. One domain, one deploy,
   one nav link, no new Pages project or secrets.
3. **Export-correctness guarantee (beyond AC):** add `@arethetypeswrong/cli`
   + `publint` to prove ESM/CJS consumers resolve types correctly.
4. **Visual verification (beyond AC):** screenshot the rendered `/api/`
   reference and the docs sidebar link as part of verification.

## Components

### 1. Single bundled `index.d.ts`
- Add `vite-plugin-dts` to `widget`; configure in `vite.config.ts` (lib build
  only) with `rollupTypes: true`, `tsconfigPath: './tsconfig.json'`,
  `include: ['src']`, excluding tests and stories.
- Remove `tsc --emitDeclarationOnly` from `build` / `build:lib`. Keep
  `typecheck: tsc --noEmit`. Simplify `tsconfig.json` emit options that the
  plugin now owns.
- Outcome: one `dist/index.d.ts` containing only the public surface.

### 2. TSDoc on every public export
- Document each symbol reachable from `src/index.ts`, and each member of
  exported interfaces (props, theme inputs, client options, message/source
  types). Use `@param`, `@returns`, `@defaultValue`, `@example`, `@see`.
- Mark genuinely-internal helpers `@internal` so they are excluded from both
  the generated docs and the coverage gate.

### 3. TypeDoc generation — `pnpm docs:api`
- Add `typedoc` to `widget`; `typedoc.json` with `entryPoints: ["src/index.ts"]`,
  `out: "dist/api"` (HTML), `excludeInternal/Private/Externals: true`, exclude
  tests/stories, `validation.notDocumented: true`, `treatWarningsAsErrors: true`.
- Scripts: `docs:api` (full HTML) and `docs:api:check` (`typedoc --emit none`,
  fast validation-only).

### 4. Host under the docs domain at `/api/`
- `docs/scripts/copy-api.mjs` (run as docs `prebuild`): copy `../widget/dist/api`
  into `docs/public/api/` when present; warn and skip when absent so docs-only
  local builds still succeed.
- `docs.yml`: add steps to install the widget and run `pnpm docs:api` before the
  docs build; add `widget/**` to the path triggers so the reference rebuilds
  when the public API changes.
- Add a sidebar item to the existing **API Reference** group:
  `{ label: "Generated Reference (TypeDoc)", link: "/api/", attrs: { target: "_blank", rel: "noopener noreferrer" }, badge: { text: "typedoc" } }`.
- `.gitignore`: add `docs/public/api/` (generated, not committed).

### 5. CI doc-coverage gate
- `treatWarningsAsErrors` + `validation.notDocumented` make `docs:api:check`
  exit non-zero on any undocumented public symbol or broken `@link`.
- `ci.yml` widget job gains a **TSDoc coverage** step (`pnpm docs:api:check`)
  and an export-correctness step (`attw` + `publint`). The existing Build step
  now also exercises `vite-plugin-dts`.

### 6. Verification (including visual)
- After `pnpm build`: assert a single `dist/index.d.ts` with no leftover
  `dist/components/*.d.ts`; run `attw` + `publint` on the packed tarball.
- Build docs, then screenshot the rendered `/api/` reference and the docs
  sidebar link to confirm rendering and wiring.

## Acceptance-criteria mapping

| Acceptance criterion | Component |
|---|---|
| Vite build emits a single `index.d.ts` bundle | 1 |
| All public exports have TSDoc comments | 2, 5 (enforced) |
| `pnpm docs:api` runs TypeDoc -> HTML in `dist/api` | 3 |
| Generated reference published to Cloudflare Pages + linked from docs | 4 |
| CI fails if any public export lacks a TSDoc summary | 5 |

## Risks / notes

- `rollupTypes` uses `@microsoft/api-extractor` under the hood; complex type
  constructs can produce warnings. The public types here are simple (string
  unions + interfaces), so risk is low. Verify the single-file output and
  consumer resolution with `attw`.
- Hosting at bare `/api/` is collision-free with the existing `/api/rest` and
  `/api/widget` content routes (no shared file/route names). Confirmed.
- Local docs `dev`/`build` without first generating the widget API will show
  no `/api/`; the tolerant copy script makes this a warning, not a failure.

## Out of scope

- Auto-generating Markdown prop tables into the hand-written docs (that was the
  "Markdown in Starlight" option, not chosen). The generated reference is the
  canonical source; hand-written pages may link to it.
- Worker package API docs (the npm consumer surface is the widget).
