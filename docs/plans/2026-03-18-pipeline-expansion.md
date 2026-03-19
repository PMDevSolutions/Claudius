# Pipeline Expansion: Screenshot Intake + Multi-Framework Output

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add screenshot/URL intake as a third input source, and Vue 3, Svelte/SvelteKit, and React Native as output targets alongside React — all sharing the existing `build-spec.json` + `design-tokens.lock.json` contract.

**Architecture:** The pipeline already decouples input (Figma/Canva) from output (React) through `build-spec.json` and `design-tokens.lock.json`. We add one new intake skill + agent on the input side, and introduce an `outputTarget` field in `build-spec.json` that routes Phase 4 (Build) to the correct converter agent. Phases 0-3 and 5-9 remain source- and target-agnostic — they read `build-spec.json` and don't care about the origin or destination framework. The TDD skill adapts its test runner and component patterns based on `outputTarget`.

**Tech Stack:** Existing pipeline infrastructure, Claude vision (for screenshot intake), Vue 3 + Vite, Svelte/SvelteKit, React Native/Expo, Playwright (E2E for all targets)

---

## Part A: Screenshot/URL Intake (Input Side)

### Task A1: Add `screenshot` source type to `pipeline.config.json`

**Files:**
- Modify: `.claude/pipeline.config.json`

**Step 1: Read the current config**

Verify the current `canva` section structure. We'll add a sibling `screenshot` section.

**Step 2: Add `screenshot` config section**

Add after the `canva` block in `pipeline.config.json`:

```json
"screenshot": {
  "enabled": true,
  "tokenInference": {
    "confirmWithUser": true,
    "confidenceThreshold": "medium",
    "maxInferenceRetries": 2
  },
  "capture": {
    "format": "png",
    "scale": 2,
    "quality": 100,
    "fullPage": true,
    "waitForNetworkIdle": true,
    "waitAfterLoadMs": 1000
  },
  "urlCapture": {
    "enabled": true,
    "viewports": [
      { "name": "desktop", "width": 1440, "height": 900 },
      { "name": "mobile", "width": 375, "height": 812 }
    ]
  }
}
```

**Step 3: Commit**

```bash
git add .claude/pipeline.config.json
git commit -m "feat: add screenshot source config to pipeline.config.json"
```

---

### Task A2: Create `screenshot-intake` skill

**Files:**
- Create: `.claude/skills/screenshot-intake/SKILL.md`

**Step 1: Write the skill**

The `screenshot-intake` skill follows the same contract as `figma-intake` and `canva-intake` — it produces a `build-spec.json` with `"source": "screenshot"`. It accepts three input modes:

1. **URL** — captures screenshots of a live website via Chrome DevTools MCP or Playwright MCP
2. **Image files** — user provides PNG/JPG screenshot files from their filesystem
3. **Clipboard/drag-drop** — user pastes or provides image paths

```markdown
---
name: screenshot-intake
description: Structured discovery from screenshots or live URLs. Uses Chrome DevTools or Playwright to capture pages, Claude vision to analyze structure and components, and targeted user questions to produce a build-spec.json. Entry point for /build-from-screenshot pipeline. Keywords: screenshot intake, URL capture, build spec, screenshot discovery, website clone, screenshot interview, image to code
---

# Screenshot Intake — Structured Discovery

## Purpose

Gather everything needed to build a React/Vue/Svelte/RN app from screenshots or a live URL. Captures pages, analyzes with Claude vision, asks targeted questions, and outputs a build-spec.json that downstream skills consume.

## When to Use

- First phase of `/build-from-screenshot` pipeline
- When user provides a URL and says "build something like this"
- When user provides screenshot images and wants to build from them
- When no design tool (Figma/Canva) is available

## Inputs

- **One of:**
  - URL (e.g., `https://example.com`) — will be captured via browser
  - Image file paths (e.g., `./designs/homepage.png`)
- **Optional:** Existing project directory to integrate into

## Process

### Step 1: Capture or Validate Screenshots

**If URL provided:**

Use Chrome DevTools MCP or Playwright MCP to capture:

```
1. Navigate to URL
2. Wait for network idle + 1s settle
3. Capture full-page screenshot at desktop viewport (1440x900)
4. Capture full-page screenshot at mobile viewport (375x812)
5. If URL has navigation links:
   → Detect nav links via DOM query
   → Offer to capture each linked page
6. Save screenshots to .claude/visual-qa/screenshots/source/
```

**If image files provided:**

```
1. Verify files exist and are valid images (PNG, JPG, WebP)
2. Copy to .claude/visual-qa/screenshots/source/
3. Note original dimensions
```

### Step 2: Vision Analysis

Feed each screenshot to Claude for structural analysis (identical to canva-intake Step 1 vision analysis):

```
1. Page structure: sections, layout patterns, responsive hints
2. Component candidates: buttons, cards, inputs, navbars, etc.
3. Visual hierarchy: heading levels, primary/secondary actions
4. Text content: all visible text strings
5. Color palette: dominant colors, backgrounds, text colors
6. Typography: font size hierarchy, weight patterns
```

### Step 3: Local Project Scan

Identical to figma-intake/canva-intake:

```
1. Detect framework (Next.js, Vite, Remix, Nuxt, SvelteKit, Expo, or none)
2. Detect app type (web-app, chrome-extension, pwa)
3. Scan existing components
4. Check package.json for UI libraries
5. Check for existing design tokens
6. Load pipeline config
```

### Step 4: Ask Targeted Questions (Max 6)

