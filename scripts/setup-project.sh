#!/usr/bin/env bash
set -euo pipefail

# Project Setup
# Initialize a new React project with standard tooling
#
# Usage:
#   ./scripts/setup-project.sh my-app              # Interactive framework prompt
#   ./scripts/setup-project.sh my-app --next        # Create Next.js app
#   ./scripts/setup-project.sh my-app --vite        # Create Vite + React app
#   ./scripts/setup-project.sh my-app --react       # Create plain React app (via Vite)

PROJECT_NAME="${1:-}"
FRAMEWORK=""

if [[ -z "$PROJECT_NAME" ]]; then
    echo "Usage: $0 <project-name> [--next|--vite|--react]"
    echo ""
    echo "Options:"
    echo "  --next     Create a Next.js app"
    echo "  --vite     Create a Vite + React app"
    echo "  --react    Create a plain React app (via Vite)"
    exit 1
fi

# Parse framework flag
for arg in "${@:2}"; do
    case "$arg" in
        --next) FRAMEWORK="next" ;;
        --vite) FRAMEWORK="vite" ;;
        --react) FRAMEWORK="react" ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# Interactive prompt if no framework specified
if [[ -z "$FRAMEWORK" ]]; then
    echo "Select a framework:"
    echo "  1) Next.js"
    echo "  2) Vite + React"
    echo "  3) Plain React (via Vite)"
    echo ""
    read -rp "Enter choice [1-3]: " CHOICE

    case "$CHOICE" in
        1) FRAMEWORK="next" ;;
        2) FRAMEWORK="vite" ;;
        3) FRAMEWORK="react" ;;
        *)
            echo "Invalid choice. Exiting."
            exit 1
            ;;
    esac
fi

echo ""
echo "=== Project Setup ==="
echo "Project: $PROJECT_NAME"
echo "Framework: $FRAMEWORK"
echo ""

# Create the project
case "$FRAMEWORK" in
    next)
        echo "Creating Next.js app..."
        pnpm create next-app "$PROJECT_NAME" --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
        ;;
    vite)
        echo "Creating Vite + React app..."
        pnpm create vite "$PROJECT_NAME" --template react-ts
        ;;
    react)
        echo "Creating React app (via Vite)..."
        pnpm create vite "$PROJECT_NAME" --template react-ts
        ;;
esac

echo ""
echo "Entering project directory..."
cd "$PROJECT_NAME"

# Install base dependencies
echo ""
echo "Installing dependencies..."
pnpm install

# Install additional dev dependencies
echo ""
echo "Installing additional tooling..."

ADDITIONAL_DEPS=()

# Tailwind CSS (skip for Next.js as it's included via create-next-app)
if [[ "$FRAMEWORK" != "next" ]]; then
    ADDITIONAL_DEPS+=(tailwindcss @tailwindcss/vite)
fi

# Linting and formatting
ADDITIONAL_DEPS+=(prettier)

# Testing
ADDITIONAL_DEPS+=(vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8)

if [[ ${#ADDITIONAL_DEPS[@]} -gt 0 ]]; then
    pnpm add -D "${ADDITIONAL_DEPS[@]}"
fi

# Copy template configs from the framework repo
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/../templates"

if [[ -d "$TEMPLATES_DIR" ]]; then
    echo ""
    echo "Copying template configurations..."

    # Copy shared configs (ESLint, Prettier, Vitest, Tailwind, tsconfig)
    if [[ -d "$TEMPLATES_DIR/shared" ]]; then
        for template_file in "$TEMPLATES_DIR/shared"/*; do
            if [[ -f "$template_file" ]]; then
                FILENAME=$(basename "$template_file")
                # Strip .tpl suffix (template configs renamed to avoid IDE auto-discovery)
                FILENAME="${FILENAME%.tpl}"
                if [[ ! -f "$FILENAME" ]]; then
                    cp "$template_file" "./$FILENAME"
                    echo "  Copied: $FILENAME"
                else
                    echo "  Skipped (already exists): $FILENAME"
                fi
            fi
        done

        # Copy Storybook config directory
        if [[ -d "$TEMPLATES_DIR/shared/.storybook" ]] && [[ ! -d ".storybook" ]]; then
            cp -r "$TEMPLATES_DIR/shared/.storybook" ./.storybook
            echo "  Copied: .storybook/"
        fi
    fi

    # Copy framework-specific configs
    FRAMEWORK_DIR="$TEMPLATES_DIR/$FRAMEWORK"
    if [[ "$FRAMEWORK" == "react" ]]; then
        FRAMEWORK_DIR="$TEMPLATES_DIR/vite"
    fi

    if [[ -d "$FRAMEWORK_DIR" ]]; then
        for template_file in "$FRAMEWORK_DIR"/*; do
            if [[ -f "$template_file" ]]; then
                FILENAME=$(basename "$template_file")
                # Strip .tpl suffix (template configs renamed to avoid IDE auto-discovery)
                FILENAME="${FILENAME%.tpl}"
                if [[ ! -f "$FILENAME" ]]; then
                    cp "$template_file" "./$FILENAME"
                    echo "  Copied: $FILENAME (${FRAMEWORK}-specific)"
                else
                    echo "  Skipped (already exists): $FILENAME"
                fi
            fi
        done
    fi
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Project created at: $(pwd)"
echo ""
echo "Next steps:"
echo "  cd $PROJECT_NAME"
echo "  pnpm dev                  # Start development server"
echo "  pnpm build                # Build for production"
echo "  pnpm vitest               # Run tests"
echo "  pnpm vitest --coverage    # Run tests with coverage"
echo ""

if [[ "$FRAMEWORK" == "vite" ]] || [[ "$FRAMEWORK" == "react" ]]; then
    echo "Tailwind CSS:"
    echo "  Add '@import \"tailwindcss\";' to your main CSS file."
    echo "  Add the @tailwindcss/vite plugin to vite.config.ts."
    echo ""
fi

echo "Recommended VS Code extensions:"
echo "  - ESLint"
echo "  - Prettier"
echo "  - Tailwind CSS IntelliSense"
echo "  - Vitest"
