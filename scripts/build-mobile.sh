#!/usr/bin/env bash
set -euo pipefail

# Caster — Mobile Build Script
# Usage:
#   bash scripts/build-mobile.sh ios          # Simulator (localhost)
#   bash scripts/build-mobile.sh ios prod     # Real device (cstr.inspire-edge.net)
#   bash scripts/build-mobile.sh android prod # Real device Android

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

PLATFORM="${1:-ios}"
MODE="${2:-dev}"

if [ "$MODE" = "prod" ] || [ "$MODE" = "production" ]; then
  export CAPACITOR_ENV=production
  echo "▸ Mode: PRODUCTION (cstr.inspire-edge.net)"
else
  echo "▸ Mode: DEV (localhost:3000 — make sure dev server is running)"
fi

echo "▸ Syncing Capacitor plugins and config..."
npx cap sync

case "$PLATFORM" in
  ios)
    echo "▸ Opening Xcode..."
    npx cap open ios
    ;;
  android)
    echo "▸ Opening Android Studio..."
    npx cap open android
    ;;
  both)
    echo "▸ Opening Xcode..."
    npx cap open ios
    echo "▸ Opening Android Studio..."
    npx cap open android
    ;;
esac

echo "✔ Done. Build and run from the native IDE."
