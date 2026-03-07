#!/bin/bash
# Deploy to GitHub Pages
# Run this script from the repo root after making changes to main
# Base path MUST always be / for the custom domain www.mycruisingweather.com

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Building for GitHub Pages (base path: /)..."
VITE_BASE_PATH=/ pnpm run build:pages

# ── Safety check: verify the built index.html uses the correct base path ──
BUILT_INDEX="$REPO_ROOT/dist/public/index.html"
if grep -q "weatherstream-mvp" "$BUILT_INDEX"; then
  echo "ERROR: Built index.html still contains /weatherstream-mvp/ base path. Aborting deploy."
  exit 1
fi
if ! grep -q 'src="/assets/' "$BUILT_INDEX"; then
  echo "ERROR: Built index.html does not reference /assets/ correctly. Aborting deploy."
  exit 1
fi
echo "Build validation passed."

echo "Deploying to gh-pages branch..."
DIST_DIR="$REPO_ROOT/dist/public"
REPO_URL=$(git remote get-url origin)

# Use a temp dir for the gh-pages branch
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

git clone --branch gh-pages "$REPO_URL" "$TMPDIR" 2>/dev/null || git clone "$REPO_URL" "$TMPDIR"

cd "$TMPDIR"
git checkout gh-pages 2>/dev/null || git checkout -b gh-pages

# Remove old build files, keep special files
rm -rf assets *.html *.json

# Copy new build
cp -r "$DIST_DIR"/. .

# Final safety check before pushing
if grep -q "weatherstream-mvp" index.html; then
  echo "ERROR: Deployed index.html still contains wrong base path. Aborting."
  exit 1
fi

git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')"
git push origin gh-pages --force

echo "Deployed successfully to https://www.mycruisingweather.com"
