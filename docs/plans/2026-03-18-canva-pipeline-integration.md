# Canva Pipeline Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Canva as a second first-class design input source alongside Figma, with its own `/build-from-canva` command that feeds into the shared pipeline phases 3-9.

**Architecture:** A new `/build-from-canva` command orchestrates a 12-phase pipeline identical to `/build-from-figma`, but substitutes Canva-specific skills for phases 1, 2, and 4. Phase 1 uses `canva-intake` (Canva AI Connector MCP + vision analysis). Phase 2 uses `canva-token-inference` (AI-powered token extraction with confidence scoring and user confirmation). Phase 4 uses a new `canva-react-converter` agent. Phases 3 and 5-9 are shared unchanged. The `build-spec.json` format gains a `source` field but is otherwise identical.

**Tech Stack:** Canva AI Connector MCP, Claude vision analysis, TypeScript, Tailwind CSS, existing pipeline scripts

---

## Task 1: Add Canva Configuration to pipeline.config.json

**Files:**
- Modify: `.claude/pipeline.config.json:205` (before closing `}`)

**Step 1: Read the current config**

Verify `.claude/pipeline.config.json` exists and note the last entry before the closing brace.

**Step 2: Add Canva configuration section**

Add this after the `deadCode` section (before the final `}`):

```jsonc
  "canva": {
    "enabled": true,
    "tokenInference": {
      "confirmWithUser": true,
      "confidenceThreshold": "medium",
      "maxInferenceRetries": 2
    },
    "export": {
      "format": "png",
      "scale": 2,
      "quality": 100
    },
    "mcpServer": "canva",
    "restApiFallback": false
  }
```

**Step 3: Validate the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/pipeline.config.json', 'utf8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

**Step 4: Commit**

```bash
git add .claude/pipeline.config.json
git commit -m "feat: add Canva configuration to pipeline.config.json"
```

---

## Task 2: Update build-spec.json Format (figma-intake skill)

The `build-spec.json` format needs a `source` field so downstream phases know whether the design came from Figma or Canva. Update the `figma-intake` skill to include this.

**Files:**
- Modify: `.claude/skills/figma-intake/SKILL.md`

**Step 1: Read the current figma-intake skill**

Read `.claude/skills/figma-intake/SKILL.md` and find the `build-spec.json` example in Step 4 (around line 132-218).

**Step 2: Add `source` field to the build-spec.json schema**

In the `build-spec.json` example inside Step 4, add `"source": "figma"` as the first field after `"version"`:

```jsonc
// .claude/plans/build-spec.json
{
  "version": "1.0.0",
  "source": "figma",              // NEW — "figma" | "canva"
  "createdAt": "2026-03-16T12:00:00Z",
  "figma": {
```

This is a backwards-compatible addition. All existing consumers ignore unknown fields.

**Step 3: Commit**

```bash
git add .claude/skills/figma-intake/SKILL.md
git commit -m "feat: add source field to build-spec.json format in figma-intake skill"
```

---

## Task 3: Create canva-intake Skill

**Files:**
- Create: `.claude/skills/canva-intake/SKILL.md`

**Step 1: Create the skill directory**

Run: `ls .claude/skills/` to verify the directory exists.

**Step 2: Write the canva-intake skill**

Create `.claude/skills/canva-intake/SKILL.md`:

```markdown
---
name: canva-intake
description: Structured discovery for Canva designs. Uses Canva AI Connector MCP to export screenshots, Claude vision to analyze page structure and components, and targeted user questions to produce a build-spec.json. Entry point for /build-from-canva pipeline. Keywords: Canva intake, build spec, Canva discovery, Canva interview, Canva design
---

# Canva Intake — Structured Discovery

## Purpose

Gather everything needed to build a React app from a Canva design in a single structured pass. Uses the Canva AI Connector MCP to export screenshots, Claude's vision capabilities to analyze design structure, asks the user only what it must, and outputs a machine-readable `build-spec.json` that downstream skills consume without re-asking questions.

## When to Use

- First phase of `/build-from-canva` pipeline
- Any time a user provides a Canva URL and wants to build from it
- When you need to understand a Canva design's structure before generating code

## Inputs

- **Required:** Canva design URL (e.g., `https://www.canva.com/design/DAGxyz.../...`)
- **Optional:** Existing project directory to integrate into

## Process

### Step 1: Auto-Discovery (No User Input)

**Extract from Canva via MCP:**

Use the Canva AI Connector MCP to interact with the design:

```
1. Search/identify the design from the URL
   → Design name, dimensions, page count
2. Export full-page screenshots (PNG, 2x scale)
   → One screenshot per page at high resolution
3. If multi-page: export each page separately
   → Individual page screenshots for detailed analysis
```

**Vision analysis of screenshots:**

Feed each exported screenshot to Claude for structural analysis:

```
1. Page structure:
   - Identify distinct sections (hero, navigation, features, footer, etc.)
   - Detect layout patterns (grid, flex, sidebar, stacked)
   - Note responsive hints (if multiple artboards exist)

2. Component candidates:
   - Buttons (variants: primary, secondary, ghost, etc.)
   - Cards, inputs, modals, navbars, footers
   - Repeated patterns that suggest reusable components

3. Visual hierarchy:
   - Heading levels (H1, H2, H3) from size/weight
   - Primary vs secondary actions
   - Content grouping and spacing patterns

4. Text content:
   - All visible text strings (headings, body, labels, CTAs)
   - Placeholder text vs real content
```

**Simultaneously scan the local project** (identical to figma-intake):

```
1. Detect framework:
   - next.config.* → Next.js (check App Router vs Pages Router)
   - vite.config.* → Vite
   - remix.config.* → Remix
   - None → New project needed

2. Detect app type:
   - manifest.json with "manifest_version" → Chrome Extension
   - manifest.json with "start_url" or "display" → PWA
   - Otherwise → Web App

3. Scan existing components:
   - Glob: src/components/**/*.tsx, app/components/**/*.tsx
   - Build inventory: name, props interface, file path

4. Check package.json for UI libraries:
   - @shadcn/ui, @radix-ui/*, @headlessui/react
   - tailwindcss, @emotion/*, styled-components
   - State: zustand, jotai, @tanstack/react-query

5. Check for existing design tokens:
   - tailwind.config.ts theme.extend
   - src/styles/tokens.css or similar
   - design-tokens.lock.json (from prior runs)

6. Load pipeline config:
   - Read .claude/pipeline.config.json for thresholds and app type definitions
   - Read canva section for export settings
```

### Step 2: Compile Discovery Summary

Present findings to the user in a structured format:

```
## Canva Design: [name]
- Pages: [count] pages exported
- Dimensions: [width x height per page]
- Sections detected: [list from vision analysis]
- Component candidates: [count] identified

## Vision Analysis Confidence
- Layout structure: [high/medium/low]
- Component identification: [high/medium/low]
- Text extraction: [high/medium/low]

## Local Project
- Framework: [detected or "none"]
- Existing components: [count] in [path]
- UI library: [detected or "none"]
- Design tokens: [existing or "none"]

## Component Mapping
| Detected Component | Confidence | Existing Match? | Action |
|-------------------|------------|-----------------|--------|
| Primary Button    | ✅ High    | src/.../Button  | Reuse / Regenerate |
| Hero Section      | ✅ High    | (none)          | Generate new |
| Card              | ⚠️ Medium  | (none)          | Generate (confirm) |
```