**Question 1 — Scope:**
> Which pages/screens should I build? [Show list from captures]

**Question 2 — Component Confirmation:**
> I detected these components from the screenshots. Confirm or correct:
> [Table with confidence levels]

**Question 3 — Output Target:**
> What framework should I build this in?
> a) React (Next.js / Vite / Remix)
> b) Vue 3 (Nuxt / Vite)
> c) Svelte (SvelteKit / Vite)
> d) React Native (Expo)
> (Default: React + Vite if no project detected)

**Question 4 — Component Reuse:**
> [Only if existing project detected]

**Question 5 — Business Logic:**
> Are there interactions beyond what's visible?

**Question 6 — Integration:**
> Standalone app or integrate into existing project?

### Step 5: Generate build-spec.json

Write `.claude/plans/build-spec.json` with:

```jsonc
{
  "version": "1.0.0",
  "source": "screenshot",
  "createdAt": "...",
  "screenshot": {
    "inputType": "url",           // "url" | "files"
    "sourceUrl": "https://...",   // null if files
    "capturedScreenshots": [
      ".claude/visual-qa/screenshots/source/page-1-desktop.png",
      ".claude/visual-qa/screenshots/source/page-1-mobile.png"
    ]
  },
  "outputTarget": "react",       // "react" | "vue" | "svelte" | "react-native"
  "appType": "web-app",
  "framework": {
    "type": "vite",               // varies by outputTarget
    "version": "6.0.0",
    "outputDir": "src"
  },
  // ... rest identical to figma/canva build-spec
}
```

### Step 6: Confirm and Proceed

Present summary, wait for confirmation.

## Output

**Primary:** `.claude/plans/build-spec.json`
**Secondary:** Captured screenshots in `.claude/visual-qa/screenshots/source/`

## Error Handling

- **URL unreachable:** Offer to retry or accept manual screenshots
- **Screenshots too small/blurry:** Warn about quality, suggest higher resolution
- **CORS/auth blocking capture:** Ask user to provide screenshots manually
- **Multi-page site:** Capture homepage, ask which subpages to include

## Integration

- **Consumed by:** `canva-token-inference` (reused for vision-based token extraction), `/build-from-screenshot`
- **Uses:** Chrome DevTools MCP, Playwright MCP, Claude vision, Glob, Read
```

**Step 2: Commit**

```bash
git add .claude/skills/screenshot-intake/SKILL.md
git commit -m "feat: add screenshot-intake skill for URL/image input"
```

---

### Task A3: Create `/build-from-screenshot` command

**Files:**
- Create: `.claude/commands/build-from-screenshot.md`

**Step 1: Write the command**

This command orchestrates the same pipeline as `/build-from-figma` and `/build-from-canva`, with Phase 1 using `screenshot-intake` and Phase 2 using `canva-token-inference` (which already does vision-based token extraction — it just needs to accept `"source": "screenshot"` alongside `"source": "canva"`).

```markdown
---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__resize_page, mcp__chrome-devtools__lighthouse_audit, mcp__chrome-devtools__evaluate_script, mcp__playwright__browser_navigate, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_resize, mcp__playwright__browser_snapshot, AskUserQuestion
---

# /build-from-screenshot — Autonomous Screenshot/URL-to-Working-App Pipeline

You are the master orchestrator for converting screenshots or a live URL into a fully working, tested application. You receive a URL or image paths and guide the process through 12 phases.

**Key enforcement rules:**
- **TDD is mandatory** — Phase 3 MUST complete before Phase 4.
- **Visual QA uses pixel diff** — Phase 5 uses `scripts/visual-diff.js`.
- **Token inference requires confirmation** — Phase 2 uses AI vision and MUST get user confirmation.
- **Output target aware** — Build phase dispatches correct converter agent based on `outputTarget`.

## Input

The user provides: `$ARGUMENTS` (a URL like `https://example.com` or image paths)

Detect input type:
- Starts with `http://` or `https://` → URL capture mode
- Otherwise → file path mode (resolve paths, verify images exist)

## Progress Tracking

```
[ ] Phase 0: Token Sync (if lockfile exists)
[ ] Phase 1: Intake — screenshot-intake skill → build-spec.json
[ ] Phase 2: Token Inference — canva-token-inference skill (reused) → lockfile + config
[ ] Phase 3: TDD Scaffold → failing tests (adapted to outputTarget)
[ ] Phase 4: Component Build → converter agent based on outputTarget
[ ] Phase 4.5: Storybook (React/Vue only)
[ ] Phase 5: Visual Verification — pixel-diff loop
[ ] Phase 5.5: Dark Mode verification
[ ] Phase 6: E2E Tests — Playwright
[ ] Phase 7: Cross-Browser (non-blocking)
[ ] Phase 8: Quality Gate
[ ] Phase 8.5: Responsive verification
[ ] Phase 9: Report
```

## Phase 1: Intake

Invoke the `screenshot-intake` skill.

**Input:** URL or file paths from $ARGUMENTS
**Output:** `.claude/plans/build-spec.json` with `"source": "screenshot"`

## Phase 2: Token Inference

Invoke the `canva-token-inference` skill. This skill already does vision-based extraction — it works identically for screenshot sources.

**Input:** build-spec.json with screenshot paths
**Output:** lockfile, tailwind/CSS config (or equivalent for target framework)

## Phase 3: TDD Scaffold

Invoke the `tdd-from-figma` skill (reads build-spec.json, works for any source).

