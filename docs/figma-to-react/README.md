# Figma-to-React Pipeline

Convert Figma designs into fully working, tested React applications with a single command.

## Overview

The `/build-from-figma` command runs a 9-phase autonomous pipeline:

```
[1] Intake       → figma-intake skill → build-spec.json
[2] Token Lock   → design-token-lock skill → lockfile + Tailwind config
[3] TDD (Gate)   → tdd-from-figma skill → failing tests (RED)
[4] Build        → figma-to-react-workflow skill → components pass tests (GREEN)
[5] Visual Diff  → visual-qa-verification skill → pixel-diff loop
[6] E2E Tests    → e2e-test-generator skill → Playwright tests
[7] Cross-Browser→ Firefox/WebKit screenshots (non-blocking)
[8] Quality Gate → coverage + TypeScript + build + tokens + Lighthouse
[9] Report       → .claude/visual-qa/build-report.md
```

## Prerequisites

- **Claude Code** with the framework's agents, skills, and plugins installed
- **Figma MCP** configured (Figma Desktop app running locally, or remote MCP fallback)
- **Chrome DevTools MCP** for screenshots and Lighthouse audits
- **Playwright MCP** for cross-browser testing
- **Node.js 18+** and **pnpm** installed
- **Figma file URL** with designs ready for development

## Quick Start

```
/build-from-figma https://figma.com/file/abc123/My-Design?node-id=1-2
```

The pipeline handles everything: Figma discovery, token extraction, test generation, component building, visual verification, E2E testing, and quality gates.

## What Gets Generated

```
app/
├── src/
│   ├── components/          # React components from Figma
│   │   ├── Hero.tsx
│   │   ├── Hero.test.tsx    # Tests written BEFORE components
│   │   ├── Navigation.tsx
│   │   └── ...
│   ├── styles/
│   │   ├── design-tokens.lock.json  # Locked design values
│   │   ├── tokens.css               # CSS custom properties
│   │   └── globals.css              # Tailwind base
│   └── types/
│       └── design-system.ts
├── e2e/                     # Generated Playwright E2E tests
├── tailwind.config.ts       # Generated from design tokens
├── vitest.config.ts
└── package.json
```

### Pipeline Artifacts (in `.claude/`)

```
.claude/
├── plans/
│   └── build-spec.json          # Machine-readable build plan
├── visual-qa/
│   ├── build-report.md          # Final report
│   ├── e2e-report.md            # E2E test results
│   ├── screenshots/
│   │   ├── figma/               # Reference screenshots from Figma
│   │   ├── chromium/            # App screenshots
│   │   ├── firefox/             # Cross-browser (if applicable)
│   │   └── webkit/              # Cross-browser (if applicable)
│   └── diffs/                   # Pixel-diff images (magenta highlights)
└── pipeline.config.json         # Thresholds and settings
```

## Supported App Types

The pipeline detects the app type from `manifest.json` and adjusts its strategy:

### Web App (default)
- Standard Playwright E2E: page navigation, forms, responsive layout
- Dev server for visual QA
- Cross-browser verification (Firefox, WebKit)

### Chrome Extension
- Detected when `manifest.json` contains `manifest_version`
- E2E uses `chromium.launchPersistentContext` with `--load-extension`
- Tests cover: extension loading, popup rendering, Chrome storage, content scripts, message passing
- Must build before testing (`pnpm build`), no dev server
- Cross-browser verification skipped (Chromium only)

### PWA
- Detected when `manifest.json` contains `start_url` or `display`
- E2E includes: install prompt, offline fallback, service worker registration
- Dev server for visual QA
- Cross-browser verification included

## Enforcement Rules

### TDD is Mandatory
Phase 3 must complete before Phase 4 begins. Tests are written first, confirmed to fail (RED), then components are built to make them pass (GREEN). If tests fail after component generation, the component is fixed -- never the test.

### Pixel-Diff Visual QA
Phase 5 uses `scripts/visual-diff.js` (pixelmatch) for programmatic comparison:
- Captures Figma reference screenshots once
- Iterates up to 5 times (configurable in `pipeline.config.json`)
- Pass threshold: 2% pixel mismatch (configurable)
- Region-based analysis identifies which areas need fixes (4x4 grid)
- Diff images saved for review

### Design Token Lockfile
All design values (colors, typography, spacing, text content) are extracted into `design-tokens.lock.json`. Components must reference tokens through Tailwind classes -- no hardcoded values. Enforced by `scripts/verify-tokens.sh`.

## Configuration

All pipeline behavior is controlled by `.claude/pipeline.config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `visualDiff.threshold` | 0.02 | Pixel mismatch pass threshold (2%) |
| `iterationLoop.maxVisualIterations` | 5 | Max visual fix iterations |
| `tdd.enforced` | true | TDD gate cannot be bypassed |
| `tdd.coverageThreshold` | 80 | Minimum test coverage percentage |
| `qualityGate.lighthouseThresholds.accessibility` | 90 | Minimum Lighthouse a11y score |
| `appTypes.chrome-extension.extensionPathDefault` | "dist" | Built extension directory |

See the full config file for all options.

## Key Skills

| Skill | Phase | Purpose |
|-------|-------|---------|
| figma-intake | 1 | Auto-discovers Figma structure, asks targeted questions, writes build-spec.json |
| design-token-lock | 2 | Extracts all design values into a lockfile |
| tdd-from-figma | 3 | Writes failing tests for every component |
| figma-to-react-workflow | 4 | Generates components that pass the tests |
| visual-qa-verification | 5 | Pixel-diff comparison loop |
| e2e-test-generator | 6 | Generates Playwright E2E tests |

## Agent Integration

| Agent | Role |
|-------|------|
| **figma-react-converter** | Reads Figma, generates components |
| **asset-cataloger** | Maps hash-named image exports to semantic filenames |
| **visual-qa-agent** | Compares rendered output against Figma screenshots |
| **accessibility-auditor** | WCAG compliance check on generated components |
| **test-writer-fixer** | Fixes test failures during component generation |

## Troubleshooting

- **Figma MCP unavailable:** Verify Figma Desktop app is running. Check MCP config in `.claude/settings.json`. Test with `mcp__figma__whoami`.
- **No Figma variables defined:** Token extraction will rely on computed styles (less accurate). Define named styles/variables in Figma for best results.
- **Visual diff threshold too strict:** Adjust `visualDiff.threshold` in `pipeline.config.json`. Anti-aliasing differences are common -- enable `antialiasing: true`.
- **Chrome extension E2E fails:** Ensure `pnpm build` succeeds first. Check that `dist/manifest.json` exists. Extension tests require non-headless Chromium.
- **Tests won't pass after 3 attempts:** Pipeline marks the component for manual intervention and continues with remaining components.
- **Session interrupted:** The pipeline tracks progress with TodoWrite. On resume, completed phases are skipped.

## Related Documentation

- `scripts/README.md` -- Scripts reference (visual-diff.js, verify-tokens.sh, verify-test-coverage.sh)
- `templates/README.md` -- Starter configs including Chrome extension E2E templates
- `.claude/skills/README.md` -- Full skills catalog
- `.claude/CUSTOM-AGENTS-GUIDE.md` -- Full agent catalog
- `docs/react-development/README.md` -- React development standards
