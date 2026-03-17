# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Claude Code-integrated React app development framework** providing specialized agents, skills, scripts, and a Figma-to-React conversion pipeline.

The framework is designed for:
- Framework-agnostic React app development (Next.js, Vite, Remix)
- Figma-to-React component conversion with Tailwind CSS
- Comprehensive testing (Vitest, React Testing Library, Playwright, Storybook)
- Full product lifecycle support (engineering, design, testing, marketing, operations)

## Project Structure

```
project-root/
├── .claude/              # Claude Code configuration
│   ├── agents/           # 44 specialized agents
│   ├── skills/           # 10 React-specific skills
│   ├── commands/         # Custom slash commands
│   ├── hooks/            # Git and tool hooks
│   └── pipeline.config.json  # Pipeline thresholds, iteration limits, app types
├── scripts/              # Development automation scripts
├── templates/            # Starter configs (ESLint, Tailwind, Vitest, Chrome ext, etc.)
├── docs/                 # Documentation
│   ├── figma-to-react/   # Figma conversion pipeline docs
│   └── react-development/# React development standards
└── CLAUDE.md             # This file
```

## Development Scripts

```bash
# Lint and format code
./scripts/lint-and-format.sh

# Run tests with coverage
./scripts/run-tests.sh

# TypeScript type checking
./scripts/check-types.sh

# Bundle size analysis
./scripts/check-bundle-size.sh

# Accessibility linting
./scripts/check-accessibility.sh

# Verify design token usage (no hardcoded values)
./scripts/verify-tokens.sh

# Verify every component has a test file
./scripts/verify-test-coverage.sh

# Pixel-level visual diff between screenshots
node scripts/visual-diff.js <actual.png> <expected.png> [--threshold 0.02] [--json]
node scripts/visual-diff.js --batch <actual-dir> <expected-dir> [--output-dir diffs/]

# Initialize a new React project
./scripts/setup-project.sh my-app --next  # or --vite

# Cross-browser testing (Playwright)
./scripts/cross-browser-test.sh chromium http://localhost:3000
./scripts/cross-browser-test.sh firefox http://localhost:3000
./scripts/cross-browser-test.sh webkit http://localhost:3000

# Setup Playwright browsers (one-time)
./scripts/setup-playwright.sh
```

## Development Commands

### Package Management (always use pnpm)
```bash
pnpm install              # Install dependencies
pnpm add <package>        # Add a dependency
pnpm add -D <package>     # Add a dev dependency
pnpm update               # Update dependencies
```

### Development Server
```bash
# Next.js
pnpm dev                  # Start dev server (port 3000)
pnpm build                # Production build
pnpm start                # Start production server

# Vite
pnpm dev                  # Start dev server (port 5173)
pnpm build                # Production build
pnpm preview              # Preview production build
```

### Testing
```bash
pnpm vitest               # Run tests in watch mode
pnpm vitest run           # Run tests once
pnpm vitest run --coverage # Run with coverage report
pnpm storybook            # Start Storybook dev server
pnpm build-storybook      # Build Storybook static site
```

### Code Quality
```bash
pnpm eslint .             # Run ESLint
pnpm eslint . --fix       # Auto-fix ESLint issues
pnpm prettier --check .   # Check formatting
pnpm prettier --write .   # Fix formatting
pnpm tsc --noEmit         # Type check without emitting
```

---

## Claude Code Architecture & Configuration

### Installed Plugins (5 Total)

- **episodic-memory** - Conversation search and memory
- **commit-commands** - Git workflow automation
- **superpowers** - Advanced development workflows
- **ai-taskmaster** - Task management (local)

**Note:** GitHub integration via `gh` CLI

**Full documentation:** `.claude/PLUGINS-REFERENCE.md`

---

### Custom Agents (44 Total)

44 specialized agents covering the full product lifecycle:

| Category | Count | Key Agents |
|----------|-------|------------|
| Engineering | 7 | frontend-developer, backend-architect, rapid-prototyper, test-writer-fixer |
| Design | 5 | ui-designer, ux-researcher, brand-guardian |
| Design-to-Code | 2 | figma-react-converter, asset-cataloger |
| Testing & QA | 7 | visual-qa-agent, accessibility-auditor, api-tester, performance-benchmarker |
| Product | 3 | sprint-prioritizer, feedback-synthesizer, trend-researcher |
| Marketing | 7 | content-creator, growth-hacker, app-store-optimizer |
| Project Management | 3 | studio-producer, project-shipper, experiment-tracker |
| Operations | 5 | analytics-reporter, infrastructure-maintainer, legal-compliance-checker |
| Documentation | 1 | docusaurus-expert |
| Meta | 2 | agent-expert, command-expert |
| Bonus | 2 | joker, studio-coach |

Agents are invoked automatically based on task context.

**Full catalog:** `.claude/CUSTOM-AGENTS-GUIDE.md`

---

### React Skills (10 Total)

| Skill | Purpose | Triggers |
|-------|---------|----------|
| figma-to-react-workflow | Figma-to-React pipeline (v3: enforced TDD, pixel-diff, E2E) | "convert Figma", "Figma to React" |
| figma-intake | Structured interview → build-spec.json (with appType) | Phase 1 of /build-from-figma |
| design-token-lock | Extract + lock Figma values → lockfile | Phase 2 of /build-from-figma |
| tdd-from-figma | Write tests FIRST, app-type-aware (Chrome ext, PWA) | Phase 3 of /build-from-figma |
| e2e-test-generator | Generate Playwright E2E from build-spec (new) | Phase 6 of /build-from-figma |
| react-component-development | Component patterns and best practices | "create component", "custom hook" |
| react-testing-workflows | Vitest, RTL, Playwright, Storybook | "write tests", "test coverage" |
| react-performance-optimization | Profiling, bundle analysis, Web Vitals | "performance", "bundle size" |
| react-accessibility | WCAG patterns for React | "accessibility", "a11y", "ARIA" |
| visual-qa-verification | Automated pixel-diff visual QA (v3: pixelmatch loop) | "verify", "visual QA", "compare to Figma" |

**Full catalog:** `.claude/skills/README.md`

---

### Figma-to-React Pipeline

**Single command:** `/build-from-figma <Figma URL>`

Autonomous 9-phase pipeline that converts a Figma design into a working, tested React app:

```
/build-from-figma https://figma.com/file/abc123

  [1] INTAKE        → figma-intake skill → build-spec.json (with appType)
  [2] TOKEN LOCK    → design-token-lock skill → design-tokens.lock.json
  [3] TDD (HARD GATE) → tdd-from-figma skill → failing tests (Red)
  [4] BUILD         → figma-to-react-workflow → components pass tests (Green)
  [5] VISUAL DIFF   → pixelmatch loop → max 5 iterations, 2% threshold
  [6] E2E TESTS     → e2e-test-generator skill → Playwright tests (app-type-aware)
  [7] CROSS-BROWSER → Firefox/WebKit screenshots (non-blocking)
  [8] QUALITY GATE  → coverage + types + build + tokens + Lighthouse
  [9] REPORT        → .claude/visual-qa/build-report.md (with diff images)
```

**Key artifacts:**
- `design-tokens.lock.json` — Single source of truth for all design values
- `build-spec.json` — Machine-readable build plan with appType and E2E flows
- `pipeline.config.json` — Thresholds, iteration limits, app-type definitions
- `verify-tokens.sh` — Catches hardcoded values and token drift
- `verify-test-coverage.sh` — Ensures every component has tests
- `visual-diff.js` — Pixel-level screenshot comparison with region analysis

**Features:**
- **Enforced TDD** — tests must exist before components, hard gate blocks build phase
- **Pixel-perfect visual diff** — `pixelmatch`-based comparison (not manual), up to 5 iterations
- **App-type awareness** — Chrome extensions, PWAs, and web apps get tailored E2E strategies
- **Chrome extension E2E** — Playwright persistent context with `--load-extension`
- Design token extraction with lockfile enforcement
- Cross-browser verification (Firefox, WebKit) with configurable thresholds
- Quality gate: 80%+ coverage, TypeScript, Lighthouse audit
- Resumable: TodoWrite tracks progress across interrupted sessions