For non-React targets, the skill adapts:
- **Vue 3:** Uses `@vue/test-utils` + Vitest
- **Svelte:** Uses `@testing-library/svelte` + Vitest
- **React Native:** Uses `@testing-library/react-native` + Jest

## Phase 4: Component Build

Dispatch the correct converter agent based on `build-spec.json.outputTarget`:

| outputTarget | Agent | Notes |
|-------------|-------|-------|
| `react` | `canva-react-converter` (reused) | Screenshot-driven, works identically |
| `vue` | `vue-converter` | New agent (Task B2) |
| `svelte` | `svelte-converter` | New agent (Task C2) |
| `react-native` | `react-native-converter` | New agent (Task D2) |

## Phases 5-9

Identical to `/build-from-canva` — all shared phases work regardless of source or target.

The build report should note `Source: Screenshot (URL)` or `Source: Screenshot (files)` and include the `outputTarget`.

## Error Recovery

- **URL capture fails:** Ask user for manual screenshots
- **Screenshots low quality:** Warn, suggest higher-resolution captures
- **Token inference unreliable:** Use more conservative defaults, require more user confirmation
```

**Step 2: Commit**

```bash
git add .claude/commands/build-from-screenshot.md
git commit -m "feat: add /build-from-screenshot command"
```

---

### Task A4: Update `canva-token-inference` to accept screenshot source

**Files:**
- Modify: `.claude/skills/canva-token-inference/SKILL.md`

**Step 1: Update the skill to be source-agnostic for vision-based extraction**

In the SKILL.md, update the "When to Use" section:

```markdown
## When to Use

- Phase 2 of the `/build-from-canva` pipeline (after `canva-intake`)
- Phase 2 of the `/build-from-screenshot` pipeline (after `screenshot-intake`)
- Any time you need to extract design tokens from screenshots (any source)
- When regenerating Tailwind config from design screenshots
```

Update the "Inputs" section:

```markdown
## Inputs

- **Required:** `.claude/plans/build-spec.json` with `"source": "canva"` or `"source": "screenshot"` and screenshot paths
  - For canva: reads `canva.exportedScreenshots[]`
  - For screenshot: reads `screenshot.capturedScreenshots[]`
- **Optional:** User-provided brand guidelines, style guide, or color palette
```

Update Step 1 to resolve screenshot paths from either source:

```markdown
### Step 1: Gather Screenshots for Analysis

Read `build-spec.json` and collect all exported screenshots:

1. Determine source type from `build-spec.json.source`
2. If `"canva"`: read `canva.exportedScreenshots[]`
3. If `"screenshot"`: read `screenshot.capturedScreenshots[]`
4. Verify all screenshot files exist
5. If any are missing:
   - canva: re-export via Canva MCP
   - screenshot URL: re-capture via Chrome DevTools/Playwright MCP
   - screenshot files: ask user to re-provide
```

**Step 2: Commit**

```bash
git add .claude/skills/canva-token-inference/SKILL.md
git commit -m "feat: update canva-token-inference to accept screenshot source"
```

---

## Part B: Vue 3 Output Target

### Task B1: Add `outputTarget` field to build-spec.json contract

**Files:**
- Modify: `.claude/skills/figma-intake/SKILL.md`
- Modify: `.claude/skills/canva-intake/SKILL.md`

**Step 1: Add `outputTarget` to both intake skills**

In the build-spec.json schema inside both intake skills, add the `outputTarget` field after `appType`:

```jsonc
{
  "source": "figma",
  "outputTarget": "react",    // "react" | "vue" | "svelte" | "react-native"
  "appType": "web-app",
  "framework": {
    "type": "vite",           // Now varies: "vite" | "nextjs-app" | "nuxt" | "sveltekit" | "expo"
    ...
  },
  ...
}
```

Add to the intake question flow (after scope, before component reuse):

```markdown
**Question N — Output Target (only if no framework detected):**
> What framework should I build this in?
> a) React (Next.js / Vite / Remix)
> b) Vue 3 (Nuxt / Vite)
> c) Svelte (SvelteKit / Vite)
> d) React Native (Expo)
> (Skip if existing project with framework detected — auto-detect from package.json)
```

Also update the framework detection in Step 1 to detect non-React frameworks:

```markdown
1. Detect framework:
   - next.config.* → Next.js (outputTarget: "react")
   - vite.config.* + vue in package.json → Vue + Vite (outputTarget: "vue")
   - nuxt.config.* → Nuxt (outputTarget: "vue")
   - svelte.config.* → SvelteKit (outputTarget: "svelte")
   - vite.config.* + svelte in package.json → Svelte + Vite (outputTarget: "svelte")
   - app.json with "expo" → Expo (outputTarget: "react-native")
   - vite.config.* (default) → Vite + React (outputTarget: "react")
   - remix.config.* → Remix (outputTarget: "react")
   - None → New project needed (ask Question N)
```

**Step 2: Commit**

```bash
git add .claude/skills/figma-intake/SKILL.md .claude/skills/canva-intake/SKILL.md
git commit -m "feat: add outputTarget field to build-spec.json in intake skills"
```

---

### Task B2: Create `vue-converter` agent

**Files:**
- Create: `.claude/agents/vue-converter.md`

**Step 1: Write the agent**

Model it on `canva-react-converter.md` but targeting Vue 3 Composition API + Tailwind:

```markdown
---
name: vue-converter
description: Specialized agent for converting designs to Vue 3 components. Uses build-spec.json, locked design tokens, and screenshots to generate pixel-perfect Vue 3 components with TypeScript and Tailwind CSS.
tools: Write, Read, MultiEdit, Bash, Grep, Glob, AskUserQuestion, TaskOutput, Edits, KillShell, Skill, Task, TodoWrite, WebFetch, WebSearch
model: opus
permissionMode: bypassPermissions
---