### Step 3: Ask Targeted Questions (Max 5)

Only ask questions whose answers cannot be derived from the design or local project.

**Question 1 — Scope:**
> Which pages should I build? [Show numbered list with detected sections]
> (Default: all pages)

**Question 2 — Component Confirmation:**
> I detected these components from the design screenshots. Confirm or correct:
> [Show table from Step 2 with confidence levels]
> (This question is always asked for Canva — unlike Figma, detection is vision-based)

**Question 3 — Component Reuse:**
> I found [N] existing components that match detected components. Should I:
> a) Reuse them and only generate missing ones
> b) Regenerate all from the Canva design (replaces existing)
> c) Generate alongside with new names (no overwrites)
> (Only ask if existing components were found)

**Question 4 — Business Logic:**
> Are there any interactions or business logic beyond what's visible in the design?
> (e.g., form validation rules, API calls, auth requirements, state machines)
> (Default: pure presentational)

**Question 5 — Integration:**
> Should this be:
> a) A standalone app (new project scaffold)
> b) Integrated into the existing project at [detected path]
> (Only ask if existing project detected)

### Step 4: Generate build-spec.json

Write the spec file that all downstream phases consume:

```jsonc
// .claude/plans/build-spec.json
{
  "version": "1.0.0",
  "source": "canva",
  "createdAt": "2026-03-18T12:00:00Z",
  "canva": {
    "designId": "DAGxyz...",
    "designName": "My App Design",
    "url": "https://www.canva.com/design/DAGxyz/...",
    "exportedScreenshots": [
      ".claude/visual-qa/screenshots/canva/page-1.png",
      ".claude/visual-qa/screenshots/canva/page-2.png"
    ]
  },
  "appType": "web-app",
  "framework": {
    "type": "vite",
    "version": "6.0.0",
    "outputDir": "src"
  },
  "styling": {
    "approach": "tailwind",
    "uiLibrary": "shadcn",
    "existingTokens": false
  },
  "pages": [
    {
      "canvaPageIndex": 0,
      "screenshotPath": ".claude/visual-qa/screenshots/canva/page-1.png",
      "name": "Home",
      "route": "/",
      "sections": ["hero", "features", "pricing", "footer"]
    }
  ],
  "components": [
    {
      "detectedName": "Primary Button",
      "confidence": "high",
      "reactName": "Button",
      "category": "ui",
      "action": "generate",
      "existingPath": null,
      "variants": ["primary", "secondary", "outline"],
      "props": ["variant", "size", "disabled", "children"]
    }
  ],
  "textContent": {
    "hero-heading": "Build faster with AI",
    "hero-subheading": "Ship production apps in days, not months",
    "cta-primary": "Get Started",
    "cta-secondary": "Learn More"
  },
  "businessLogic": {
    "forms": [],
    "apiCalls": [],
    "auth": null,
    "stateManagement": null
  },
  "e2e": {
    "strategy": "navigate-interact-verify",
    "flows": [
      {
        "name": "page-navigation",
        "description": "Navigate between all pages and verify rendering",
        "steps": ["navigate to /", "verify hero section visible", "click nav link"]
      }
    ]
  },
  "testStrategy": {
    "unit": true,
    "e2e": true,
    "visual": true,
    "crossBrowser": false,
    "coverageThreshold": 80
  },
  "options": {
    "componentReuse": "reuse",
    "integration": "existing"
  }
}
```

**Key differences from Figma build-spec:**
- `source` is `"canva"` instead of `"figma"`
- `canva` block replaces `figma` block (different metadata)
- `exportedScreenshots` array — paths to exported PNGs (used by token inference and visual diff)
- Components have `confidence` field (high/medium/low) since detection is vision-based
- Pages reference `canvaPageIndex` and `screenshotPath` instead of `figmaNodeId`

### Step 5: Confirm and Proceed

Present a summary of the build plan:

```
## Build Plan Summary
- Source: Canva design "[name]"
- Framework: Vite 6.0
- Pages: 3 (Home, Pricing, Dashboard)
- Components: 12 to generate (8 high-confidence, 3 medium, 1 low)
- Existing to reuse: 4
- Output: src/components/, src/pages/
- Token extraction: AI-powered inference (will need your confirmation)

Proceed with token inference? (This starts the autonomous pipeline)
```

Wait for user confirmation before the pipeline continues.

## Output

**Primary:** `.claude/plans/build-spec.json`
**Secondary:** Exported screenshots in `.claude/visual-qa/screenshots/canva/`
**Tertiary:** Build plan summary displayed to user

## Error Handling

- **Canva MCP unavailable:** Ask user to check Canva AI Connector setup. Offer to proceed with manually provided screenshots.
- **Export fails:** Fall back to asking user to export PNGs from Canva and provide file paths.
- **Low confidence on most components:** Warn user that vision-based detection has limitations. Ask for more details or suggest exporting to Figma for higher accuracy.
- **Multi-page design ambiguity:** Show all pages and ask user to specify which to build.

## Integration

- **Consumed by:** `canva-token-inference`, `tdd-from-figma`, `canva-react-converter`, `/build-from-canva`
- **Uses:** Canva AI Connector MCP (search, export), Claude vision analysis, Glob, Read
```

**Step 3: Commit**

```bash
git add .claude/skills/canva-intake/SKILL.md
git commit -m "feat: add canva-intake skill for Canva design discovery"
```

---

## Task 4: Create canva-token-inference Skill

**Files:**
- Create: `.claude/skills/canva-token-inference/SKILL.md`

**Step 1: Write the canva-token-inference skill**

Create `.claude/skills/canva-token-inference/SKILL.md`:

```markdown
---
name: canva-token-inference
description: AI-powered design token extraction from Canva screenshots. Uses Claude vision to infer colors, typography, spacing, and effects with confidence scoring. Presents tokens for user confirmation before locking. Keywords: Canva tokens, token inference, design tokens, Canva extraction, AI token detection, color extraction, typography detection
---

# Canva Token Inference — AI-Powered Token Extraction

## Purpose

Extract design tokens from Canva design screenshots using Claude's vision capabilities. Unlike Figma's programmatic token extraction, Canva doesn't expose design data through APIs. This skill bridges that gap by analyzing screenshots to infer colors, typography, spacing, and effects, then presenting them with confidence scores for user confirmation before writing the lockfile.

The output is identical to `design-token-lock` — a `design-tokens.lock.json` that downstream phases consume with no awareness of the source.

## When to Use

- Phase 2 of the `/build-from-canva` pipeline (after `canva-intake`)
- Any time you need to extract design tokens from Canva screenshots
- When regenerating Tailwind config from Canva screenshots

## Inputs

