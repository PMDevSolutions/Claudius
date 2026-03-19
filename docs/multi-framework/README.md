# Multi-Framework Output

The pipeline supports generating code for multiple frontend frameworks from any design source (Figma, Canva, or screenshots/URLs).

## The `outputTarget` Field

The `outputTarget` field in `build-spec.json` controls which framework the pipeline generates code for:

```json
{
  "source": "figma",
  "appType": "web-app",
  "outputTarget": "vue",
  "components": [...]
}
```

Valid values: `"react"` (default), `"vue"`, `"svelte"`, `"react-native"`.

## Framework Auto-Detection

If `outputTarget` is not explicitly set during intake, the pipeline detects the framework from the project context:

| Signal | Detected Target |
|--------|----------------|
| `next.config.*` or `react-dom` in `package.json` | `react` |
| `vue` in `package.json` dependencies | `vue` |
| `svelte.config.*` or `svelte` in `package.json` | `svelte` |
| `app.json` with Expo config or `react-native` in `package.json` | `react-native` |
| No project context (greenfield) | `react` (default) |

The intake skills (`figma-intake`, `canva-intake`, `screenshot-intake`) also ask the user to confirm or override the detected target during the interview phase.

## Output Targets

### React (default)

- **Converter agents:** `figma-react-converter`, `canva-react-converter`
- **Styling:** Tailwind CSS with `cn()` utility (clsx + tailwind-merge)
- **Test library:** Vitest + @testing-library/react
- **Templates:** `templates/nextjs/` (Next.js App Router) or `templates/vite/` (Vite + React)
- **Component pattern:** Functional components with TypeScript, props interfaces, `children`/`className` passthrough

### Vue 3

- **Converter agent:** `vue-converter`
- **Styling:** Tailwind CSS with utility classes in `<template>` blocks
- **Test library:** Vitest + @vue/test-utils
- **Template:** `templates/vue/` (Vue 3 + Vite + Tailwind + Vitest)
- **Component pattern:** `<script setup lang="ts">` with Composition API, `defineProps`/`defineEmits`, TypeScript interfaces

The `vue-converter` agent generates:
- Single-file components (`.vue`) with `<script setup>`, `<template>`, and `<style>` blocks
- Composables for reusable logic (equivalent to React custom hooks)
- Props defined with `defineProps<T>()` for full type safety
- Tailwind utility classes applied directly in templates

### Svelte / SvelteKit

- **Converter agent:** `svelte-converter`
- **Styling:** Tailwind CSS with utility classes in markup
- **Test library:** Vitest + @testing-library/svelte
- **Template:** `templates/sveltekit/` (SvelteKit + Tailwind + Vitest)
- **Component pattern:** `.svelte` files with `<script lang="ts">`, exported props via `export let` (Svelte 4) or `$props()` rune (Svelte 5)

The `svelte-converter` agent generates:
- Svelte components (`.svelte`) with TypeScript script blocks
- SvelteKit routes for page-level components (`+page.svelte`, `+layout.svelte`)
- Stores for shared state (writable, derived)
- Tailwind utility classes applied directly in markup

### React Native / Expo

- **Converter agent:** `react-native-converter`
- **Styling:** NativeWind (Tailwind CSS for React Native)
- **Test library:** Jest + @testing-library/react-native
- **Template:** `templates/expo/` (Expo + NativeWind + Jest)
- **Component pattern:** Functional components with TypeScript, `View`/`Text`/`Pressable` primitives

The `react-native-converter` agent generates:
- React Native components using Expo-compatible APIs
- NativeWind `className` prop for Tailwind-style styling
- Platform-specific variants where needed (`Platform.OS` checks)
- Navigation structure with Expo Router
- Adapted layouts: web grid/flex patterns mapped to React Native `View` + `ScrollView`

**Key differences from web React:**
- No HTML elements -- uses `View`, `Text`, `Image`, `Pressable`, `ScrollView`
- No CSS media queries -- uses `useWindowDimensions` or NativeWind responsive classes
- No `onClick` -- uses `onPress`
- Shadows use platform-specific APIs (`shadowColor`/`elevation`)

## Pipeline Phase Dispatch

Most pipeline phases are shared across all output targets. Only Phase 4 (Build) dispatches to a framework-specific converter agent:

| Phase | Shared? | Notes |
|-------|---------|-------|
| [0] Token Sync | Shared | Design tokens are framework-agnostic |
| [1] Intake | Shared | Produces `outputTarget` in build-spec.json |
| [2] Token Lock/Infer | Shared | Tokens map to Tailwind config (or NativeWind for React Native) |
| [3] TDD (Gate) | Target-specific | Test file format and library vary by target |
| [4] Build | **Target-specific** | Dispatches to `vue-converter`, `svelte-converter`, `react-native-converter`, or React converter |
| [4.5] Storybook | React/Vue only | Svelte uses SvelteKit stories; React Native skips |
| [5] Visual Diff | Shared | Compares screenshots regardless of framework |
| [5.5] Dark Mode | Shared | Theme token verification |
| [6] E2E Tests | Shared | Playwright for web; Detox/Maestro for React Native |
| [7] Cross-Browser | Web only | React Native skips (tested on simulators instead) |
| [8] Quality Gate | Shared | Coverage, types, build, tokens, Lighthouse (web only) |
| [8.5] Responsive | Shared | Screenshots at breakpoints (web); device sizes (React Native) |
| [9] Report | Shared | Final build report |

## Phase 3: TDD by Target

The `tdd-from-figma` skill generates framework-appropriate test files:

| Target | Test Runner | Test Library | Test File Extension |
|--------|------------|-------------|-------------------|
| React | Vitest | @testing-library/react | `.test.tsx` |
| Vue | Vitest | @vue/test-utils | `.test.ts` |
| Svelte | Vitest | @testing-library/svelte | `.test.ts` |
| React Native | Jest | @testing-library/react-native | `.test.tsx` |

## Phase 4: Agent Dispatch Table

| outputTarget | Source: Figma | Source: Canva | Source: Screenshot |
|-------------|--------------|--------------|-------------------|
| `react` | figma-react-converter | canva-react-converter | figma-react-converter |
| `vue` | vue-converter | vue-converter | vue-converter |
| `svelte` | svelte-converter | svelte-converter | svelte-converter |
| `react-native` | react-native-converter | react-native-converter | react-native-converter |

For Figma and screenshot sources with non-React targets, the converter agent reads the design tokens and build-spec, then generates framework-specific components directly (no intermediate React step).

## Related Documentation

- `docs/figma-to-react/README.md` -- Figma conversion pipeline
- `docs/canva-to-react/README.md` -- Canva conversion pipeline
- `docs/screenshot-to-app/README.md` -- Screenshot/URL conversion pipeline
- `templates/README.md` -- Starter configs for all supported frameworks
- `.claude/skills/README.md` -- Full skills catalog
- `.claude/CUSTOM-AGENTS-GUIDE.md` -- Full agent catalog
