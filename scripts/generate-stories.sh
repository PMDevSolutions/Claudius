#!/usr/bin/env bash
# generate-stories.sh — Auto-generate Storybook .stories.tsx files for React components
# Phase 4.5 of the Figma-to-React pipeline (non-blocking)
set -euo pipefail

SRC_DIR="src/components"
CONFIG_FILE=".claude/pipeline.config.json"
FORCE=false
DRY_RUN=false
GENERATED=0
SKIPPED=0

# --- Parse flags ---
for arg in "$@"; do
  case "$arg" in
    --force)   FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
    *)         echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "=== Storybook Story Generation ==="
echo ""

# --- Check for src/components directory ---
if [[ ! -d "$SRC_DIR" ]]; then
  echo "⊘ No $SRC_DIR directory found — skipping story generation"
  exit 0
fi

# --- Read config from pipeline.config.json ---
SKIP_PATTERNS="[]"
INCLUDE_VIEWPORTS=false
VIEWPORT_NAMES="[]"
BREAKPOINTS="{}"

if [[ -f "$CONFIG_FILE" ]]; then
  echo "▸ Reading config from $CONFIG_FILE"

  # Parse all storybook config in one node call
  CONFIG_VALUES=$(node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    const sb = cfg.storybook || {};
    const vd = cfg.visualDiff || {};
    console.log(JSON.stringify({
      skipPatterns: sb.skipPatterns || [],
      includeViewports: sb.includeResponsiveViewports || false,
      viewports: sb.viewports || [],
      breakpoints: vd.breakpoints || {}
    }));
  " 2>/dev/null || echo '{}')

  if [[ "$CONFIG_VALUES" != '{}' ]]; then
    SKIP_PATTERNS=$(node -e "console.log(JSON.parse(process.argv[1]).skipPatterns.join('|'))" "$CONFIG_VALUES" 2>/dev/null || echo "")
    INCLUDE_VIEWPORTS=$(node -e "console.log(JSON.parse(process.argv[1]).includeViewports)" "$CONFIG_VALUES" 2>/dev/null || echo "false")
    VIEWPORT_NAMES=$(node -e "console.log(JSON.stringify(JSON.parse(process.argv[1]).viewports))" "$CONFIG_VALUES" 2>/dev/null || echo "[]")
    BREAKPOINTS=$(node -e "console.log(JSON.stringify(JSON.parse(process.argv[1]).breakpoints))" "$CONFIG_VALUES" 2>/dev/null || echo "{}")
  fi

  echo "  includeResponsiveViewports: $INCLUDE_VIEWPORTS"
  echo ""
else
  echo "▸ No $CONFIG_FILE found — using defaults"
  echo ""
fi

# --- Scan for component files ---
echo "▸ Scanning $SRC_DIR for React components..."

COMPONENT_FILES=$(find "$SRC_DIR" -name "*.tsx" \
  ! -name "*.test.tsx" \
  ! -name "*.test.ts" \
  ! -name "*.stories.tsx" \
  ! -name "*.stories.ts" \
  ! -name "*.d.ts" \
  ! -name "index.tsx" \
  ! -name "index.ts" \
  ! -path "*/node_modules/*" \
  ! -path "*/__tests__/*" \
  ! -path "*/__mocks__/*" \
  2>/dev/null || true)

if [[ -z "$COMPONENT_FILES" ]]; then
  echo "  ⊘ No component files found in $SRC_DIR"
  echo ""
  echo "=== Summary ==="
  echo "  Generated: 0"
  echo "  Skipped:   0"
  exit 0
fi

# --- Process each component file ---
while IFS= read -r component_file; do
  filename=$(basename "$component_file")

  # Check skip patterns from config
  if [[ -n "$SKIP_PATTERNS" && "$SKIP_PATTERNS" != "[]" ]]; then
    should_skip=false
    # Check each pattern individually
    IFS='|' read -ra PATTERNS <<< "$SKIP_PATTERNS"
    for pattern in "${PATTERNS[@]}"; do
      # Convert glob pattern to a simple check
      # Strip leading **/ for basename matching
      simple_pattern="${pattern##**/}"
      if [[ "$filename" == $simple_pattern ]]; then
        should_skip=true
        break
      fi
    done
    if [[ "$should_skip" == "true" ]]; then
      echo "  ⊘ Skipped (config pattern): $component_file"
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
  fi

  # Check for existing story file
  story_file="${component_file%.tsx}.stories.tsx"
  if [[ -f "$story_file" && "$FORCE" != "true" ]]; then
    echo "  ⊘ Skipped (story exists): $component_file"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Detect exported React components
  EXPORTS=$(grep -E 'export\s+(default\s+)?(function|const)\s+[A-Z]' "$component_file" 2>/dev/null || true)

  if [[ -z "$EXPORTS" ]]; then
    echo "  ⊘ Skipped (no exported component): $component_file"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Extract the first component name
  COMPONENT_NAME=$(echo "$EXPORTS" | head -1 \
    | grep -oE '(function|const)\s+[A-Z][A-Za-z0-9]*' \
    | head -1 \
    | sed 's/^function\s\+//' \
    | sed 's/^const\s\+//')

  if [[ -z "$COMPONENT_NAME" ]]; then
    echo "  ⊘ Skipped (could not parse component name): $component_file"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Extract props interface name (look for interface/type ending in Props)
  PROPS_INTERFACE=$(grep -oE '(interface|type)\s+[A-Za-z]*Props' "$component_file" 2>/dev/null \
    | head -1 \
    | sed 's/^interface\s\+//' \
    | sed 's/^type\s\+//' || true)

  # Derive the import path (relative from story to component)
  component_basename=$(basename "$component_file" .tsx)

  # Build the Storybook title from the file path
  # e.g. src/components/ui/Button.tsx -> Components/ui/Button
  relative_path="${component_file#src/components/}"
  story_title="Components/${relative_path%.tsx}"

  # --- Generate story content ---
  STORY_CONTENT="import type { Meta, StoryObj } from '@storybook/react';
import { ${COMPONENT_NAME} } from './${component_basename}';"

  # Add props type import if detected
  if [[ -n "$PROPS_INTERFACE" ]]; then
    STORY_CONTENT="import type { Meta, StoryObj } from '@storybook/react';
import { ${COMPONENT_NAME} } from './${component_basename}';
import type { ${PROPS_INTERFACE} } from './${component_basename}';"
  fi

  STORY_CONTENT="${STORY_CONTENT}

const meta: Meta<typeof ${COMPONENT_NAME}> = {
  title: '${story_title}',
  component: ${COMPONENT_NAME},
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ${COMPONENT_NAME}>;

export const Default: Story = {};"

  # Add responsive viewport stories if configured
  if [[ "$INCLUDE_VIEWPORTS" == "true" ]]; then
    # Build viewport stories from config
    VIEWPORT_STORIES=$(node -e "
      const viewports = ${VIEWPORT_NAMES};
      const breakpoints = ${BREAKPOINTS};
      const stories = [];
      for (const vp of viewports) {
        const width = breakpoints[vp];
        if (!width) continue;
        const name = vp.charAt(0).toUpperCase() + vp.slice(1);
        stories.push('');
        stories.push('export const ' + name + ': Story = {');
        stories.push('  parameters: {');
        stories.push('    viewport: {');
        stories.push('      defaultViewport: \'${'\'' + name.toLowerCase() + '\\'' }');
        stories.push('    },');
        stories.push('  },');
        stories.push('};');
      }
      console.log(stories.join('\n'));
    " 2>/dev/null || true)

    # Use a more reliable approach for viewport stories
    VIEWPORT_STORIES=$(node -e "
      const viewports = ${VIEWPORT_NAMES};
      const breakpoints = ${BREAKPOINTS};
      const lines = [];
      for (const vp of viewports) {
        const width = breakpoints[vp];
        if (!width) continue;
        const name = vp.charAt(0).toUpperCase() + vp.slice(1);
        lines.push('');
        lines.push('export const ' + name + ': Story = {');
        lines.push('  parameters: {');
        lines.push('    viewport: {');
        lines.push('      defaultViewport: ' + JSON.stringify(vp) + ',');
        lines.push('    },');
        lines.push('  },');
        lines.push('};');
      }
      console.log(lines.join('\n'));
    " 2>/dev/null || true)

    if [[ -n "$VIEWPORT_STORIES" ]]; then
      STORY_CONTENT="${STORY_CONTENT}
${VIEWPORT_STORIES}"
    fi
  fi

  # Add trailing newline
  STORY_CONTENT="${STORY_CONTENT}
"

  # --- Write or report ---
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  ✓ Would generate: $story_file (component: ${COMPONENT_NAME})"
  else
    echo "$STORY_CONTENT" > "$story_file"
    echo "  ✓ Generated: $story_file (component: ${COMPONENT_NAME})"
  fi
  GENERATED=$((GENERATED + 1))

done <<< "$COMPONENT_FILES"
echo ""

# --- Storybook smoke test ---
if [[ "$DRY_RUN" != "true" && $GENERATED -gt 0 ]]; then
  if [[ -f "package.json" ]] && grep -q '"storybook"' package.json 2>/dev/null; then
    echo "▸ Running Storybook build smoke test..."
    if pnpm build-storybook --quiet 2>/dev/null; then
      echo "  ✓ Storybook build succeeded"
    else
      echo "  ⚠ Storybook build failed — stories may need manual review"
    fi
    echo ""
  else
    echo "▸ Storybook not found in package.json — skipping smoke test"
    echo ""
  fi
fi

# --- Summary ---
echo "=== Summary ==="
if [[ "$DRY_RUN" == "true" ]]; then
  echo "  Would generate: $GENERATED"
  echo "  Skipped:         $SKIPPED"
  echo "  (dry run — no files written)"
else
  echo "  Generated: $GENERATED"
  echo "  Skipped:   $SKIPPED"
fi
