# Skills Catalog

**Last Updated:** 2026-03-17
**Total Skills:** 10
**Location:** `.claude/skills/`

Skills are documentation-based workflows that trigger automatically when relevant keywords appear in conversation. They provide systematic guidance, not tool integrations.

---

## Skills Index

### Figma-to-React Pipeline Skills

These skills power the `/build-from-figma` autonomous pipeline. They run in sequence (Phase 1 through Phase 6) but can also be invoked independently.

#### 1. figma-intake (Phase 1)
- **Purpose:** Structured interview that auto-discovers Figma file structure, scans the local project, asks 3-5 targeted questions, and produces a `build-spec.json`
- **Triggers:** Phase 1 of `/build-from-figma`, or any Figma URL conversation
- **Output:** `.claude/plans/build-spec.json`

#### 2. design-token-lock (Phase 2)
- **Purpose:** Extracts all design values from Figma and writes a lockfile that becomes the single source of truth for colors, typography, spacing, and text content
- **Triggers:** Phase 2 of `/build-from-figma`, "extract tokens", "design tokens"
- **Output:** `src/styles/design-tokens.lock.json`, `tailwind.config.ts`, `src/styles/tokens.css`

#### 3. tdd-from-figma (Phase 3)
- **Purpose:** Writes failing tests for every component BEFORE implementation. App-type-aware: generates Chrome extension tests (popup, service worker, Chrome API mocks), PWA tests (manifest, offline), or standard web app tests.
- **Triggers:** Phase 3 of `/build-from-figma`, "write tests first", "TDD"
- **Output:** `src/components/**/*.test.tsx` (RED phase -- all tests fail)

#### 4. figma-to-react-workflow (Phase 4)
- **Purpose:** Orchestrates the full Figma-to-React conversion pipeline. Generates React components that pass the tests from Phase 3. Includes pixel-diff visual QA loop and quality gate.
- **Triggers:** "convert Figma", "Figma to React", "design to code"
- **Works with:** figma-react-converter agent, asset-cataloger agent

#### 5. e2e-test-generator (Phase 6)
- **Purpose:** Generates Playwright E2E tests from `build-spec.json`. App-type-aware: web apps get page navigation/form/responsive tests, Chrome extensions get load/popup/storage/content-script tests, PWAs get install/offline tests.
- **Triggers:** Phase 6 of `/build-from-figma`, "generate E2E tests", "Playwright tests"
- **Output:** `e2e/` directory with Playwright config and test files

#### 6. visual-qa-verification (Phase 5)
- **Purpose:** Automated pixel-diff visual QA using `scripts/visual-diff.js`. Captures Figma screenshots, renders the app, compares with pixelmatch, and iterates fixes up to 5 times. Includes cross-browser verification.
- **Triggers:** "visual QA", "compare to Figma", "screenshot diff", "verify app"
- **Works with:** visual-qa-agent, Chrome DevTools MCP, Figma MCP

### React Development Skills

These skills provide patterns and best practices. They trigger on relevant keywords during any React development work.

#### 7. react-component-development
- **Purpose:** Component patterns, TypeScript conventions, custom hooks, composition, and Tailwind CSS best practices
- **Triggers:** "create component", "component pattern", "custom hook", "React best practices"
- **Works with:** frontend-developer agent, ui-designer agent

#### 8. react-testing-workflows
- **Purpose:** Testing strategy with Vitest, React Testing Library, Playwright, and Storybook
- **Triggers:** "write tests", "test coverage", "Vitest", "Playwright", "Storybook"
- **Works with:** test-writer-fixer agent, test-results-analyzer agent

#### 9. react-performance-optimization
- **Purpose:** Performance profiling, bundle analysis, code splitting, and Web Vitals
- **Triggers:** "performance", "bundle size", "Web Vitals", "lazy loading", "profiling"
- **Works with:** performance-benchmarker agent, analytics-reporter agent

#### 10. react-accessibility
- **Purpose:** WCAG 2.1 AA patterns for React, ARIA usage, keyboard navigation, focus management
- **Triggers:** "accessibility", "WCAG", "ARIA", "a11y", "keyboard navigation"
- **Works with:** accessibility-auditor agent, ux-researcher agent

---

## Pipeline Flow

```
Figma Design
    |
    v
[Phase 1] figma-intake → build-spec.json
    |
    v
[Phase 2] design-token-lock → lockfile + tailwind config
    |
    v
[Phase 3] tdd-from-figma → failing tests (RED)
    |
    +-- react-component-development (component patterns)
    +-- react-accessibility (WCAG compliance)
    |
    v
[Phase 4] figma-to-react-workflow → components pass tests (GREEN)
    |
    v
[Phase 5] visual-qa-verification → pixel-diff loop (max 5 iterations)
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

## Skills vs Agents vs Plugins

| Type | Purpose | Invocation |
|------|---------|------------|
| **Skills** | Systematic workflows and best practices | Automatic keyword detection |
| **Agents** | Specialized task execution | Task tool (auto or explicit) |
| **Plugins** | Tool integrations and commands | Manual `/` commands |

## Skill File Structure

```yaml
---
name: skill-name
description: Use when [triggers]. Keywords: term1, term2
---

# Skill Name
## Overview
## When to Use
## Quick Reference
## Implementation
## Common Mistakes
```