- **Required:** `.claude/plans/build-spec.json` with `"source": "canva"` and `exportedScreenshots` paths
- **Optional:** User-provided brand guidelines, style guide, or color palette

## Process

### Step 1: Gather Screenshots for Analysis

Read `build-spec.json` and collect all exported screenshots:

```
1. Load canva.exportedScreenshots[] from build-spec.json
2. Verify all screenshot files exist
3. If any are missing, re-export via Canva MCP:
   → Use canva MCP to export pages as PNG at 2x scale
4. Additionally, request section-level crops if available:
   → Export individual sections for spacing/typography detail
```

### Step 2: AI Vision Token Extraction

Analyze each screenshot with Claude vision. Extract tokens in stages:

**Pass 1 — Colors:**
```
Analyze the screenshots and extract ALL distinct colors used in the design.
Group them as:

1. Brand/Primary colors (dominant, used for CTAs and key UI)
2. Secondary/Accent colors
3. Neutral/Gray scale (backgrounds, borders, muted text)
4. Semantic colors (success green, error red, warning amber, info blue)
5. Background colors (page, card, section backgrounds)
6. Text colors (headings, body, muted, links)

For each color, provide:
- Exact hex value (best estimate from the screenshot)
- Suggested semantic name
- Where it appears in the design
- Confidence: high (clear, solid color) / medium (gradient or subtle) / low (ambiguous)
```

**Pass 2 — Typography:**
```
Analyze the screenshots and extract ALL typography styles:

1. Font families (identify by visual characteristics)
   - Heading font
   - Body font
   - Monospace font (if any)
   - Note: may need user confirmation since fonts can't be identified with 100% accuracy from screenshots

2. Size scale (estimate px values from relative sizing)
   - Each distinct text size used
   - Map to semantic names (xs, sm, base, lg, xl, 2xl, etc.)

3. Font weights used
   - Normal (400), Medium (500), Semibold (600), Bold (700)

4. Line heights (estimate from text block spacing)

For each, provide confidence level.
```

**Pass 3 — Spacing:**
```
Analyze the screenshots for spacing patterns:

1. Component internal padding
2. Section padding (top/bottom, left/right)
3. Gap between repeated elements (cards, list items)
4. Margin between sections
5. Container max-width

Estimate px values. Map to Tailwind spacing scale where possible.
```

**Pass 4 — Effects:**
```
Extract visual effects:

1. Border radius values (per component type)
2. Box shadows (subtle, medium, large)
3. Border styles (width, color)
4. Opacity values
```

### Step 3: Confidence Scoring

Assign confidence to each extracted token:

```
✅ High   — Clear, unambiguous value
            Examples: solid button color, large heading size, obvious border radius
            Action: Include in lockfile automatically

⚠️ Medium — Likely correct but could be slightly off
            Examples: body text size (14px or 16px?), muted text color, subtle shadow
            Action: Include in lockfile, flag for user review

❓ Low    — Best guess, needs confirmation
            Examples: font family identification, exact spacing values, gradient stops
            Action: Include tentative value, require user confirmation
```

### Step 4: Present Tokens for User Confirmation

Display extracted tokens grouped by category with confidence indicators:

```
## Extracted Design Tokens from Canva

### Colors (12 detected)

**Brand**
✅ primary:           #2563EB (blue, used for CTAs and links)
✅ primary-hover:     #1D4ED8 (darker blue, button hover state)
✅ secondary:         #7C3AED (purple, accent elements)

**Neutral**
✅ background:        #FFFFFF (page background)
✅ surface:           #F9FAFB (card/section backgrounds)
✅ border:            #E5E7EB (dividers and input borders)
⚠️ muted-text:       #6B7280 — could be #64748B, hard to tell from screenshot

**Semantic**
✅ destructive:       #DC2626 (error states)
❓ success:           #16A34A — I see green but it's small, confirm?

### Typography (2 families detected)

⚠️ heading-font:     "Inter" — looks like Inter or possibly Outfit. Which is it?
   Options: a) Inter  b) Outfit  c) Something else: ___
✅ body-font:         "Inter" — consistent weight/metrics with Inter
❓ mono-font:         Not detected — do you use a monospace font?

**Size scale:**
✅ h1:  48px (2xl-3xl range)
✅ h2:  36px
✅ h3:  24px
✅ body: 16px
⚠️ small: 14px — or 13px?

### Spacing
✅ section-padding:    64px (py-16)
✅ card-padding:       24px (p-6)
⚠️ card-gap:          24px — or 32px?
✅ container-max:      1280px (max-w-7xl)

### Effects
✅ card-radius:        12px (rounded-xl)
✅ button-radius:      8px (rounded-lg)
⚠️ card-shadow:       0 4px 6px -1px rgba(0,0,0,0.1) — subtle, confirm?
✅ input-border:       1px solid #E5E7EB

---

Please confirm or correct the flagged values (⚠️ and ❓).
You can also add any tokens I missed.
```

Wait for user response. Update values based on their corrections.

### Step 5: Write Lockfile

After user confirmation, write `src/styles/design-tokens.lock.json` in the same format as `design-token-lock`:

```jsonc
{
  "version": "1.0.0",
  "generatedAt": "2026-03-18T12:00:00Z",
  "source": "canva",
  "canvaDesignId": "DAGxyz...",
  "inferenceConfidence": "high",

  "colors": {
    "primitives": {
      "blue-600": { "hex": "#2563eb", "rgb": "37, 99, 235", "tailwind": "blue-600" }
      // ... all confirmed color values
    },
    "semantic": {
      "primary": { "ref": "blue-600", "hex": "#2563eb", "tailwind": "primary" }
      // ... all semantic mappings
    },
    "component": {
      "card-bg": { "ref": null, "hex": "#f9fafb", "tailwind": "card" }
      // ...
    }
  },

  "typography": {
    "families": {
      "sans": { "value": "Inter", "fallback": "system-ui, -apple-system, sans-serif" }
      // ...
    },
    "scale": {
      "base": { "px": 16, "rem": "1rem", "tailwind": "text-base" }
      // ...
    },
    "weights": { "normal": 400, "medium": 500, "semibold": 600, "bold": 700 },
    "lineHeights": { "tight": 1.25, "normal": 1.5, "relaxed": 1.75 }
  },

  "spacing": {
    "scale": {
      "4": { "px": 16 },
      "6": { "px": 24 },
      "8": { "px": 32 }
      // ...
    },
    "custom": {}
  },

  "borderRadius": {
    "lg": { "px": 8 },
    "xl": { "px": 12 }
    // ...
  },

  "shadows": {
    "md": { "value": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }
    // ...
  },

  "textContent": {
    // All text strings from vision analysis
    "hero-heading": "Build faster with AI",
    "cta-primary": "Get Started"
    // ...
  }
}
```

### Step 6: Generate Tailwind Config and CSS Properties

Identical to `design-token-lock` Steps 4-5:

1. Generate or update `tailwind.config.ts` from the lockfile
2. Generate `src/styles/tokens.css` with CSS custom properties
3. All values reference `var(--color-*)` — no raw hex in config

