# Pipeline Enhancement Design — 2026-03-18

## Goal

Enhance the Figma-to-app pipeline with dark mode testing, Storybook generation, token sync, component docs, and automated hooks.

## Architecture

- 4 new scripts in `scripts/`
- 3 new hooks in `settings.json`
- 3 new config sections in `pipeline.config.json`
- 3 new pipeline sub-phases (0, 4.5, 5.5)
- Extended Phase 9 report

## Tech Stack

- Bash scripts (same patterns as existing)
- Node.js for `generate-component-docs.sh` (TypeScript AST)
- Chrome DevTools MCP `emulate` for dark mode
- Figma MCP `get_metadata` + `get_variable_defs` for token sync
- pixelmatch (existing) for dark mode visual diff

---

## Batch 1 — Foundation

### Task 1.1: Pipeline config additions

**Files:** `.claude/pipeline.config.json`

1. Add `darkMode` section:
   ```json
   "darkMode": {
     "enabled": true,
     "diffThreshold": 0.03,
     "emulateMediaFeature": "prefers-color-scheme: dark",
     "compareAgainst": "light"
   }
   ```
2. Add `storybook` section:
   ```json
   "storybook": {
     "autoGenerate": true,
     "includeResponsiveViewports": true,
     "viewports": ["mobile", "tablet", "desktop"],
     "skipPatterns": ["**/index.ts", "**/*.test.*"]
   }
   ```
3. Add `tokenSync` section:
   ```json
   "tokenSync": {
     "autoCheck": true,
     "warnOnDrift": true,
     "autoUpdate": false
   }
   ```

**Expected output:** Updated pipeline.config.json with 3 new top-level sections.

### Task 1.2: Hooks in settings.json

**Files:** `.claude/settings.json`

1. Add pre-commit token guard hook:
   - Matcher: `Bash`
   - Pattern: detect `git commit` in TOOL_INPUT
   - Action: run `./scripts/verify-tokens.sh` — if exit code 1, warn "Token violations found — fix before committing"

2. Add post-visual-diff dark mode reminder:
   - Matcher: `Bash`
   - Pattern: detect `visual-diff.js` in TOOL_INPUT and success in TOOL_OUTPUT
   - Action: remind "Run dark mode verification: ./scripts/check-dark-mode.sh"

3. Add post-test coverage enforcement:
   - Matcher: `Bash`
   - Pattern: detect `vitest` in TOOL_INPUT and coverage output
   - Action: parse coverage %, warn if below pipeline.config.json threshold

**Expected output:** settings.json with 3 new hooks under PostToolUse.

---

## Batch 2 — Scripts (parallelizable)

### Task 2.1: sync-tokens.sh

**Files:** `scripts/sync-tokens.sh`

1. Read `src/styles/design-tokens.lock.json` — extract figmaFileKey, extractedAt
2. Check if lockfile exists — if not, exit 0 with "no lockfile found"
3. Compare `extractedAt` against Figma file's `lastModified` (via MCP metadata call — script outputs instructions for Claude to call MCP, since bash can't call MCP directly)
4. Alternative approach: compare lockfile token values against current Tailwind config and source files for internal drift
5. With `--dry-run` (default): report drift as JSON to stdout
6. With `--update`: exit with code 2 signaling "re-run design-token-lock skill"
7. Output JSON: `{ "status": "no-drift" | "minor-drift" | "major-drift", "changes": [...] }`

**Steps:**
1. Write the script with `set -euo pipefail`
2. Implement lockfile parsing with python3 (consistent with verify-tokens.sh)
3. Implement internal drift detection (lockfile values vs source usage)
4. Add `--dry-run` and `--update` flags
5. Test with missing lockfile, matching lockfile, drifted lockfile

### Task 2.2: check-dark-mode.sh

**Files:** `scripts/check-dark-mode.sh`

1. Accept arguments: `<url> [--output-dir <dir>]`
2. Default output dir: `.claude/visual-qa/screenshots/dark/`
3. Read breakpoints from pipeline.config.json
4. For each breakpoint:
   - Output instructions for Chrome DevTools MCP: emulate dark mode, resize, screenshot
   - Save screenshot with naming convention: `dark-<page>-<breakpoint>.png`
5. Run `visual-diff.js --batch` comparing dark screenshots against light baselines
6. Use `darkMode.diffThreshold` from config (default 0.03)
7. Output summary: per-breakpoint pass/fail

