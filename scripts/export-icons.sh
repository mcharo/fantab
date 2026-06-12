#!/usr/bin/env bash
# Rasterize the extension icon from SVG to the PNG sizes the manifest references.
# Requires librsvg (`brew install librsvg`), which provides rsvg-convert — it renders
# each size natively from the vector with true transparency (no white background).
set -euo pipefail

cd "$(dirname "$0")/.."
SVG="public/icons/icon.svg"
SIZES=(16 32 48 128 1024)

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found. Install it with: brew install librsvg" >&2
  exit 1
fi

for size in "${SIZES[@]}"; do
  out="public/icons/icon-${size}.png"
  rsvg-convert -w "$size" -h "$size" "$SVG" -o "$out"
  echo "wrote $out (${size}x${size})"
done