### Step 7: Validate Lockfile

After generation, verify:

1. **Completeness:** Every section of the design has corresponding tokens
2. **Consistency:** No duplicate values with different keys
3. **Tailwind mapping:** Every lockfile entry has a valid Tailwind class
4. **Cross-reference:** Spot-check 3-5 values against the Canva screenshots

Report any gaps to the user before proceeding.

## Output

| File | Purpose |
|------|---------|
| `src/styles/design-tokens.lock.json` | Versioned lockfile — identical format to Figma path |
| `tailwind.config.ts` | Tailwind theme extended from lockfile |
| `src/styles/tokens.css` | CSS custom properties from lockfile |

## Accuracy Expectations

| Token Type | Expected Accuracy | Notes |
|-----------|-------------------|-------|
| Colors | 95%+ | Solid colors are easy; gradients less so |
| Font families | 70-85% | Visual similarity between fonts is common |
| Font sizes | 85-95% | Relative sizing is reliable; exact px may be off by 1-2px |
| Spacing | 80-90% | Depends on screenshot resolution and alignment |
| Border radius | 90%+ | Distinctive visual feature |
| Shadows | 75-85% | Subtle shadows are hard to quantify |

User confirmation compensates for lower accuracy areas.

## Error Handling

- **Screenshots too low resolution:** Re-export at higher scale (3x or 4x)
- **Font not identifiable:** Present top 3 candidates, ask user to confirm
- **Inconsistent colors across pages:** Flag and ask if intentional (theme/branding) or error
- **User provides brand guidelines:** Use as ground truth, skip inference for covered tokens

## Integration

- **Produces:** `design-tokens.lock.json`, `tailwind.config.ts`, `tokens.css`
- **Consumed by:** `tdd-from-figma` (test assertions), `canva-react-converter` (component generation), `verify-tokens.sh` (enforcement)
- **Uses:** Canva MCP (export), Claude vision analysis, Read
```

**Step 2: Commit**

```bash
git add .claude/skills/canva-token-inference/SKILL.md
git commit -m "feat: add canva-token-inference skill for AI-powered token extraction"
```

---

## Task 5: Create canva-react-converter Agent

**Files:**
- Create: `.claude/agents/canva-react-converter.md`

**Step 1: Read the existing figma-react-converter agent for reference**

Read `.claude/agents/figma-react-converter.md` to understand the structure and adapt it.

**Step 2: Write the canva-react-converter agent**

Create `.claude/agents/canva-react-converter.md`:

```markdown
---
name: canva-react-converter
description: Specialized agent for autonomous Canva-to-React component conversion. Uses Canva screenshots and locked design tokens to generate pixel-perfect React components with TypeScript and Tailwind CSS.
tools: Write, Read, MultiEdit, Bash, Grep, Glob, AskUserQuestion, TaskOutput, Edits, KillShell, Skill, Task, TodoWrite, WebFetch, WebSearch
model: opus
permissionMode: bypassPermissions
---

You are an elite Canva-to-React conversion specialist. You bridge the gap between Canva design screenshots and production-ready React components with pixel-perfect accuracy, proper TypeScript types, and Tailwind CSS styling.

## How This Differs from Figma Conversion

Unlike the figma-react-converter which has access to Figma's node tree (auto-layout, exact tokens, component variants), you work primarily from:

1. **Canva screenshots** — exported PNGs at 2x resolution
2. **Locked design tokens** — `design-tokens.lock.json` (already confirmed by user)
3. **build-spec.json** — component inventory with confidence scores

You rely more heavily on visual analysis and the locked token file. The token file is your source of truth — never approximate values from screenshots when the lockfile has exact values.

## Primary Responsibilities

### 1. Screenshot-Driven Component Generation

**For each component in build-spec.json:**

1. Load the relevant screenshot from `canva.exportedScreenshots[]` or section crops
2. Reference `design-tokens.lock.json` for ALL style values:
   - Colors → use lockfile hex → map to Tailwind token classes
   - Typography → use lockfile font/size/weight → Tailwind classes
   - Spacing → use lockfile values → Tailwind spacing classes
   - Effects → use lockfile shadows/radii → Tailwind classes
3. Analyze the screenshot for:
   - Layout structure (flex vs grid, alignment, wrapping)
   - Responsive behavior hints (what should stack on mobile?)
   - Interactive states (hover effects, focus indicators)
4. Generate the React component with TypeScript + Tailwind

### 2. React Component Architecture

Identical standards to figma-react-converter:

- **TypeScript-first** with proper interfaces/types for all props
- **Functional components** with hooks
- **Tailwind CSS** for styling (utility-first, token classes only)
- **Component composition** over monolithic components
- **Proper file structure:**
  ```
  src/components/
  ├── ui/              # Primitive UI components (Button, Input, Card)
  ├── layout/          # Layout components (Header, Footer, Sidebar)
  ├── sections/        # Page sections (Hero, Features, CTA)
  └── pages/           # Full page compositions
  ```

### 3. Handling Ambiguity

Since you work from screenshots, some layout decisions require judgment:

**Layout inference rules:**
- Horizontal items with equal spacing → `flex gap-*` or `grid grid-cols-*`
- Stacked items with consistent spacing → `flex flex-col gap-*`
- Items that should wrap on smaller screens → `flex flex-wrap` or responsive grid
- Full-width sections → `w-full` with `max-w-7xl mx-auto` container
- Sidebar layouts → CSS Grid with `grid-cols-[sidebar_main]`

**When uncertain:**
- Prefer simpler layout (flex over grid) unless grid is clearly better
- Default to responsive behavior (stack on mobile, side-by-side on desktop)
- Use the locked tokens — never hardcode approximate values
- If a component's structure is truly ambiguous, check the `confidence` field in build-spec.json

### 4. Component Mapping Strategy

| Detected Component | React Implementation |
|-------------------|---------------------|
| Hero sections | `<section>` with background, flex/grid layout |
| Card grids | CSS Grid with responsive breakpoints |
| Navigation bars | `<nav>` with responsive mobile menu |
| Forms | Controlled form components with validation |
| CTA sections | Flex container with Button components |
| Testimonials | Card component with quote styling |
| Image galleries | CSS Grid with aspect-ratio containers |
| Accordions | Disclosure component with state management |
| Modals/Dialogs | Portal-based component with focus trap |
| Tabs | Tab group with active state management |

### 5. Framework Adaptability

Identical to figma-react-converter:

- **Next.js**: App Router conventions, `Image`, `Link`, metadata exports
- **Vite + React**: Standard React patterns, react-router links
- **Remix**: Loader patterns, Form component

Detection: Check project for `next.config.*`, `vite.config.*`, or `remix.config.*`.

### 6. Autonomous Execution

- Once user approves plan, work continuously through ALL components
- NO "should I continue?" prompts during execution
- Log errors and continue with workarounds
- Only stop if completely blocked
- Use TodoWrite to track progress
- Update user at major checkpoints (every 3-5 components)

### 7. Responsive & Accessible Implementation