**Documentation:** `docs/figma-to-react/README.md`

---

### MCP Server Integration

- **Figma Desktop MCP** - Local Figma integration (port 3845)
- **Figma Remote MCP** - Fallback remote access
- **Playwright MCP** - Cross-browser testing (Chromium, Firefox, WebKit)
- **Chrome DevTools MCP** - Screenshots, Lighthouse audits, DOM inspection

---

## React Development Standards

### TypeScript
- Strict mode enabled
- No `any` types - use proper interfaces and generics
- Export prop interfaces alongside components
- Use discriminated unions for complex prop patterns

### Component Patterns
- Functional components only (no class components)
- Custom hooks for reusable logic
- Composition over inheritance
- Props interface for every component
- `children` and `className` passthrough where appropriate

### Tailwind CSS
- Utility-first styling
- Design tokens via Tailwind config (not hardcoded values)
- Responsive with mobile-first breakpoints (sm, md, lg, xl, 2xl)
- Use `cn()` utility for conditional classes (clsx + tailwind-merge)

### Testing Strategy
- **Unit tests** (Vitest): Pure functions, custom hooks, utilities
- **Component tests** (RTL): User interactions, rendering, accessibility
- **Visual tests** (Storybook): Component states, responsive variants
- **E2E tests** (Playwright): Critical user flows, cross-browser

### Accessibility
- WCAG 2.1 AA minimum
- Semantic HTML (landmarks, headings hierarchy)
- ARIA attributes on interactive elements
- Keyboard navigation support
- Color contrast 4.5:1 minimum

### Code Quality
- ESLint with React, TypeScript, and jsx-a11y plugins
- Prettier for formatting
- 2-space indentation (JS/TS/CSS/JSON)

---

### Development Workflow with Claude Code

**1. Feature Development**
```bash
# Start feature branch
git checkout -b feature/hero-component

# Develop with Claude Code
# - frontend-developer agent for React work
# - test-writer-fixer agent for tests
# - ui-designer agent for design decisions

# Commit with structure
/commit
```

**2. Code Quality**
```bash
./scripts/lint-and-format.sh
./scripts/check-types.sh
./scripts/run-tests.sh
./scripts/check-accessibility.sh
```

**3. Figma-to-React Conversion**
```
User: "Convert this Figma design to React components"
      [Provide Figma URL]

Claude: [Uses figma-react-converter agent]
        → Extracts design tokens
        → Generates Tailwind config + React components
        → Runs visual QA verification
```

**4. Using Custom Agents**
```
User: "Help me optimize app performance"
Claude: [Uses performance-benchmarker agent]

User: "Build a hero component"
Claude: [Uses frontend-developer agent]

User: "Write tests for my auth hook"
Claude: [Uses test-writer-fixer agent]
```

---

### Quick Command Reference

**Figma Pipeline:**
```bash
/build-from-figma <URL>       # Full autonomous pipeline
```

**Git Workflows (via commit-commands):**
```bash
/commit                       # Structured commit
/commit-push-pr              # Commit + push + PR
/clean_gone                   # Clean merged branches
```

**GitHub CLI:**
```bash
gh pr create                  # Create pull request
gh pr list                    # List pull requests
gh issue create               # Create issue
```

**Code Quality:**
```bash
./scripts/lint-and-format.sh        # ESLint + Prettier
./scripts/run-tests.sh              # Vitest + coverage
./scripts/check-types.sh            # TypeScript check
./scripts/check-bundle-size.sh      # Bundle analysis
./scripts/check-accessibility.sh    # a11y linting
./scripts/verify-tokens.sh          # Design token enforcement
```

---

**Last Updated:** 2026-03-17
**Architecture:** 44 agents, 10 skills, 4 plugins + gh CLI, Figma + Playwright MCP
