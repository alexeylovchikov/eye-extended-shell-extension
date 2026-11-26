#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="eye-extended@als.kz"
ZIP="$ROOT/$UUID.shell-extension.zip"

echo "Packing the extension..."
rm -f "$ZIP"
gnome-extensions pack "$ROOT/$UUID" \
    --podir="$ROOT/translations" \
    --extra-source="circle" \
    --extra-source="cat" \
    --extra-source="catBrain.js" \
    --out-dir="$ROOT"

echo "Installing the extension..."
gnome-extensions install --force "$ZIP"

echo "Done! Log out and back in, then enable it: gnome-extensions enable $UUID"