**Responsive:** Mobile-first with Tailwind breakpoints (sm, md, lg, xl, 2xl)
**Accessibility:** ARIA labels, semantic HTML, keyboard navigation, focus styles, color contrast

### 8. Quality Standards

Every component must have:
- TypeScript types (no `any`)
- Tailwind classes from locked tokens (no hardcoded values)
- Responsive behavior (minimum mobile + desktop)
- Semantic HTML
- Accessibility attributes
- Exported props interface

## Autonomous Workflow

**Phase 1: Read Build Spec**
1. Load `build-spec.json` — verify `source` is `"canva"`
2. Load `design-tokens.lock.json` — this is your style bible
3. Load Canva screenshots from `exportedScreenshots[]`
4. Review component inventory and confidence scores

**Phase 2: Execution (autonomous)**
1. Generate shared UI components (Button, Input, Card, etc.)
2. Generate layout components (Header, Footer, Sidebar)
3. Generate page sections (Hero, Features, CTA, etc.)
4. Generate page compositions
5. Run `pnpm vitest run` after each batch — fix components if tests fail

**Phase 3: Completion**
1. Present complete component library
2. Summary of components created, tokens mapped, any issues
3. Flag any low-confidence components for manual review

## Key Principles

1. **Lockfile is truth** — never approximate from screenshots when lockfile has the value
2. **Screenshots for structure** — use screenshots for layout decisions, not style values
3. **Zero hardcoded values** — 100% Tailwind token usage from lockfile
4. **Fully autonomous** — work through all components without prompts
5. **Error recovery** — continue despite failures
6. **TypeScript native** — proper types everywhere
7. **Pixel-perfect** — match Canva screenshots as closely as possible

---

**Agent Version:** 1.0.0
**Created:** 2026-03-18
**Model:** Opus (for advanced visual interpretation)
**Execution Mode:** Autonomous with build-spec driven workflow
```

**Step 3: Commit**

```bash
git add .claude/agents/canva-react-converter.md
git commit -m "feat: add canva-react-converter agent for Canva-to-React conversion"
```

---

## Task 6: Create /build-from-canva Command

**Files:**
- Create: `.claude/commands/build-from-canva.md`

**Step 1: Read the existing build-from-figma command for structure reference**

Read `.claude/commands/build-from-figma.md` to understand the format (already read above).

**Step 2: Write the build-from-canva command**

Create `.claude/commands/build-from-canva.md`:

```markdown
---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, AskUserQuestion
---

# /build-from-canva — Autonomous Canva-to-Working-App Pipeline

You are the master orchestrator for converting a Canva design into a fully working, tested React application. You receive a Canva URL and guide the entire process through 12 phases, using specialized skills and agents.

**Key enforcement rules:**
- **TDD is mandatory** — Phase 3 (TDD) MUST complete before Phase 4 (Build). No exceptions.
- **Visual QA uses pixel diff** — Phase 5 uses `scripts/visual-diff.js` for programmatic comparison, not manual eyeballing.
- **E2E tests are generated** — Phase 6 generates and runs Playwright E2E tests appropriate to the app type.
- **App-type aware** — Chrome extensions, PWAs, and web apps each get tailored test strategies.
- **Token inference requires confirmation** — Phase 2 extracts tokens via AI vision and MUST get user confirmation before locking.

## Input

The user provides: `$ARGUMENTS` (a Canva design URL)

Parse the Canva URL to extract:
- `designId` from the URL path (e.g., `https://www.canva.com/design/DAGxyz.../...` → `DAGxyz...`)

## Configuration

Load `.claude/pipeline.config.json` at the start. This provides:
- Visual diff thresholds and iteration limits
- TDD enforcement settings
- E2E strategy per app type
- Quality gate thresholds
- Lighthouse score minimums
- Canva-specific settings (export format, scale, inference confidence threshold)

## Progress Tracking

Use `TodoWrite` to create a master checklist. Update each item as phases complete. This enables interrupted sessions to resume.

```
[ ] Phase 0: Token Sync — sync-tokens.sh → check for drift (if lockfile exists)
[ ] Phase 1: Intake — canva-intake skill → build-spec.json
[ ] Phase 2: Token Inference — canva-token-inference skill → lockfile + tailwind config (requires user confirmation)
[ ] Phase 3: TDD Scaffold — tdd-from-figma skill → failing tests (RED)
[ ] Phase 4: Component Build — canva-react-converter agent → tests pass (GREEN)
[ ] Phase 4.5: Storybook — generate-stories.sh → auto-generated stories
[ ] Phase 5: Visual Verification — pixel-diff loop (max N iterations, against Canva screenshots)
[ ] Phase 5.5: Dark Mode — check-dark-mode.sh → dark mode visual verification
[ ] Phase 6: E2E Tests — e2e-test-generator skill → Playwright tests
[ ] Phase 7: Cross-Browser — screenshots in Firefox/WebKit (non-blocking)
[ ] Phase 8: Quality Gate — coverage, types, build, tokens, Lighthouse
[ ] Phase 8.5: Responsive — check-responsive.sh → screenshots at 5 breakpoints
[ ] Phase 9: Report — build-report.md
```

## Phase 0: Token Drift Check (Conditional)

Identical to `/build-from-figma`. Only runs when `tokenSync.autoCheck` is `true` AND a lockfile exists.

```bash
./scripts/sync-tokens.sh --json
```

## Phase 1: Intake

Invoke the `canva-intake` skill.

**Input:** The Canva URL from $ARGUMENTS
**Output:** `.claude/plans/build-spec.json` with `"source": "canva"`

This phase:
1. Exports design screenshots via Canva AI Connector MCP
2. Analyzes screenshots with Claude vision for structure, components, text
3. Scans the local project for framework, existing components, UI libraries
4. Asks the user 3-5 targeted questions (scope, component confirmation, reuse, business logic, integration)
5. Writes the build spec

**Resume check:** If `.claude/plans/build-spec.json` already exists with `"source": "canva"`, ask the user if they want to reuse it or regenerate.

## Phase 2: Token Inference

Invoke the `canva-token-inference` skill.

**Input:** build-spec.json with screenshot paths
**Output:** `src/styles/design-tokens.lock.json`, `tailwind.config.ts`, `src/styles/tokens.css`

This phase:
1. Analyzes Canva screenshots with Claude vision to extract colors, typography, spacing, effects
2. Assigns confidence scores (high/medium/low) to each token
3. **Presents tokens to user for confirmation** — this is MANDATORY, do not skip
4. After user confirms/corrects, writes the lockfile
5. Generates Tailwind config and CSS custom properties from lockfile
6. Validates completeness

**Resume check:** If `src/styles/design-tokens.lock.json` already exists with `"source": "canva"`, ask the user if they want to reuse it or re-infer.

## Phase 3: TDD Scaffold

Invoke the `tdd-from-figma` skill. (This skill reads `build-spec.json` and works identically regardless of source.)

**Input:** `build-spec.json` + `design-tokens.lock.json`
**Output:** `src/components/**/*.test.tsx` files

