# Pipeline Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dark mode testing, Storybook generation, token sync, component docs, and automated hooks to the Figma-to-app pipeline.

**Architecture:** 4 new bash/Node scripts, 3 new PostToolUse hooks in settings.json, 3 new config sections in pipeline.config.json, updated build-from-figma command with phases 0/4.5/5.5, and updated documentation.

**Tech Stack:** Bash scripts, Node.js (pixelmatch, pngjs, TypeScript compiler), Chrome DevTools MCP emulation, Figma MCP metadata API.

---

## Batch 1 — Foundation

### Task 1: Add darkMode config section to pipeline.config.json

**Files:**
- Modify: `.claude/pipeline.config.json:108-118` (insert before `reporting` section)

**Step 1: Add the darkMode section**

Insert after line 108 (`},` closing `screenshotCapture`) and before line 110 (`"reporting"`):

```json
  "darkMode": {
    "enabled": true,
    "diffThreshold": 0.03,
    "emulateMediaFeature": "prefers-color-scheme: dark",
    "compareAgainst": "light",
    "screenshotDir": ".claude/visual-qa/screenshots/dark"
  },

  "storybook": {
    "autoGenerate": true,
    "includeResponsiveViewports": true,
    "viewports": ["mobile", "tablet", "desktop"],
    "skipPatterns": ["**/index.ts", "**/*.test.*", "**/*.stories.*"]
  },

  "tokenSync": {
    "autoCheck": true,
    "warnOnDrift": true,
    "autoUpdate": false
  },
```

**Step 2: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('.claude/pipeline.config.json'))"`
Expected: No output (valid JSON)

**Step 3: Commit**

```bash
git add .claude/pipeline.config.json
git commit -m "feat: add darkMode, storybook, tokenSync config sections to pipeline"
```

---

### Task 2: Add hooks to settings.json

**Files:**
- Modify: `.claude/settings.json:3-15` (extend PostToolUse hooks array)

**Step 1: Add three new hooks**

The existing `hooks.PostToolUse` array has one entry (the build QA reminder). Add three more entries to the array after the existing one:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"pnpm build\" && echo \"$TOOL_OUTPUT\" | grep -q \"built in\"; then echo \"[post-build-qa] Build succeeded. Run quality gate: pnpm vitest run && pnpm tsc --noEmit && ./scripts/verify-tokens.sh\"; fi'",
            "description": "Remind to run quality gate after successful builds during the pipeline"
          },
          {
            "type": "command",
            "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"git commit\"; then if [ -f src/styles/design-tokens.lock.json ] && [ -d src ]; then RESULT=$(./scripts/verify-tokens.sh 2>&1); EXIT=$?; if [ $EXIT -ne 0 ]; then echo \"[pre-commit-guard] Token violations found. Fix before committing:\"; echo \"$RESULT\" | tail -5; fi; fi; fi'",
            "description": "Check for token violations before git commits"
          },
          {
            "type": "command",
            "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"visual-diff.js\" && echo \"$TOOL_OUTPUT\" | grep -q \"PASS\"; then DARK_ENABLED=$(python3 -c \"import json; print(json.load(open('.claude/pipeline.config.json')).get('darkMode',{}).get('enabled',False))\" 2>/dev/null); if [ \"$DARK_ENABLED\" = \"True\" ]; then echo \"[dark-mode-reminder] Visual diff passed. Run dark mode verification: ./scripts/check-dark-mode.sh\"; fi; fi'",
            "description": "Remind to run dark mode verification after visual diff passes"
          },
          {
            "type": "command",
            "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"vitest\" && echo \"$TOOL_OUTPUT\" | grep -qE \"Coverage|coverage\"; then THRESHOLD=$(python3 -c \"import json; print(json.load(open('.claude/pipeline.config.json')).get('tdd',{}).get('coverageThreshold',80))\" 2>/dev/null || echo 80); COV=$(echo \"$TOOL_OUTPUT\" | grep -oE \"[0-9]+\\.?[0-9]*%\" | head -1 | tr -d \"%\"); if [ -n \"$COV\" ]; then BELOW=$(python3 -c \"print('yes' if float('$COV') < float('$THRESHOLD') else 'no')\" 2>/dev/null); if [ \"$BELOW\" = \"yes\" ]; then echo \"[coverage-warn] Coverage ${COV}% is below threshold ${THRESHOLD}%. Improve coverage before quality gate.\"; fi; fi; fi'",
            "description": "Warn when test coverage drops below pipeline threshold"
          }
        ]
      }
    ]
  }
}
```

**Step 2: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('.claude/settings.json'))"`
Expected: No output (valid JSON)

**Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: add pre-commit token guard, dark mode reminder, and coverage hooks"
```

---

## Batch 2 — Scripts (parallelizable)

### Task 3: Create sync-tokens.sh

**Files:**
- Create: `scripts/sync-tokens.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
# sync-tokens.sh — Detect internal token drift between lockfile and source
# Checks if design-tokens.lock.json values are still reflected in Tailwind config and source files
#
# Usage:
#   ./scripts/sync-tokens.sh [--dry-run] [--update] [--json]
#
# Exit codes:
#   0 = no drift
#   1 = drift detected
#   2 = lockfile not found (nothing to check)
set -euo pipefail

