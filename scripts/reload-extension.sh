#!/usr/bin/env bash
# Rebuild and toggle Tiling Shell without restarting the real GNOME session.
# GNOME may cache imported JavaScript; use dev:nested for reliable JS testing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID=tilingshell@ferrarodomenico.com

cd "$ROOT"

extension_exists=false
if command -v gnome-extensions >/dev/null 2>&1 &&
  gnome-extensions info "$UUID" >/dev/null 2>&1; then
  extension_exists=true
  gnome-extensions disable "$UUID" 2>/dev/null || true
  # Let pending extension callbacks finish before replacing imported files.
  sleep 2
fi

npm run build
npm run install:extension

if [[ "$extension_exists" == true ]]; then
  gnome-extensions enable "$UUID"
  sleep 1
  state="$(gnome-extensions info "$UUID" | sed -n 's/^  State: //p')"
  if [[ "$state" != ACTIVE ]]; then
    echo "Tiling Shell reload failed; extension state is $state." >&2
    exit 1
  fi
fi

echo "Tiling Shell rebuilt, installed, and toggled."
echo "For JavaScript changes, use 'npm run dev:nested' to avoid GNOME's module cache."