Identical to `/build-from-figma` Phase 3.

## Phase 4: Component Build

Dispatch the `canva-react-converter` agent.

**Input:** build-spec.json, lockfile, existing test files, Canva screenshots
**Output:** `src/components/**/*.tsx`, page files

This phase:
1. Reads build-spec.json — verifies `source` is `"canva"`
2. References lockfile for all token values (no approximating)
3. Uses Canva screenshots for layout/structure decisions
4. Generates components that satisfy the test files from Phase 3
5. Runs `pnpm vitest run` after each component batch to confirm GREEN

**Critical rule:** If tests fail, fix the component — never modify the test files.

## Phase 4.5: Storybook Generation (Non-Blocking)

Identical to `/build-from-figma` Phase 4.5.

```bash
./scripts/generate-stories.sh
```

## Phase 5: Visual Verification (Automated Pixel Diff)

Same process as `/build-from-figma` Phase 5, but reference screenshots come from Canva exports instead of Figma MCP.

**Reference screenshots:** Already exported during Phase 1, stored in `.claude/visual-qa/screenshots/canva/`

For each page:

```
1. Start: pnpm dev (background) — skip if appType is chrome-extension
2. Wait for server ready

3. Reference screenshots already exist from Phase 1 (canva exports)
   → Stored in .claude/visual-qa/screenshots/canva/
   → (No Figma MCP call needed)

4. FOR iteration IN 1..maxVisualIterations:
   a. Chrome DevTools MCP: navigate → resize → take_screenshot
      → Save to .claude/visual-qa/screenshots/chromium/

   b. Run pixel diff:
      → node scripts/visual-diff.js --batch \
          .claude/visual-qa/screenshots/chromium \
          .claude/visual-qa/screenshots/canva \
          --output-dir .claude/visual-qa/diffs --json

   c. Parse JSON results:
      → IF all mismatchPct <= threshold: PASS → break
      → IF any FAIL and iteration < max:
        - Read diff images + region analysis
        - Fix component code targeting specific regions
        - Run: pnpm vitest run (ensure tests still pass)
        - Continue to next iteration

5. Stop dev server
```

**Note:** The visual diff threshold may need to be slightly more lenient for Canva sources since reference screenshots are rasterized exports rather than Figma's pixel-perfect renders. The pipeline config's `visualDiff.threshold` applies — adjust if needed.

## Phases 5.5 through 9

Identical to `/build-from-figma`. All shared phases work the same regardless of design source:

- **Phase 5.5:** Dark Mode verification (`check-dark-mode.sh`)
- **Phase 6:** E2E test generation (`e2e-test-generator` skill)
- **Phase 7:** Cross-browser screenshots (Firefox, WebKit)
- **Phase 8:** Quality gate (coverage, types, build, tokens, Lighthouse)
- **Phase 8.5:** Responsive screenshots (`check-responsive.sh`)
- **Phase 9:** Build report (`.claude/visual-qa/build-report.md`)

The build report should note `Source: Canva` and include the token inference confidence summary.

## Error Recovery

- **Canva MCP unavailable:** Ask user to check Canva AI Connector configuration. Offer to proceed with manually exported PNGs.
- **Export fails:** Ask user to manually export design pages as PNG from Canva and provide file paths.
- **Token inference low confidence:** Present all tokens with detailed confidence breakdown. Offer to accept user-provided brand guidelines as override.
- **Dev server won't start:** Check for port conflicts, missing dependencies. Run `pnpm install` if needed.
- **Tests won't pass after 3 attempts:** Mark component as needing manual intervention, continue with remaining.
- **Build fails:** Check TypeScript errors first, then dependency issues. Report blockers.
- **Session interrupted:** On resume, check TodoWrite progress. Skip completed phases, resume from first incomplete.

## Completion

When all phases complete, present:

1. The build report summary
2. Count of pages/components built and verified
3. Token inference accuracy (how many tokens were confirmed vs corrected)
4. Any items needing manual review
5. Next steps (e.g., "run `pnpm dev` to see the app")
```

**Step 3: Commit**

```bash
git add .claude/commands/build-from-canva.md
git commit -m "feat: add /build-from-canva command for Canva-to-React pipeline"
```

---

## Task 7: Update Documentation — Skills README

**Files:**
- Modify: `.claude/skills/README.md`

**Step 1: Read the current skills README**

Read `.claude/skills/README.md` (already read above — 15 skills, needs to become 17).

**Step 2: Add canva-intake and canva-token-inference entries**

After the `visual-qa-verification` entry (skill #6) and before the "React Development Skills" section, add:

```markdown
#### 7. canva-intake (Phase 1 — Canva)
- **Purpose:** Structured discovery for Canva designs. Exports screenshots via Canva MCP, uses Claude vision to analyze page structure and components, asks targeted questions, and produces a `build-spec.json`
- **Triggers:** Phase 1 of `/build-from-canva`, or any Canva URL conversation
- **Output:** `.claude/plans/build-spec.json` with `"source": "canva"`

#### 8. canva-token-inference (Phase 2 — Canva)
- **Purpose:** AI-powered design token extraction from Canva screenshots. Uses Claude vision to infer colors, typography, spacing with confidence scoring. Presents tokens for user confirmation before locking.
- **Triggers:** Phase 2 of `/build-from-canva`, "extract Canva tokens", "Canva design tokens"
- **Output:** `src/styles/design-tokens.lock.json`, `tailwind.config.ts`, `src/styles/tokens.css`
```

Renumber the existing React Development Skills from 7-15 to 9-17.

Update the total count from 15 to 17 in the header.

Update the Pipeline Flow diagram to show dual paths:

```markdown
## Pipeline Flow