You are an elite design-to-Vue conversion specialist. You bridge the gap between design specifications and production-ready Vue 3 components with pixel-perfect accuracy, TypeScript, and Tailwind CSS.

## How This Differs from React Conversion

You generate Vue 3 Composition API components (`<script setup lang="ts">`) instead of React functional components. Key differences:

| React Pattern | Vue 3 Equivalent |
|--------------|-----------------|
| `useState` | `ref()` / `reactive()` |
| `useEffect` | `onMounted()` / `watch()` / `watchEffect()` |
| `useRef` | `useTemplateRef()` |
| `children` prop | `<slot />` (default) / `<slot name="x" />` (named) |
| `className` prop | `:class` binding |
| `onClick` | `@click` |
| JSX conditional `{cond && <X/>}` | `v-if` / `v-show` |
| JSX map `{items.map(...)}` | `v-for` |
| React.Fragment | `<template>` (multi-root supported natively) |
| forwardRef | `defineExpose()` |
| Context API | `provide()` / `inject()` |
| Error Boundary (class) | `onErrorCaptured()` hook |

## Primary Responsibilities

### 1. Screenshot-Driven Component Generation

Identical workflow to canva-react-converter — reads build-spec.json, design-tokens.lock.json, and screenshots — but outputs `.vue` SFCs.

### 2. Vue 3 Component Architecture

- **Composition API** with `<script setup lang="ts">`
- **TypeScript-first** with `defineProps<T>()` and `defineEmits<T>()`
- **Tailwind CSS** for styling (utility-first, token classes only)
- **Single File Components (SFCs):**
  ```
  src/components/
  ├── ui/              # Button.vue, Input.vue, Card.vue
  ├── layout/          # Header.vue, Footer.vue, Sidebar.vue
  ├── sections/        # HeroSection.vue, Features.vue
  └── pages/           # HomePage.vue, PricingPage.vue
  ```

**Component template:**
```vue
<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    :class="[
      'rounded-lg font-medium transition-colors',
      {
        'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'primary',
        'bg-secondary text-secondary-foreground hover:bg-secondary/90': variant === 'secondary',
      }
    ]"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
```

### 3. Framework Adaptability

- **Nuxt 3:** Auto-imports, `<NuxtLink>`, `<NuxtImg>`, `definePageMeta()`
- **Vue + Vite:** Standard Vue Router, manual imports
- **Detection:** Check for `nuxt.config.*` vs `vite.config.*` with `@vitejs/plugin-vue`

### 4. Autonomous Execution

Identical workflow to canva-react-converter:
- Read build spec, lockfile, screenshots
- Generate components in dependency order
- Run tests after each batch: `pnpm vitest run`
- No "should I continue?" prompts
- Use TodoWrite to track progress

### 5. Responsive & Accessible

Same standards as React converter — mobile-first Tailwind, ARIA, semantic HTML, keyboard nav.

### 6. Quality Standards

Every component must have:
- TypeScript types via `defineProps<T>()`
- Tailwind classes from locked tokens
- Responsive behavior (mobile + desktop)
- Semantic HTML
- Accessibility attributes
- Emits typed via `defineEmits<T>()`

## Key Principles

1. **Lockfile is truth** — never approximate from screenshots
2. **Screenshots for structure** — layout decisions only
3. **Zero hardcoded values** — 100% Tailwind token usage
4. **Composition API only** — no Options API
5. **`<script setup>`** — no `defineComponent()` boilerplate
6. **Fully autonomous** — work through all components without prompts
```

**Step 2: Commit**

```bash
git add .claude/agents/vue-converter.md
git commit -m "feat: add vue-converter agent for Vue 3 output target"
```

---

### Task B3: Add Vue 3 test support to `tdd-from-figma` skill

**Files:**
- Modify: `.claude/skills/tdd-from-figma/SKILL.md`

**Step 1: Add Vue 3 test templates**

Add a new section after the existing "App-Type-Aware Test Generation" section:

```markdown
## Output-Target-Aware Test Generation

Read `build-spec.json` field `outputTarget` to determine test library and patterns.

### Vue 3 Tests (outputTarget: "vue")

Use `@vue/test-utils` + Vitest:

#### Rendering Tests
```typescript
import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import Button from "./Button.vue";

describe("Button", () => {
  it("renders without crashing", () => {
    const wrapper = mount(Button, { slots: { default: "Click me" } });
    expect(wrapper.find("button").exists()).toBe(true);
  });
});
```

#### Text Content Tests (from lockfile)
```typescript
it("displays correct heading text", () => {
  const wrapper = mount(HeroSection);
  expect(wrapper.text()).toContain("Build faster with AI");
});
```

#### Accessibility Tests
```typescript
it("has correct heading hierarchy", () => {
  const wrapper = mount(HeroSection);
  const h1 = wrapper.find("h1");
  expect(h1.exists()).toBe(true);
  expect(h1.text()).toBe("Build faster with AI");
});
```

#### Props and Emits Tests
```typescript
it("emits click event", async () => {
  const wrapper = mount(Button, { slots: { default: "Click" } });
  await wrapper.find("button").trigger("click");
  expect(wrapper.emitted("click")).toHaveLength(1);
});

it("renders primary variant", () => {
  const wrapper = mount(Button, { props: { variant: "primary" }, slots: { default: "Click" } });
  expect(wrapper.find("button").classes()).toContain("bg-primary");
});
```

