---
allowed-tools: Skill, Agent, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, mcp__figma__get_metadata, mcp__figma__get_variable_defs, mcp__figma__get_design_context, mcp__figma__get_screenshot, mcp__figma-desktop__get_metadata, mcp__figma-desktop__get_variable_defs, mcp__figma-desktop__get_design_context, mcp__figma-desktop__get_screenshot, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__resize_page, mcp__chrome-devtools__lighthouse_audit, mcp__chrome-devtools__evaluate_script, AskUserQuestion
---

# /build-from-figma — Autonomous Figma-to-Working-App Pipeline

You are the master orchestrator for converting a Figma design into a fully working, tested React application. You receive a Figma URL and guide the entire process through 9 phases, using specialized skills and agents.

**Key enforcement rules:**
- **TDD is mandatory** — Phase 3 (TDD) MUST complete before Phase 4 (Build). No exceptions.
- **Visual QA uses pixel diff** — Phase 5 uses `scripts/visual-diff.js` for programmatic comparison, not manual eyeballing.
- **E2E tests are generated** — Phase 6 generates and runs Playwright E2E tests appropriate to the app type.
- **App-type aware** — Chrome extensions, PWAs, and web apps each get tailored test strategies.

## Input

The user provides: `$ARGUMENTS` (a Figma URL, optionally with node-id)

Parse the Figma URL to extract:
- `fileKey` from the URL path
- `nodeId` from the `?node-id=` parameter (convert `-` to `:`)
- For branch URLs: use `branchKey` as `fileKey`

## Configuration

Load `.claude/pipeline.config.json` at the start. This provides:
- Visual diff thresholds and iteration limits
- TDD enforcement settings
- E2E strategy per app type
- Quality gate thresholds
- Lighthouse score minimums

## Progress Tracking

Use `TodoWrite` to create a master checklist. Update each item as phases complete. This enables interrupted sessions to resume.

```
[ ] Phase 1: Intake — figma-intake skill → build-spec.json
[ ] Phase 2: Token Lock — design-token-lock skill → lockfile + tailwind config
[ ] Phase 3: TDD Scaffold — tdd-from-figma skill → failing tests (RED)
[ ] Phase 4: Component Build — figma-to-react-workflow → tests pass (GREEN)
[ ] Phase 5: Visual Verification — pixel-diff loop (max N iterations)
[ ] Phase 6: E2E Tests — e2e-test-generator skill → Playwright tests
[ ] Phase 7: Cross-Browser — screenshots in Firefox/WebKit (non-blocking)
[ ] Phase 8: Quality Gate — coverage, types, build, tokens, Lighthouse
[ ] Phase 9: Report — build-report.md
```

For each component, track: `[ ] ComponentName: test-written → implemented → visual-verified`

## Phase 1: Intake

Invoke the `figma-intake` skill.

**Input:** The Figma URL from $ARGUMENTS
**Output:** `.claude/plans/build-spec.json`

This phase:
1. Auto-discovers Figma file structure via MCP
2. Scans the local project for framework, existing components, UI libraries
3. Asks the user 3-5 targeted questions (scope, reuse, business logic, labels, integration)
4. Writes the build spec

**Resume check:** If `.claude/plans/build-spec.json` already exists, ask the user if they want to reuse it or regenerate.

## Phase 2: Token Lock

Invoke the `design-token-lock` skill.

**Input:** Figma file key from build-spec.json
**Output:** `src/styles/design-tokens.lock.json`, `tailwind.config.ts`, `src/styles/tokens.css`

This phase:
1. Extracts all design values from Figma via MCP
2. Writes the lockfile with exact hex, px, text content values
3. Generates Tailwind config and CSS custom properties from lockfile
4. Validates completeness against the Figma file

**Resume check:** If `src/styles/design-tokens.lock.json` already exists, ask the user if they want to reuse it or re-extract.

## Phase 3: TDD Scaffold

Invoke the `tdd-from-figma` skill.

**Input:** `build-spec.json` + `design-tokens.lock.json`
**Output:** `src/components/**/*.test.tsx` files

This phase:
1. Reads the build spec for component inventory
2. Reads the lockfile for exact text content, ARIA expectations
3. Writes test files for every component (rendering, content, a11y, interactions)
4. Runs `pnpm vitest run` to confirm RED (all tests fail — no implementations yet)

Process components in dependency order: UI primitives → Layout → Sections → Pages

## Phase 4: Component Build

Invoke the `figma-to-react-workflow` skill (which detects build-spec.json and lockfile automatically).

**Input:** build-spec.json, lockfile, existing test files
**Output:** `src/components/**/*.tsx`, page files

This phase:
1. Skips discovery (build-spec.json exists)
2. References lockfile for all token values (no approximating)
3. Generates components that satisfy the test files from Phase 3
4. Runs `pnpm vitest run` after each component batch to confirm GREEN

**Critical rule:** If tests fail, fix the component — never modify the test files.

## Phase 5: Visual Verification (Automated Pixel Diff)

Automated pixel-level screenshot comparison using `scripts/visual-diff.js`.

