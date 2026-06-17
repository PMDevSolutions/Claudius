# TypeScript Types + Hosted API Reference Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a single bundled `dist/index.d.ts` for full consumer IntelliSense and auto-generate a TypeDoc HTML API reference hosted at `claudius-docs.pages.dev/api/`, with CI gating undocumented public exports.

**Architecture:** Replace `tsc --emitDeclarationOnly` with `vite-plugin-dts` (`rollupTypes`) so the Vite lib build emits one `index.d.ts` (+ a `.d.cts` twin for correct CJS type resolution). TSDoc every public export reachable from `src/index.ts`. TypeDoc reads that barrel, emits HTML to `widget/dist/api`, validates documentation coverage, and the Astro docs build copies the HTML into `public/api/` so it ships with the existing Pages project. CI runs the coverage gate + `attw`/`publint` export check.

**Tech Stack:** Vite 6, vite-plugin-dts, TypeDoc, @arethetypeswrong/cli, publint, Astro + Starlight, GitHub Actions, Cloudflare Pages, pnpm.

**Design doc:** `docs/plans/2026-06-16-typescript-types-api-reference-design.md`

---

## Phase 1: Single bundled `index.d.ts` via vite-plugin-dts

### Task 1.1: Add vite-plugin-dts and configure the lib build

**Files:**
- Modify: `widget/package.json` (devDeps + scripts)
- Modify: `widget/vite.config.ts`
- Create: `widget/scripts/emit-dts-cts.mjs`

**Step 1:** Install deps.
```bash
cd widget && pnpm add -D vite-plugin-dts @arethetypeswrong/cli publint
```

**Step 2:** Edit `widget/vite.config.ts` — import and register the plugin (lib build only):
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    dts({
      rollupTypes: true,
      tsconfigPath: "./tsconfig.json",
      include: ["src"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.stories.tsx",
        "src/test-setup.ts",
        "src/test-utils/**",
        "src/main.tsx",
        "src/embed.tsx",
      ],
      insertTypesEntry: true,
    }),
  ],
  // ...rest unchanged
});
```

**Step 3:** Create `widget/scripts/emit-dts-cts.mjs` (CJS type twin so `attw` passes the `require` condition):
```js
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist");
await copyFile(resolve(dist, "index.d.ts"), resolve(dist, "index.d.cts"));
console.log("[emit-dts-cts] wrote dist/index.d.cts");
```

**Step 4:** Update `widget/package.json` scripts and exports:
```jsonc
"build": "vite build && vite build --config vite.config.embed.ts && node scripts/emit-dts-cts.mjs",
"build:lib": "vite build && node scripts/emit-dts-cts.mjs",
"check:exports": "publint --strict && attw --pack .",
```
Exports map (per-condition types):
```jsonc
"main": "./dist/claudius.cjs",
"module": "./dist/claudius.js",
"types": "./dist/index.d.ts",
"exports": {
  ".": {
    "import": { "types": "./dist/index.d.ts", "default": "./dist/claudius.js" },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/claudius.cjs" }
  },
  "./embed": "./dist/claudius.iife.js",
  "./style.css": "./dist/claudius.css"
}
```

**Step 5:** Build and verify single bundle.
```bash
cd widget && rm -rf dist && pnpm build
find dist -name "*.d.ts" -o -name "*.d.cts"
```
Expected: only `dist/index.d.ts` and `dist/index.d.cts` (no `dist/components/*.d.ts`).

**Step 6:** Verify export correctness.
```bash
cd widget && pnpm check:exports
```
Expected: publint clean; attw reports types resolve for both `import` and `require` (no FalseCJS/FalseESM). If attw still flags an issue, inspect and adjust the exports map / `.d.cts`.

**Step 7:** Confirm types compile in isolation.
```bash
cd widget && npx tsc --noEmit dist/index.d.ts
```
Expected: no errors.

**Step 8:** Commit.
```bash
git add widget/vite.config.ts widget/package.json widget/scripts/emit-dts-cts.mjs widget/pnpm-lock.yaml
git commit -m "build(widget): emit single bundled index.d.ts via vite-plugin-dts"
```

---

## Phase 2: TypeDoc + doc-coverage gate (the failing test)

### Task 2.1: Add TypeDoc with strict validation

**Files:**
- Modify: `widget/package.json` (devDep + scripts)
- Create: `widget/typedoc.json`

**Step 1:** Install.
```bash
cd widget && pnpm add -D typedoc
```

**Step 2:** Create `widget/typedoc.json`:
```jsonc
{
  "$schema": "https://typedoc.org/schema.json",
  "name": "claudius-chat-widget",
  "entryPoints": ["src/index.ts"],
  "out": "dist/api",
  "tsconfig": "tsconfig.json",
  "readme": "none",
  "githubPages": false,
  "excludeInternal": true,
  "excludePrivate": true,
  "excludeExternals": true,
  "exclude": [
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.stories.tsx",
    "**/__tests__/**",
    "**/test-utils/**"
  ],
  "validation": {
    "notExported": true,
    "invalidLink": true,
    "notDocumented": true
  },
  "requiredToBeDocumented": [
    "Class", "Interface", "Function", "Variable", "TypeAlias",
    "Property", "Method", "Accessor", "EnumMember", "Constructor"
  ],
  "treatWarningsAsErrors": true
}
```

**Step 3:** Add scripts to `widget/package.json`:
```jsonc
"docs:api": "typedoc",
"docs:api:check": "typedoc --emit none",
```

**Step 4:** Run the gate to get RED (the worklist of undocumented exports).
```bash
cd widget && pnpm docs:api:check
```
Expected: FAIL — warnings-as-errors listing every public symbol/member without a TSDoc summary (this is the Phase 3 checklist).

**Step 5:** Commit the harness.
```bash
git add widget/typedoc.json widget/package.json widget/pnpm-lock.yaml
git commit -m "docs(widget): add TypeDoc config with strict doc-coverage validation"
```

---

## Phase 3: TSDoc every public export (make the gate GREEN)

**Approach (TDD loop):** `pnpm docs:api:check` is the failing test. Document the symbols it reports, rerun, repeat until it exits 0. Use a consistent voice: a one-line summary, then `@param`/`@returns`/`@defaultValue`/`@example`/`@see` as relevant. Mark internal-only helpers `@internal`.

**Files (public surface from `src/index.ts`):**
- `widget/src/components/ChatWidget.tsx` — `ChatWidget`, `ChatWidgetProps` (+ every prop), `WidgetPosition`
- `widget/src/i18n.ts` (or `i18n/index.ts`) — `ClaudiusTranslations`, `defaultTranslations`, `createTranslations`
- `widget/src/locales/index.ts` — `locales`, `detectLocale`, `resolveTranslations`, `LocaleCode`
- `widget/src/hooks/useTriggers.ts` — `Trigger`, `TriggerAction`, `UrlPattern`
- `widget/src/theme/index.ts` / `widget/src/theme/types.ts` / `widget/src/theme/themes.ts` — `builtinThemes`, `ClaudiusTheme`, `ClaudiusThemeInput`, `BuiltinThemeName`, `ThemeColorToken`, `ThemeRadiusToken`, `ThemeShadowToken`, `ThemeFontToken`
- `widget/src/api/client.ts` — `ChatApiClient`, `ChatApiClientOptions`
- `widget/src/api/errors.ts` — `ChatApiError`, `DebounceError`
- `widget/src/api/types.ts` — `Source`, `ChatMessage`, `ChatRequest`, `ChatResponse`, `ChatErrorResponse`

**Worked example — `ChatWidgetProps` in `ChatWidget.tsx`:**
```ts
/**
 * Configuration for the {@link ChatWidget} component.
 */