MODE="dry-run"
JSON_OUTPUT=false

for arg in "$@"; do
  case "$arg" in
    --update) MODE="update" ;;
    --dry-run) MODE="dry-run" ;;
    --json) JSON_OUTPUT=true ;;
  esac
done

# Find lockfile
LOCKFILE=""
for candidate in "src/styles/design-tokens.lock.json" "design-tokens.lock.json"; do
  if [[ -f "$candidate" ]]; then
    LOCKFILE="$candidate"
    break
  fi
done

if [[ -z "$LOCKFILE" ]]; then
  if $JSON_OUTPUT; then
    echo '{"status": "no-lockfile", "message": "No design-tokens.lock.json found"}'
  else
    echo "=== Token Sync ==="
    echo "No design-tokens.lock.json found — nothing to check"
  fi
  exit 2
fi

echo "=== Token Sync ===" >&2
echo "Lockfile: $LOCKFILE" >&2
echo "" >&2

# Extract token data from lockfile using python3
DRIFT_REPORT=$(python3 -c "
import json, os, re, sys

with open('$LOCKFILE') as f:
    lockfile = json.load(f)

drift = []

# Check 1: Colors in lockfile vs tailwind.config.ts
colors = lockfile.get('colors', {})
tailwind_path = 'tailwind.config.ts'
if not os.path.exists(tailwind_path):
    tailwind_path = 'tailwind.config.js'

if os.path.exists(tailwind_path):
    with open(tailwind_path) as f:
        tw_content = f.read()
    for name, value in colors.items():
        if isinstance(value, str) and value not in tw_content:
            drift.append({
                'type': 'color-missing-from-tailwind',
                'token': name,
                'value': value,
                'file': tailwind_path
            })

# Check 2: Typography tokens
typography = lockfile.get('typography', {})
for name, spec in typography.items():
    if isinstance(spec, dict):
        for prop, val in spec.items():
            if isinstance(val, str) and val.endswith('px'):
                pass  # Typography values checked via CSS

# Check 3: Spacing tokens
spacing = lockfile.get('spacing', {})
if os.path.exists(tailwind_path):
    with open(tailwind_path) as f:
        tw_content = f.read()
    for name, value in spacing.items():
        if isinstance(value, (str, int, float)):
            val_str = str(value)
            if val_str not in tw_content:
                drift.append({
                    'type': 'spacing-missing-from-tailwind',
                    'token': name,
                    'value': val_str,
                    'file': tailwind_path
                })

# Check 4: CSS custom properties in tokens.css
tokens_css = 'src/styles/tokens.css'
if os.path.exists(tokens_css):
    with open(tokens_css) as f:
        css_content = f.read()
    for name, value in colors.items():
        css_var = '--color-' + name.replace('.', '-').replace(' ', '-').lower()
        if css_var not in css_content and isinstance(value, str):
            drift.append({
                'type': 'color-missing-from-css',
                'token': name,
                'value': value,
                'file': tokens_css
            })

# Classify severity
if len(drift) == 0:
    result = {'status': 'no-drift', 'changes': []}
elif len(drift) <= 3:
    result = {'status': 'minor-drift', 'changes': drift}
else:
    result = {'status': 'major-drift', 'changes': drift}

print(json.dumps(result, indent=2))
" 2>/dev/null)

if $JSON_OUTPUT; then
  echo "$DRIFT_REPORT"
else
  STATUS=$(echo "$DRIFT_REPORT" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
  CHANGE_COUNT=$(echo "$DRIFT_REPORT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['changes']))")

  echo "▸ Comparing lockfile tokens against Tailwind config and CSS..."
  echo ""

  if [[ "$STATUS" == "no-drift" ]]; then
    echo "  ✓ No token drift detected — lockfile and source are in sync"
    exit 0
  fi

  echo "  ✗ $CHANGE_COUNT token drift(s) detected:"
  echo ""
  echo "$DRIFT_REPORT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data['changes']:
    print(f\"    {c['type']}: {c['token']} = {c['value']} (in {c['file']})\")
"
  echo ""

  if [[ "$STATUS" == "minor-drift" ]]; then
    echo "  Status: MINOR DRIFT — consider running design-token-lock skill to re-sync"
  else
    echo "  Status: MAJOR DRIFT — recommend full re-extraction from Figma"
  fi

  if [[ "$MODE" == "update" ]]; then
    echo ""
    echo "  --update flag set: Re-run the design-token-lock skill to regenerate lockfile"
    exit 1
  fi
fi

# Exit code based on drift status
STATUS_CHECK=$(echo "$DRIFT_REPORT" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
if [[ "$STATUS_CHECK" == "no-drift" ]]; then
  exit 0
else
  exit 1
fi
```

**Step 2: Make executable**

Run: `chmod +x scripts/sync-tokens.sh`

**Step 3: Verify script runs without lockfile**

Run: `./scripts/sync-tokens.sh`
Expected: "No design-tokens.lock.json found" with exit code 2

**Step 4: Commit**

```bash
git add scripts/sync-tokens.sh
git commit -m "feat: add sync-tokens.sh for detecting token drift between lockfile and source"
```

---

### Task 4: Create check-dark-mode.sh

**Files:**
- Create: `scripts/check-dark-mode.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
# check-dark-mode.sh — Capture dark mode screenshots and compare against light mode baselines
#
# Usage:
#   ./scripts/check-dark-mode.sh <url> [--output-dir <dir>]
#
# This script generates a Playwright script that:
# 1. Navigates to each page with prefers-color-scheme: dark emulation
# 2. Captures screenshots at all breakpoints from pipeline.config.json
# 3. Runs visual-diff.js to compare dark vs light screenshots
#
# Prerequisites:
#   - Light mode screenshots already captured in .claude/visual-qa/screenshots/chromium/
#   - Playwright browsers installed (./scripts/setup-playwright.sh)
#   - Dev server running at the specified URL
#
# Exit codes:
#   0 = dark mode screenshots captured and compared (or dark mode disabled)
#   1 = differences found above threshold
#   2 = error (missing prerequisites)
set -euo pipefail

URL="${1:-http://localhost:3000}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$PROJECT_ROOT/.claude/pipeline.config.json"

# Check if dark mode testing is enabled
DARK_ENABLED=$(python3 -c "
import json
with open('$CONFIG') as f:
    config = json.load(f)
print(config.get('darkMode', {}).get('enabled', False))
" 2>/dev/null || echo "False")

if [[ "$DARK_ENABLED" != "True" ]]; then
  echo "=== Dark Mode Verification ==="
  echo "Dark mode testing is disabled in pipeline.config.json"
  echo "Set darkMode.enabled = true to enable"
  exit 0
fi

# Read config values
read -r THRESHOLD OUTPUT_DIR BREAKPOINTS_JSON <<< $(python3 -c "
import json
with open('$CONFIG') as f:
    config = json.load(f)
dm = config.get('darkMode', {})
vd = config.get('visualDiff', {})
bp = vd.get('breakpoints', {'mobile': 375, 'tablet': 768, 'desktop': 1440})
threshold = dm.get('diffThreshold', 0.03)
output_dir = dm.get('screenshotDir', '.claude/visual-qa/screenshots/dark')
import json as j
print(threshold, output_dir, j.dumps(bp))
")

LIGHT_DIR="$PROJECT_ROOT/.claude/visual-qa/screenshots/chromium"
DARK_DIR="$PROJECT_ROOT/$OUTPUT_DIR"
DIFF_DIR="$PROJECT_ROOT/.claude/visual-qa/diffs/dark-vs-light"

# Verify light mode screenshots exist
if [[ ! -d "$LIGHT_DIR" ]] || [[ -z "$(ls -A "$LIGHT_DIR" 2>/dev/null)" ]]; then
  echo "=== Dark Mode Verification ==="
  echo "Error: No light mode screenshots found in $LIGHT_DIR"
  echo "Run visual QA (Phase 5) first to capture light mode baselines"
  exit 2
fi

mkdir -p "$DARK_DIR" "$DIFF_DIR"

echo "=== Dark Mode Verification ==="
echo "URL: $URL"
echo "Light baselines: $LIGHT_DIR"
echo "Dark output: $DARK_DIR"
echo "Threshold: $THRESHOLD"
echo ""

# Generate Playwright script for dark mode capture
SCRIPT_FILE=$(mktemp /tmp/dark-mode-capture-XXXXXX.mjs)

cat > "$SCRIPT_FILE" << SCRIPT
import { chromium } from 'playwright';
import { readdirSync } from 'fs';

const url = '$URL';
const outputDir = '$DARK_DIR';
const breakpoints = $BREAKPOINTS_JSON;

const breakpointNames = {};
for (const [name, width] of Object.entries(breakpoints)) {
  breakpointNames[width] = name;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const [name, width] of Object.entries(breakpoints)) {
    const context = await browser.newContext({
      viewport: { width: Number(width), height: 900 },
      colorScheme: 'dark'
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // Wait for dark mode CSS to apply
      await page.waitForTimeout(500);
      const filename = outputDir + '/' + name + '_' + width + 'px.png';
      await page.screenshot({ path: filename, fullPage: true });
      console.log('  Captured dark mode: ' + name + ' (' + width + 'px)');
    } catch (err) {
      console.error('  Failed: ' + name + ' (' + width + 'px) - ' + err.message);
    }

    await context.close();
  }

  await browser.close();
  console.log('');
  console.log('Dark mode screenshots saved to: ' + outputDir);
})();
SCRIPT

# Run dark mode capture
echo "▸ Capturing dark mode screenshots..."
node "$SCRIPT_FILE"
EXIT_CODE=$?
rm -f "$SCRIPT_FILE"

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "Error capturing dark mode screenshots"
  exit 2
fi

echo ""
echo "▸ Comparing dark mode against light mode baselines..."
echo ""

# Run visual diff
node "$PROJECT_ROOT/scripts/visual-diff.js" --batch \
  "$DARK_DIR" \
  "$LIGHT_DIR" \
  --output-dir "$DIFF_DIR" \
  --threshold "$THRESHOLD"

DIFF_EXIT=$?

echo ""
if [[ $DIFF_EXIT -eq 0 ]]; then
  echo "=== Summary ==="
  echo "✓ Dark mode screenshots are within tolerance of light mode baselines"
  echo "  (This means dark mode changes are minimal — verify this is intentional)"
else
  echo "=== Summary ==="
  echo "✗ Dark mode differences detected above threshold"
  echo "  Diff images saved to: $DIFF_DIR"
  echo "  Review diffs to confirm dark mode styling is correct"
fi

exit $DIFF_EXIT
```

**Step 2: Make executable**

Run: `chmod +x scripts/check-dark-mode.sh`

**Step 3: Commit**

```bash
git add scripts/check-dark-mode.sh
git commit -m "feat: add check-dark-mode.sh for dark mode visual verification"
```

---

### Task 5: Create generate-stories.sh

**Files:**
- Create: `scripts/generate-stories.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
# generate-stories.sh — Auto-generate Storybook stories for React components
#
# Usage:
#   ./scripts/generate-stories.sh [--force] [--dry-run]
#
# Scans src/components/ for exported React components and generates
# .stories.tsx files with default, prop variant, and responsive stories.
# Skips components that already have stories unless --force is used.
#
# Exit codes:
#   0 = stories generated (or nothing to generate)
#   1 = errors during generation
#   2 = no components found
set -euo pipefail

FORCE=false
DRY_RUN=false
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$PROJECT_ROOT/.claude/pipeline.config.json"
SRC_DIR="src/components"
GENERATED=0
SKIPPED=0
ERRORS=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

echo "=== Storybook Story Generator ==="
echo ""

# Check if Storybook is installed
if ! grep -q '"storybook"' package.json 2>/dev/null && ! grep -q '"@storybook' package.json 2>/dev/null; then
  echo "Warning: Storybook not detected in package.json"
  echo "Install with: pnpm add -D storybook @storybook/react @storybook/react-vite"
  echo "Generating stories anyway (install Storybook to use them)"
  echo ""
fi

# Check if components directory exists
if [[ ! -d "$SRC_DIR" ]]; then
  echo "No components directory found at $SRC_DIR"
  exit 2
fi

# Read skip patterns from config
SKIP_PATTERNS=$(python3 -c "
import json
try:
    with open('$CONFIG') as f:
        config = json.load(f)
    patterns = config.get('storybook', {}).get('skipPatterns', [])
    print(' '.join(patterns))
except Exception:
    print('**/*.test.* **/*.stories.* **/index.ts')
" 2>/dev/null)

# Read viewport config
VIEWPORTS=$(python3 -c "
import json
try:
    with open('$CONFIG') as f:
        config = json.load(f)
    sb = config.get('storybook', {})
    vd = config.get('visualDiff', {}).get('breakpoints', {})
    viewports = sb.get('viewports', ['mobile', 'tablet', 'desktop'])
    include_responsive = sb.get('includeResponsiveViewports', True)
    if include_responsive:
        for vp in viewports:
            width = vd.get(vp, 375)
            print(f'{vp}:{width}')
except Exception:
    print('mobile:375')
    print('tablet:768')
    print('desktop:1440')
" 2>/dev/null)

echo "▸ Scanning $SRC_DIR for components..."
echo ""

# Find all .tsx files that export components (not test files, not stories, not index)
find "$SRC_DIR" -name "*.tsx" -type f | while read -r filepath; do
  filename=$(basename "$filepath")

  # Skip test files, stories, and index files
  if [[ "$filename" == *.test.* ]] || [[ "$filename" == *.stories.* ]] || [[ "$filename" == "index.ts" ]] || [[ "$filename" == "index.tsx" ]]; then
    continue
  fi

  # Check for exported component (function or const)
  if ! grep -qE 'export (default |)(function|const) [A-Z]' "$filepath" 2>/dev/null; then
    continue
  fi

  # Extract component name
  COMPONENT_NAME=$(grep -oE 'export (default |)(function|const) ([A-Z][a-zA-Z0-9]+)' "$filepath" | head -1 | grep -oE '[A-Z][a-zA-Z0-9]+$')

  if [[ -z "$COMPONENT_NAME" ]]; then
    continue
  fi

  # Check if story already exists
  STORY_FILE="${filepath%.tsx}.stories.tsx"
  if [[ -f "$STORY_FILE" ]] && ! $FORCE; then
    SKIPPED=$((SKIPPED + 1))
    echo "  ⊘ Skipped: $COMPONENT_NAME (story exists)"
    continue
  fi

  # Extract relative import path
  COMPONENT_DIR=$(dirname "$filepath")
  REL_PATH="./$filename"
  REL_PATH="${REL_PATH%.tsx}"

  # Extract props interface name
  PROPS_INTERFACE=$(grep -oE 'interface ([A-Z][a-zA-Z0-9]*Props)' "$filepath" | head -1 | awk '{print $2}' || true)

  if $DRY_RUN; then
    echo "  Would generate: $STORY_FILE"
    GENERATED=$((GENERATED + 1))
    continue
  fi

  # Generate story file
  cat > "$STORY_FILE" << STORY
import type { Meta, StoryObj } from '@storybook/react';
import { $COMPONENT_NAME } from '${REL_PATH}';

const meta: Meta<typeof $COMPONENT_NAME> = {
  title: 'Components/$COMPONENT_NAME',
  component: $COMPONENT_NAME,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof $COMPONENT_NAME>;

export const Default: Story = {};
STORY

  # Add responsive viewport stories
  while IFS=: read -r vp_name vp_width; do
    if [[ -n "$vp_name" ]]; then
      VP_UPPER=$(echo "$vp_name" | sed 's/^./\U&/')
      cat >> "$STORY_FILE" << VIEWPORT

export const ${VP_UPPER}: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'custom',
    },
    chromatic: { viewports: [$vp_width] },
  },
  decorators: [
    (Story) => (
      <div style={{ width: '${vp_width}px' }}>
        <Story />
      </div>
    ),
  ],
};
VIEWPORT
    fi
  done <<< "$VIEWPORTS"

  GENERATED=$((GENERATED + 1))
  echo "  ✓ Generated: $COMPONENT_NAME → $(basename "$STORY_FILE")"
done

echo ""
echo "=== Summary ==="
echo "Generated: $GENERATED story file(s)"
echo "Skipped: $SKIPPED (already exist)"
if [[ $ERRORS -gt 0 ]]; then
  echo "Errors: $ERRORS"
  exit 1
fi

# Smoke test if Storybook is installed and stories were generated
if [[ $GENERATED -gt 0 ]] && ! $DRY_RUN && grep -q '"build-storybook"' package.json 2>/dev/null; then
  echo ""
  echo "▸ Running Storybook smoke test..."
  if pnpm build-storybook --quiet 2>/dev/null; then
    echo "  ✓ Storybook builds successfully with new stories"
  else
    echo "  ✗ Storybook build failed — check generated stories for errors"
    exit 1
  fi
fi
```

**Step 2: Make executable**

Run: `chmod +x scripts/generate-stories.sh`

**Step 3: Commit**

```bash
git add scripts/generate-stories.sh
git commit -m "feat: add generate-stories.sh for auto-generating Storybook stories"
```

---

### Task 6: Create generate-component-docs.sh

**Files:**
- Create: `scripts/generate-component-docs.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
# generate-component-docs.sh — Generate MDX documentation for React components
#
# Usage:
#   ./scripts/generate-component-docs.sh [--output-dir <dir>]
#
# Scans src/components/ for exported React components and generates
# MDX documentation files with props tables, token usage, and links
# to stories and tests.
#
# Exit codes:
#   0 = docs generated
#   1 = errors
#   2 = no components found
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="src/components"
OUTPUT_DIR="${1:-docs/components}"
LOCKFILE=""
GENERATED=0

# Parse --output-dir flag
for i in "$@"; do
  case "$i" in
    --output-dir) shift; OUTPUT_DIR="$1"; shift ;;
  esac
done

echo "=== Component Documentation Generator ==="
echo ""

if [[ ! -d "$SRC_DIR" ]]; then
  echo "No components directory found at $SRC_DIR"
  exit 2
fi

# Find lockfile for token mapping
for candidate in "src/styles/design-tokens.lock.json" "design-tokens.lock.json"; do
  if [[ -f "$candidate" ]]; then
    LOCKFILE="$candidate"
    break
  fi
done

mkdir -p "$OUTPUT_DIR"

# Collect component info for index
INDEX_ENTRIES=""

echo "▸ Scanning $SRC_DIR for components..."
echo ""

find "$SRC_DIR" -name "*.tsx" -type f | sort | while read -r filepath; do
  filename=$(basename "$filepath")

  # Skip non-component files
  if [[ "$filename" == *.test.* ]] || [[ "$filename" == *.stories.* ]] || [[ "$filename" == "index.ts" ]] || [[ "$filename" == "index.tsx" ]]; then
    continue
  fi

  # Check for exported component
  if ! grep -qE 'export (default |)(function|const) [A-Z]' "$filepath" 2>/dev/null; then
    continue
  fi

  COMPONENT_NAME=$(grep -oE 'export (default |)(function|const) ([A-Z][a-zA-Z0-9]+)' "$filepath" | head -1 | grep -oE '[A-Z][a-zA-Z0-9]+$')

  if [[ -z "$COMPONENT_NAME" ]]; then
    continue
  fi

  # Check for related files
  HAS_TEST="No"
  HAS_STORIES="No"
  TEST_FILE="${filepath%.tsx}.test.tsx"
  STORY_FILE="${filepath%.tsx}.stories.tsx"
  [[ -f "$TEST_FILE" ]] && HAS_TEST="Yes"
  [[ -f "$STORY_FILE" ]] && HAS_STORIES="Yes"

  # Extract props interface
  PROPS_BLOCK=$(python3 -c "
import re, sys

with open('$filepath') as f:
    content = f.read()

# Find props interface
pattern = r'(interface\s+\w*Props\w*\s*\{[^}]*\})'
match = re.search(pattern, content, re.DOTALL)
if match:
    block = match.group(1)
    # Parse individual props
    lines = block.split('\n')
    print(lines[0])  # interface line
    for line in lines[1:]:
        line = line.strip()
        if line and line != '}':
            print('  ' + line)
    print('}')
else:
    # Try type alias
    pattern = r'(type\s+\w*Props\w*\s*=\s*\{[^}]*\})'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        print(match.group(1))
    else:
        print('No props interface found')
" 2>/dev/null || echo "No props interface found")

  # Extract JSDoc comment above component
  JSDOC=$(python3 -c "
import re
with open('$filepath') as f:
    content = f.read()
pattern = r'/\*\*\s*(.*?)\s*\*/\s*export'
match = re.search(pattern, content, re.DOTALL)
if match:
    doc = match.group(1).strip()
    # Clean up JSDoc formatting
    lines = [l.strip().lstrip('* ').strip() for l in doc.split('\n')]
    print(' '.join(l for l in lines if l and not l.startswith('@')))
else:
    print('')
" 2>/dev/null || echo "")

  # Generate MDX file
  DOC_FILE="$OUTPUT_DIR/${COMPONENT_NAME}.mdx"

  cat > "$DOC_FILE" << DOC
# $COMPONENT_NAME

${JSDOC:-*No description available.*}

**Source:** \`$filepath\`

| Status | |
|--------|--|
| Tests | $HAS_TEST |
| Stories | $HAS_STORIES |

## Props

\`\`\`typescript
$PROPS_BLOCK
\`\`\`
DOC

  # Add token usage section if lockfile exists
  if [[ -n "$LOCKFILE" ]]; then
    # Find which tokens this component uses
    TOKENS_USED=$(python3 -c "
import json, re

with open('$LOCKFILE') as f:
    lockfile = json.load(f)

with open('$filepath') as f:
    source = f.read()

tokens_found = []
colors = lockfile.get('colors', {})
for name in colors:
    # Check for Tailwind class usage like bg-primary, text-secondary
    clean_name = name.replace('.', '-').replace(' ', '-').lower()
    if clean_name in source:
        tokens_found.append(f'color: {name} = {colors[name]}')

spacing = lockfile.get('spacing', {})
for name in spacing:
    clean_name = name.replace('.', '-').replace(' ', '-').lower()
    if clean_name in source:
        tokens_found.append(f'spacing: {name} = {spacing[name]}')

for t in tokens_found[:10]:
    print(t)
" 2>/dev/null || true)

    if [[ -n "$TOKENS_USED" ]]; then
      cat >> "$DOC_FILE" << TOKENS

## Design Tokens Used

| Type | Token | Value |
|------|-------|-------|
TOKENS
      while IFS= read -r token_line; do
        TYPE=$(echo "$token_line" | cut -d: -f1)
        REST=$(echo "$token_line" | cut -d: -f2-)
        NAME=$(echo "$REST" | cut -d= -f1 | xargs)
        VALUE=$(echo "$REST" | cut -d= -f2 | xargs)
        echo "| $TYPE | \`$NAME\` | \`$VALUE\` |" >> "$DOC_FILE"
      done <<< "$TOKENS_USED"
    fi
  fi

  # Add links section
  cat >> "$DOC_FILE" << LINKS

## Related Files

- Source: [\`$filepath\`](../../$filepath)
LINKS

  [[ "$HAS_TEST" == "Yes" ]] && echo "- Tests: [\`$TEST_FILE\`](../../$TEST_FILE)" >> "$DOC_FILE"
  [[ "$HAS_STORIES" == "Yes" ]] && echo "- Stories: [\`$STORY_FILE\`](../../$STORY_FILE)" >> "$DOC_FILE"

  GENERATED=$((GENERATED + 1))
  echo "  ✓ $COMPONENT_NAME → $DOC_FILE"
done

# Generate index
echo ""
echo "▸ Generating component index..."

cat > "$OUTPUT_DIR/index.mdx" << INDEX
# Component Documentation

Auto-generated documentation for all React components.

| Component | Tests | Stories | Source |
|-----------|-------|---------|--------|
INDEX

find "$SRC_DIR" -name "*.tsx" -type f | sort | while read -r filepath; do
  filename=$(basename "$filepath")
  [[ "$filename" == *.test.* ]] || [[ "$filename" == *.stories.* ]] || [[ "$filename" == "index.ts" ]] || [[ "$filename" == "index.tsx" ]] && continue

  COMPONENT_NAME=$(grep -oE 'export (default |)(function|const) ([A-Z][a-zA-Z0-9]+)' "$filepath" 2>/dev/null | head -1 | grep -oE '[A-Z][a-zA-Z0-9]+$' || true)
  [[ -z "$COMPONENT_NAME" ]] && continue

  HAS_TEST="--"
  HAS_STORIES="--"
  [[ -f "${filepath%.tsx}.test.tsx" ]] && HAS_TEST="Yes"
  [[ -f "${filepath%.tsx}.stories.tsx" ]] && HAS_STORIES="Yes"

  echo "| [$COMPONENT_NAME](./${COMPONENT_NAME}.mdx) | $HAS_TEST | $HAS_STORIES | \`$filepath\` |" >> "$OUTPUT_DIR/index.mdx"
done

echo ""
echo "=== Summary ==="
echo "Generated: $GENERATED component doc(s)"
echo "Index: $OUTPUT_DIR/index.mdx"
echo "Output: $OUTPUT_DIR/"
```

**Step 2: Make executable**

Run: `chmod +x scripts/generate-component-docs.sh`

**Step 3: Commit**

```bash
git add scripts/generate-component-docs.sh
git commit -m "feat: add generate-component-docs.sh for MDX component documentation"
```

---

## Batch 3 — Pipeline Wiring

### Task 7: Update build-from-figma.md with new phases

**Files:**
- Modify: `.claude/commands/build-from-figma.md`

**Step 1: Add Phase 0 to TodoWrite checklist (after line 37)**

Add before the existing Phase 1 line:

```
[ ] Phase 0: Token Sync — sync-tokens.sh → check for drift (if lockfile exists)
```

**Step 2: Add Phase 0 section (after line 51, before "## Phase 1: Intake")**

```markdown
## Phase 0: Token Drift Check (Conditional)

Only runs when `tokenSync.autoCheck` is `true` in `pipeline.config.json` AND a lockfile already exists at `src/styles/design-tokens.lock.json`.

```bash
./scripts/sync-tokens.sh --json
```

Parse the JSON output:
- `"status": "no-drift"` → Skip Phase 2, proceed to Phase 1
- `"status": "minor-drift"` → Log drift details, proceed to Phase 2 to re-extract
- `"status": "major-drift"` → Pause and ask user: "Significant token changes detected. Re-run full intake (Phase 1) or just update tokens (Phase 2)?"

If lockfile does not exist, skip this phase entirely.
```

**Step 3: Add Phase 4.5 to TodoWrite checklist (after Phase 4 line)**

```
[ ] Phase 4.5: Storybook — generate-stories.sh → auto-generated stories
```

**Step 4: Add Phase 4.5 section (after Phase 4 section, before Phase 5)**

```markdown
## Phase 4.5: Storybook Generation (Non-Blocking)

Only runs when `storybook.autoGenerate` is `true` in `pipeline.config.json`.

```bash
./scripts/generate-stories.sh
```

This phase:
1. Scans all components generated in Phase 4
2. Generates `.stories.tsx` files with default and responsive viewport stories
3. Runs `pnpm build-storybook --quiet` as a smoke test (if Storybook is installed)
4. Skips components that already have story files

Non-blocking: if Storybook is not installed or generation fails, log a warning and continue.
```

**Step 5: Add Phase 5.5 to TodoWrite checklist (after Phase 5 line)**

```
[ ] Phase 5.5: Dark Mode — check-dark-mode.sh → dark mode visual verification
```

**Step 6: Add Phase 5.5 section (after Phase 5 section, before Phase 6)**

```markdown
## Phase 5.5: Dark Mode Verification (Non-Blocking)

Only runs when `darkMode.enabled` is `true` in `pipeline.config.json`.

**Prerequisites:** Phase 5 complete (light mode screenshots exist in `.claude/visual-qa/screenshots/chromium/`).

```bash
./scripts/check-dark-mode.sh http://localhost:3000
```

This phase:
1. Captures dark mode screenshots at all breakpoints using Playwright's `colorScheme: 'dark'`
2. Compares against light mode baselines using `visual-diff.js`
3. Uses `darkMode.diffThreshold` (default 0.03, more lenient than light mode)
4. Saves diff images to `.claude/visual-qa/diffs/dark-vs-light/`

Non-blocking: results are logged in the build report but do not halt the pipeline. Dark mode differences are expected — the goal is to catch missing dark mode styles (invisible text, missing backgrounds).

If no dark mode styles exist in the app (all screenshots match light mode), note this in the report as "No dark mode styles detected."
```

**Step 7: Extend Phase 9 report section (after line 235)**

Add to the build report contents list:

```markdown
- Dark mode verification results (if enabled)
- Storybook generation status (stories generated, skipped)
- Component documentation links (generated by `generate-component-docs.sh`)
```

Add after the report writing instructions:

```markdown
After writing the build report, generate component documentation:

```bash
./scripts/generate-component-docs.sh
```

This creates MDX files in `docs/components/` with props tables, token mappings, and links to tests and stories.
```

**Step 8: Commit**

```bash
git add .claude/commands/build-from-figma.md
git commit -m "feat: add phases 0, 4.5, 5.5 to build-from-figma pipeline"
```

---

## Batch 4 — Documentation

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add new scripts to Development Scripts section (after line 70)**

Add before the closing ` ``` `:

```bash
# Dark mode visual verification
./scripts/check-dark-mode.sh http://localhost:3000

# Storybook story generation
./scripts/generate-stories.sh

# Token drift detection
./scripts/sync-tokens.sh [--dry-run] [--json]

# Component documentation generation
./scripts/generate-component-docs.sh
```

**Step 2: Update pipeline diagram (lines 180-192)**

Replace the pipeline diagram with:

```
/build-from-figma https://figma.com/file/abc123

  [0] TOKEN SYNC    → sync-tokens.sh → drift check (conditional, if lockfile exists)
  [1] INTAKE        → figma-intake skill → build-spec.json (with appType)
  [2] TOKEN LOCK    → design-token-lock skill → design-tokens.lock.json
  [3] TDD (HARD GATE) → tdd-from-figma skill → failing tests (Red)
  [4] BUILD         → figma-to-react-workflow → components pass tests (Green)
  [4.5] STORYBOOK   → generate-stories.sh → auto-generated stories (non-blocking)
  [5] VISUAL DIFF   → pixelmatch loop → max 5 iterations, 2% threshold
  [5.5] DARK MODE   → check-dark-mode.sh → dark mode verification (non-blocking)
  [6] E2E TESTS     → e2e-test-generator skill → Playwright tests (app-type-aware)
  [7] CROSS-BROWSER → Firefox/WebKit screenshots (non-blocking)
  [8] QUALITY GATE  → coverage + types + build + tokens + Lighthouse
  [9] REPORT        → .claude/visual-qa/build-report.md (with diff images + docs)
```

**Step 3: Add new key artifacts (after line 200)**

```markdown
- `sync-tokens.sh` — Detects token drift between lockfile and source
- `check-dark-mode.sh` — Dark mode screenshot capture and visual comparison
- `generate-stories.sh` — Auto-generates Storybook stories from components
- `generate-component-docs.sh` — Generates MDX component documentation
```

**Step 4: Add new features (after line 210)**

```markdown
- **Dark mode verification** — automated dark theme screenshot comparison (non-blocking)
- **Storybook generation** — auto-generated stories with responsive viewports
- **Token sync** — detects drift between Figma lockfile and source code
- **Component docs** — auto-generated MDX documentation with props, tokens, and links
- **Automated hooks** — pre-commit token guard, coverage warnings, dark mode reminders
```

**Step 5: Update Code Quality section (lines 336-344)**

Add new scripts:

```bash
./scripts/sync-tokens.sh              # Token drift detection
./scripts/check-dark-mode.sh          # Dark mode verification
./scripts/generate-stories.sh         # Storybook generation
./scripts/generate-component-docs.sh  # Component documentation
```

**Step 6: Update last line counts (line 349)**

```markdown
**Last Updated:** 2026-03-18
**Architecture:** 44 agents, 10 skills, 4 plugins + gh CLI, Figma + Playwright MCP, 14 scripts
```

**Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new pipeline phases, scripts, and hooks"
```

---

### Task 9: Update figma-to-react docs

**Files:**
- Modify: `docs/figma-to-react/README.md`

**Step 1: Update pipeline diagram (lines 9-19)**

Replace with:

```
[0] Token Sync  → sync-tokens.sh → drift check (conditional)
[1] Intake      → figma-intake skill → build-spec.json
[2] Token Lock  → design-token-lock skill → lockfile + Tailwind config
[3] TDD (Gate)  → tdd-from-figma skill → failing tests (RED)
[4] Build       → figma-to-react-workflow skill → components pass tests (GREEN)
[4.5] Storybook → generate-stories.sh → auto-generated stories
[5] Visual Diff → visual-qa-verification skill → pixel-diff loop
[5.5] Dark Mode → check-dark-mode.sh → dark mode verification
[6] E2E Tests   → e2e-test-generator skill → Playwright tests
[7] Cross-Browser→ Firefox/WebKit screenshots (non-blocking)
[8] Quality Gate → coverage + TypeScript + build + tokens + Lighthouse
[9] Report      → .claude/visual-qa/build-report.md + docs/components/
```

**Step 2: Add new generated output to "What Gets Generated" (after line 57)**

```markdown
├── docs/
│   └── components/           # Auto-generated component docs
│       ├── index.mdx         # Component index with status table
│       ├── Hero.mdx          # Per-component documentation
│       └── Navigation.mdx
```

**Step 3: Add pipeline artifacts for new phases (after line 75)**

```markdown
│   ├── screenshots/
│   │   ├── dark/               # Dark mode screenshots
```

**Step 4: Add new config settings to Configuration table (after line 128)**

```markdown
| `darkMode.enabled` | true | Enable dark mode visual verification |
| `darkMode.diffThreshold` | 0.03 | Dark mode pixel mismatch threshold |
| `storybook.autoGenerate` | true | Auto-generate Storybook stories |
| `tokenSync.autoCheck` | true | Check for token drift before extraction |
```

**Step 5: Add new skills to Key Skills table (after line 141)**

```markdown
| sync-tokens.sh | 0 | Detects token drift between lockfile and source |
| generate-stories.sh | 4.5 | Auto-generates Storybook stories |
| check-dark-mode.sh | 5.5 | Dark mode visual verification |
| generate-component-docs.sh | 9 | MDX component documentation |
```

**Step 6: Commit**

```bash
git add docs/figma-to-react/README.md
git commit -m "docs: update figma-to-react docs with new pipeline phases"
```

---

## Final Verification

### Task 10: Verify all changes

**Step 1: Verify JSON configs are valid**

Run: `python3 -c "import json; json.load(open('.claude/pipeline.config.json')); json.load(open('.claude/settings.json')); print('All JSON valid')`
Expected: "All JSON valid"

**Step 2: Verify all scripts are executable**

Run: `ls -la scripts/sync-tokens.sh scripts/check-dark-mode.sh scripts/generate-stories.sh scripts/generate-component-docs.sh`
Expected: All four files with `-rwxr-xr-x` permissions

**Step 3: Verify scripts run without error (no-op mode)**

Run: `./scripts/sync-tokens.sh` — Expected: exit 2 (no lockfile)
Run: `./scripts/generate-stories.sh --dry-run` — Expected: exit 0 or 2 (no components)
Run: `./scripts/generate-component-docs.sh` — Expected: exit 0 or 2 (no components)

**Step 4: Count all scripts**

Run: `ls scripts/*.sh scripts/*.js | wc -l`
Expected: 14 (10 existing + 4 new)

**Step 5: Final commit if any loose changes**

```bash
git status
```
