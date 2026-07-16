#!/bin/bash
# Validate a GitHub Pages build prepared for www.mycruisingweather.com.
set -euo pipefail

TARGET_DIR="${1:-}"
CUSTOM_DOMAIN="www.mycruisingweather.com"
FORBIDDEN_BASE_PATH="/weatherstream-mvp/"

if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
  echo "ERROR: Expected a build directory argument." >&2
  exit 1
fi

INDEX_FILE="$TARGET_DIR/index.html"
if [ ! -f "$INDEX_FILE" ]; then
  echo "ERROR: Missing $INDEX_FILE." >&2
  exit 1
fi

for HTML_FILE in "$INDEX_FILE" "$TARGET_DIR/404.html"; do
  if [ -f "$HTML_FILE" ] && grep -Fqs "$FORBIDDEN_BASE_PATH" "$HTML_FILE"; then
    echo "ERROR: $HTML_FILE contains forbidden $FORBIDDEN_BASE_PATH paths." >&2
    exit 1
  fi
done

if ! grep -Eq '(src|href)="/assets/' "$INDEX_FILE"; then
  echo "ERROR: $INDEX_FILE does not reference root-mounted /assets/." >&2
  exit 1
fi

CNAME_FILE="$TARGET_DIR/CNAME"
if [ ! -f "$CNAME_FILE" ] || [ "$(tr -d '\r\n' < "$CNAME_FILE")" != "$CUSTOM_DOMAIN" ]; then
  echo "ERROR: $TARGET_DIR is missing the required CNAME for $CUSTOM_DOMAIN." >&2
  exit 1
fi

while IFS= read -r ASSET_PATH; do
  if [ ! -f "$TARGET_DIR/${ASSET_PATH#/}" ]; then
    echo "ERROR: Referenced asset is missing: $ASSET_PATH" >&2
    exit 1
  fi
done < <(grep -Eo '(src|href)="/assets/[^"?]+' "$INDEX_FILE" | sed -E 's/^(src|href)="//' | sort -u)

echo "Custom-domain root validation passed for $TARGET_DIR."