export interface ChatWidgetProps {
  /** Absolute URL of the Worker chat endpoint (e.g. `https://api.example.com/api/chat`). */
  apiUrl: string;
  /** Header title. Falls back to the active locale's default title. */
  title?: string;
  /** Header subtitle shown beneath the title. */
  subtitle?: string;
  /** First assistant message shown when the chat opens. */
  welcomeMessage?: string;
  /** Placeholder text for the message input. */
  placeholder?: string;
  /** Persist the conversation to storage so it survives reloads. @defaultValue `false` */
  persistMessages?: boolean;
  /** Prefix for the storage key used when {@link ChatWidgetProps.persistMessages} is set. */
  storageKeyPrefix?: string;
  /** Abort a chat request after this many milliseconds. */
  requestTimeoutMs?: number;
  /**
   * Color-scheme mode (`"light" | "dark" | "auto"`), a built-in theme name,
   * an inline {@link ClaudiusTheme} object, or a URL to a theme JSON file.
   * @defaultValue `"light"`
   */
  theme?: ClaudiusThemeInput;
  /** Accent color override; wins over the theme's accent in light and dark. */
  accentColor?: string;
  /** Corner the widget docks to. @defaultValue `"bottom-right"` */
  position?: WidgetPosition;
  /** BCP-47 locale used to pick built-in translations. */
  locale?: LocaleCode;
  /** Partial overrides merged over the resolved locale translations. */
  translations?: Partial<ClaudiusTranslations>;
  /** Proactive open/greeting rules evaluated against the current page. */
  triggers?: Trigger[];
}
```
Document `ChatWidget` itself with a summary + `@param props` + an `@example` JSX block, and `WidgetPosition` with a one-line summary.

**Step (repeat):**
```bash
cd widget && pnpm docs:api:check
```
until: PASS (exit 0).

**Then generate the HTML and sanity-check:**
```bash
cd widget && pnpm docs:api && ls dist/api/index.html
```

**Commit** (logical chunks, e.g. one per area or one for all TSDoc):
```bash
git add widget/src
git commit -m "docs(widget): add TSDoc to all public exports"
```

---

## Phase 4: Host the reference under the docs domain at `/api/`

### Task 4.1: Copy script + docs build wiring

**Files:**
- Create: `docs/scripts/copy-api.mjs`
- Modify: `docs/package.json` (build script)
- Modify: `.gitignore`

**Step 1:** Create `docs/scripts/copy-api.mjs`:
```js
import { cp, access, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../widget/dist/api");
const dest = resolve(here, "../public/api");

try {
  await access(src);
} catch {
  console.warn(
    "[copy-api] ../widget/dist/api not found; skipping. " +
      "Run `pnpm --dir ../widget docs:api` to include the API reference.",
  );
  process.exit(0);
}
await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log("[copy-api] copied widget/dist/api -> docs/public/api");
```

**Step 2:** `docs/package.json` — make the copy run before the Astro build:
```jsonc
"build": "node scripts/copy-api.mjs && astro build",
```

**Step 3:** `.gitignore` — add:
```
docs/public/api/
```

### Task 4.2: Sidebar link

**Files:**
- Modify: `docs/astro.config.mjs` (API Reference group)

Add to the existing `API Reference` group's `items`:
```js
{
  label: "API Reference",
  items: [
    { autogenerate: { directory: "api" } },
    {
      label: "Generated Reference (TypeDoc)",
      link: "/api/",
      attrs: { target: "_blank", rel: "noopener noreferrer" },
      badge: { text: "typedoc", variant: "tip" },
    },
  ],
},
```

**Step:** Build docs end-to-end and verify.
```bash
cd widget && pnpm docs:api
cd ../docs && pnpm build && ls dist/api/index.html
```
Expected: `docs/dist/api/index.html` exists.

**Commit:**
```bash
git add docs/scripts/copy-api.mjs docs/package.json docs/astro.config.mjs .gitignore
git commit -m "docs: host generated TypeDoc reference at /api/ and link it in the sidebar"
```

---

## Phase 5: CI wiring

### Task 5.1: Doc-coverage + export gates in widget CI

**Files:**
- Modify: `.github/workflows/ci.yml` (widget job)

Add after the `Type check` step and after `Build` respectively:
```yaml
      - name: API docs coverage (TSDoc)
        run: pnpm docs:api:check

      # (existing) Build step here ...

      - name: Validate package exports (attw + publint)
        run: pnpm check:exports
```
Order: lint -> format check -> typecheck -> **docs:api:check** -> test -> build -> **check:exports**.

### Task 5.2: Generate the reference in the docs workflow

**Files:**
- Modify: `.github/workflows/docs.yml`

1. Add `widget/**` to both `push.paths` and `pull_request.paths`.
2. In the `build` job, before `Build (includes Pagefind index)`, add:
```yaml
      - name: Install widget deps
        working-directory: widget
        run: pnpm install --frozen-lockfile

      - name: Generate API reference (TypeDoc)
        working-directory: widget
        run: pnpm docs:api
```
(The docs `build` script's `copy-api.mjs` then picks up `widget/dist/api`.)

**Commit:**
```bash
git add .github/workflows/ci.yml .github/workflows/docs.yml
git commit -m "ci: gate undocumented exports + bad exports, generate API reference in docs build"
```

---

## Phase 6: Full verification (including visual)

**Step 1:** Clean widget build + assertions.
```bash
cd widget && rm -rf dist && pnpm build
find dist -name "*.d.*ts" | sort      # expect only index.d.ts + index.d.cts
pnpm check:exports                     # attw + publint clean
pnpm docs:api:check                    # coverage gate green
```

**Step 2:** Docs build + serve + visual check.
```bash
cd widget && pnpm docs:api
cd ../docs && pnpm build && pnpm preview   # serves http://localhost:4321
```
Then with chrome-devtools MCP:
- Navigate to `http://localhost:4321/api/` and screenshot — confirm the TypeDoc reference renders with `ChatWidget`, props, hooks, types.
- Navigate to a Starlight page and screenshot the sidebar — confirm the "Generated Reference (TypeDoc)" link with the `typedoc` badge appears under API Reference.

**Step 3:** Regression + pre-push checks (per project memory: scoped prettier, e2e).
```bash
cd widget && pnpm test                 # expect 257 passing
pnpm lint
pnpm exec prettier --check <changed widget files>   # scoped, NOT format:check (CRLF artifact)
pnpm e2e:install && pnpm e2e           # per memory: run before pushing widget changes
```

**Step 4:** Finish the branch (per CLAUDE.md auto-PR rule): push and open a PR with `Closes #44` if all criteria are met.

---

## Acceptance-criteria checklist

- [ ] Vite build emits a single `index.d.ts` bundle (Phase 1)
- [ ] All public exports have TSDoc comments (Phase 3, enforced Phase 5)
- [ ] `pnpm docs:api` runs TypeDoc -> HTML in `dist/api` (Phase 2/3)
- [ ] Generated reference published to Cloudflare Pages + linked from docs (Phase 4/5)
- [ ] CI fails if any public export lacks a TSDoc summary (Phase 5)
