# Scripts Reference

**Last Updated:** 2026-03-17

All scripts live in `scripts/` and are designed to run from the project root.

## Code Quality

### Lint & Format (`lint-and-format.sh`)
- **Purpose**: Run ESLint + Prettier across the project
- **Usage**: `./scripts/lint-and-format.sh` or `./scripts/lint-and-format.sh --check` (CI mode)

### Type Check (`check-types.sh`)
- **Purpose**: TypeScript type checking (tsc --noEmit)
- **Usage**: `./scripts/check-types.sh`

### Bundle Size (`check-bundle-size.sh`)
- **Purpose**: Analyze bundle size, warn on large chunks
- **Usage**: `./scripts/check-bundle-size.sh`
- **Config**: Set `BUNDLE_SIZE_LIMIT` env var (default: 250KB)

### Accessibility (`check-accessibility.sh`)
- **Purpose**: Run eslint-plugin-jsx-a11y checks
- **Usage**: `./scripts/check-accessibility.sh`

## Testing

### Run Tests (`run-tests.sh`)
- **Purpose**: Run Vitest with coverage report
- **Usage**: `./scripts/run-tests.sh` or `./scripts/run-tests.sh --watch`

### Cross-Browser Testing (`cross-browser-test.sh`)
- **Purpose**: Capture screenshots across browsers at standard breakpoints
- **Usage**: `./scripts/cross-browser-test.sh <browser> <url>`
- **Browsers**: chromium, firefox, webkit
- **Output**: Screenshots saved to `.claude/visual-qa/screenshots/<browser>/`

### Setup Playwright (`setup-playwright.sh`)
- **Purpose**: One-time setup for Playwright browser engines
- **Usage**: `./scripts/setup-playwright.sh`

## Pipeline Verification

### Verify Design Tokens (`verify-tokens.sh`)
- **Purpose**: Ensure no hardcoded color, font-size, or spacing values in components; all values must come from design tokens via Tailwind classes
- **Usage**: `./scripts/verify-tokens.sh`
- **Exit code**: 1 if hardcoded values found

### Verify Test Coverage (`verify-test-coverage.sh`)
- **Purpose**: Ensure every `.tsx` component has a corresponding `.test.tsx` file. Also checks that tests import their component, assert lockfile text content, use role-based queries, and contain describe/it blocks.
- **Usage**: `./scripts/verify-test-coverage.sh`
- **Checks**:
  1. Every component has a test file
  2. Test files import their component
  3. Tests assert text content from the design token lockfile
  4. RTL query quality (getByRole vs getByTestId ratio)
  5. Test files contain describe/it blocks
- **Exit code**: 1 if any violations found
- **Note**: Requires `python3` for lockfile JSON parsing

### Visual Diff (`visual-diff.js`)
- **Purpose**: Pixel-level screenshot comparison using `pixelmatch`. Produces diff images with magenta highlights and region-based analysis.
- **Dependencies**: `pixelmatch`, `pngjs` (install in your project: `pnpm add -D pixelmatch pngjs`)
- **Single comparison**:
  ```bash
  node scripts/visual-diff.js actual.png expected.png --threshold 0.02 --json
  ```
- **Batch comparison** (compares matching filenames across two directories):
  ```bash
  node scripts/visual-diff.js --batch actual-dir/ expected-dir/ --output-dir diffs/ --json
  ```
- **Options**:
  - `--threshold <n>` -- Mismatch percentage to consider a pass (default: 0.02 = 2%)
  - `--output <path>` -- Save diff image (single mode)
  - `--output-dir <path>` -- Save diff images (batch mode)
  - `--json` -- Output results as JSON
  - `--region-grid <n>` -- Grid size for region analysis (default: 4, meaning 4x4)
  - `--antialiasing` -- Enable anti-aliasing detection
- **Exit codes**: 0 = pass, 1 = fail (above threshold), 2 = error
- **Config**: Reads defaults from `.claude/pipeline.config.json`

## Project Setup

### Setup Project (`setup-project.sh`)
- **Purpose**: Initialize a new React project with standard tooling from `templates/`
- **Usage**: `./scripts/setup-project.sh my-app --next` or `--vite`
- **What it does**: Copies template configs, installs dependencies, sets up testing

## Agent-Specific Scripts

Each agent has supporting scripts in `scripts/<agent-name>/`:

| Agent | Scripts | Purpose |
|-------|---------|---------|
| frontend-developer | lint-and-format.sh, check-build.sh, build-report.sh | Code quality and build validation |
| performance-benchmarker | check-tools.sh, save-benchmarks.sh, compare-results.sh | Performance profiling |
| test-writer-fixer | validate-test-command.sh, save-coverage.sh, commit-coverage.sh | Test execution and coverage |
| api-tester | check-endpoints.sh, save-results.sh, generate-summary.sh | API testing |
| docusaurus-expert | validate-markdown.sh, check-build.sh, preview-link.sh | Documentation |
| analytics-reporter | check-data-sources.sh, format-report.sh, archive-report.sh | Analytics |
| test-results-analyzer | create-run-dir.sh, validate-report.sh, archive-and-trend.sh | Test analysis |
