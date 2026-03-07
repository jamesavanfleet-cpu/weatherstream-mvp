#!/bin/bash
# Deploy to GitHub Pages
# Run this script from the repo root after making changes to main

set -e

echo "Building for GitHub Pages..."
VITE_BASE_PATH=/ pnpm run build:pages

echo "Deploying to gh-pages branch..."
DIST_DIR="$(pwd)/dist/public"
REPO_URL=$(git remote get-url origin)

# Use a temp dir for the gh-pages branch
TMPDIR=$(mktemp -d)
git clone --branch gh-pages "$REPO_URL" "$TMPDIR" 2>/dev/null || git clone "$REPO_URL" "$TMPDIR"

cd "$TMPDIR"
git checkout gh-pages 2>/dev/null || git checkout -b gh-pages

# Remove old build files, keep special files
rm -rf assets *.html *.json

# Copy new build
cp -r "$DIST_DIR"/. .

git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')"
git push origin gh-pages --force

cd -
rm -rf "$TMPDIR"
echo "Deployed successfully!"