**Steps:**
1. Write the script with `set -euo pipefail`
2. Parse pipeline.config.json for breakpoints and dark mode config
3. Implement screenshot capture orchestration (outputs commands for MCP)
4. Wire up visual-diff.js batch comparison
5. Format human-readable output with pass/fail per breakpoint

### Task 2.3: generate-stories.sh

**Files:** `scripts/generate-stories.sh`

1. Scan `src/components/**/*.tsx` for exported components
2. Skip files matching `storybook.skipPatterns` from config
3. Skip components that already have `.stories.tsx` files
4. For each component:
   - Extract component name and props interface
   - Generate `.stories.tsx` with:
     - Default story with no props
     - Story per significant prop variant (boolean toggles, enum values)
     - Responsive viewport decorators if `includeResponsiveViewports` is true
5. Run `pnpm build-storybook --quiet` as smoke test if Storybook is installed
6. Report: N stories generated, M skipped (already exist), K errors

**Steps:**
1. Write the script
2. Implement component discovery (find + grep for `export`)
3. Implement TypeScript prop extraction (use grep for interface patterns)
4. Write story template generator
5. Add Storybook smoke test
6. Handle missing Storybook gracefully (skip with warning)

### Task 2.4: generate-component-docs.sh

**Files:** `scripts/generate-component-docs.sh`

1. Scan `src/components/**/*.tsx` for exported components
2. For each component:
   - Extract props interface via `tsc --declaration` output or grep
   - Pull JSDoc comments if present
   - Check for corresponding `.stories.tsx` — link if exists
   - Check `design-tokens.lock.json` for token usage mapping
   - Write `docs/components/<ComponentName>.mdx`
3. Generate `docs/components/index.mdx` with table of all components
4. Table columns: Name, Props count, Has tests, Has stories, Tokens used

**Steps:**
1. Write the script
2. Implement component discovery (reuse pattern from generate-stories.sh)
3. Implement prop extraction
4. Implement MDX template generation
5. Generate index file with component table
6. Create `docs/components/` directory if needed

---

## Batch 3 — Pipeline Wiring

### Task 3.1: Update build-from-figma.md

**Files:** `.claude/commands/build-from-figma.md`

1. Add Phase 0 (Token Drift Check) before Phase 1:
   - Conditional: only runs if lockfile exists AND `tokenSync.autoCheck` is true
   - Runs `sync-tokens.sh --dry-run`
   - Three outcomes: no drift (skip Phase 2), minor drift (auto-update), major drift (ask user)
   - Add to TodoWrite checklist

2. Add Phase 4.5 (Storybook Generation) after Phase 4:
   - Conditional: only runs if `storybook.autoGenerate` is true in config
   - Runs `generate-stories.sh`
   - Non-blocking — continues even if Storybook isn't installed
   - Add to TodoWrite checklist

3. Add Phase 5.5 (Dark Mode Verification) after Phase 5:
   - Conditional: only runs if `darkMode.enabled` is true in config
   - Runs `check-dark-mode.sh` for each page at all breakpoints
   - Non-blocking — logs results but doesn't halt pipeline
   - Add to TodoWrite checklist

4. Extend Phase 9 (Report):
   - Call `generate-component-docs.sh`
   - Add "Component Documentation" section to build report
   - Add "Dark Mode Results" section to build report
   - Add "Storybook Status" section to build report

5. Update TodoWrite master checklist to include new phases

### Task 3.2: Update pipeline.config.json phase descriptions

**Files:** `.claude/pipeline.config.json`

Add a `phases` section documenting all phases (0 through 9) for self-documentation.

---

## Batch 4 — Documentation

### Task 4.1: Update CLAUDE.md

**Files:** `CLAUDE.md`

1. Add 4 new scripts to "Development Scripts" section
2. Add hooks description to "Claude Code Architecture" section
3. Update pipeline diagram to show phases 0, 4.5, 5.5
4. Update script count (13 → 17)

### Task 4.2: Update Figma pipeline docs

**Files:** `docs/figma-to-react/README.md`

1. Document Phase 0, 4.5, 5.5
2. Document token sync workflow
3. Document dark mode verification
4. Document Storybook generation
5. Document component docs generation

---

## Implementation Order

1. **Batch 1** (foundation) — config + hooks first, no script dependencies
2. **Batch 2** (scripts) — all 4 scripts in parallel, independent of each other
3. **Batch 3** (wiring) — update build-from-figma.md once scripts exist
4. **Batch 4** (docs) — update all documentation last