**Prerequisites:** All unit tests passing from Phase 4.

**Configuration:** Read `.claude/pipeline.config.json`:
- `iterationLoop.maxVisualIterations` (default: 5)
- `iterationLoop.diffPassThreshold` (default: 0.02 = 2% pixel diff)

For each page in build-spec.json:

```
1. Start: pnpm dev (background) — skip if appType is chrome-extension
   For chrome-extension: pnpm build first, then test against built output
2. Wait for server/build ready

3. Capture Figma reference screenshots ONCE:
   → Figma MCP: get_screenshot for each page/frame
   → Save to .claude/visual-qa/screenshots/figma/

4. FOR iteration IN 1..maxVisualIterations:
   a. Chrome DevTools MCP: navigate → resize → take_screenshot at each breakpoint
      → Save to .claude/visual-qa/screenshots/chromium/

   b. Run pixel diff:
      → node scripts/visual-diff.js --batch \
          .claude/visual-qa/screenshots/chromium \
          .claude/visual-qa/screenshots/figma \
          --output-dir .claude/visual-qa/diffs --json

   c. Parse JSON results:
      → IF all mismatchPct <= threshold: PASS → break loop
      → IF any FAIL and iteration < max:
        - Read diff images + region analysis to identify problem areas
        - Fix component code targeting specific regions
        - Run: pnpm vitest run (ensure tests still pass)
        - Continue to next iteration
      → IF final iteration and still failing:
        - Save diff images for manual review
        - Mark as "needs manual review"

5. Stop dev server
```

## Phase 6: E2E Tests

Generate and run end-to-end tests appropriate to the app type.

```
1. Invoke the e2e-test-generator skill:
   → Reads build-spec.json (appType, pages, e2e.flows, extensionManifest)
   → Generates Playwright config + test files in e2e/

2. Run E2E tests:
   → web-app: pnpm exec playwright test
   → chrome-extension: pnpm build && pnpm exec playwright test --config=playwright.chrome-ext.config.ts
   → pwa: pnpm exec playwright test (includes offline tests)

3. If E2E tests fail:
   → Read failure output
   → Fix component/page code
   → Re-run unit tests (ensure still passing)
   → Re-run E2E (max 2 retries)

4. Save results to .claude/visual-qa/e2e-report.md
```

## Phase 7: Cross-Browser Verification (Non-Blocking)

Capture screenshots in Firefox and WebKit, compare against Chromium baseline.

```bash
# Only for web apps and PWAs (Chrome extensions are Chromium-only)
./scripts/cross-browser-test.sh firefox http://localhost:3000
./scripts/cross-browser-test.sh webkit http://localhost:3000

node scripts/visual-diff.js --batch \
  .claude/visual-qa/screenshots/firefox \
  .claude/visual-qa/screenshots/chromium \
  --output-dir .claude/visual-qa/diffs/firefox-vs-chromium \
  --threshold 0.03
```

Cross-browser differences are logged in the build report but do NOT block the pipeline.

## Phase 8: Quality Gate

Run all quality checks. All must pass for pipeline success.

```bash
# 1. Unit test coverage (threshold from pipeline.config.json, default: 80%)
pnpm vitest run --coverage

# 2. Test existence verification
./scripts/verify-test-coverage.sh

# 3. TypeScript
pnpm tsc --noEmit

# 4. Production build
pnpm build

# 5. Token verification
./scripts/verify-tokens.sh

# 6. Lighthouse audit (via Chrome DevTools MCP)
#    → Start dev server, run lighthouse_audit per page
#    → Thresholds from pipeline.config.json → qualityGate.lighthouseThresholds
```

If any check fails, attempt to fix automatically (max 2 attempts per check). If still failing after fixes, report the failure and continue to the report phase.

## Phase 9: Report

Write `.claude/visual-qa/build-report.md` with:

- Build summary (pages, components, framework, app type, timestamps)
- Visual QA results table (pass/fail per page per breakpoint, mismatch %, iterations needed)
- E2E test results table (pass/fail per test file, app-type-specific tests)
- Cross-browser results (if applicable, non-blocking)
- Quality gate results table (each check with status and details)
- Unit test coverage percentage
- Lighthouse scores
- Diff images saved to `.claude/visual-qa/diffs/`
- Remaining issues requiring manual attention

Create the `.claude/visual-qa/` directory if it doesn't exist.

Present the report summary to the user when complete.

## Error Recovery

- **Figma MCP unavailable:** Ask user to verify Figma Desktop is running. Offer to proceed with manual screenshots.
- **Dev server won't start:** Check for port conflicts, missing dependencies. Run `pnpm install` if needed.
- **Tests won't pass after 3 attempts:** Mark component as needing manual intervention, continue with remaining components.
- **Build fails:** Check TypeScript errors first, then dependency issues. Report blockers to user.
- **Session interrupted:** On resume, check TodoWrite progress. Skip completed phases, resume from first incomplete item.

## Completion

When all phases complete, present:

1. The build report summary
2. Count of pages/components built and verified
3. Any items needing manual review
4. Next steps (e.g., "run `pnpm dev` to see the app")
