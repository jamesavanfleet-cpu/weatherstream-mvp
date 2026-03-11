#!/bin/bash
# Deploy to GitHub Pages
# Run this script from the repo root after making changes to main
# Base path MUST always be / for the custom domain www.mycruisingweather.com
#
# IMPORTANT: The following files are PERSISTENT and are NEVER overwritten by this deploy script.
# They are managed by their own dedicated update scripts:
#   briefing_video.json    -- updated only via update_briefing_video.sh
#   live_conditions.json   -- updated by hourly_conditions.sh
#   intel.json             -- updated by generate_intel.py
#   top_story.json         -- updated by generate_top_story.py
#   cruise_itineraries.json -- updated by dedicated itinerary script

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Building for GitHub Pages (base path: /)..."
VITE_BASE_PATH=/ pnpm run build:pages

# Safety check: verify the built index.html uses the correct base path
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

# Preserve persistent data files before clearing old build artifacts
# These files must NEVER be overwritten by a code deploy
PRESERVE_FILES="briefing_video.json live_conditions.json intel.json top_story.json cruise_itineraries.json"
for PFILE in $PRESERVE_FILES; do
  if [ -f "$PFILE" ]; then
    cp "$PFILE" "/tmp/deploy_preserve_${PFILE}"
    echo "Preserved: $PFILE"
  fi
done

# Remove old build files
rm -rf assets *.html *.json

# Copy new build
cp -r "$DIST_DIR"/. .

# Restore preserved data files -- these always win over anything the build copied
for PFILE in $PRESERVE_FILES; do
  if [ -f "/tmp/deploy_preserve_${PFILE}" ]; then
    cp "/tmp/deploy_preserve_${PFILE}" "$PFILE"
    rm "/tmp/deploy_preserve_${PFILE}"
    echo "Restored: $PFILE"
  fi
done

# Final safety check before pushing
if grep -q "weatherstream-mvp" index.html; then
  echo "ERROR: Deployed index.html still contains wrong base path. Aborting."
  exit 1
fi

git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M')" || echo "Nothing to commit."
git push origin gh-pages --force

echo "Deployed successfully to https://www.mycruisingweather.com"
