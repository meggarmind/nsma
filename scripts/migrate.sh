#!/bin/bash
# ============================================================================
# Migration Script: Old folder structure → New NSMA structure
# ============================================================================
# Usage: ./migrate.sh /path/to/project
# ============================================================================

PROJECT_ROOT="${1:-.}"
PROJECT_ROOT=$(realpath "$PROJECT_ROOT")
PROJECT_NAME=$(basename "$PROJECT_ROOT")

echo "╔══════════════════════════════════════════════════════════╗"
echo "║           NSMA Migration Script                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Project: $PROJECT_NAME"
echo "Path: $PROJECT_ROOT"
echo ""

# Confirm
read -p "Proceed with migration? (y/N) " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Creating new folder structure..."

# Create new structure
mkdir -p "$PROJECT_ROOT/prompts/pending"
mkdir -p "$PROJECT_ROOT/prompts/processed"
mkdir -p "$PROJECT_ROOT/prompts/archived"
mkdir -p "$PROJECT_ROOT/prompts/deferred"

echo "✓ Created prompts/{pending,processed,archived,deferred}"

# Move files from old locations
moved=0

# Move prompts/*.md -> prompts/pending/
if [ -d "$PROJECT_ROOT/prompts" ]; then
    for f in "$PROJECT_ROOT/prompts"/*.md; do
        [ -e "$f" ] || continue
        filename=$(basename "$f")
        # Don't move if already in subfolder
        if [ -f "$f" ]; then
            mv "$f" "$PROJECT_ROOT/prompts/pending/"
            echo "  Moved: prompts/$filename → prompts/pending/"
            ((moved++))
        fi
    done
fi

# Move processed/* -> prompts/processed/
if [ -d "$PROJECT_ROOT/processed" ]; then
    for f in "$PROJECT_ROOT/processed"/*; do
        [ -e "$f" ] || continue
        mv "$f" "$PROJECT_ROOT/prompts/processed/"
        echo "  Moved: processed/$(basename "$f") → prompts/processed/"
        ((moved++))
    done
    rmdir "$PROJECT_ROOT/processed" 2>/dev/null && echo "✓ Removed empty: processed/"
fi

# Move archived/* -> prompts/archived/
if [ -d "$PROJECT_ROOT/archived" ]; then
    for f in "$PROJECT_ROOT/archived"/*; do
        [ -e "$f" ] || continue
        mv "$f" "$PROJECT_ROOT/prompts/archived/"
        echo "  Moved: archived/$(basename "$f") → prompts/archived/"
        ((moved++))
    done
    rmdir "$PROJECT_ROOT/archived" 2>/dev/null && echo "✓ Removed empty: archived/"
fi

# Move deferred/* -> prompts/deferred/
if [ -d "$PROJECT_ROOT/deferred" ]; then
    for f in "$PROJECT_ROOT/deferred"/*; do
        [ -e "$f" ] || continue
        mv "$f" "$PROJECT_ROOT/prompts/deferred/"
        echo "  Moved: deferred/$(basename "$f") → prompts/deferred/"
        ((moved++))
    done
    rmdir "$PROJECT_ROOT/deferred" 2>/dev/null && echo "✓ Removed empty: deferred/"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Migration complete!"
echo "  Files moved: $moved"
echo ""
echo "New structure:"
find "$PROJECT_ROOT/prompts" -type d | head -10
echo ""
echo "Next steps:"
echo "  1. Add project in NSMA dashboard: http://localhost:3100"
echo "  2. Configure phases and modules"
echo "  3. Set prompts path to: $PROJECT_ROOT/prompts"
echo "═══════════════════════════════════════════════════════════"