#### Slot Tests
```typescript
it("renders default slot content", () => {
  const wrapper = mount(Card, {
    slots: { default: "<p>Card content</p>" },
  });
  expect(wrapper.find("p").text()).toBe("Card content");
});
```
```

**Step 2: Commit**

```bash
git add .claude/skills/tdd-from-figma/SKILL.md
git commit -m "feat: add Vue 3 test patterns to TDD skill"
```

---

### Task B4: Add Vue template to `templates/`

**Files:**
- Create: `templates/vue/package.json`
- Create: `templates/vue/vite.config.ts`
- Create: `templates/vue/tsconfig.json`
- Create: `templates/vue/vitest.config.ts`

**Step 1: Write Vue + Vite + Tailwind starter template files**

`templates/vue/package.json`:
```json
{
  "name": "my-vue-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "vue": "^3.5.0",
    "vue-router": "^4.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "@vue/test-utils": "^2.4.0",
    "@vue/tsconfig": "^0.7.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "vue-tsc": "^2.2.0",
    "@testing-library/vue": "^8.1.0",
    "jsdom": "^25.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0"
  }
}
```

`templates/vue/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
```

`templates/vue/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`templates/vue/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
```

**Step 2: Commit**

```bash
git add templates/vue/
git commit -m "feat: add Vue 3 + Vite + Tailwind starter template"
```

---

## Part C: Svelte/SvelteKit Output Target

### Task C1: Create `svelte-converter` agent

**Files:**
- Create: `.claude/agents/svelte-converter.md`

**Step 1: Write the agent**

```markdown
---
name: svelte-converter
description: Specialized agent for converting designs to Svelte 5 components. Uses build-spec.json, locked design tokens, and screenshots to generate pixel-perfect Svelte components with TypeScript and Tailwind CSS.
tools: Write, Read, MultiEdit, Bash, Grep, Glob, AskUserQuestion, TaskOutput, Edits, KillShell, Skill, Task, TodoWrite, WebFetch, WebSearch
model: opus
permissionMode: bypassPermissions
---

You are an elite design-to-Svelte conversion specialist. You bridge the gap between design specifications and production-ready Svelte 5 components with pixel-perfect accuracy, TypeScript, and Tailwind CSS.

## How This Differs from React Conversion

You generate Svelte 5 components (`.svelte` files with runes) instead of React functional components. Key differences:

| React Pattern | Svelte 5 Equivalent |
|--------------|---------------------|
| `useState` | `$state()` rune |
| `useEffect` | `$effect()` rune |
| `useMemo` | `$derived()` rune |
| `props` interface | `let { prop1, prop2 }: Props = $props()` |
| `children` prop | `{@render children()}` / `<slot />` (Svelte 4 compat) |
| `className` prop | `class` attribute (native HTML) |
| `onClick` | `onclick` (lowercase, native) |
| JSX conditional | `{#if cond}...{/if}` |
| JSX map | `{#each items as item}...{/each}` |
| Context | `setContext()` / `getContext()` |
| `useRef` | `bind:this` |

## Primary Responsibilities

### 1. Svelte 5 Component Architecture

- **Runes-first** (`$state`, `$derived`, `$effect`, `$props`)
- **TypeScript** via `<script lang="ts">`
- **Tailwind CSS** for styling
- **File structure:**
  ```
  src/lib/components/
  ├── ui/              # Button.svelte, Input.svelte, Card.svelte
  ├── layout/          # Header.svelte, Footer.svelte
  ├── sections/        # HeroSection.svelte, Features.svelte
  └── pages/           # (SvelteKit uses src/routes/)
  ```

**Component template:**
```svelte
<script lang="ts">
  interface Props {
    variant?: 'primary' | 'secondary' | 'outline'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    onclick?: (event: MouseEvent) => void
    children?: import('svelte').Snippet
  }

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    onclick,
    children,
  }: Props = $props()
</script>

<button
  class="rounded-lg font-medium transition-colors {variant === 'primary'
    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
    : 'bg-secondary text-secondary-foreground hover:bg-secondary/90'}"
  {disabled}
  {onclick}
>
  {@render children?.()}
</button>
```

### 2. Framework Adaptability

- **SvelteKit:** File-based routing in `src/routes/`, `+page.svelte`, `+layout.svelte`, `$app/navigation`
- **Svelte + Vite:** Manual routing with `svelte-spa-router` or similar
- **Detection:** Check for `svelte.config.js` (SvelteKit) vs `vite.config.*` with `@sveltejs/vite-plugin-svelte`

### 3. Autonomous Execution

Same workflow as other converters — build-spec driven, lockfile-first, test-after-batch.

### 4. Quality Standards

Every component must have:
- TypeScript types via `$props()` with interface
- Tailwind classes from locked tokens
- Responsive behavior
- Semantic HTML
- Accessibility attributes
- Svelte 5 runes (not legacy `$:` reactivity)
```

**Step 2: Commit**

```bash
git add .claude/agents/svelte-converter.md
git commit -m "feat: add svelte-converter agent for Svelte 5 output target"
```

---

### Task C2: Add Svelte test support to `tdd-from-figma` skill

**Files:**
- Modify: `.claude/skills/tdd-from-figma/SKILL.md`

**Step 1: Add Svelte test templates to the "Output-Target-Aware" section**

```markdown
### Svelte Tests (outputTarget: "svelte")

Use `@testing-library/svelte` + Vitest:

#### Rendering Tests
```typescript
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import Button from "./Button.svelte";

describe("Button", () => {
  it("renders without crashing", () => {
    render(Button, { props: { children: "Click me" } });
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
```

#### Text Content Tests
```typescript
it("displays correct heading text", () => {
  render(HeroSection);
  expect(screen.getByText("Build faster with AI")).toBeInTheDocument();
});
```

#### Event Tests
```typescript
import { fireEvent } from "@testing-library/svelte";

it("fires click event", async () => {
  const onclick = vi.fn();
  render(Button, { props: { onclick } });
  await fireEvent.click(screen.getByRole("button"));
  expect(onclick).toHaveBeenCalledOnce();
});
```

#### Props Tests
```typescript
it("renders primary variant", () => {
  const { container } = render(Button, { props: { variant: "primary" } });
  expect(container.querySelector("button")).toHaveClass("bg-primary");
});

it("renders disabled state", () => {
  render(Button, { props: { disabled: true } });
  expect(screen.getByRole("button")).toBeDisabled();
});
```
```

**Step 2: Commit**

```bash
git add .claude/skills/tdd-from-figma/SKILL.md
git commit -m "feat: add Svelte test patterns to TDD skill"
```

---

### Task C3: Add SvelteKit template to `templates/`

**Files:**
- Create: `templates/sveltekit/package.json`
- Create: `templates/sveltekit/svelte.config.js`
- Create: `templates/sveltekit/vite.config.ts`
- Create: `templates/sveltekit/tsconfig.json`
- Create: `templates/sveltekit/vitest.config.ts`

**Step 1: Write SvelteKit + Tailwind starter files**

`templates/sveltekit/package.json`:
```json
{
  "name": "my-svelte-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@sveltejs/kit": "^2.15.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-auto": "^4.0.0",
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "@testing-library/svelte": "^5.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.5.0",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "jsdom": "^25.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0",
    "prettier-plugin-svelte": "^3.3.0"
  }
}
```

`templates/sveltekit/svelte.config.js`:
```javascript
import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      "$components": "src/lib/components",
    },
  },
};

