#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cp -v "$ROOT"/eye-extended@als.kz/*.js ~/.local/share/gnome-shell/extensions/eye-extended@als.kz/
