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