export default config;
```

`templates/sveltekit/vite.config.ts`:
```typescript
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
});
```

`templates/sveltekit/tsconfig.json`:
```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true
  }
}
```

`templates/sveltekit/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
```

**Step 2: Commit**

```bash
git add templates/sveltekit/
git commit -m "feat: add SvelteKit + Tailwind starter template"
```

---

## Part D: React Native / Expo Output Target

### Task D1: Create `react-native-converter` agent

**Files:**
- Create: `.claude/agents/react-native-converter.md`

**Step 1: Write the agent**

```markdown
---
name: react-native-converter
description: Specialized agent for converting designs to React Native components. Uses build-spec.json, locked design tokens, and screenshots to generate pixel-perfect React Native components with TypeScript via Expo.
tools: Write, Read, MultiEdit, Bash, Grep, Glob, AskUserQuestion, TaskOutput, Edits, KillShell, Skill, Task, TodoWrite, WebFetch, WebSearch
model: opus
permissionMode: bypassPermissions
---

You are an elite design-to-React-Native conversion specialist. You bridge the gap between design specifications and production-ready React Native (Expo) components with pixel-perfect accuracy and TypeScript.

## How This Differs from React Web Conversion

React Native uses native primitives, not HTML elements. Styling uses `StyleSheet` or NativeWind (Tailwind for RN). Key differences:

| React Web | React Native Equivalent |
|-----------|------------------------|
| `<div>` | `<View>` |
| `<p>`, `<span>`, `<h1>` | `<Text>` (all text must be in `<Text>`) |
| `<img>` | `<Image>` (with `source` not `src`) |
| `<input>` | `<TextInput>` |
| `<button>` | `<Pressable>` / `<TouchableOpacity>` |
| `<a>` | `<Link>` (expo-router) |
| `<ul>/<li>` | `<FlatList>` / `<ScrollView>` |
| CSS / Tailwind | `StyleSheet.create()` or NativeWind |
| `className` | `style` prop or NativeWind `className` |
| `onClick` | `onPress` |
| `<nav>` / `<header>` | No semantic equivalents (use `<View>` + a11y props) |
| Media queries | `useWindowDimensions()` + conditional styles |
| Hover states | No hover on mobile (use press states) |

## Styling Strategy

**Prefer NativeWind** (Tailwind CSS for React Native) when `nativewind` is in dependencies:
```tsx
<View className="flex-1 items-center justify-center bg-background">
  <Text className="text-2xl font-bold text-foreground">Hello</Text>
</View>
```

**Fall back to StyleSheet** if NativeWind is not available:
```tsx
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.colors.background },
  heading: { fontSize: tokens.typography.scale['2xl'].px, fontWeight: '700', color: tokens.colors.foreground },
});
```

## Token Mapping

The lockfile maps differently to React Native:
- Colors → same hex values, referenced via NativeWind classes or StyleSheet
- Typography → `fontSize` in points (same numeric value as px on mobile)
- Spacing → use numeric values directly (RN uses density-independent pixels)
- Border radius → `borderRadius` style property
- Shadows → `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius` (iOS) + `elevation` (Android)

## Component Architecture