```
Figma Design                    Canva Design
    |                               |
    v                               v
[Phase 1] figma-intake         [Phase 1] canva-intake
    |                               |
    v                               v
[Phase 2] design-token-lock    [Phase 2] canva-token-inference
    |                               |
    +---------- build-spec.json ----+
                    |
                    v
[Phase 3] tdd-from-figma → failing tests (RED)
    |
    +-- react-component-development (component patterns)
    +-- react-accessibility (WCAG compliance)
    |
    v
[Phase 4] figma-to-react-workflow / canva-react-converter → tests pass (GREEN)
    |
    v
[Phase 5] visual-qa-verification → pixel-diff loop
    |
    v
[Phase 6] e2e-test-generator → Playwright E2E tests
    |
    +-- react-testing-workflows (test strategy)
    +-- react-performance-optimization (bundle/runtime)
    |
    v
Production-Ready Application
```
```

**Step 3: Commit**

```bash
git add .claude/skills/README.md
git commit -m "docs: add Canva skills to skills README, update pipeline flow diagram"
```

---

## Task 8: Update Documentation — Custom Agents Guide

**Files:**
- Modify: `.claude/CUSTOM-AGENTS-GUIDE.md`

**Step 1: Read the current guide**

Read `.claude/CUSTOM-AGENTS-GUIDE.md` (already read — 47 agents).

**Step 2: Add canva-react-converter to Design-to-Code section**

In the Design-to-Code table (around line 38-41), add a new row:

```markdown
| canva-react-converter | Canva-to-React conversion from screenshots | Converting Canva designs into React components with Tailwind CSS |
```

Update the header count from 47 to 48.

Add to the Quick Reference table at the bottom:

```markdown
| Convert Canva to React | canva-react-converter |
```

Add to the Agent + Skill Integration table:

```markdown
| canva-react-converter | canva-token-inference |
```

**Step 3: Commit**

```bash
git add .claude/CUSTOM-AGENTS-GUIDE.md
git commit -m "docs: add canva-react-converter to custom agents guide"
```

---

## Task 9: Update Documentation — Agent Naming Guide

**Files:**
- Modify: `.claude/AGENT-NAMING-GUIDE.md`

**Step 1: Update agent count from 47 to 48**

**Step 2: Commit**

```bash
git add .claude/AGENT-NAMING-GUIDE.md
git commit -m "docs: update agent count to 48 in naming guide"
```

---

## Task 10: Update Documentation — CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Read CLAUDE.md and identify all sections that need updates**

Updates needed:
1. Custom Agents count: 47 → 48
2. Design-to-Code agents count: 2 → 3
3. Add canva-react-converter to agent table
4. Skills count: 15 → 17
5. Add canva-intake and canva-token-inference to skills table
6. Add `/build-from-canva` to the pipeline section and quick command reference
7. Add Canva MCP to MCP server section
8. Update total counts in header/footer

**Step 2: Make all updates**

In the Custom Agents table, update Design-to-Code count from 2 to 3 and add `canva-react-converter`.

In the React Skills table, add:

```markdown
| canva-intake | Canva design discovery → build-spec.json (with appType) | Phase 1 of /build-from-canva |
| canva-token-inference | AI-powered token extraction from Canva screenshots | Phase 2 of /build-from-canva |
```

Update Skills count from 15 to 17.

In the Pipeline section, add the `/build-from-canva` pipeline:

```markdown
**Canva pipeline:** `/build-from-canva <Canva URL>`

Same 12-phase pipeline with Canva-specific phases 1, 2, and 4:
- Phase 1: canva-intake (vision-based discovery)
- Phase 2: canva-token-inference (AI extraction + user confirmation)
- Phase 4: canva-react-converter agent
- Phases 3, 5-9: shared (identical to Figma pipeline)
```

In the MCP section, add:

```markdown
- **Canva AI Connector** - Search, export, and interact with Canva designs
```

In Quick Command Reference, add:

```markdown
/build-from-canva <URL>       # Full autonomous Canva pipeline
```

Update footer: `48 agents, 17 skills`

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Canva pipeline, agent, and skills"
```

---

## Task 11: Update Documentation — README.md

**Files:**
- Modify: `README.md`

**Step 1: Update all Canva-related sections**

Updates needed:
1. Add Canva to "What This Framework Provides" bullets
2. Update agent count 47 → 48
3. Update skills count 15 → 17
4. Add `/build-from-canva` to Quick Start section
5. Add Canva AI Connector to MCP table
6. Add canva-react-converter to agent categories table
7. Add canva-intake and canva-token-inference to skills table
8. Update directory structure if needed

**Step 2: Make all updates**

Add to Quick Start after the Figma section:

```markdown
### Build from Canva (Autonomous Pipeline)

\`\`\`
/build-from-canva https://www.canva.com/design/DAGxyz.../My-Design
\`\`\`

Same 12-phase pipeline as Figma, with AI-powered token inference:
- Phase 1: Vision-based design discovery (screenshots + Claude analysis)
- Phase 2: AI token extraction with confidence scoring (requires user confirmation)
- Phases 3-9: Shared pipeline (TDD, build, visual diff, E2E, quality gate)
```

Add to MCP table:

```markdown
| **Canva AI Connector** | Search, export, interact with Canva designs | Phases 1-2 (Canva) |
```

Update Design-to-Code agent count to 3, add canva-react-converter.

Add 2 new pipeline skills (canva-intake, canva-token-inference) to the skills table.

Update all counts: 48 agents, 17 skills.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with Canva pipeline integration"
```

---

## Task 12: Update Documentation — Figma-to-React Pipeline Docs

**Files:**
- Modify: `docs/figma-to-react/README.md`

**Step 1: Add cross-reference to Canva pipeline**

At the bottom of the Related Documentation section, add:

```markdown
- `docs/canva-to-react/README.md` -- Canva-to-React conversion pipeline
```

**Step 2: Commit**

```bash
git add docs/figma-to-react/README.md
git commit -m "docs: add cross-reference to Canva pipeline in Figma docs"
```

---

## Task 13: Create Canva-to-React Pipeline Documentation

**Files:**
- Create: `docs/canva-to-react/README.md`

**Step 1: Write the Canva pipeline documentation**

Create `docs/canva-to-react/README.md`:

```markdown
# Canva-to-React Pipeline

Convert Canva designs into fully working, tested React applications with a single command.

## Overview

The `/build-from-canva` command runs the same 12-phase autonomous pipeline as `/build-from-figma`, with Canva-specific substitutions for design discovery and token extraction.

```
[0] Token Sync      → sync-tokens.sh → drift check (conditional)
[1] Intake           → canva-intake skill → build-spec.json (vision-based)
[2] Token Inference  → canva-token-inference skill → lockfile + Tailwind config (AI + user confirmation)
[3] TDD (Gate)       → tdd-from-figma skill → failing tests (RED)
[4] Build            → canva-react-converter agent → components pass tests (GREEN)
[4.5] Storybook     → generate-stories.sh → auto-generated stories
[5] Visual Diff      → visual-diff.js → pixel-diff loop (against Canva screenshots)
[5.5] Dark Mode     → check-dark-mode.sh → dark mode verification
[6] E2E Tests        → e2e-test-generator skill → Playwright tests
[7] Cross-Browser   → Firefox/WebKit screenshots (non-blocking)
[8] Quality Gate     → coverage + TypeScript + build + tokens + Lighthouse
[8.5] Responsive    → check-responsive.sh → screenshots at 5 breakpoints
[9] Report           → .claude/visual-qa/build-report.md
```

## Prerequisites

- **Claude Code** with the framework's agents, skills, and plugins installed
- **Canva AI Connector MCP** configured (Canva account with OAuth)
- **Chrome DevTools MCP** for screenshots and Lighthouse audits
- **Playwright MCP** for cross-browser testing
- **Node.js 18+** and **pnpm** installed
- **Canva design URL** with designs ready for development

## Quick Start

```
/build-from-canva https://www.canva.com/design/DAGxyz.../My-Design
```

The pipeline handles everything: Canva export, vision analysis, token inference, user confirmation, test generation, component building, visual verification, E2E testing, and quality gates.

## How It Differs from Figma Pipeline

