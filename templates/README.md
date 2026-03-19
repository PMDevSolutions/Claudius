# Templates Reference

**Last Updated:** 2026-03-18

Starter configuration files for new projects. These are copied by `scripts/setup-project.sh` or referenced directly when scaffolding a new app.

## Directory Structure

```
templates/
├── shared/              # Framework-agnostic configs (used by all project types)
├── nextjs/              # Next.js-specific configs
├── vite/                # Vite-specific configs
├── vue/                 # Vue 3 + Vite configs
├── sveltekit/           # SvelteKit configs
├── expo/                # Expo + React Native configs
└── chrome-extension/    # Chrome extension E2E testing templates
```

## Shared Templates (`shared/`)

These configs apply to any React project regardless of framework:

| File | Purpose |
|------|---------|
| `eslint.config.js` | ESLint flat config with React, TypeScript, and jsx-a11y plugins |
| `prettier.config.js` | Prettier formatting rules (2-space indent, trailing commas) |
| `tailwind.config.ts` | Base Tailwind config with design token structure |
| `tsconfig.json` | TypeScript strict mode with path aliases |
| `vitest.config.template.ts` | Vitest config with jsdom, RTL setup, and coverage thresholds |

### Usage

Copy into your project root when starting a new app:

```bash
cp templates/shared/eslint.config.js .
cp templates/shared/prettier.config.js .
cp templates/shared/tailwind.config.ts .
cp templates/shared/tsconfig.json .
cp templates/shared/vitest.config.template.ts vitest.config.ts
```

Or use the setup script: `./scripts/setup-project.sh my-app --vite`

## Next.js Templates (`nextjs/`)

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config with App Router defaults |

### Usage

```bash
./scripts/setup-project.sh my-app --next
```

Copies shared templates plus Next.js-specific config.

## Vite Templates (`vite/`)

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite config with React plugin, path aliases, and build optimizations |

### Usage

```bash
./scripts/setup-project.sh my-app --vite
```

Copies shared templates plus Vite-specific config.

## Vue 3 Templates (`vue/`)

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite config with Vue plugin and path aliases |
| `tsconfig.json` | TypeScript config for Vue 3 with strict mode |
| `vitest.config.ts` | Vitest config with @vue/test-utils setup |
| `tailwind.config.ts` | Tailwind config with Vue-compatible content paths |

### Usage

```bash
./scripts/setup-project.sh my-app --vue
```

Copies shared templates plus Vue 3-specific configs. Sets up a Vue 3 + Vite + Tailwind CSS + Vitest project with Composition API (`<script setup>`) as the default component pattern.

## SvelteKit Templates (`sveltekit/`)

| File | Purpose |
|------|---------|
| `svelte.config.js` | SvelteKit config with Vite adapter |
| `vite.config.ts` | Vite config with SvelteKit plugin |
| `tsconfig.json` | TypeScript config for Svelte |
| `vitest.config.ts` | Vitest config with @testing-library/svelte setup |
| `tailwind.config.ts` | Tailwind config with Svelte-compatible content paths |

### Usage

```bash
./scripts/setup-project.sh my-app --sveltekit
```

Copies shared templates plus SvelteKit-specific configs. Sets up a SvelteKit + Tailwind CSS + Vitest project with TypeScript support.

## Expo Templates (`expo/`)

| File | Purpose |
|------|---------|
| `app.json` | Expo app config with default settings |
| `tsconfig.json` | TypeScript config for React Native / Expo |
| `jest.config.ts` | Jest config with @testing-library/react-native setup |
| `tailwind.config.ts` | NativeWind (Tailwind for React Native) config |
| `babel.config.js` | Babel config with NativeWind preset |

### Usage

```bash
./scripts/setup-project.sh my-app --expo
```

Sets up an Expo + NativeWind + Jest project with TypeScript. Uses Expo Router for navigation and NativeWind for Tailwind CSS-style styling in React Native.

## Chrome Extension Templates (`chrome-extension/`)

Playwright E2E testing infrastructure for Chrome extensions. These are used by the `e2e-test-generator` skill (Phase 6 of `/build-from-figma`) and can be copied manually for any Chrome extension project.

| File | Purpose |
|------|---------|
| `playwright.chrome-ext.config.ts` | Playwright config for extension testing (non-headless, single worker) |
| `e2e/fixtures.ts` | Custom Playwright fixtures: `extensionContext`, `extensionId`, `extensionPopup`, `extensionServiceWorker` |
| `e2e/extension.e2e.ts` | Example E2E tests: extension loading, popup rendering, Chrome storage, content scripts, message passing, visual regression |

### How Chrome Extension E2E Works

Chrome extensions cannot run in headless mode. The fixtures use `chromium.launchPersistentContext` with `--load-extension` to load the built extension:

1. Build the extension: `pnpm build`
2. Playwright launches Chromium with the extension loaded from `dist/`
3. The `extensionId` fixture extracts the ID from the service worker URL
4. The `extensionPopup` fixture opens `chrome-extension://<id>/popup.html` as a page
5. Tests interact with the popup, service worker, storage, and content scripts

### Usage

```bash
# Copy templates into your Chrome extension project
cp templates/chrome-extension/playwright.chrome-ext.config.ts .
cp -r templates/chrome-extension/e2e ./e2e

# Install Playwright
pnpm add -D @playwright/test
pnpm exec playwright install chromium

# Build and test
pnpm build
pnpm exec playwright test --config=playwright.chrome-ext.config.ts
```

### Environment Variables

- `EXTENSION_PATH` -- Override the path to the built extension (default: `./dist`)