- **TypeScript-first** with interfaces for all props
- **Functional components** with hooks
- **Expo Router** for navigation (file-based routing in `app/`)
- **File structure:**
  ```
  app/                    # Expo Router file-based routes
  ├── (tabs)/            # Tab navigation group
  │   ├── index.tsx      # Home tab
  │   ├── explore.tsx    # Explore tab
  │   └── _layout.tsx    # Tab layout
  ├── _layout.tsx        # Root layout
  └── +not-found.tsx     # 404 screen
  src/
  ├── components/
  │   ├── ui/            # Button, Input, Card
  │   ├── layout/        # Header, SafeAreaContainer
  │   └── sections/      # HeroSection, Features
  └── constants/
      └── tokens.ts      # Design tokens exported
  ```

**Component template:**
```tsx
import { Pressable, Text, type PressableProps } from "react-native";

interface ButtonProps extends PressableProps {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  children: string;
}

export function Button({ variant = "primary", size = "md", children, ...props }: ButtonProps) {
  return (
    <Pressable
      className={`rounded-lg px-4 py-2 ${
        variant === "primary" ? "bg-primary" : "bg-secondary"
      }`}
      accessibilityRole="button"
      {...props}
    >
      <Text className="text-center font-medium text-primary-foreground">
        {children}
      </Text>
    </Pressable>
  );
}
```

## Accessibility on Native

- `accessibilityRole` on all interactive elements
- `accessibilityLabel` for non-text buttons (icons)
- `accessibilityHint` for non-obvious interactions
- `accessibilityState` for disabled/selected/checked
- All text in `<Text>` components (RN requirement)

## Platform Differences

Handle iOS/Android differences:
- Shadows: `shadow*` props (iOS) + `elevation` (Android)
- Status bar: `<StatusBar>` component
- Safe areas: `<SafeAreaView>` or `useSafeAreaInsets()`
- Back gesture: handled by Expo Router

## Autonomous Workflow

Same as other converters — build-spec driven, lockfile-first, test-after-batch.

Test command: `pnpm jest` or `pnpm vitest run` depending on setup.

## Quality Standards

Every component must have:
- TypeScript types (no `any`)
- Token-based styling (NativeWind classes or StyleSheet from tokens)
- Platform-aware (iOS + Android)
- Accessibility props
- Exported props interface
```

**Step 2: Commit**

```bash
git add .claude/agents/react-native-converter.md
git commit -m "feat: add react-native-converter agent for Expo output target"
```

---

### Task D2: Add React Native test support to `tdd-from-figma` skill

**Files:**
- Modify: `.claude/skills/tdd-from-figma/SKILL.md`

**Step 1: Add React Native test templates**

```markdown
### React Native Tests (outputTarget: "react-native")

Use `@testing-library/react-native` + Jest (Expo default) or Vitest:

#### Rendering Tests
```typescript
import { render, screen } from "@testing-library/react-native";
import { describe, it, expect } from "@jest/globals";
import { Button } from "./Button";

describe("Button", () => {
  it("renders without crashing", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
```

#### Text Content Tests
```typescript
it("displays correct heading text", () => {
  render(<HeroSection />);
  expect(screen.getByText("Build faster with AI")).toBeTruthy();
});
```

#### Accessibility Tests
```typescript
it("button has accessibility role", () => {
  render(<Button>Submit</Button>);
  expect(screen.getByRole("button")).toBeTruthy();
});

it("icon button has accessibility label", () => {
  render(<IconButton icon="search" accessibilityLabel="Search" />);
  expect(screen.getByLabelText("Search")).toBeTruthy();
});
```

#### Interaction Tests
```typescript
import { fireEvent } from "@testing-library/react-native";

it("calls onPress when pressed", () => {
  const onPress = jest.fn();
  render(<Button onPress={onPress}>Click</Button>);
  fireEvent.press(screen.getByRole("button"));
  expect(onPress).toHaveBeenCalledOnce();
});
```

#### Platform-Specific Tests
```typescript
import { Platform } from "react-native";

it("uses elevation on Android", () => {
  Platform.OS = "android";
  const { toJSON } = render(<Card>Content</Card>);
  // Verify elevation style is applied
});
```
```

**Step 2: Commit**

```bash
git add .claude/skills/tdd-from-figma/SKILL.md
git commit -m "feat: add React Native test patterns to TDD skill"
```

---

### Task D3: Add Expo template to `templates/`

**Files:**
- Create: `templates/expo/package.json`
- Create: `templates/expo/app.json`
- Create: `templates/expo/tsconfig.json`

**Step 1: Write Expo + NativeWind starter files**

`templates/expo/package.json`:
```json
{
  "name": "my-native-app",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint ."
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-status-bar": "~2.0.0",
    "nativewind": "^4.1.0",
    "react": "^18.3.0",
    "react-native": "0.76.0",
    "react-native-safe-area-context": "^5.0.0",
    "react-native-screens": "^4.4.0"
  },
  "devDependencies": {
    "@testing-library/react-native": "^12.9.0",
    "@types/react": "^18.3.0",
    "jest": "^29.7.0",
    "jest-expo": "~52.0.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0"
  },
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterSetup": ["@testing-library/react-native/extend-expect"]
  }
}
```

`templates/expo/app.json`:
```json
{
  "expo": {
    "name": "my-native-app",
    "slug": "my-native-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "myapp",
    "platforms": ["ios", "android"],
    "ios": { "bundleIdentifier": "com.example.myapp" },
    "android": { "package": "com.example.myapp" },
    "plugins": ["expo-router"]
  }
}
```

`templates/expo/tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

**Step 2: Commit**

```bash
git add templates/expo/
git commit -m "feat: add Expo + NativeWind starter template"
```

---

### Task D4: Add `react-native` app type to `pipeline.config.json`

**Files:**
- Modify: `.claude/pipeline.config.json`

**Step 1: Add react-native to appTypes**