| Aspect | Figma Pipeline | Canva Pipeline |
|--------|---------------|----------------|
| **Design access** | Figma MCP (node tree, variables, computed styles) | Canva MCP (screenshot export only) |
| **Token extraction** | Programmatic (exact values from Figma API) | AI-powered inference + user confirmation |
| **Component detection** | Node tree traversal with component metadata | Vision analysis of screenshots with confidence scoring |
| **Reference screenshots** | Captured via Figma MCP at specific nodes | Exported from Canva as full-page PNGs |
| **Phases 3-9** | Identical | Identical |

### Key Difference: Token Inference

Canva doesn't expose design data (colors, fonts, spacing) through its API. Instead:

1. Claude analyzes exported screenshots to **infer** design tokens
2. Each token gets a **confidence score** (high/medium/low)
3. Tokens are **presented to the user for confirmation** before locking
4. After confirmation, the lockfile is **identical** to Figma's — downstream phases see no difference

Expected accuracy by token type:

| Token Type | Accuracy | Notes |
|-----------|----------|-------|
| Colors | 95%+ | Solid colors reliable; gradients less so |
| Font families | 70-85% | Visual similarity between fonts is common |
| Font sizes | 85-95% | Relative sizing reliable; exact px may be off by 1-2px |
| Spacing | 80-90% | Depends on resolution and alignment |
| Border radius | 90%+ | Distinctive visual feature |
| Shadows | 75-85% | Subtle shadows hard to quantify |

## Canva MCP Setup

The pipeline uses the **Canva AI Connector MCP** server. Setup:

1. Ensure you have a Canva account
2. Configure the MCP server in your Claude Code settings
3. Authenticate via OAuth when prompted
4. Test with a simple design export

**Fallback:** If the Canva MCP is unavailable, the pipeline can accept manually exported PNG files. Export your Canva pages as PNG at 2x resolution and provide the file paths when prompted.

## Configuration

Canva-specific settings in `.claude/pipeline.config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `canva.enabled` | true | Enable Canva pipeline |
| `canva.tokenInference.confirmWithUser` | true | Require user confirmation of inferred tokens |
| `canva.tokenInference.confidenceThreshold` | "medium" | Minimum confidence to auto-accept (high = only auto-accept high confidence) |
| `canva.tokenInference.maxInferenceRetries` | 2 | Max retries for ambiguous token extraction |
| `canva.export.format` | "png" | Export format from Canva |
| `canva.export.scale` | 2 | Export scale factor |
| `canva.export.quality` | 100 | Export quality (PNG is always lossless) |

All other pipeline settings (visual diff, TDD, E2E, quality gate) are shared with the Figma pipeline.

## Canva-Specific Skills

| Skill | Phase | Purpose |
|-------|-------|---------|
| canva-intake | 1 | Vision-based design discovery, exports Canva screenshots, produces build-spec.json |
| canva-token-inference | 2 | AI-powered token extraction with confidence scoring and user confirmation |

## Canva-Specific Agent

| Agent | Role |
|-------|------|
| **canva-react-converter** | Reads Canva screenshots + locked tokens, generates React components |

## Supported App Types

Identical to the Figma pipeline — app type detection is project-based, not design-tool-based:

| App Type | Detection | E2E Strategy |
|----------|-----------|-------------|
| **Web App** | Default | Standard Playwright |
| **Chrome Extension** | `manifest.json` with `manifest_version` | Persistent context with `--load-extension` |
| **PWA** | `manifest.json` with `start_url` | Install prompt, offline tests |

## Troubleshooting

- **Canva MCP unavailable:** Check Canva AI Connector configuration. Ensure OAuth is authenticated. Test connection.
- **Export fails or returns low-resolution images:** Verify `canva.export.scale` is set to 2 in pipeline config. Try manual export as fallback.
- **Token inference very inaccurate:** Provide brand guidelines or a style guide as additional input. The skill will use these as ground truth.
- **Font identification wrong:** Fonts are the hardest to identify from screenshots. Always confirm font choices during the token review step.
- **Visual diff threshold too strict for Canva:** Canva exports may differ slightly from rendered output. Consider increasing `visualDiff.threshold` to 0.03 for Canva projects.
- **Tests won't pass after 3 attempts:** Pipeline marks the component for manual intervention and continues.
- **Session interrupted:** The pipeline tracks progress with TodoWrite. On resume, completed phases are skipped.

## Related Documentation

- `docs/figma-to-react/README.md` -- Figma-to-React conversion pipeline
- `docs/react-development/README.md` -- React development standards
- `scripts/README.md` -- Scripts reference
- `.claude/skills/README.md` -- Full skills catalog
- `.claude/CUSTOM-AGENTS-GUIDE.md` -- Full agent catalog
```

**Step 2: Commit**

```bash
git add docs/canva-to-react/README.md
git commit -m "docs: add Canva-to-React pipeline documentation"
```

---

## Task 14: Update Documentation — React Development README

**Files:**
- Modify: `docs/react-development/README.md`

**Step 1: Update counts**

Update agent count from 47 to 48 and skills from 15 to 17 (if referenced).

Add to Related Documentation section:

```markdown
- `docs/canva-to-react/README.md` -- Canva-to-React conversion pipeline
```

**Step 2: Commit**

```bash
git add docs/react-development/README.md
git commit -m "docs: update react-development README with Canva references"
```

---

## Task 15: Update Documentation — Scripts README

**Files:**
- Modify: `scripts/README.md`

**Step 1: Read the scripts README**

Check if it references the pipeline or design sources — if so, add Canva references.

**Step 2: Add any needed Canva references**

If the README mentions Figma as the design source, add Canva as an alternative. This is likely minimal — scripts operate on screenshots and lockfiles regardless of source.

**Step 3: Commit (if changes made)**

```bash
git add scripts/README.md
git commit -m "docs: add Canva source references to scripts README"
```

---

## Summary

| # | Task | Type | What It Creates/Modifies |
|---|------|------|--------------------------|
| 1 | Pipeline config | Config | Canva section in `pipeline.config.json` |
| 2 | build-spec.json format | Skill update | `source` field in figma-intake |
| 3 | canva-intake skill | Skill (new) | `.claude/skills/canva-intake/SKILL.md` |
| 4 | canva-token-inference skill | Skill (new) | `.claude/skills/canva-token-inference/SKILL.md` |
| 5 | canva-react-converter agent | Agent (new) | `.claude/agents/canva-react-converter.md` |
| 6 | /build-from-canva command | Command (new) | `.claude/commands/build-from-canva.md` |
| 7 | Skills README | Docs | Updated counts, new entries, dual pipeline flow |
| 8 | Custom Agents Guide | Docs | New agent entry, updated counts |
| 9 | Agent Naming Guide | Docs | Updated count |
| 10 | CLAUDE.md | Docs | All Canva references, counts, MCP, commands |
| 11 | README.md | Docs | Canva pipeline, counts, MCP table |
| 12 | Figma-to-React docs | Docs | Cross-reference to Canva docs |
| 13 | Canva-to-React docs | Docs (new) | Full Canva pipeline documentation |
| 14 | React Development docs | Docs | Updated counts, Canva reference |
| 15 | Scripts README | Docs | Canva source references (if applicable) |

**Total: 15 tasks, ~15 commits**