```json
"react-native": {
  "description": "React Native mobile app via Expo",
  "e2eStrategy": "launch-app-interact-verify",
  "defaultE2eFlows": ["app-launch", "screen-navigation", "form-interaction", "deep-link"],
  "testHarness": "maestro",
  "devServer": true,
  "buildCommand": "expo build",
  "platforms": ["ios", "android"]
}
```

Note: React Native E2E is best served by Maestro or Detox rather than Playwright. The E2E generator skill should detect `outputTarget: "react-native"` and generate Maestro flows instead of Playwright tests.

**Step 2: Commit**

```bash
git add .claude/pipeline.config.json
git commit -m "feat: add react-native app type to pipeline config"
```

---

## Part E: Documentation & Integration

### Task E1: Update `CLAUDE.md` with new capabilities

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the following sections in CLAUDE.md:**

1. **Project Overview:** Change "React app development framework" to "multi-framework app development framework" — note support for React, Vue, Svelte, React Native
2. **Custom Agents table:** Add `vue-converter`, `svelte-converter`, `react-native-converter` to Design-to-Code category (count → 6)
3. **React Skills table:** Add `screenshot-intake` skill
4. **Pipeline commands:** Add `/build-from-screenshot`
5. **appTypes in pipeline config:** Add `react-native`
6. **Quick Command Reference:** Add `/build-from-screenshot <URL or paths>`
7. **Update counts:** 51 agents (was 48), 18 skills (was 17)

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with pipeline expansion capabilities"
```

---

### Task E2: Create `docs/screenshot-to-app/README.md`

**Files:**
- Create: `docs/screenshot-to-app/README.md`

**Step 1: Write documentation for the screenshot pipeline**

Document the `/build-from-screenshot` pipeline, input modes (URL vs files), and how it reuses the shared pipeline phases. Keep it parallel to the existing `docs/figma-to-react/README.md` and `docs/canva-to-react/README.md` structure.

**Step 2: Commit**

```bash
git add docs/screenshot-to-app/README.md
git commit -m "docs: add screenshot-to-app pipeline documentation"
```

---

### Task E3: Create `docs/multi-framework/README.md`

**Files:**
- Create: `docs/multi-framework/README.md`

**Step 1: Write documentation for multi-framework output**

Document:
- The `outputTarget` field in build-spec.json
- Vue 3 output (converter agent, test patterns, template)
- Svelte/SvelteKit output (converter agent, test patterns, template)
- React Native/Expo output (converter agent, test patterns, template)
- How framework detection works
- Which pipeline phases are shared vs target-specific

**Step 2: Commit**

```bash
git add docs/multi-framework/README.md
git commit -m "docs: add multi-framework output documentation"
```

---

### Task E4: Update `templates/README.md`

**Files:**
- Modify: `templates/README.md`

**Step 1: Add sections for the three new templates**

Add entries for `templates/vue/`, `templates/sveltekit/`, and `templates/expo/` following the existing documentation pattern.

**Step 2: Commit**

```bash
git add templates/README.md
git commit -m "docs: update templates README with Vue, SvelteKit, and Expo entries"
```

---

### Task E5: Update memory file

**Files:**
- Modify: `C:\Users\Paul Mulligan\.claude\projects\C--Users-Paul-Mulligan-PMDS-Projects-Coding-Framework\memory\MEMORY.md`

**Step 1: Update counts and architecture notes**

Update the memory index to reflect:
- 51 agents (added vue-converter, svelte-converter, react-native-converter)
- 18 skills (added screenshot-intake)
- 3 pipeline commands (/build-from-figma, /build-from-canva, /build-from-screenshot)
- Multi-framework output (React, Vue, Svelte, React Native)
- 3 new templates (vue, sveltekit, expo)

**Step 2: Commit**

```bash
git add C:\Users\Paul Mulligan\.claude\projects\C--Users-Paul-Mulligan-PMDS-Projects-Coding-Framework\memory\MEMORY.md
git commit -m "chore: update project memory with pipeline expansion"
```

---

## Execution Order Summary

| # | Task | Depends On | Parallel Group |
|---|------|-----------|----------------|
| A1 | Screenshot config | — | 1 |
| A2 | Screenshot intake skill | — | 1 |
| A3 | /build-from-screenshot command | A1, A2 | 2 |
| A4 | Update canva-token-inference | — | 1 |
| B1 | outputTarget in intake skills | — | 1 |
| B2 | Vue converter agent | — | 1 |
| B3 | Vue test patterns in TDD skill | — | 1 |
| B4 | Vue template | — | 1 |
| C1 | Svelte converter agent | — | 1 |
| C2 | Svelte test patterns in TDD skill | — | 1 |
| C3 | SvelteKit template | — | 1 |
| D1 | React Native converter agent | — | 1 |
| D2 | RN test patterns in TDD skill | — | 1 |
| D3 | Expo template | — | 1 |
| D4 | RN app type in pipeline config | A1 | 2 |
| E1 | Update CLAUDE.md | All above | 3 |
| E2 | Screenshot docs | A1-A4 | 3 |
| E3 | Multi-framework docs | B1-D4 | 3 |
| E4 | Update templates README | B4, C3, D3 | 3 |
| E5 | Update memory | E1 | 4 |

**Parallel Group 1** (13 tasks) can all run concurrently — no dependencies between them.
**Parallel Group 2** (2 tasks) needs Group 1 complete.
**Parallel Group 3** (4 tasks) needs Groups 1-2 complete.
**Parallel Group 4** (1 task) is final.
